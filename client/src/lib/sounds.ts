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
