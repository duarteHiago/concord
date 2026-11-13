// Os worklets próprios do microfone (mono seguro contra fase e medidor), rodando em Node.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { dbfs, invert, loadWorklet, noise, run, send, silence, tone } from './worklet-host.mjs';

const file = (name) => fileURLToPath(new URL(`../src/lib/worklets/${name}`, import.meta.url));

test('mono: canais iguais viram a média (mesmo nível)', async () => {
  const Mono = await loadWorklet(file('mono.worklet.js'), 'concord-mono');
  const voice = tone(1, 220);
  const { out } = run(new Mono(), [voice, voice]);
  assert.ok(Math.abs(dbfs(out, 24000) - dbfs(voice, 24000)) < 0.5, `saiu ${dbfs(out, 24000).toFixed(1)} dB, entrou ${dbfs(voice, 24000).toFixed(1)} dB`);
});

test('mono: canal direito em oposição de fase não cancela a voz', async () => {
  const Mono = await loadWorklet(file('mono.worklet.js'), 'concord-mono');
  const voice = tone(1, 220);
  const proc = new Mono();
  const { out } = run(proc, [voice, invert(voice)]);
  // a soma pura daria silêncio absoluto; depois de ~100 ms a mistura já decidiu inverter o 2º canal
  const tail = dbfs(out, 24000);
  assert.ok(tail > dbfs(voice, 24000) - 1, `voz sumiu: ${tail.toFixed(1)} dBFS`);
  assert.ok(proc.port.sent.some((m) => m.mode === 'inv'), 'não avisou o modo "inv"');
});

test('mono: canal morto usa só o canal vivo, no nível cheio', async () => {
  const Mono = await loadWorklet(file('mono.worklet.js'), 'concord-mono');
  const voice = tone(1, 220);
  const { out } = run(new Mono(), [voice, silence(1)]);
  assert.ok(Math.abs(dbfs(out, 24000) - dbfs(voice, 24000)) < 0.5, `saiu ${dbfs(out, 24000).toFixed(1)} dB (a média deixaria 6 dB abaixo)`);
});

test('mono: entrada já mono passa como está', async () => {
  const Mono = await loadWorklet(file('mono.worklet.js'), 'concord-mono');
  const voice = tone(0.1, 220);
  const { out } = run(new Mono(), [voice]);
  assert.deepEqual(Array.from(out.subarray(0, 8)), Array.from(voice.subarray(0, 8)));
});

test('medidor: reporta o nível em dBFS, passa o som e morre com "destroy"', async () => {
  const Meter = await loadWorklet(file('meter.worklet.js'), 'concord-meter');
  const proc = new Meter();
  const signal = noise(1, 0.1);
  const { out, keep } = run(proc, [signal]);
  assert.ok(keep);
  assert.deepEqual(Array.from(out.subarray(0, 8)), Array.from(signal.subarray(0, 8)));
  const last = proc.port.sent.at(-1);
  assert.ok(last && Math.abs(last.db - dbfs(signal)) < 1, `mediu ${last?.db}, esperado ${dbfs(signal).toFixed(1)}`);
  assert.ok(proc.port.sent.length >= 9, `só ${proc.port.sent.length} leituras em 1 s`);
  send(proc, 'destroy');
  assert.equal(run(proc, [signal.subarray(0, 128)]).keep, false);
});

test('medidor: sem entrada ligada conta como silêncio (é o que o vigia precisa ver)', async () => {
  const Meter = await loadWorklet(file('meter.worklet.js'), 'concord-meter');
  const proc = new Meter();
  run(proc, [noise(0.5, 0.1)]);
  for (let i = 0; i < 400; i++) proc.process([[]], [[new Float32Array(128)]], {});
  assert.ok(proc.port.sent.at(-1).db < -90, `ficou em ${proc.port.sent.at(-1).db}`);
});
