// Processamento do microfone como um processador do LiveKit (WebAudio):
// supressão de ruído por IA (GTCRN ou RNNoise) → efeito de voz.
// O processador sobrevive a trocas de microfone: o LiveKit chama restart() quando a faixa reinicia.
import { GtcrnWorkletNode, RnnoiseWorkletNode, loadGtcrn, loadRnnoise } from '@sapphi-red/web-noise-suppressor';
import gtcrnWasmUrl from '@sapphi-red/web-noise-suppressor/gtcrn.wasm?url';
import gtcrnWorkletUrl from '@sapphi-red/web-noise-suppressor/gtcrnWorklet.js?url';
import rnnoiseWasmUrl from '@sapphi-red/web-noise-suppressor/rnnoise.wasm?url';
import rnnoiseSimdWasmUrl from '@sapphi-red/web-noise-suppressor/rnnoise_simd.wasm?url';
import rnnoiseWorkletUrl from '@sapphi-red/web-noise-suppressor/rnnoiseWorklet.js?url';
import type { AudioProcessorOptions, LocalAudioTrack, Track, TrackProcessor } from 'livekit-client';

/** off: nenhum; browser: filtro do navegador; rnnoise / gtcrn: redes neurais (rodam no seu PC). */
export type NoiseMode = 'off' | 'browser' | 'rnnoise' | 'gtcrn';

export const NOISE_MODES: { id: NoiseMode; label: string; hint: string }[] = [
  { id: 'gtcrn', label: 'IA avançada (GTCRN)', hint: 'Remove até barulhos fortes (teclado mecânico, ventilador, rua). Usa um pouco mais de CPU.' },
  { id: 'rnnoise', label: 'IA leve (RNNoise)', hint: 'A mesma do Jitsi e do OBS. Boa e muito leve.' },
  { id: 'browser', label: 'Do navegador', hint: 'O filtro básico do Chrome.' },
  { id: 'off', label: 'Desligada', hint: 'Som cru do microfone (bom para música).' },
];

const binaries = new Map<string, Promise<ArrayBuffer>>();
const wasm = (key: string, load: () => Promise<ArrayBuffer>) => {
  let p = binaries.get(key);
  if (!p) {
    p = load();
    binaries.set(key, p);
  }
  return p;
};

const modulesLoaded = new WeakMap<BaseAudioContext, Map<string, Promise<void>>>();
function addModule(ctx: AudioContext, url: string) {
  let map = modulesLoaded.get(ctx);
  if (!map) {
    map = new Map();
    modulesLoaded.set(ctx, map);
  }
  let p = map.get(url);
  if (!p) {
    p = ctx.audioWorklet.addModule(url);
    map.set(url, p);
  }
  return p;
}

async function noiseNode(ctx: AudioContext, mode: NoiseMode): Promise<AudioWorkletNode | null> {
  if (mode === 'gtcrn') {
    const [wasmBinary] = await Promise.all([wasm('gtcrn', () => loadGtcrn({ url: gtcrnWasmUrl })), addModule(ctx, gtcrnWorkletUrl)]);
    return new GtcrnWorkletNode(ctx, { maxChannels: 1, wasmBinary });
  }
  if (mode === 'rnnoise') {
    const [wasmBinary] = await Promise.all([
      wasm('rnnoise', () => loadRnnoise({ url: rnnoiseWasmUrl, simdUrl: rnnoiseSimdWasmUrl })),
      addModule(ctx, rnnoiseWorkletUrl),
    ]);
    return new RnnoiseWorkletNode(ctx, { maxChannels: 1, wasmBinary });
  }
  return null;
}

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

class VoiceProcessor implements TrackProcessor<Track.Kind.Audio, AudioProcessorOptions> {
  name = 'concord-voice';
  processedTrack?: MediaStreamTrack;
  private effect: EffectId;
  private noise: NoiseMode;
  private nodes: AudioNode[] = [];
  private source?: MediaStreamAudioSourceNode;
  private dest?: MediaStreamAudioDestinationNode;

  constructor(noise: NoiseMode, effect: EffectId) {
    this.noise = noise;
    this.effect = effect;
  }

  async init(opts: AudioProcessorOptions) {
    const ctx = opts.audioContext;
    if (ctx.state === 'suspended') await ctx.resume().catch(() => {});
    this.source = ctx.createMediaStreamSource(new MediaStream([opts.track]));
    // tudo em mono: a supressão de ruído só processa o 1º canal; se o microfone vier em estéreo,
    // o 2º canal ficaria mudo e a voz chegaria só num lado do fone de quem ouve
    const mono = ctx.createGain();
    mono.channelCount = 1;
    mono.channelCountMode = 'explicit';
    mono.channelInterpretation = 'speakers'; // mistura esquerdo + direito
    this.source.connect(mono);
    this.nodes.push(mono);
    this.dest = ctx.createMediaStreamDestination();
    this.dest.channelCount = 1;
    this.dest.channelCountMode = 'explicit';
    let input: AudioNode = mono;
    const denoise = await noiseNode(ctx, this.noise);
    if (denoise) {
      mono.connect(denoise);
      input = denoise;
      this.nodes.push(denoise);
    }
    this.nodes.push(...(await build(ctx, this.effect, input, this.dest)));
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
        if (n instanceof GtcrnWorkletNode) n.destroy();
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

/** Aplica (ou remove) a supressão de ruído por IA e o efeito na faixa do microfone. */
export async function applyVoiceProcessing(track: LocalAudioTrack, noise: NoiseMode, effect: EffectId) {
  const usesAi = noise === 'rnnoise' || noise === 'gtcrn';
  // microfone que se apresenta em estéreo (alguns fones/placas USB, às vezes com um lado mudo):
  // passa pelo processador mesmo sem IA/efeito só para virar mono e chegar nos dois lados do fone
  const stereoMic = (track.mediaStreamTrack.getSettings().channelCount ?? 1) > 1;
  if (!usesAi && effect === 'none' && !stereoMic) {
    if (track.getProcessor()) await track.stopProcessor();
    return;
  }
  // RNNoise e GTCRN trabalham em 48 kHz
  sharedContext ??= new AudioContext({ latencyHint: 'interactive', sampleRate: 48000 });
  track.setAudioContext(sharedContext);
  await track.setProcessor(new VoiceProcessor(noise, effect));
}
