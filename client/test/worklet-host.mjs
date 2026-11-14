// Roda um AudioWorkletProcessor em Node, sem navegador: define os globais que o worklet espera
// (AudioWorkletProcessor, registerProcessor, sampleRate) e devolve a classe registrada. Serve para testar o
// processamento do microfone de verdade (inclusive o DeepFilterNet3 com o wasm e o modelo de produção).
import { pathToFileURL } from 'node:url';

export const SAMPLE_RATE = 48000;
export const BLOCK = 128;

const registry = new Map();
globalThis.sampleRate = SAMPLE_RATE;
globalThis.AudioWorkletProcessor ??= class {
  constructor() {
    const sent = [];
    this.port = { onmessage: null, sent, postMessage: (m) => sent.push(m) };
  }
};
globalThis.registerProcessor ??= (name, cls) => registry.set(name, cls);

/** Carrega o arquivo do worklet e devolve a classe registrada com esse nome. */
export async function loadWorklet(file, name) {
  await import(pathToFileURL(file).href);
  const cls = registry.get(name);
  if (!cls) throw new Error(`worklet ${name} não registrado em ${file}`);
  return cls;
}

/** Manda uma mensagem para o processador como a thread principal faria. */
export const send = (proc, data) => proc.port.onmessage?.({ data });

/** Processa canais inteiros em blocos de 128 e devolve a saída mono. `channels` é uma lista de Float32Array. */
export function run(proc, channels, { outputs = 1 } = {}) {
  const n = channels[0].length;
  const out = new Float32Array(n);
  let keep = true;
  for (let pos = 0; pos < n && keep; pos += BLOCK) {
    const len = Math.min(BLOCK, n - pos);
    const input = channels.map((c) => c.subarray(pos, pos + len));
    const block = Array.from({ length: outputs }, () => new Float32Array(len));
    keep = proc.process([input], [block], {});
    out.set(block[0], pos);
  }
  return { out, keep };
}

export const dbfs = (buf, from = 0, to = buf.length) => {
  let e = 0;
  for (let i = from; i < to; i++) e += buf[i] * buf[i];
  return 10 * Math.log10(e / Math.max(1, to - from) + 1e-12);
};

export function tone(seconds, hz, amp = 0.3, phase = 0) {
  const n = Math.round(seconds * SAMPLE_RATE);
  const buf = new Float32Array(n);
  for (let i = 0; i < n; i++) buf[i] = amp * Math.sin(2 * Math.PI * hz * (i / SAMPLE_RATE) + phase);
  return buf;
}

/** Ruído branco determinístico (gerador simples, mesma sequência a cada rodada). */
export function noise(seconds, amp = 0.05, seed = 1) {
  const n = Math.round(seconds * SAMPLE_RATE);
  const buf = new Float32Array(n);
  let s = seed >>> 0;
  for (let i = 0; i < n; i++) {
    s = (s * 1664525 + 1013904223) >>> 0;
    buf[i] = amp * ((s / 0xffffffff) * 2 - 1);
  }
  return buf;
}

export const mix = (...bufs) => {
  const out = new Float32Array(bufs[0].length);
  for (const b of bufs) for (let i = 0; i < out.length; i++) out[i] += b[i];
  return out;
};
export const invert = (buf) => buf.map((v) => -v);
export const silence = (seconds) => new Float32Array(Math.round(seconds * SAMPLE_RATE));
