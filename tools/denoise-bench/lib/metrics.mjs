// Métricas com referência limpa (temos a voz limpa, então dá para medir melhor do que com DNSMOS):
// - atraso do processamento (alinhamento por correlação de envelopes)
// - SI-SDR nos trechos de fala (dB, maior é melhor)
// - fala cortada: % dos quadros de fala em que a saída caiu mais de 10 dB em relação ao esperado
// - ruído residual nas pausas (dBFS) e quanto de ruído saiu (dB em relação à entrada)
// - vazamento: energia da saída nos trechos sem fala, comparada à da voz
const FRAME = 20; // ms

export const dbfs = (x) => 10 * Math.log10(energy(x) + 1e-12);
export function energy(x, from = 0, to = x.length) {
  let e = 0;
  for (let i = from; i < to; i++) e += x[i] * x[i];
  return e / Math.max(1, to - from);
}

function envelope(x, sampleRate, msPerBin = 1) {
  const hop = Math.round((sampleRate * msPerBin) / 1000);
  const n = Math.floor(x.length / hop);
  const env = new Float32Array(n);
  for (let i = 0; i < n; i++) env[i] = Math.sqrt(energy(x, i * hop, (i + 1) * hop));
  return { env, hop };
}

/** Quantas amostras a saída está atrasada em relação à referência (0 a 200 ms). */
export function estimateDelay(ref, out, sampleRate, maxMs = 200) {
  const a = envelope(ref, sampleRate);
  const b = envelope(out, sampleRate);
  const n = Math.min(a.env.length, b.env.length);
  const maxLag = Math.round(maxMs);
  let best = 0;
  let bestScore = -Infinity;
  for (let lag = 0; lag <= maxLag; lag++) {
    let s = 0;
    for (let i = 0; i + lag < n; i++) s += a.env[i] * b.env[i + lag];
    if (s > bestScore) {
      bestScore = s;
      best = lag;
    }
  }
  // afina para a amostra: SI-SDR é sensível a desalinhamento de menos de 1 ms
  const coarse = best * a.hop;
  const win = a.hop * 2;
  const from = Math.max(0, coarse - win);
  let fine = coarse;
  let fineScore = -Infinity;
  const len = Math.min(ref.length, out.length - (coarse + win), sampleRate * 10);
  for (let lag = from; lag <= coarse + win; lag++) {
    let s = 0;
    for (let i = 0; i < len; i++) s += ref[i] * out[i + lag];
    if (s > fineScore) {
      fineScore = s;
      fine = lag;
    }
  }
  return fine;
}

/** Alinha a saída à referência (tira o atraso) e corta os dois no mesmo tamanho. */
export function align(ref, out, sampleRate) {
  const delay = estimateDelay(ref, out, sampleRate);
  const n = Math.min(ref.length, out.length - delay);
  return { ref: ref.subarray(0, n), out: out.subarray(delay, delay + n), delay };
}

/** Quadros de fala: energia da referência limpa até 35 dB abaixo do quadro mais forte. */
export function speechFrames(clean, sampleRate) {
  const hop = Math.round((sampleRate * FRAME) / 1000);
  const n = Math.floor(clean.length / hop);
  const e = new Float32Array(n);
  let max = 0;
  for (let i = 0; i < n; i++) {
    e[i] = energy(clean, i * hop, (i + 1) * hop);
    if (e[i] > max) max = e[i];
  }
  const thr = max * 10 ** (-35 / 10);
  const mask = new Uint8Array(n);
  for (let i = 0; i < n; i++) mask[i] = e[i] > thr ? 1 : 0;
  return { mask, hop, energies: e };
}

/** SI-SDR (dB) da saída contra a referência, só nos quadros de fala. */
export function siSdr(ref, out, mask, hop) {
  let dot = 0;
  let rr = 0;
  for (let f = 0; f < mask.length; f++) {
    if (!mask[f]) continue;
    for (let i = f * hop; i < (f + 1) * hop; i++) {
      dot += ref[i] * out[i];
      rr += ref[i] * ref[i];
    }
  }
  const scale = dot / (rr + 1e-12);
  let num = 0;
  let den = 0;
  for (let f = 0; f < mask.length; f++) {
    if (!mask[f]) continue;
    for (let i = f * hop; i < (f + 1) * hop; i++) {
      const t = scale * ref[i];
      num += t * t;
      den += (out[i] - t) ** 2;
    }
  }
  return 10 * Math.log10(num / (den + 1e-12) + 1e-12);
}

/**
 * Tudo de uma vez. `clean` é a voz limpa, `noisy` o que entrou no processador, `out` o que saiu.
 * Os três já alinhados e do mesmo tamanho.
 */
export function evaluate({ clean, noisy, out, sampleRate }) {
  const { mask, hop, energies: cleanE } = speechFrames(clean, sampleRate);
  const n = mask.length;
  let speech = 0;
  let cut = 0;
  const gains = [];
  for (let f = 0; f < n; f++) {
    if (!mask[f]) continue;
    const oe = energy(out, f * hop, (f + 1) * hop);
    gains.push(oe / (cleanE[f] + 1e-12));
  }
  gains.sort((a, b) => a - b);
  const typical = gains[Math.floor(gains.length / 2)] ?? 1; // ganho mediano nos quadros de fala
  for (let f = 0; f < n; f++) {
    if (!mask[f]) continue;
    speech++;
    const oe = energy(out, f * hop, (f + 1) * hop);
    if (oe < cleanE[f] * typical * 10 ** (-10 / 10)) cut++;
  }
  let pauseIn = 0;
  let pauseOut = 0;
  let pauses = 0;
  for (let f = 0; f < n; f++) {
    if (mask[f]) continue;
    pauses++;
    pauseIn += energy(noisy, f * hop, (f + 1) * hop);
    pauseOut += energy(out, f * hop, (f + 1) * hop);
  }
  pauseIn /= Math.max(1, pauses);
  pauseOut /= Math.max(1, pauses);
  return {
    speechFrames: speech,
    pauseFrames: pauses,
    /** % dos quadros de fala cortados (saída mais de 10 dB abaixo do esperado) */
    speechCutPct: speech ? (100 * cut) / speech : 0,
    /** SI-SDR da fala (dB) */
    siSdrDb: siSdr(clean, out, mask, hop),
    siSdrInDb: siSdr(clean, noisy, mask, hop),
    /** ruído que sobra nas pausas (dBFS) e quanto saiu em relação ao que entrou (dB) */
    residualDbfs: 10 * Math.log10(pauseOut + 1e-12),
    noiseReductionDb: 10 * Math.log10((pauseIn + 1e-12) / (pauseOut + 1e-12)),
    /** ganho mediano aplicado à fala (dB): perto de 0 = não abafou */
    speechGainDb: 10 * Math.log10(typical + 1e-12),
  };
}

/**
 * Buracos: trechos de mais de `minMs` ms em que a saída é silêncio absoluto enquanto a entrada tem som.
 * Com `ref` (a voz limpa), só conta onde há voz: tirar todo o ruído de uma pausa não é buraco, é o trabalho.
 */
export function findDropouts(input, out, sampleRate, minMs = 300, ref = null) {
  const hop = Math.round(sampleRate * 0.01);
  const n = Math.floor(Math.min(input.length, out.length) / hop);
  const holes = [];
  let start = -1;
  for (let f = 0; f <= n; f++) {
    const hasVoice = !ref || energy(ref, f * hop, (f + 1) * hop) > 1e-5;
    const silent = f < n && hasVoice && energy(input, f * hop, (f + 1) * hop) > 1e-6 && energy(out, f * hop, (f + 1) * hop) < 1e-10;
    if (silent && start < 0) start = f;
    if (!silent && start >= 0) {
      const ms = (f - start) * 10;
      if (ms >= minMs) holes.push({ atMs: start * 10, ms });
      start = -1;
    }
  }
  return holes;
}
