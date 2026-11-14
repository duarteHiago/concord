// O worklet do DeepFilterNet3 com o wasm e o modelo que vão para produção (public/vendor/deepfilternet3).
// É o teste de regressão do "microfone mudo": a saída nunca pode ser silêncio quando entra som, e o modelo tem
// que avisar quando está pronto, quando falha e aceitar morrer.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { dbfs, loadWorklet, mix, noise, run, send, tone } from './worklet-host.mjs';

const root = (p) => fileURLToPath(new URL(`../${p}`, import.meta.url));
const vendor = 'public/vendor/deepfilternet3/v3';

async function assets() {
  const wasmModule = await WebAssembly.compile(readFileSync(root(`${vendor}/pkg/df_bg.wasm`)));
  const modelBytes = readFileSync(root(`${vendor}/models/DeepFilterNet3_onnx.tar.gz`));
  return { wasmModule, modelBytes };
}

test('DeepFilterNet3: carrega, avisa "ready" e processa sem emudecer', { timeout: 60_000 }, async () => {
  const Dfn = await loadWorklet(root('src/lib/worklets/deepfilter.worklet.js'), 'deepfilter-audio-processor');
  const proc = new Dfn({ processorOptions: { ...(await assets()), suppressionLevel: 45 } });
  assert.deepEqual(proc.port.sent[0], { type: 'ready', frameLength: 480 });
  // voz de mentira: harmônicos modulados (um tom puro o modelo trata como ruído, e com razão)
  const voiced = mix(tone(3, 140, 0.15), tone(3, 280, 0.1), tone(3, 420, 0.07), tone(3, 560, 0.05));
  for (let i = 0; i < voiced.length; i++) voiced[i] *= 0.5 + 0.5 * Math.sin(2 * Math.PI * 4 * (i / 48000));
  const input = mix(voiced, noise(3, 0.02));
  const { out, keep } = run(proc, [input]);
  assert.ok(keep);
  const tail = dbfs(out, 48000);
  assert.ok(Number.isFinite(tail) && tail > -60, `saída quase muda: ${tail.toFixed(1)} dBFS (entrada ${dbfs(input, 48000).toFixed(1)})`);
  assert.ok(!proc.port.sent.some((m) => m.type === 'error'), JSON.stringify(proc.port.sent));
});

test('DeepFilterNet3: ruído branco sozinho sai bem mais baixo do que entrou', { timeout: 60_000 }, async () => {
  const Dfn = await loadWorklet(root('src/lib/worklets/deepfilter.worklet.js'), 'deepfilter-audio-processor');
  const proc = new Dfn({ processorOptions: { ...(await assets()), suppressionLevel: 45 } });
  const input = noise(3, 0.05);
  const { out } = run(proc, [input]);
  const gain = dbfs(out, 48000) - dbfs(input, 48000);
  assert.ok(gain < -20, `só tirou ${(-gain).toFixed(1)} dB de ruído`);
});

test('DeepFilterNet3: "destroy" faz o processador devolver false (o navegador o recolhe)', { timeout: 60_000 }, async () => {
  const Dfn = await loadWorklet(root('src/lib/worklets/deepfilter.worklet.js'), 'deepfilter-audio-processor');
  const proc = new Dfn({ processorOptions: { ...(await assets()), suppressionLevel: 45 } });
  send(proc, 'destroy');
  assert.equal(run(proc, [noise(0.01)]).keep, false);
});

test('DeepFilterNet3: modelo inválido avisa "error" em vez de passar o som cru calado', { timeout: 60_000 }, async () => {
  const Dfn = await loadWorklet(root('src/lib/worklets/deepfilter.worklet.js'), 'deepfilter-audio-processor');
  const { wasmModule } = await assets();
  const proc = new Dfn({ processorOptions: { wasmModule, modelBytes: new Uint8Array([1, 2, 3]), suppressionLevel: 45 } });
  assert.equal(proc.port.sent[0]?.type, 'error');
  assert.equal(proc.port.sent[0]?.stage, 'init');
});
