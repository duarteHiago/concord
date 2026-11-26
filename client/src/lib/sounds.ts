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
  // gravação da sala: três toques graves subindo (começou) e descendo (parou), bem diferente dos outros
  recordStart: [[392, 0], [392, 0.12], [587, 0.24]],
  recordStop: [[587, 0], [392, 0.12]],
  // "chamar atenção": tem som próprio, mais alto e com zumbido (ver playNudge)
  nudge: [],
  nudgeSent: [[660, 0], [880, 0.06]],
  // código compartilhado: "plim" duplo
  clip: [[1175, 0], [1568, 0.07], [1175, 0.16], [1568, 0.23]],
};

export function playSound(name: keyof typeof SOUNDS) {
  if (name === 'nudge') return playNudge();
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

/**
 * "Chamar atenção": trinado que sobe no fim, por cima de um zumbido vibrando (como celular no vibra), os dois
 * durando o mesmo tanto que a tremida (750 ms, ver desktop/main.cjs). Mais alto que os outros sons de propósito.
 */
const NUDGE_SECONDS = 0.75;
const NUDGE_TRILL: [number, number][] = [[880, 0], [660, 0.08], [880, 0.16], [660, 0.24], [880, 0.32], [660, 0.4], [1175, 0.5], [1568, 0.6]];

function playNudge() {
  try {
    ctx ??= new AudioContext();
    const t0 = ctx.currentTime;

    for (const [freq, offset] of NUDGE_TRILL) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, t0 + offset);
      gain.gain.linearRampToValueAtTime(0.2, t0 + offset + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + offset + 0.14);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t0 + offset);
      osc.stop(t0 + offset + 0.16);
    }

    // zumbido: onda grave e abafada, com o volume pulsando rápido (o "vibrar")
    const buzz = ctx.createOscillator();
    buzz.type = 'sawtooth';
    buzz.frequency.value = 95;
    const lowpass = ctx.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = 900;
    const pulse = ctx.createGain();
    pulse.gain.value = 0.5;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 22;
    const lfoDepth = ctx.createGain();
    lfoDepth.gain.value = 0.5;
    lfo.connect(lfoDepth).connect(pulse.gain);
    const envelope = ctx.createGain();
    envelope.gain.setValueAtTime(0, t0);
    envelope.gain.linearRampToValueAtTime(0.16, t0 + 0.03);
    envelope.gain.setValueAtTime(0.16, t0 + NUDGE_SECONDS - 0.15);
    envelope.gain.linearRampToValueAtTime(0, t0 + NUDGE_SECONDS);
    buzz.connect(lowpass).connect(pulse).connect(envelope).connect(ctx.destination);
    buzz.start(t0);
    lfo.start(t0);
    buzz.stop(t0 + NUDGE_SECONDS + 0.05);
    lfo.stop(t0 + NUDGE_SECONDS + 0.05);
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

// ---- avisos de mensagem e menção ----
// Escolhidos pelo usuário entre algumas opções (nov/2026): "Gota" para mensagem e "Acorde" para menção. Baixos e
// curtos de propósito; passam por um passa-baixa suave (tira o chiado das senoides) e um compressor leve (segura
// os picos quando dois tocam juntos). O volume é o das preferências (0 a 100, padrão 60).

let notifyBus: { input: GainNode } | null = null;

function notifyInput(volume: number): GainNode | null {
  const c = ctxOrNull();
  if (!c) return null;
  if (c.state === 'suspended') void c.resume();
  if (!notifyBus) {
    const lowpass = c.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = 5200;
    lowpass.Q.value = 0.3;
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -24;
    comp.ratio.value = 3;
    comp.attack.value = 0.003;
    comp.release.value = 0.15;
    const input = c.createGain();
    input.connect(lowpass).connect(comp).connect(c.destination);
    notifyBus = { input };
  }
  notifyBus.input.gain.value = Math.max(0, Math.min(1, volume / 100));
  return notifyBus.input;
}

/** Um tom curto: ataque, queda exponencial e, se pedir, a frequência escorregando (a "gota"). */
function softTone(c: AudioContext, out: AudioNode, o: { freq: number; at?: number; attack?: number; decay: number; gain: number; glide?: number }) {
  const t = c.currentTime + (o.at ?? 0);
  const attack = o.attack ?? 0.006;
  const env = c.createGain();
  env.gain.setValueAtTime(0, t);
  env.gain.linearRampToValueAtTime(o.gain, t + attack);
  env.gain.exponentialRampToValueAtTime(0.0001, t + attack + o.decay);
  env.connect(out);
  const osc = c.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(o.freq, t);
  if (o.glide) osc.frequency.exponentialRampToValueAtTime(o.freq * o.glide, t + Math.min(0.09, o.decay));
  osc.connect(env);
  osc.start(t);
  osc.stop(t + attack + o.decay + 0.05);
}

let lastMessageSound = 0;

/**
 * "message" = Gota (um pingo que escorrega para baixo); "mention" = Acorde (duas notas juntas, levemente
 * desencontradas). Numa conversa animada a Gota toca no máximo uma vez a cada 1,5 s.
 */
export function playNotify(kind: 'message' | 'mention', volume = 60) {
  if (kind === 'message') {
    if (Date.now() - lastMessageSound < 1500) return;
    lastMessageSound = Date.now();
  }
  const out = notifyInput(volume);
  const c = ctx;
  if (!out || !c) return;
  if (kind === 'message') {
    softTone(c, out, { freq: 880, glide: 0.62, decay: 0.12, gain: 0.07 });
  } else {
    softTone(c, out, { freq: 494, attack: 0.012, decay: 0.42, gain: 0.04 });
    softTone(c, out, { freq: 740, attack: 0.012, decay: 0.38, gain: 0.035, at: 0.035 });
  }
}
