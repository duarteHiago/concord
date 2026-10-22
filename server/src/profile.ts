// Perfil de CPU sob demanda, gravado pelo inspector do próprio Node (não precisa reiniciar com --inspect).
// Pedido por deploy/monitoring/perfil.sh durante um teste de carga: diz em quais funções do código o app
// gasta o tempo e quanto a thread principal ficou livre (folga). O arquivo .cpuprofile completo fica em
// data/perfis/ e abre no Chrome DevTools (aba Performance) ou em https://www.speedscope.app.
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { Session } from 'node:inspector/promises';
import { dirname, join } from 'node:path';
import { config } from './config.ts';

interface ProfileNode {
  id: number;
  callFrame: { functionName: string; url: string; lineNumber: number };
  hitCount?: number;
  children?: number[];
}

interface Profile {
  nodes: ProfileNode[];
  startTime: number;
  endTime: number;
}

const KEEP = 20;
const SPECIAL: Record<string, string> = { '(idle)': 'livre', '(garbage collector)': 'gc', '(program)': 'outro', '(root)': 'root' };
let running = false;

/** "file:///app/server/src/api.ts" -> "src/api.ts"; pacotes e internos do Node viram um nome só. */
function fileOf(url: string): string {
  if (!url) return '(nativo)';
  if (url.startsWith('node:')) return '(node)';
  const pkg = /node_modules\/((?:@[^/]+\/)?[^/]+)/.exec(url);
  if (pkg) return `node_modules/${pkg[1]}`;
  const own = /\/((?:src|shared)\/.+)$/.exec(url);
  return own ? own[1] : url.replace(/^file:\/\//, '');
}

const pct = (n: number, total: number) => `${((100 * n) / Math.max(total, 1)).toFixed(1).padStart(5)}%`;

export async function cpuProfile(seconds: number): Promise<string> {
  if (running) throw new Error('Já tem um perfil sendo gravado. Espere ele terminar.');
  running = true;
  const duration = Math.min(120, Math.max(5, Math.round(seconds) || 30));
  const session = new Session();
  session.connect();
  let profile: Profile;
  try {
    await session.post('Profiler.enable');
    await session.post('Profiler.start');
    await new Promise((r) => setTimeout(r, duration * 1000));
    profile = (await session.post('Profiler.stop')).profile as Profile;
  } finally {
    session.disconnect();
    running = false;
  }

  const dir = join(dirname(config.dbPath), 'perfis');
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `perfil-${new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-')}.cpuprofile`);
  writeFileSync(file, JSON.stringify(profile));
  for (const old of readdirSync(dir).filter((f) => f.endsWith('.cpuprofile')).sort().slice(0, -KEEP)) {
    rmSync(join(dir, old), { force: true });
  }
  return summarize(profile, duration, file);
}

function summarize(profile: Profile, duration: number, file: string): string {
  const byId = new Map(profile.nodes.map((n) => [n.id, n]));
  const parent = new Map<number, number>();
  for (const n of profile.nodes) for (const c of n.children ?? []) parent.set(c, n.id);

  const keyOf = (n: ProfileNode) => {
    const { functionName, url, lineNumber } = n.callFrame;
    return `${functionName || '(anônima)'}  ${fileOf(url)}${url ? `:${lineNumber + 1}` : ''}`;
  };

  let total = 0;
  const kinds = { livre: 0, gc: 0, outro: 0, codigo: 0 };
  const self = new Map<string, number>();
  const inclusive = new Map<string, number>();
  const files = new Map<string, number>();
  for (const n of profile.nodes) {
    const hits = n.hitCount ?? 0;
    if (!hits) continue;
    total += hits;
    const special = SPECIAL[n.callFrame.functionName];
    if (special && special !== 'root') {
      kinds[special as 'livre' | 'gc' | 'outro'] += hits;
      continue;
    }
    kinds.codigo += hits;
    const key = keyOf(n);
    self.set(key, (self.get(key) ?? 0) + hits);
    const where = fileOf(n.callFrame.url);
    files.set(where, (files.get(where) ?? 0) + hits);
    // tempo "com o que ela chama": soma nesta função e em todas acima dela na pilha (uma vez cada, por recursão)
    const seen = new Set<string>();
    for (let id: number | undefined = n.id; id !== undefined; id = parent.get(id)) {
      const node = byId.get(id)!;
      if (SPECIAL[node.callFrame.functionName]) continue;
      const k = keyOf(node);
      if (seen.has(k)) continue;
      seen.add(k);
      inclusive.set(k, (inclusive.get(k) ?? 0) + hits);
    }
  }

  const top = (m: Map<string, number>, n: number) => [...m].sort((a, b) => b[1] - a[1]).slice(0, n);
  const lines = [
    `Perfil de CPU do app: ${duration} s`,
    `Arquivo completo: ${file}`,
    '  (abra no Chrome DevTools, aba Performance, ou em https://www.speedscope.app)',
    '',
    'Thread principal do app (o Node.js roda a lógica num núcleo só):',
    `  ${pct(kinds.livre, total)}  livre, esperando trabalho  <- folga`,
    `  ${pct(kinds.codigo, total)}  rodando código (JavaScript do app e das bibliotecas)`,
    `  ${pct(kinds.gc, total)}  coleta de lixo`,
    `  ${pct(kinds.outro, total)}  outro (nativo: rede, criptografia, compilação...)`,
    '',
    'Por arquivo (tempo gasto dentro dele):',
    ...top(files, 12).map(([f, h]) => `  ${pct(h, total)}  ${f}`),
    '',
    'Funções que mais gastam:',
    '   própria | com o que ela chama',
    ...top(self, 25).map(([k, h], i) => `  ${String(i + 1).padStart(2)}. ${pct(h, total)} | ${pct(inclusive.get(k) ?? h, total)}  ${k}`),
    '',
    'Caminhos mais pesados (tempo com o que ela chama, só código do Concord):',
    '  (middlewares como requireAuth e httpMetrics chamam a rota por dentro: o tempo delas entra neles também)',
    ...top(new Map([...inclusive].filter(([k]) => /\s(src|shared)\//.test(k))), 15).map(([k, h]) => `  ${pct(h, total)}  ${k}`),
    '',
  ];
  return lines.join('\n');
}
