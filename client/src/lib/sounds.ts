// Pequenos sons de interface gerados com WebAudio (sem arquivos).
let ctx: AudioContext | null = null;

const SOUNDS: Record<string, [number, number][]> = {
  join: [[523, 0], [784, 0.09]],
  leave: [[784, 0], [523, 0.09]],
  peerJoin: [[660, 0], [880, 0.08]],
  peerLeave: [[660, 0], [440, 0.08]],
  mute: [[440, 0]],
  unmute: [[660, 0]],
  stream: [[523, 0], [659, 0.07], [784, 0.14]],
  // "chamar atenção": um trinado curto, fácil de reconhecer
  nudge: [[880, 0], [660, 0.06], [880, 0.12], [660, 0.18], [880, 0.24], [1175, 0.32]],
  nudgeSent: [[660, 0], [880, 0.06]],
  mention: [[988, 0], [1319, 0.08]],
};

export function playSound(name: keyof typeof SOUNDS) {
  try {
    ctx ??= new AudioContext();
    const t0 = ctx.currentTime;
    for (const [freq, offset] of SOUNDS[name]) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, t0 + offset);
      gain.gain.linearRampToValueAtTime(0.08, t0 + offset + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + offset + 0.16);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t0 + offset);
      osc.stop(t0 + offset + 0.18);
    }
  } catch {
    // áudio indisponível
  }
}

// ---- sons dos minigames ----

function ctxOrNull(): AudioContext | null {
  try {
    ctx ??= new AudioContext();
    return ctx;
  } catch {
    return null;
  }
}

/** "Tique" curto da roleta passando por uma fatia. */
export function playTick() {
  const c = ctxOrNull();
  if (!c) return;
  const t = c.currentTime;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = 'square';
  osc.frequency.value = 1700;
  gain.gain.setValueAtTime(0.035, t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
  osc.connect(gain).connect(c.destination);
  osc.start(t);
  osc.stop(t + 0.035);
}

/** Dados chacoalhando: rajadas curtas de ruído. */
export function playRattle(seconds = 1) {
  const c = ctxOrNull();
  if (!c) return;
  const t0 = c.currentTime;
  const hits = Math.round(seconds * 14);
  for (let i = 0; i < hits; i++) {
    const at = t0 + (i / hits) * seconds + Math.random() * 0.03;
    const len = Math.floor(c.sampleRate * 0.025);
    const buf = c.createBuffer(1, len, c.sampleRate);
    const data = buf.getChannelData(0);
    for (let j = 0; j < len; j++) data[j] = (Math.random() * 2 - 1) * (1 - j / len);
    const src = c.createBufferSource();
    src.buffer = buf;
    const filter = c.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 2200 + Math.random() * 1500;
    const gain = c.createGain();
    gain.gain.value = 0.12 * (1 - (i / hits) * 0.6);
    src.connect(filter).connect(gain).connect(c.destination);
    src.start(at);
  }
}

/** Moeda girando no ar (um "tim" metálico) e o resultado. */
export function playCoin() {
  const c = ctxOrNull();
  if (!c) return;
  const t = c.currentTime;
  for (const [freq, offset] of [[2637, 0], [3136, 0.05]] as const) {
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = 'triangle';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.05, t + offset);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + offset + 0.6);
    osc.connect(gain).connect(c.destination);
    osc.start(t + offset);
    osc.stop(t + offset + 0.65);
  }
}

/** Pequena fanfarra do resultado. */
export function playWin() {
  const c = ctxOrNull();
  if (!c) return;
  const t = c.currentTime;
  [523, 659, 784, 1047].forEach((freq, i) => {
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = 'triangle';
    osc.frequency.value = freq;
    const at = t + i * 0.09;
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(0.07, at + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + (i === 3 ? 0.6 : 0.2));
    osc.connect(gain).connect(c.destination);
    osc.start(at);
    osc.stop(at + 0.65);
  });
}
