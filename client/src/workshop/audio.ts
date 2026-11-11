// Sintetizador dos sons da Oficina (WebAudio, sem arquivos). Volume baixo de propósito: são sons de interface.
import type { Tone } from './packs';

let ctx: AudioContext | null = null;
let noiseBuf: AudioBuffer | null = null;
const lastPlayed = new Map<string, number>();

function context(): AudioContext | null {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function noise(c: AudioContext): AudioBuffer {
  if (noiseBuf) return noiseBuf;
  const len = c.sampleRate;
  noiseBuf = c.createBuffer(1, len, c.sampleRate);
  const data = noiseBuf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  return noiseBuf;
}

/**
 * Toca uma receita. `key` + `gapMs` evitam metralhadora (passar o mouse rápido por vários ícones, várias
 * pessoas entrando ao mesmo tempo).
 */
export function playTones(tones: Tone[], key?: string, gapMs = 0, volume = 1) {
  if (key && gapMs) {
    const now = performance.now();
    if (now - (lastPlayed.get(key) ?? -Infinity) < gapMs) return;
    lastPlayed.set(key, now);
  }
  const c = context();
  if (!c) return;
  const t0 = c.currentTime + 0.01;
  const master = c.createGain();
  master.gain.value = Math.max(0, Math.min(1, volume));
  master.connect(c.destination);
  for (const n of tones) {
    const start = t0 + n.t;
    const end = start + n.d;
    const peak = n.g ?? 0.06;
    const env = c.createGain();
    env.gain.setValueAtTime(0, start);
    env.gain.linearRampToValueAtTime(peak, start + Math.min(0.015, n.d / 4));
    env.gain.exponentialRampToValueAtTime(0.0001, end);
    let src: AudioScheduledSourceNode;
    let head: AudioNode;
    if (n.noise) {
      const b = c.createBufferSource();
      b.buffer = noise(c);
      const bp = c.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = n.f;
      bp.Q.value = 0.9;
      b.connect(bp);
      src = b;
      head = bp;
    } else {
      const o = c.createOscillator();
      o.type = n.type ?? 'sine';
      o.frequency.setValueAtTime(n.f, start);
      if (n.to) o.frequency.exponentialRampToValueAtTime(n.to, end);
      if (n.vib) {
        const lfo = c.createOscillator();
        const depth = c.createGain();
        lfo.frequency.value = n.vib;
        depth.gain.value = n.f * 0.012;
        lfo.connect(depth).connect(o.frequency);
        lfo.start(start);
        lfo.stop(end + 0.05);
      }
      src = o;
      head = o;
    }
    if (n.lp) {
      const lp = c.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = n.lp;
      head.connect(lp);
      head = lp;
    }
    head.connect(env).connect(master);
    src.start(start);
    src.stop(end + 0.05);
  }
}
