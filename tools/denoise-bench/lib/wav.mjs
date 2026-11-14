// Ler e escrever WAV (PCM 16 bits ou float 32) sem dependências. Tudo vira Float32Array mono em [-1, 1].
import { readFileSync, writeFileSync } from 'node:fs';

export function readWav(path) {
  const buf = readFileSync(path);
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') throw new Error(`${path}: não é WAV`);
  let pos = 12;
  let fmt = null;
  let data = null;
  while (pos + 8 <= buf.length) {
    const id = buf.toString('ascii', pos, pos + 4);
    const size = buf.readUInt32LE(pos + 4);
    const body = pos + 8;
    if (id === 'fmt ') {
      fmt = { format: buf.readUInt16LE(body), channels: buf.readUInt16LE(body + 2), sampleRate: buf.readUInt32LE(body + 4), bits: buf.readUInt16LE(body + 14) };
      if (fmt.format === 0xfffe) fmt.format = buf.readUInt16LE(body + 24); // WAVE_FORMAT_EXTENSIBLE
    } else if (id === 'data') data = buf.subarray(body, body + size);
    pos = body + size + (size % 2);
  }
  if (!fmt || !data) throw new Error(`${path}: WAV sem fmt/data`);
  const frames = Math.floor(data.length / (fmt.channels * (fmt.bits / 8)));
  const out = new Float32Array(frames);
  for (let i = 0; i < frames; i++) {
    let sum = 0;
    for (let c = 0; c < fmt.channels; c++) {
      const off = (i * fmt.channels + c) * (fmt.bits / 8);
      if (fmt.format === 3) sum += data.readFloatLE(off);
      else if (fmt.bits === 16) sum += data.readInt16LE(off) / 32768;
      else if (fmt.bits === 24) sum += ((data[off] | (data[off + 1] << 8) | (data[off + 2] << 16)) << 8) / 2147483648;
      else if (fmt.bits === 32) sum += data.readInt32LE(off) / 2147483648;
      else if (fmt.bits === 8) sum += (data[off] - 128) / 128;
      else throw new Error(`${path}: ${fmt.bits} bits não suportado`);
    }
    out[i] = sum / fmt.channels;
  }
  return { samples: out, sampleRate: fmt.sampleRate };
}

export function writeWav(path, samples, sampleRate) {
  const bytes = samples.length * 2;
  const buf = Buffer.alloc(44 + bytes);
  buf.write('RIFF', 0, 'ascii');
  buf.writeUInt32LE(36 + bytes, 4);
  buf.write('WAVE', 8, 'ascii');
  buf.write('fmt ', 12, 'ascii');
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36, 'ascii');
  buf.writeUInt32LE(bytes, 40);
  for (let i = 0; i < samples.length; i++) buf.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(samples[i] * 32767))), 44 + i * 2);
  writeFileSync(path, buf);
}

/** Reamostragem por interpolação linear com filtro simples; serve para voz (não para medir qualidade do filtro). */
export function resample(samples, from, to) {
  if (from === to) return samples;
  const ratio = from / to;
  const n = Math.floor(samples.length / ratio);
  const out = new Float32Array(n);
  // média móvel curta antes de descer de taxa, para não dobrar o espectro
  let src = samples;
  if (ratio > 1) {
    const k = Math.round(ratio);
    src = new Float32Array(samples.length);
    let acc = 0;
    for (let i = 0; i < samples.length; i++) {
      acc += samples[i] - (i >= k ? samples[i - k] : 0);
      src[i] = acc / k;
    }
  }
  for (let i = 0; i < n; i++) {
    const p = i * ratio;
    const j = Math.floor(p);
    const f = p - j;
    out[i] = src[j] * (1 - f) + (src[j + 1] ?? src[j]) * f;
  }
  return out;
}
