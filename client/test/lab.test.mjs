// Modos experimentais: o portão guiado pela IA e o controlador da força automática.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { AUTO_INITIAL, autoStep } from '../src/lib/noiseAuto.ts';
import { dbfs, loadWorklet, noise, tone } from './worklet-host.mjs';

const file = (name) => fileURLToPath(new URL(`../src/lib/worklets/${name}`, import.meta.url));

/** Roda o portão inteligente com dois sinais: o limpo (entrada 0) e o cru (entrada 1). */
function runGate(proc, clean, raw) {
  const out = new Float32Array(clean.length);
  for (let pos = 0; pos < clean.length; pos += 128) {
    const block = [new Float32Array(128)];
    proc.process([[clean.subarray(pos, pos + 128)], [raw.subarray(pos, pos + 128)]], [block], {});
    out.set(block[0].subarray(0, Math.min(128, clean.length - pos)), pos);
  }
  return out;
}

test('portão inteligente: abre quando a IA deixou o som passar, fecha quando ela tirou quase tudo', async () => {
  const Gate = await loadWorklet(file('smartgate.worklet.js'), 'concord-smartgate');
  const proc = new Gate();
  const voice = tone(1, 200, 0.2);
  // 1º segundo: IA deixou passar (limpo ≈ cru) → abre; depois 3 s em que a IA tirou 30 dB (ruído) → fecha
  // (segura 450 ms e solta em ~250 ms: mede o último segundo)
  const raw = new Float32Array(48000 * 4);
  const clean = new Float32Array(48000 * 4);
  raw.set(voice, 0);
  clean.set(voice, 0);
  const n = noise(3, 0.2);
  raw.set(n, 48000);
  clean.set(n.map((v) => v * 0.03), 48000);
  const out = runGate(proc, clean, raw);
  const openPart = dbfs(out, 24000, 48000);
  const closedPart = dbfs(out, 48000 * 3, 48000 * 4);
  assert.ok(openPart > dbfs(voice, 24000) - 1, `com voz saiu ${openPart.toFixed(1)} dB`);
  // fechado = -40 dB em relação ao que entrava limpo
  assert.ok(closedPart < dbfs(clean, 48000 * 3, 48000 * 4) - 30, `com ruído saiu ${closedPart.toFixed(1)} dB`);
  const last = proc.port.sent.at(-1);
  assert.equal(last.open, false);
  assert.ok(typeof last.kept === 'number');
});

test('portão inteligente: sem a entrada crua, trata tudo como voz (não corta)', async () => {
  const Gate = await loadWorklet(file('smartgate.worklet.js'), 'concord-smartgate');
  const proc = new Gate();
  const voice = tone(1, 200, 0.2);
  const out = new Float32Array(voice.length);
  for (let pos = 0; pos < voice.length; pos += 128) {
    const block = [new Float32Array(128)];
    proc.process([[voice.subarray(pos, pos + 128)]], [block], {});
    out.set(block[0], pos);
  }
  assert.ok(dbfs(out, 24000) > dbfs(voice, 24000) - 1);
});

test('força automática: sala silenciosa sobe a força, sala barulhenta desce, com histerese', () => {
  let s = AUTO_INITIAL;
  let now = 0;
  // 10 s de fala a -25 dB com pausas a -70 dB (sala silenciosa): SNR alto → 60 dB
  for (let i = 0; i < 100; i++) {
    now += 100;
    s = autoStep(s, i % 10 < 6 ? -25 : -70, now);
  }
  assert.equal(s.strength, 60, `silenciosa: ${JSON.stringify(s)}`);
  // ventilador ligado: pausas a -35 dB → SNR ~10 → força mínima (20 dB), para não cortar a voz
  for (let i = 0; i < 300; i++) {
    now += 100;
    s = autoStep(s, i % 10 < 6 ? -25 : -35, now);
  }
  assert.equal(s.strength, 20, `barulhenta: ${JSON.stringify(s)}`);
  // leitura de faixa parada não muda nada
  assert.deepEqual(autoStep(s, -120, now + 100), s);
});

test('força automática: não troca mais de uma vez por segundo', () => {
  const s = { ...AUTO_INITIAL, floor: -70, speech: -25, lastChangeAt: 0 };
  const a = autoStep(s, -25, 500);
  const b = autoStep(a, -25, 900);
  assert.equal(b.strength, AUTO_INITIAL.strength);
  const c = autoStep(b, -25, 1200);
  assert.equal(c.strength, 60);
});
