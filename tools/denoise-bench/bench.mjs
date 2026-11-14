// Bancada: para cada mistura de data/manifest.json, roda cada modelo e mede contra a voz limpa.
// Uso: node bench.mjs [--modes dfn,gtcrn,rnnoise,off] [--strength 45] [--engine node|browser] [--filter texto]
//      [--long 600]  (teste de estabilidade: N segundos contínuos num modelo, procurando buracos)
// Resultado: tabela no terminal, JSON em results/<data>.json e results/latest.json.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { align, dbfs, evaluate, findDropouts } from './lib/metrics.mjs';
import { readWav } from './lib/wav.mjs';

const here = fileURLToPath(new URL('.', import.meta.url));
const args = Object.fromEntries(process.argv.slice(2).map((a, i, all) => (a.startsWith('--') ? [a.slice(2), all[i + 1]?.startsWith('--') || all[i + 1] === undefined ? true : all[i + 1]] : [])).filter((x) => x.length));
const modes = String(args.modes ?? 'off,rnnoise,gtcrn,dfn').split(',');
const strength = Number(args.strength ?? 45);
const engine = args.engine ?? 'node';
const filter = args.filter ? String(args.filter) : null;

const { makeEngine } = engine === 'browser' ? await import('./lib/engines-browser.mjs') : await import('./lib/engines-node.mjs');

if (args.long) {
  const seconds = Number(args.long);
  const { pink, SR } = await import('./lib/synth.mjs');
  const mode = modes.at(-1);
  console.log(`Estabilidade: ${seconds}s contínuos no modelo ${mode}...`);
  const eng = await makeEngine(mode, { strength });
  const chunk = pink(10);
  let holes = [];
  let worst = -Infinity;
  const t0 = performance.now();
  for (let s = 0; s < seconds; s += 10) {
    const out = eng.processAsync ? await eng.processAsync(chunk) : eng.process(chunk);
    holes = holes.concat(findDropouts(chunk, out, SR).map((h) => ({ ...h, atMs: h.atMs + s * 1000 })));
    worst = Math.max(worst, dbfs(out));
  }
  const rtf = (performance.now() - t0) / 1000 / seconds;
  console.log(`fator de tempo real ${rtf.toFixed(3)} · buracos: ${holes.length} · erros do worklet: ${eng.errors?.().length ?? 0}`);
  if (holes.length) console.log(holes.slice(0, 10));
  eng.destroy();
  process.exit(holes.length ? 1 : 0);
}

const data = join(here, 'data');
const manifest = JSON.parse(readFileSync(join(data, 'manifest.json'), 'utf8')).filter((m) => !filter || m.name.includes(filter));
if (!manifest.length) {
  console.error('Sem misturas. Rode `npm run data` antes.');
  process.exit(1);
}

const rows = [];
for (const mode of modes) {
  const eng = await makeEngine(mode, { strength });
  let seconds = 0;
  let ms = 0;
  for (const item of manifest) {
    const clean = readWav(join(data, 'mix', item.clean)).samples;
    const noisy = readWav(join(data, 'mix', item.noisy)).samples;
    const t0 = performance.now();
    const raw = eng.processAsync ? await eng.processAsync(noisy) : eng.process(noisy);
    ms += performance.now() - t0;
    seconds += noisy.length / 48000;
    const a = align(clean, raw, 48000);
    const m = evaluate({ clean: a.ref, noisy: noisy.subarray(0, a.ref.length), out: a.out, sampleRate: 48000 });
    const holes = findDropouts(noisy.subarray(a.delay), raw.subarray(a.delay), 48000);
    rows.push({ mode, ...item, delayMs: (a.delay / 48) | 0, ...m, dropouts: holes.length, workletErrors: eng.errors?.().length ?? 0 });
  }
  rows.filter((r) => r.mode === mode).forEach((r) => (r.rtf = ms / 1000 / seconds));
  eng.destroy();
}

// resumo por modelo e por ruído
const summary = {};
for (const r of rows) {
  const key = `${r.mode}|${r.noise}`;
  const s = (summary[key] ??= { mode: r.mode, noise: r.noise, n: 0, siSdrIn: 0, siSdr: 0, nr: 0, cut: 0, gain: 0, residual: 0, drop: 0, delay: 0, rtf: r.rtf });
  s.n++;
  s.siSdrIn += r.siSdrInDb;
  s.siSdr += r.siSdrDb;
  s.nr += r.noiseReductionDb;
  s.cut += r.speechCutPct;
  s.gain += r.speechGainDb;
  s.residual += r.residualDbfs;
  s.drop += r.dropouts;
  s.delay += r.delayMs;
}
const fmt = (v, d = 1) => (Number.isFinite(v) ? v.toFixed(d) : '—');
console.log('\nmodelo   | ruído      | SI-SDR entra→sai (dB) | ruído tirado (dB) | resto nas pausas (dBFS) | fala cortada (%) | ganho na fala (dB) | atraso (ms) | buracos | RTF');
console.log('---------|------------|-----------------------|-------------------|-------------------------|------------------|--------------------|-------------|---------|-----');
for (const s of Object.values(summary)) {
  const n = s.n;
  console.log(
    `${s.mode.padEnd(8)} | ${s.noise.padEnd(10)} | ${fmt(s.siSdrIn / n).padStart(6)} → ${fmt(s.siSdr / n).padStart(6)}       | ${fmt(s.nr / n).padStart(17)} | ${fmt(s.residual / n).padStart(23)} | ${fmt(s.cut / n).padStart(16)} | ${fmt(s.gain / n).padStart(18)} | ${fmt(s.delay / n, 0).padStart(11)} | ${String(s.drop).padStart(7)} | ${fmt(s.rtf, 3)}`,
  );
}

mkdirSync(join(here, 'results'), { recursive: true });
const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 16);
const out = { at: new Date().toISOString(), engine, strength, node: process.version, rows, summary: Object.values(summary) };
writeFileSync(join(here, 'results', `${stamp}-${engine}.json`), JSON.stringify(out, null, 2));
writeFileSync(join(here, 'results', `latest-${engine}.json`), JSON.stringify(out, null, 2));
console.log(`\n${rows.length} medições salvas em results/${stamp}-${engine}.json`);
