// Oficina do servidor: pacotes temáticos (ícone animado, sons, intro, notificação...) e o Mural com widgets
// organizados numa grade. Compartilhado entre servidor e cliente: o servidor valida com parseWorkshop antes de
// guardar, o cliente usa os mesmos tipos e limites no editor.
//
// Regras de segurança (ver o plano da Oficina):
// - Nada de CSS, HTML ou URL livre que mude o app. Tudo aqui é escolha numa lista fechada, texto curto
//   (mostrado como texto, nunca como HTML) ou número com limite.
// - Imagens só do próprio Concord (/uploads/workshop/...). Links só https, mostrados com o domínio.
// - Por enquanto a Oficina só existe no Concord de testes (STAGING=true).

export const WORKSHOP_VERSION = 1;

// ---------------------------------------------------------------- pacotes e peças

/** Pacotes oficiais. A arte e os sons ficam no cliente (client/src/workshop/packs.ts). */
export const WORKSHOP_PACKS = ['runas', 'tatico', 'lofi', 'arcade', 'acampamento', 'galaxia'] as const;
export type WorkshopPackId = (typeof WORKSHOP_PACKS)[number];

/**
 * Peças que um pacote fornece. Cada peça pode vir de um pacote diferente (dá para misturar), ou ficar
 * desligada (fica o comportamento padrão do Concord).
 */
export const WORKSHOP_PIECES = ['icon', 'hover', 'enter', 'intro', 'notify', 'voice', 'announcer', 'banner', 'backdrop'] as const;
export type WorkshopPiece = (typeof WORKSHOP_PIECES)[number];

export const PIECE_INFO: Record<WorkshopPiece, { label: string; hint: string; sound?: boolean; motion?: boolean }> = {
  icon: { label: 'Ícone animado', hint: 'Efeito em volta do ícone do servidor na barra de cima.', motion: true },
  hover: { label: 'Som ao passar o mouse', hint: 'Toca quando alguém passa o mouse no ícone do servidor.', sound: true },
  enter: { label: 'Som ao entrar', hint: 'Toca quando alguém abre o servidor.', sound: true },
  intro: { label: 'Animação de entrada', hint: 'Abre na primeira vez que a pessoa entra no servidor, a cada sessão.', motion: true },
  notify: { label: 'Notificação de menção', hint: 'Som e aviso próprios quando alguém é mencionado aqui.', sound: true },
  voice: { label: 'Sons das salas de voz', hint: 'Entrar, sair e chegar gente nas salas deste servidor.', sound: true },
  announcer: { label: 'Anunciador da sala', hint: 'Uma faixa com som quando a sala junta 2, 3 ou 5 pessoas.', sound: true, motion: true },
  banner: { label: 'Faixa animada', hint: 'Arte animada atrás do nome do servidor, na lateral.', motion: true },
  backdrop: { label: 'Fundo do Mural', hint: 'Partículas e cor de fundo na página do Mural.', motion: true },
};

// ---------------------------------------------------------------- widgets do Mural

export const WIDGET_TYPES = [
  'text',
  'rules',
  'countdown',
  'voice',
  'online',
  'scoreboard',
  'pomodoro',
  'channels',
  'clock',
  'image',
  'links',
  'jam',
] as const;
export type WidgetType = (typeof WIDGET_TYPES)[number];

export const TIMEZONES = [
  'America/Sao_Paulo',
  'America/Manaus',
  'America/Fortaleza',
  'America/Noronha',
  'America/Rio_Branco',
  'Europe/Lisbon',
  'America/New_York',
  'Asia/Tokyo',
  'UTC',
] as const;

export interface WidgetProps {
  text: { title: string; body: string; tone: 'plain' | 'accent' | 'warn' };
  rules: { title: string; items: string[] };
  countdown: { title: string; at: number; doneText: string };
  voice: { title: string };
  online: { title: string };
  scoreboard: { title: string; rows: { name: string; score: number }[]; order: 'desc' | 'asc' };
  pomodoro: { title: string; focus: number; pause: number; startedAt: number | null };
  channels: { title: string; channelIds: string[] };
  clock: { title: string; tz: (typeof TIMEZONES)[number] };
  image: { url: string; caption: string; fit: 'cover' | 'contain' };
  links: { title: string; items: { label: string; url: string }[] };
  jam: { title: string };
}

export type WidgetPlacement = {
  [T in WidgetType]: { id: string; type: T; x: number; y: number; w: number; h: number; props: WidgetProps[T] };
}[WidgetType];

/** Grade do Mural: colunas fixas, altura da linha no cliente. No celular vira uma coluna. */
export const GRID_COLS = 6;
export const GRID_MAX_ROWS = 40;
export const MAX_WIDGETS = 16;

export const WIDGET_INFO: Record<WidgetType, { label: string; hint: string; min: [number, number]; size: [number, number]; max: [number, number] }> = {
  text: { label: 'Aviso', hint: 'Um recado em destaque.', min: [2, 1], size: [3, 2], max: [6, 6] },
  rules: { label: 'Regras', hint: 'Lista numerada de regras.', min: [2, 2], size: [3, 3], max: [6, 8] },
  countdown: { label: 'Contagem regressiva', hint: 'Até o próximo evento, mix ou campeonato.', min: [2, 1], size: [3, 2], max: [6, 4] },
  voice: { label: 'Quem está na voz', hint: 'As salas com gente agora, ao vivo.', min: [2, 2], size: [2, 3], max: [6, 8] },
  online: { label: 'Online agora', hint: 'Quantas pessoas estão online e quem são.', min: [1, 1], size: [2, 2], max: [6, 4] },
  scoreboard: { label: 'Placar', hint: 'Ranking da galera (vitórias, pontos, MVPs).', min: [2, 2], size: [2, 3], max: [6, 8] },
  pomodoro: { label: 'Pomodoro da sala', hint: 'Um timer de foco que todo mundo vê igual.', min: [2, 2], size: [2, 2], max: [4, 4] },
  channels: { label: 'Atalhos de canais', hint: 'Botões para os canais e salas mais usados.', min: [2, 1], size: [2, 2], max: [6, 6] },
  clock: { label: 'Relógio', hint: 'Hora de um fuso (bom para quem joga em outro país).', min: [1, 1], size: [2, 1], max: [3, 2] },
  image: { label: 'Imagem', hint: 'Um banner, arte ou mapa do servidor.', min: [1, 1], size: [3, 2], max: [6, 8] },
  links: { label: 'Links', hint: 'Até 6 links (só https), com o domínio à mostra.', min: [2, 1], size: [2, 2], max: [6, 6] },
  jam: { label: 'Jam do Spotify', hint: 'As Jams abertas nas salas deste servidor.', min: [2, 1], size: [2, 2], max: [6, 4] },
};

export function defaultProps<T extends WidgetType>(type: T): WidgetProps[T] {
  const d: { [K in WidgetType]: WidgetProps[K] } = {
    text: { title: 'Aviso', body: 'Escreva aqui o recado para a galera.', tone: 'accent' },
    rules: { title: 'Regras', items: ['Respeito acima de tudo', 'Sem spam', 'Chamou pro mix, apareça'] },
    countdown: { title: 'Próximo evento', at: Date.now() + 3 * 24 * 3600_000, doneText: 'Começou!' },
    voice: { title: 'Na voz agora' },
    online: { title: 'Online' },
    scoreboard: { title: 'Placar', rows: [{ name: 'Fulano', score: 12 }, { name: 'Ciclana', score: 9 }, { name: 'Beltrano', score: 4 }], order: 'desc' },
    pomodoro: { title: 'Foco', focus: 25, pause: 5, startedAt: null },
    channels: { title: 'Atalhos', channelIds: [] },
    clock: { title: 'Horário', tz: 'America/Sao_Paulo' },
    image: { url: '', caption: '', fit: 'cover' },
    links: { title: 'Links', items: [] },
    jam: { title: 'Jam' },
  };
  return structuredClone(d[type]) as WidgetProps[T];
}

// ---------------------------------------------------------------- tela do servidor (grade livre)

/**
 * A tela do servidor como uma grade: blocos do sistema (canais, conversa, membros, voz) e widgets vão em
 * qualquer lugar e tamanho. A barra de servidores fica sempre fixa em cima (é como a pessoa sai do servidor),
 * e o campo de digitar e os controles de voz vêm dentro dos blocos obrigatórios: o admin move e redimensiona,
 * mas não esconde. No celular e em telas pequenas, vale o layout padrão.
 */
export const SYSTEM_BLOCKS = ['channels', 'main', 'members', 'voicebar'] as const;
export type SystemBlock = (typeof SYSTEM_BLOCKS)[number];

export const SCREEN_COLS = 12;
export const SCREEN_ROWS = 12;
export const MAX_SCREEN_WIDGETS = 10;

export const BLOCK_INFO: Record<SystemBlock, { label: string; hint: string; required: boolean; min: [number, number] }> = {
  channels: { label: 'Canais', hint: 'Nome do servidor, salas e conversas.', required: true, min: [2, 4] },
  main: { label: 'Conversa e salas', hint: 'O chat, a sala de voz ou o fórum aberto, com o campo de digitar.', required: true, min: [4, 5] },
  members: { label: 'Membros', hint: 'Quem está no servidor. Opcional.', required: false, min: [2, 3] },
  voicebar: { label: 'Voz e perfil', hint: 'Controles da sala de voz, microfone, fone e o seu perfil.', required: true, min: [2, 2] },
};

export interface BlockPlacement {
  id: SystemBlock;
  type: 'block';
  block: SystemBlock;
  x: number;
  y: number;
  w: number;
  h: number;
}
export type ScreenItem = WidgetPlacement | BlockPlacement;

export const isBlock = (i: ScreenItem): i is BlockPlacement => i.type === 'block';

/** Limites de tamanho na tela (os widgets ocupam o dobro de colunas, porque a tela tem 12 e o Mural 6). */
export function screenLimits(i: { type: string; block?: SystemBlock }): { min: [number, number]; max: [number, number] } {
  if (i.type === 'block') return { min: BLOCK_INFO[i.block as SystemBlock].min, max: [SCREEN_COLS, SCREEN_ROWS] };
  const info = WIDGET_INFO[i.type as WidgetType];
  return { min: [Math.min(SCREEN_COLS, info.min[0] * 2), info.min[1]], max: [SCREEN_COLS, SCREEN_ROWS] };
}

/** O layout de sempre do Concord, como ponto de partida. */
export const defaultScreen = (): ScreenItem[] => [
  { id: 'channels', type: 'block', block: 'channels', x: 0, y: 0, w: 3, h: 10 },
  { id: 'voicebar', type: 'block', block: 'voicebar', x: 0, y: 10, w: 3, h: 2 },
  { id: 'main', type: 'block', block: 'main', x: 3, y: 0, w: 7, h: 12 },
  { id: 'members', type: 'block', block: 'members', x: 10, y: 0, w: 2, h: 12 },
];

// ---------------------------------------------------------------- configuração

export interface WorkshopConfig {
  version: typeof WORKSHOP_VERSION;
  pieces: Partial<Record<WorkshopPiece, WorkshopPackId>>;
  mural: { title: string; widgets: WidgetPlacement[] };
  /** tela do servidor em grade livre; sem ela, o layout padrão */
  screen?: { items: ScreenItem[] };
}

export const emptyWorkshop = (): WorkshopConfig => ({ version: WORKSHOP_VERSION, pieces: {}, mural: { title: 'Mural', widgets: [] } });

/** Instalar um pacote inteiro: todas as peças dele, mantendo o Mural. */
export function installPack(config: WorkshopConfig, pack: WorkshopPackId): WorkshopConfig {
  return { ...config, pieces: Object.fromEntries(WORKSHOP_PIECES.map((p) => [p, pack])) };
}

/** Dois widgets se sobrepõem na grade? */
export const overlaps = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

// ---------------------------------------------------------------- validação

export type ParseResult = { ok: true; value: WorkshopConfig } | { ok: false; error: string };

class Invalid extends Error {}
const bad = (msg: string): never => {
  throw new Invalid(msg);
};

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Objeto só com as chaves esperadas (chave desconhecida é erro, para não guardar lixo nem abrir brecha). */
function obj(v: unknown, where: string, keys: readonly string[]): Record<string, unknown> {
  if (!isObj(v)) bad(`${where}: esperava um objeto`);
  const o = v as Record<string, unknown>;
  for (const k of Object.keys(o)) if (!keys.includes(k)) bad(`${where}: chave desconhecida "${k}"`);
  return o;
}

// sem caracteres de controle nem os de direção de texto (dá para disfarçar um link com eles)
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f‪-‮⁦-⁩]/;

function text(v: unknown, where: string, max: number, opts: { min?: number; multiline?: boolean } = {}): string {
  if (typeof v !== 'string') bad(`${where}: esperava texto`);
  const s = (v as string).replace(/\r\n/g, '\n').trim();
  if (s.length < (opts.min ?? 0)) bad(`${where}: muito curto`);
  if (s.length > max) bad(`${where}: no máximo ${max} caracteres`);
  if (CONTROL.test(s) || (!opts.multiline && s.includes('\n'))) bad(`${where}: caracteres não permitidos`);
  return s;
}

function intIn(v: unknown, where: string, min: number, max: number): number {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < min || v > max) bad(`${where}: esperava um número inteiro de ${min} a ${max}`);
  return v as number;
}

function oneOf<T extends string>(v: unknown, where: string, list: readonly T[]): T {
  if (typeof v !== 'string' || !list.includes(v as T)) bad(`${where}: valor inválido`);
  return v as T;
}

function list<T>(v: unknown, where: string, max: number, item: (x: unknown, i: number) => T): T[] {
  if (!Array.isArray(v)) bad(`${where}: esperava uma lista`);
  const arr = v as unknown[];
  if (arr.length > max) bad(`${where}: no máximo ${max} itens`);
  return arr.map(item);
}

const ID = /^[A-Za-z0-9_-]{1,40}$/;
/** Imagem enviada pela Oficina (POST /servers/:id/workshop/image). */
export const WORKSHOP_IMAGE = /^\/uploads\/workshop\/[A-Za-z0-9-]+\.(png|jpg|gif|webp)$/;
// dois anos para frente ou para trás já dá conta de qualquer evento
const TIME_WINDOW = 2 * 365 * 24 * 3600_000;

function httpsUrl(v: unknown, where: string): string {
  const s = text(v, where, 300, { min: 1 });
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    return bad(`${where}: link inválido`);
  }
  if (u.protocol !== 'https:' || u.username || u.password) bad(`${where}: use um link https://`);
  return u.toString();
}

function widgetProps(type: WidgetType, v: unknown, where: string, now: number): WidgetProps[WidgetType] {
  const title = (o: Record<string, unknown>) => text(o.title, `${where}.title`, 40);
  switch (type) {
    case 'text': {
      const o = obj(v, where, ['title', 'body', 'tone']);
      return { title: title(o), body: text(o.body, `${where}.body`, 600, { multiline: true }), tone: oneOf(o.tone, `${where}.tone`, ['plain', 'accent', 'warn'] as const) };
    }
    case 'rules': {
      const o = obj(v, where, ['title', 'items']);
      return { title: title(o), items: list(o.items, `${where}.items`, 12, (x, i) => text(x, `${where}.items[${i}]`, 140, { min: 1 })) };
    }
    case 'countdown': {
      const o = obj(v, where, ['title', 'at', 'doneText']);
      return { title: title(o), at: intIn(o.at, `${where}.at`, now - TIME_WINDOW, now + TIME_WINDOW), doneText: text(o.doneText, `${where}.doneText`, 40) };
    }
    case 'voice':
    case 'online':
    case 'jam': {
      const o = obj(v, where, ['title']);
      return { title: title(o) };
    }
    case 'scoreboard': {
      const o = obj(v, where, ['title', 'rows', 'order']);
      return {
        title: title(o),
        rows: list(o.rows, `${where}.rows`, 10, (x, i) => {
          const r = obj(x, `${where}.rows[${i}]`, ['name', 'score']);
          return { name: text(r.name, `${where}.rows[${i}].name`, 32, { min: 1 }), score: intIn(r.score, `${where}.rows[${i}].score`, -999_999, 999_999) };
        }),
        order: oneOf(o.order, `${where}.order`, ['desc', 'asc'] as const),
      };
    }
    case 'pomodoro': {
      const o = obj(v, where, ['title', 'focus', 'pause', 'startedAt']);
      const startedAt = o.startedAt === null ? null : intIn(o.startedAt, `${where}.startedAt`, now - TIME_WINDOW, now + 60_000);
      return { title: title(o), focus: intIn(o.focus, `${where}.focus`, 5, 90), pause: intIn(o.pause, `${where}.pause`, 1, 30), startedAt };
    }
    case 'channels': {
      const o = obj(v, where, ['title', 'channelIds']);
      return { title: title(o), channelIds: list(o.channelIds, `${where}.channelIds`, 8, (x, i) => (typeof x === 'string' && ID.test(x) ? x : bad(`${where}.channelIds[${i}]: canal inválido`))) };
    }
    case 'clock': {
      const o = obj(v, where, ['title', 'tz']);
      return { title: title(o), tz: oneOf(o.tz, `${where}.tz`, TIMEZONES) };
    }
    case 'image': {
      const o = obj(v, where, ['url', 'caption', 'fit']);
      const url = o.url === '' ? '' : typeof o.url === 'string' && WORKSHOP_IMAGE.test(o.url) ? o.url : bad(`${where}.url: só imagens enviadas pela Oficina`);
      return { url, caption: text(o.caption, `${where}.caption`, 80), fit: oneOf(o.fit, `${where}.fit`, ['cover', 'contain'] as const) };
    }
    case 'links': {
      const o = obj(v, where, ['title', 'items']);
      return {
        title: title(o),
        items: list(o.items, `${where}.items`, 6, (x, i) => {
          const l = obj(x, `${where}.items[${i}]`, ['label', 'url']);
          return { label: text(l.label, `${where}.items[${i}].label`, 40, { min: 1 }), url: httpsUrl(l.url, `${where}.items[${i}].url`) };
        }),
      };
    }
  }
}

function widget(v: unknown, where: string, now: number, screen = false): WidgetPlacement {
  const o = obj(v, where, ['id', 'type', 'x', 'y', 'w', 'h', 'props']);
  const type = oneOf(o.type, `${where}.type`, WIDGET_TYPES);
  const { min, max } = screen ? screenLimits({ type }) : { min: WIDGET_INFO[type].min, max: WIDGET_INFO[type].max };
  const [cols, rows] = screen ? [SCREEN_COLS, SCREEN_ROWS] : [GRID_COLS, GRID_MAX_ROWS];
  const id =
    typeof o.id === 'string' && ID.test(o.id) && !(SYSTEM_BLOCKS as readonly string[]).includes(o.id) ? o.id : bad(`${where}.id: inválido`);
  const w = intIn(o.w, `${where}.w`, min[0], max[0]);
  const h = intIn(o.h, `${where}.h`, min[1], max[1]);
  const x = intIn(o.x, `${where}.x`, 0, cols - w);
  const y = intIn(o.y, `${where}.y`, 0, rows - h);
  return { id, type, x, y, w, h, props: widgetProps(type, o.props, `${where}.props`, now) } as WidgetPlacement;
}

function block(v: unknown, where: string): BlockPlacement {
  const o = obj(v, where, ['id', 'type', 'block', 'x', 'y', 'w', 'h']);
  const b = oneOf(o.block, `${where}.block`, SYSTEM_BLOCKS);
  if (o.id !== b) bad(`${where}.id: precisa ser igual ao bloco`);
  const { min } = screenLimits({ type: 'block', block: b });
  const w = intIn(o.w, `${where}.w`, min[0], SCREEN_COLS);
  const h = intIn(o.h, `${where}.h`, min[1], SCREEN_ROWS);
  return { id: b, type: 'block', block: b, x: intIn(o.x, `${where}.x`, 0, SCREEN_COLS - w), y: intIn(o.y, `${where}.y`, 0, SCREEN_ROWS - h), w, h };
}

function noOverlap(items: { id: string; x: number; y: number; w: number; h: number }[], where: string) {
  const ids = new Set<string>();
  items.forEach((it, i) => {
    if (ids.has(it.id)) bad(`${where}[${i}].id: repetido`);
    ids.add(it.id);
    for (let j = 0; j < i; j++) if (overlaps(it, items[j])) bad(`${where}[${i}]: está em cima de outro`);
  });
}

function screen(v: unknown, now: number): { items: ScreenItem[] } {
  const o = obj(v, 'screen', ['items']);
  if (!Array.isArray(o.items)) bad('screen.items: esperava uma lista');
  const raw = o.items as unknown[];
  if (raw.length > SYSTEM_BLOCKS.length + MAX_SCREEN_WIDGETS) bad('screen.items: itens demais');
  const items: ScreenItem[] = raw.map((x, i) =>
    isObj(x) && x.type === 'block' ? block(x, `screen.items[${i}]`) : widget(x, `screen.items[${i}]`, now, true),
  );
  if (items.filter((i) => !isBlock(i)).length > MAX_SCREEN_WIDGETS) bad(`screen.items: no máximo ${MAX_SCREEN_WIDGETS} widgets na tela`);
  for (const b of SYSTEM_BLOCKS)
    if (BLOCK_INFO[b].required && !items.some((i) => isBlock(i) && i.block === b)) bad(`screen: o bloco "${BLOCK_INFO[b].label}" é obrigatório`);
  noOverlap(items, 'screen.items');
  return { items };
}

/** Valida uma configuração vinda de fora. Nunca confia no cliente. */
export function parseWorkshop(input: unknown, now = Date.now()): ParseResult {
  try {
    const o = obj(input, 'oficina', ['version', 'pieces', 'mural', 'screen']);
    if (o.version !== WORKSHOP_VERSION) bad('oficina.version: versão desconhecida');
    const p = obj(o.pieces, 'pieces', WORKSHOP_PIECES);
    const pieces: WorkshopConfig['pieces'] = {};
    for (const [k, v] of Object.entries(p)) pieces[k as WorkshopPiece] = oneOf(v, `pieces.${k}`, WORKSHOP_PACKS);
    const m = obj(o.mural, 'mural', ['title', 'widgets']);
    const widgets = list(m.widgets, 'mural.widgets', MAX_WIDGETS, (x, i) => widget(x, `mural.widgets[${i}]`, now));
    noOverlap(widgets, 'mural.widgets');
    const value: WorkshopConfig = { version: WORKSHOP_VERSION, pieces, mural: { title: text(m.title, 'mural.title', 40, { min: 1 }), widgets } };
    if (o.screen !== undefined) value.screen = screen(o.screen, now);
    return { ok: true, value };
  } catch (err) {
    if (err instanceof Invalid) return { ok: false, error: err.message };
    throw err;
  }
}

/**
 * Publicar para os membros. No futuro exige boost do servidor; no Concord de testes, por enquanto, quem pode
 * gerenciar o servidor publica de graça. Isolado aqui para plugar o boost depois sem mexer nas rotas.
 */
export function canPublishWorkshop(ctx: { canManage: boolean; boosted?: boolean }): boolean {
  return ctx.canManage;
}
