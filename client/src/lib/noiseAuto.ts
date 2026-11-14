// "IA máxima automática": escolhe a força do DeepFilterNet3 pelo quanto de ruído há no microfone.
// A bancada (docs/supressao-bancada-baseline.md) mostrou que a força fixa de 45 dB corta 9 a 13 % da fala
// quando o ruído é forte, e que em sala silenciosa dá para apertar mais sem perda. Então: muito ruído →
// força menor (preserva a voz); pouco ruído → força maior (pausas em silêncio total).
// Sem DOM e sem WebAudio: a bancada (tools/denoise-bench) usa o mesmo código em Node.

export interface AutoState {
  /** piso de ruído estimado (dBFS): desce rápido, sobe devagar */
  floor: number;
  /** nível de fala estimado (dBFS): sobe rápido, desce devagar */
  speech: number;
  /** força em uso agora (dB) */
  strength: number;
  /** pós-filtro em uso agora (0 = desligado) */
  beta: number;
  lastChangeAt: number;
}

// começa no degrau do meio (tem que ser um dos degraus abaixo, senão a histerese nunca sai dele)
export const AUTO_INITIAL: AutoState = { floor: -60, speech: -30, strength: 30, beta: 0, lastChangeAt: 0 };

/**
 * Degraus de força por relação voz/ruído (dB). Entre uma troca e outra há histerese de 3 dB e 1 s.
 * Da varredura na bancada (voz TTS, 2026-11-13): com ruído forte (SNR 0–10) a força 20 corta 1,5–2 % da fala
 * contra 8–13 % da 30–60, tirando ~18 dB de ruído; com a sala silenciosa o corte satura (~5 %) e a força maior
 * só tira mais ruído, então ali compensa apertar. A estimativa aqui (picos de fala − piso) sai uns 5 dB acima da
 * SNR da bancada; os limiares já contam com isso.
 */
export const AUTO_STEPS: { minSnr: number; strength: number; beta: number }[] = [
  { minSnr: 32, strength: 60, beta: 0.02 },
  { minSnr: 24, strength: 45, beta: 0 },
  { minSnr: 16, strength: 30, beta: 0 },
  { minSnr: -Infinity, strength: 20, beta: 0 },
];

const HYSTERESIS_DB = 3;
const MIN_INTERVAL_MS = 1000;

/**
 * Recebe uma leitura de nível da entrada crua (dBFS, média de ~200 ms, a cada ~100 ms) e devolve o estado
 * novo. `strength`/`beta` só mudam quando a relação voz/ruído cruza um degrau com folga.
 */
export function autoStep(state: AutoState, inDb: number, now: number): AutoState {
  // nível de verdade abaixo de -90 é faixa parada: não aprende nada
  if (inDb < -90) return state;
  // o piso sobe ~3 dB/s: um ventilador que liga é reconhecido em uns 10 s (a força desce e a voz não corta)
  const floor = inDb < state.floor ? state.floor + (inDb - state.floor) * 0.3 : state.floor + 0.3;
  const speech = inDb > state.speech ? state.speech + (inDb - state.speech) * 0.5 : state.speech - 0.02; // desce ~0,2 dB/s
  const next = { ...state, floor: Math.min(-20, Math.max(-100, floor)), speech: Math.min(0, Math.max(-80, speech)) };
  const snr = next.speech - next.floor;
  const target = AUTO_STEPS.find((s) => snr >= s.minSnr)!;
  if (target.strength === state.strength) return next;
  if (now - state.lastChangeAt < MIN_INTERVAL_MS) return next;
  // histerese: para subir de degrau precisa passar o limite com folga; para descer, ficar abaixo com folga
  const current = AUTO_STEPS.find((s) => s.strength === state.strength) ?? target;
  const goingUp = target.strength > current.strength;
  if (goingUp && snr < target.minSnr + HYSTERESIS_DB) return next;
  if (!goingUp && snr > current.minSnr - HYSTERESIS_DB) return next;
  return { ...next, strength: target.strength, beta: target.beta, lastChangeAt: now };
}
