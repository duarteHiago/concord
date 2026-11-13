// Ruídos sintéticos determinísticos (mesma sequência a cada rodada) para a bancada: servem para regressão e
// para comparar modelos entre si. Para julgar qualidade de verdade, use gravações reais (ver README).
export const SR = 48000;

function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

/** Ruído branco. */
export function white(seconds, seed = 1) {
  const r = rng(seed);
  const n = Math.round(seconds * SR);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = r() * 2 - 1;
  return out;
}

/** Ruído rosa (ventilador, ar-condicionado, chiado de rua): filtro de Paul Kellet sobre branco. */
export function pink(seconds, seed = 2) {
  const w = white(seconds, seed);
  const out = new Float32Array(w.length);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < w.length; i++) {
    const x = w[i];
    b0 = 0.99886 * b0 + x * 0.0555179;
    b1 = 0.99332 * b1 + x * 0.0750759;
    b2 = 0.969 * b2 + x * 0.153852;
    b3 = 0.8665 * b3 + x * 0.3104856;
    b4 = 0.55 * b4 + x * 0.5329522;
    b5 = -0.7616 * b5 - x * 0.016898;
    out[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + x * 0.5362) * 0.11;
    b6 = x * 0.115926;
  }
  return out;
}

/** Zumbido de rede elétrica (60 Hz e harmônicos), como fonte mal aterrada. */
export function hum(seconds, hz = 60) {
  const n = Math.round(seconds * SR);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    out[i] = 0.6 * Math.sin(2 * Math.PI * hz * t) + 0.3 * Math.sin(2 * Math.PI * 2 * hz * t) + 0.15 * Math.sin(2 * Math.PI * 3 * hz * t);
  }
  return out;
}

/** Teclado mecânico: estalos curtos (ruído filtrado com decaimento rápido) em intervalos irregulares, ~8/s. */
export function keyboard(seconds, seed = 3) {
  const r = rng(seed);
  const n = Math.round(seconds * SR);
  const out = new Float32Array(n);
  let t = 0;
  while (t < n) {
    const len = Math.round(SR * (0.004 + r() * 0.01));
    const bright = 0.3 + r() * 0.7;
    let prev = 0;
    for (let i = 0; i < len && t + i < n; i++) {
      const x = r() * 2 - 1;
      const hp = x - prev * (1 - bright); // mais agudo = mais "clique"
      prev = x;
      out[t + i] += hp * Math.exp((-6 * i) / len) * (0.5 + r() * 0.5);
    }
    t += Math.round(SR * (0.05 + r() * 0.2));
  }
  return out;
}

/** Deixa o sinal com a energia pedida (dBFS). */
export function normalize(x, targetDbfs) {
  let e = 0;
  for (let i = 0; i < x.length; i++) e += x[i] * x[i];
  const cur = 10 * Math.log10(e / x.length + 1e-12);
  const g = 10 ** ((targetDbfs - cur) / 20);
  const out = new Float32Array(x.length);
  for (let i = 0; i < x.length; i++) out[i] = x[i] * g;
  return out;
}

/** Mistura voz e ruído numa relação sinal-ruído (dB), medindo a voz só onde ela existe. */
export function mixAtSnr(clean, noiseSig, snrDb) {
  const n = clean.length;
  // energia da voz só nos trechos com voz (quadros acima de -35 dB do pico)
  const hop = Math.round(SR * 0.02);
  const frames = Math.floor(n / hop);
  const e = new Float32Array(frames);
  let max = 0;
  for (let f = 0; f < frames; f++) {
    let s = 0;
    for (let i = f * hop; i < (f + 1) * hop; i++) s += clean[i] * clean[i];
    e[f] = s / hop;
    if (e[f] > max) max = e[f];
  }
  let speechE = 0;
  let count = 0;
  for (let f = 0; f < frames; f++) if (e[f] > max * 10 ** (-35 / 10)) (speechE += e[f]), count++;
  speechE /= Math.max(1, count);
  let noiseE = 0;
  for (let i = 0; i < n; i++) noiseE += noiseSig[i % noiseSig.length] ** 2;
  noiseE /= n;
  const g = Math.sqrt(speechE / (noiseE + 1e-12) / 10 ** (snrDb / 10));
  const out = new Float32Array(n);
  const noiseOut = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    noiseOut[i] = noiseSig[i % noiseSig.length] * g;
    out[i] = clean[i] + noiseOut[i];
  }
  return { noisy: out, noise: noiseOut };
}

export const NOISES = {
  ventilador: (s) => pink(s),
  zumbido: (s) => hum(s),
  teclado: (s) => keyboard(s),
  branco: (s) => white(s),
};
