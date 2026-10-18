// Efeitos de voz no microfone, como um processador do LiveKit (WebAudio).
// O processador sobrevive a trocas de microfone: o LiveKit chama restart() quando a faixa reinicia.
import type { AudioProcessorOptions, LocalAudioTrack, Track, TrackProcessor } from 'livekit-client';

export type EffectId = 'none' | 'robot' | 'radio' | 'echo' | 'cave' | 'megaphone' | 'deep' | 'chipmunk';

export const EFFECTS: { id: EffectId; label: string; hint: string }[] = [
  { id: 'none', label: 'Sem efeito', hint: 'Sua voz normal' },
  { id: 'deep', label: 'Voz grossa', hint: 'Mais grave' },
  { id: 'chipmunk', label: 'Esquilo', hint: 'Mais aguda' },
  { id: 'robot', label: 'Robô', hint: 'Metálica' },
  { id: 'radio', label: 'Rádio', hint: 'Walkie-talkie' },
  { id: 'megaphone', label: 'Megafone', hint: 'Estourada' },
  { id: 'echo', label: 'Eco', hint: 'Repetições' },
  { id: 'cave', label: 'Caverna', hint: 'Reverberação' },
];

// Deslocador de tom simples: duas leituras de uma linha de atraso, com janela triangular.
const PITCH_WORKLET = `
class ConcordPitch extends AudioWorkletProcessor {
  static get parameterDescriptors() { return [{ name: 'ratio', defaultValue: 1, minValue: 0.5, maxValue: 2 }]; }
  constructor() {
    super();
    this.size = 4096; this.buf = new Float32Array(this.size); this.w = 0;
    this.win = 1200; this.phase = 0;
  }
  read(pos) {
    const i = Math.floor(pos); const f = pos - i;
    const a = this.buf[(i + this.size) % this.size]; const b = this.buf[(i + 1 + this.size) % this.size];
    return a + (b - a) * f;
  }
  process(inputs, outputs, params) {
    const input = inputs[0] && inputs[0][0];
    const out = outputs[0];
    if (!input) return true;
    const ratio = params.ratio[0];
    for (let i = 0; i < input.length; i++) {
      this.buf[this.w] = input[i];
      this.phase = (this.phase + (1 - ratio) + this.win) % this.win;
      const d1 = this.phase; const d2 = (this.phase + this.win / 2) % this.win;
      const g1 = 1 - Math.abs((2 * d1) / this.win - 1); const g2 = 1 - Math.abs((2 * d2) / this.win - 1);
      const v = this.read(this.w - d1) * g1 + this.read(this.w - d2) * g2;
      for (let c = 0; c < out.length; c++) out[c][i] = v;
      this.w = (this.w + 1) % this.size;
    }
    return true;
  }
}
registerProcessor('concord-pitch', ConcordPitch);
`;

const workletLoaded = new WeakMap<BaseAudioContext, Promise<void>>();
function loadPitchWorklet(ctx: AudioContext) {
  let p = workletLoaded.get(ctx);
  if (!p) {
    const url = URL.createObjectURL(new Blob([PITCH_WORKLET], { type: 'application/javascript' }));
    p = ctx.audioWorklet.addModule(url).finally(() => URL.revokeObjectURL(url));
    workletLoaded.set(ctx, p);
  }
  return p;
}

function distortionCurve(amount: number) {
  const n = 1024;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / n - 1;
    curve[i] = ((3 + amount) * x * 20 * (Math.PI / 180)) / (Math.PI + amount * Math.abs(x));
  }
  return curve;
}

function impulse(ctx: AudioContext, seconds: number, decay: number) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const data = buf.getChannelData(c);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len) ** decay;
  }
  return buf;
}

/** Monta o grafo do efeito entre a entrada e a saída. Devolve os nós para desligar depois. */
async function build(ctx: AudioContext, effect: EffectId, src: AudioNode, dest: AudioNode): Promise<AudioNode[]> {
  const nodes: AudioNode[] = [];
  const add = <T extends AudioNode>(n: T) => (nodes.push(n), n);

  switch (effect) {
    case 'deep':
    case 'chipmunk': {
      await loadPitchWorklet(ctx);
      const pitch = add(new AudioWorkletNode(ctx, 'concord-pitch'));
      pitch.parameters.get('ratio')!.value = effect === 'deep' ? 0.72 : 1.55;
      src.connect(pitch).connect(dest);
      break;
    }
    case 'robot': {
      const ring = add(ctx.createGain());
      ring.gain.value = 0;
      const osc = add(ctx.createOscillator());
      osc.type = 'sine';
      osc.frequency.value = 55;
      osc.connect(ring.gain);
      osc.start();
      const boost = add(ctx.createGain());
      boost.gain.value = 1.6;
      src.connect(ring).connect(boost).connect(dest);
      break;
    }
    case 'radio':
    case 'megaphone': {
      const hp = add(ctx.createBiquadFilter());
      hp.type = 'highpass';
      hp.frequency.value = effect === 'radio' ? 500 : 900;
      const lp = add(ctx.createBiquadFilter());
      lp.type = 'lowpass';
      lp.frequency.value = effect === 'radio' ? 3200 : 4000;
      const shaper = add(ctx.createWaveShaper());
      shaper.curve = distortionCurve(effect === 'radio' ? 30 : 120);
      shaper.oversample = '2x';
      const comp = add(ctx.createDynamicsCompressor());
      src.connect(hp).connect(lp).connect(shaper).connect(comp).connect(dest);
      break;
    }
    case 'echo': {
      const delay = add(ctx.createDelay(1));
      delay.delayTime.value = 0.28;
      const feedback = add(ctx.createGain());
      feedback.gain.value = 0.38;
      const wet = add(ctx.createGain());
      wet.gain.value = 0.55;
      src.connect(dest);
      src.connect(delay);
      delay.connect(feedback).connect(delay);
      delay.connect(wet).connect(dest);
      break;
    }
    case 'cave': {
      const conv = add(ctx.createConvolver());
      conv.buffer = impulse(ctx, 2.8, 2.5);
      const wet = add(ctx.createGain());
      wet.gain.value = 0.7;
      src.connect(dest);
      src.connect(conv).connect(wet).connect(dest);
      break;
    }
    default:
      src.connect(dest);
  }
  return nodes;
}

class EffectProcessor implements TrackProcessor<Track.Kind.Audio, AudioProcessorOptions> {
  name = 'concord-voice-effect';
  processedTrack?: MediaStreamTrack;
  private effect: EffectId;
  private nodes: AudioNode[] = [];
  private source?: MediaStreamAudioSourceNode;
  private dest?: MediaStreamAudioDestinationNode;

  constructor(effect: EffectId) {
    this.effect = effect;
  }

  async init(opts: AudioProcessorOptions) {
    const ctx = opts.audioContext;
    if (ctx.state === 'suspended') await ctx.resume().catch(() => {});
    this.source = ctx.createMediaStreamSource(new MediaStream([opts.track]));
    this.dest = ctx.createMediaStreamDestination();
    this.nodes = await build(ctx, this.effect, this.source, this.dest);
    this.processedTrack = this.dest.stream.getAudioTracks()[0];
  }

  async restart(opts: AudioProcessorOptions) {
    await this.destroy();
    await this.init(opts);
  }

  async destroy() {
    for (const n of this.nodes) {
      try {
        if (n instanceof OscillatorNode) n.stop();
        n.disconnect();
      } catch {
        // já desligado
      }
    }
    this.source?.disconnect();
    this.nodes = [];
  }
}

let sharedContext: AudioContext | null = null;

/** Aplica (ou remove) o efeito na faixa do microfone. */
export async function applyVoiceEffect(track: LocalAudioTrack, effect: EffectId) {
  if (effect === 'none') {
    if (track.getProcessor()) await track.stopProcessor();
    return;
  }
  sharedContext ??= new AudioContext({ latencyHint: 'interactive' });
  track.setAudioContext(sharedContext);
  await track.setProcessor(new EffectProcessor(effect));
}
