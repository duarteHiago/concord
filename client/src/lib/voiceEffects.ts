// Processamento do microfone como um processador do LiveKit (WebAudio):
// mono → supressão de ruído por IA (DeepFilterNet3, GTCRN ou RNNoise) → portão de voz → efeito de voz.
// O processador sobrevive a trocas de microfone: o LiveKit chama restart() quando a faixa reinicia.
import { GtcrnWorkletNode, RnnoiseWorkletNode, loadGtcrn, loadRnnoise } from '@sapphi-red/web-noise-suppressor';
import gtcrnWasmUrl from '@sapphi-red/web-noise-suppressor/gtcrn.wasm?url';
import gtcrnWorkletUrl from '@sapphi-red/web-noise-suppressor/gtcrnWorklet.js?url';
import rnnoiseWasmUrl from '@sapphi-red/web-noise-suppressor/rnnoise.wasm?url';
import rnnoiseSimdWasmUrl from '@sapphi-red/web-noise-suppressor/rnnoise_simd.wasm?url';
import rnnoiseWorkletUrl from '@sapphi-red/web-noise-suppressor/rnnoiseWorklet.js?url';
import type { AudioProcessorOptions, LocalAudioTrack, Track, TrackProcessor } from 'livekit-client';

/** off: nenhum; browser: filtro do navegador; dfn / rnnoise / gtcrn: redes neurais (rodam no seu PC). */
export type NoiseMode = 'off' | 'browser' | 'rnnoise' | 'gtcrn' | 'dfn';

export const NOISE_MODES: { id: NoiseMode; label: string; hint: string }[] = [
  {
    id: 'gtcrn',
    label: 'IA natural (recomendada)',
    hint: 'Tira ventilador, teclado e barulho de rua mantendo a voz natural. Leve no PC.',
  },
  {
    id: 'dfn',
    label: 'IA máxima (DeepFilterNet 3)',
    hint: 'Some até com o último clique de teclado; a voz pode ficar um pouco mais "seca". Ajuste a intensidade abaixo.',
  },
  { id: 'rnnoise', label: 'IA básica (RNNoise)', hint: 'Só ruído constante (ventilador, chiado); deixa passar teclado.' },
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

// DeepFilterNet3: arquivos servidos pelo próprio Concord (client/public/vendor/deepfilternet3)
type DfnCore = InstanceType<typeof import('deepfilternet3-noise-filter').DeepFilterNet3Core>;
let dfnCore: Promise<DfnCore> | null = null;
function loadDfn(): Promise<DfnCore> {
  dfnCore ??= (async () => {
    const { DeepFilterNet3Core } = await import('deepfilternet3-noise-filter');
    // limite de atenuação em dB (ajustado depois pela intensidade escolhida)
    const core = new DeepFilterNet3Core({
      sampleRate: 48000,
      noiseReductionLevel: DEFAULT_NOISE_STRENGTH,
      assetConfig: { cdnUrl: `${location.origin}/vendor/deepfilternet3` },
    });
    await core.initialize();
    return core;
  })().catch((err) => {
    dfnCore = null; // tenta de novo na próxima vez
    throw err;
  });
  return dfnCore;
}

/** Muda a intensidade do DeepFilterNet3 na hora (sem reiniciar o microfone). */
export function updateNoiseStrength(level: number) {
  void dfnCore?.then((core) => core.setSuppressionLevel(level)).catch(() => {});
}

/** Baixa o modelo do DeepFilterNet3 com antecedência (ex.: ao entrar numa sala). */
export const preloadDfn = () => void loadDfn().catch(() => {});

/** Avisos do processamento (ex.: a IA máxima não carregou e caiu para a leve). */
export const voiceNotices = new EventTarget();

/**
 * Força da supressão (limite de atenuação em dB do DeepFilterNet3): mais alto = tira mais ruído, mas abafa a voz.
 * Medido com voz real + teclado: 100 dB distorcia mais a voz e cortava 0,6% da fala; 45 dB tira o teclado
 * quase todo (-77 dB nas pausas) sem cortes.
 */
export const DEFAULT_NOISE_STRENGTH = 45;

// depois de uma falha do DeepFilterNet3, espera um pouco antes de tentar de novo nesta mesma
// sessão: alguns programas de mixagem de áudio (ex.: VoiceMeeter) reiniciam o próprio motor de
// áudio de vez em quando, o que reinicia a faixa do microfone e, com ela, essa montagem — tentar
// de novo imediatamente a cada reinício tende a falhar pela mesma razão. Depois do intervalo,
// volta a tentar sozinho (não precisa trocar de modelo manualmente pra "destravar").
let dfnCooldownUntil = 0;
const DFN_COOLDOWN_MS = 5 * 60_000;

async function noiseNode(ctx: AudioContext, mode: NoiseMode, strength = DEFAULT_NOISE_STRENGTH): Promise<AudioWorkletNode | null> {
  if (mode === 'dfn') {
    if (Date.now() < dfnCooldownUntil) return noiseNode(ctx, 'gtcrn');
    try {
      const core = await loadDfn();
      const node = await core.createAudioWorkletNode(ctx);
      core.setSuppressionLevel(strength);
      return node;
    } catch (err) {
      // o wasm do DFN3 tem 16 MB e, diferente do modelo, hoje não fica em cache de borda — uma
      // falha de rede passageira é bem provável; tenta mais uma vez antes de desistir
      console.warn('[voz] DeepFilterNet3 falhou, tentando de novo', err);
      try {
        const core = await loadDfn();
        const node = await core.createAudioWorkletNode(ctx);
        core.setSuppressionLevel(strength);
        return node;
      } catch (err2) {
        // GTCRN mediu quase tão bem quanto o DFN3 e é leve: é o plano B
        console.warn('[voz] DeepFilterNet3 indisponível, usando GTCRN', err2);
        dfnCooldownUntil = Date.now() + DFN_COOLDOWN_MS;
        voiceNotices.dispatchEvent(new CustomEvent('fallback', { detail: (err2 as Error).message }));
        return noiseNode(ctx, 'gtcrn');
      }
    }
  }
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

// Portão de voz (como a "sensibilidade de entrada automática" do Discord): fecha o microfone quando você
// não está falando, para o resto de ruído não passar. Aprende sozinho o ruído de fundo (modo automático)
// e só abre com som que dura (~20 ms seguidos, como uma sílaba): estalos curtos, tipo tecla, não abrem.
// Atrasa o som 25 ms para não cortar o começo das palavras e segura aberto um pouco depois da fala.
const GATE_WORKLET = `
class ConcordGate extends AudioWorkletProcessor {
  constructor() {
    super();
    this.mode = 'auto'; this.threshold = -50;
    this.floor = -60; this.open = false; this.hold = 0; this.gain = 0;
    this.delay = new Float32Array(Math.round(sampleRate * 0.025)); this.w = 0;
    this.above = 0; this.needAbove = Math.round(sampleRate * 0.02 / 128);
    this.energies = new Float32Array(8); this.ei = 0;
    this.attack = 1 - Math.exp(-1 / (sampleRate * 0.002));
    this.release = 1 - Math.exp(-1 / (sampleRate * 0.25));
    // segura aberto 450 ms: cobre a pausa entre palavras (antes cortava no meio da frase)
    this.holdSamples = Math.round(sampleRate * 0.45);
    // fechado = -40 dB, não silêncio absoluto: soa como "abaixar", não como corte
    this.closedGain = 0.01;
    this.report = 0;
    this.port.onmessage = (e) => {
      if (e.data.mode) this.mode = e.data.mode;
      if (typeof e.data.threshold === 'number') this.threshold = e.data.threshold;
    };
  }
  process(inputs, outputs) {
    const input = inputs[0] && inputs[0][0];
    const out = outputs[0];
    if (!input) return true;
    let e = 0;
    for (let i = 0; i < input.length; i++) e += input[i] * input[i];
    const block = 10 * Math.log10(e / input.length + 1e-12);
    this.energies[this.ei] = e / input.length;
    this.ei = (this.ei + 1) % this.energies.length;
    let avg = 0;
    for (let i = 0; i < this.energies.length; i++) avg += this.energies[i];
    const level = 10 * Math.log10(avg / this.energies.length + 1e-12);
    // ruído de fundo: desce rápido, sobe devagar (~5 dB/s)
    if (level < this.floor) this.floor += (level - this.floor) * 0.1;
    else this.floor += 0.015;
    this.floor = Math.min(-25, Math.max(-90, this.floor));
    const thr = this.mode === 'manual' ? this.threshold : Math.max(this.floor + 14, -62);
    // conta blocos seguidos acima do limite (som que dura); estalo curto zera a contagem
    this.above = block > thr ? this.above + 1 : 0;
    const voice = this.open ? level > thr : this.above >= this.needAbove;
    if (this.mode === 'off' || voice) {
      this.open = true;
      this.hold = this.holdSamples;
    } else if (this.hold > 0) this.hold -= input.length;
    else this.open = false;
    const target = this.open ? 1 : this.closedGain;
    for (let i = 0; i < input.length; i++) {
      const delayed = this.delay[this.w];
      this.delay[this.w] = input[i];
      this.w = (this.w + 1) % this.delay.length;
      this.gain += (target - this.gain) * (target > this.gain ? this.attack : this.release);
      const v = delayed * this.gain;
      for (let c = 0; c < out.length; c++) out[c][i] = v;
    }
    this.report += input.length;
    if (this.report >= sampleRate * 0.05) {
      this.report = 0;
      this.port.postMessage({ level, threshold: thr, open: this.open });
    }
    return true;
  }
}
registerProcessor('concord-gate', ConcordGate);
`;

export type GateMode = 'auto' | 'manual' | 'off';
export interface GateSettings {
  mode: GateMode;
  /** limiar em dB (modo manual) */
  threshold: number;
}
// desligado por padrão: com o DeepFilterNet3 as pausas já ficam em silêncio e o portão só arriscava
// cortar a fala (medido: 1,3% da fala cortada com portão, 0% sem)
export const DEFAULT_GATE: GateSettings = { mode: 'off', threshold: -50 };

/** Nível do microfone já processado (para o medidor nas configurações). */
export interface MicLevel {
  level: number;
  threshold: number;
  open: boolean;
}
export const micLevels = new EventTarget();

const gateLoaded = new WeakMap<BaseAudioContext, Promise<void>>();
function loadGateWorklet(ctx: AudioContext) {
  let p = gateLoaded.get(ctx);
  if (!p) {
    const url = URL.createObjectURL(new Blob([GATE_WORKLET], { type: 'application/javascript' }));
    p = ctx.audioWorklet.addModule(url).finally(() => URL.revokeObjectURL(url));
    gateLoaded.set(ctx, p);
  }
  return p;
}

let currentGate: AudioWorkletNode | null = null;
/** Muda a sensibilidade na hora, sem reiniciar o microfone. */
export function updateGate(gate: GateSettings) {
  currentGate?.port.postMessage(gate);
}

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
  private gate: GateSettings;
  private level: boolean;
  private strength: number;
  private nodes: AudioNode[] = [];
  private source?: MediaStreamAudioSourceNode;
  private dest?: MediaStreamAudioDestinationNode;

  constructor(noise: NoiseMode, effect: EffectId, gate: GateSettings, level: boolean, strength: number) {
    this.strength = strength;
    this.noise = noise;
    this.effect = effect;
    this.gate = gate;
    this.level = level;
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
    const denoise = await noiseNode(ctx, this.noise, this.strength);
    if (denoise) {
      mono.connect(denoise);
      input = denoise;
      this.nodes.push(denoise);
    }
    // portão depois da IA (decide pelo som já limpo) e antes do efeito (não corta o eco/reverb)
    await loadGateWorklet(ctx);
    const gate = new AudioWorkletNode(ctx, 'concord-gate', { channelCount: 1, channelCountMode: 'explicit', outputChannelCount: [1] });
    gate.port.postMessage(this.gate);
    gate.port.onmessage = (e: MessageEvent<MicLevel>) => micLevels.dispatchEvent(new CustomEvent<MicLevel>('level', { detail: e.data }));
    input.connect(gate);
    input = gate;
    this.nodes.push(gate);
    currentGate = gate;
    if (this.level) {
      // nivelador de volume depois da limpeza: deixa a voz uniforme sem "subir" o ruído
      // (o ganho automático do navegador fica desligado: ele aumentava o barulho nas pausas)
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -28;
      comp.knee.value = 12;
      comp.ratio.value = 3.5;
      comp.attack.value = 0.004;
      comp.release.value = 0.25;
      // o compressor do navegador já aplica um ganho de compensação automático
      const makeup = ctx.createGain();
      makeup.gain.value = 1;
      input.connect(comp);
      comp.connect(makeup);
      input = makeup;
      this.nodes.push(comp, makeup);
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
    if (currentGate && this.nodes.includes(currentGate)) currentGate = null;
    this.nodes = [];
  }
}

let sharedContext: AudioContext | null = null;

export interface MicTestSettings {
  noise: NoiseMode;
  strength: number;
  gate: GateSettings;
  level: boolean;
}

export interface MicTestHandle {
  /** troca ao vivo (ex.: a pessoa mexeu no modelo, na força ou na sensibilidade ali em cima) */
  update(settings: MicTestSettings): void;
  /** volume do que toca de volta nos seus fones (não é a sensibilidade/nível do microfone) */
  setMonitorVolume(v: number): void;
  stop(): void;
}

/**
 * Testa o microfone sem entrar em nenhuma sala: captura o áudio, aplica a mesma cadeia da chamada
 * de verdade (IA de ruído, portão, nivelador) e toca de volta, com um pequeno atraso natural —
 * assim dá pra ouvir exatamente o que as outras pessoas ouviriam, e comparar os modelos na hora.
 */
export async function startMicTest(deviceId: string, outputId: string, initial: MicTestSettings, onLevel: (level: MicLevel) => void): Promise<MicTestHandle> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { deviceId: deviceId ? { exact: deviceId } : undefined, echoCancellation: false, noiseSuppression: false, autoGainControl: false },
  });
  const ctx = new AudioContext({ latencyHint: 'interactive', sampleRate: 48000 });
  await ctx.resume().catch(() => {});
  const ctxWithSink = ctx as AudioContext & { setSinkId?: (id: string) => Promise<void> };
  if (outputId && ctxWithSink.setSinkId) void ctxWithSink.setSinkId(outputId).catch(() => {});

  const source = ctx.createMediaStreamSource(stream);
  const mono = ctx.createGain();
  mono.channelCount = 1;
  mono.channelCountMode = 'explicit';
  mono.channelInterpretation = 'speakers';
  source.connect(mono);
  const monitor = ctx.createGain();
  monitor.connect(ctx.destination);

  let settings = initial;
  let nodes: AudioNode[] = [];

  async function rebuild() {
    for (const n of nodes) {
      try {
        if (n instanceof GtcrnWorkletNode) n.destroy();
        n.disconnect();
      } catch {
        // já desligado
      }
    }
    nodes = [];
    let input: AudioNode = mono;
    const denoise = await noiseNode(ctx, settings.noise, settings.strength);
    if (denoise) {
      mono.connect(denoise);
      input = denoise;
      nodes.push(denoise);
    }
    await loadGateWorklet(ctx);
    const gateNode = new AudioWorkletNode(ctx, 'concord-gate', { channelCount: 1, channelCountMode: 'explicit', outputChannelCount: [1] });
    gateNode.port.postMessage(settings.gate);
    gateNode.port.onmessage = (e: MessageEvent<MicLevel>) => onLevel(e.data);
    input.connect(gateNode);
    input = gateNode;
    nodes.push(gateNode);
    if (settings.level && settings.noise !== 'off') {
      // mesmo nivelador da chamada de verdade: só depois da limpeza, pra não "subir" o ruído
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -28;
      comp.knee.value = 12;
      comp.ratio.value = 3.5;
      comp.attack.value = 0.004;
      comp.release.value = 0.25;
      const makeup = ctx.createGain();
      makeup.gain.value = 1;
      input.connect(comp);
      comp.connect(makeup);
      input = makeup;
      nodes.push(comp, makeup);
    }
    input.connect(monitor);
  }
  await rebuild();

  return {
    update(next) {
      settings = next;
      void rebuild();
    },
    setMonitorVolume(v) {
      monitor.gain.value = v;
    },
    stop() {
      for (const n of nodes) {
        try {
          if (n instanceof GtcrnWorkletNode) n.destroy();
          n.disconnect();
        } catch {
          // já desligado
        }
      }
      monitor.disconnect();
      mono.disconnect();
      source.disconnect();
      stream.getTracks().forEach((t) => t.stop());
      void ctx.close();
    },
  };
}

/** Aplica (ou remove) a supressão de ruído por IA e o efeito na faixa do microfone. */
export async function applyVoiceProcessing(
  track: LocalAudioTrack,
  noise: NoiseMode,
  effect: EffectId,
  gate: GateSettings = DEFAULT_GATE,
  level = true,
  strength = DEFAULT_NOISE_STRENGTH,
) {
  const usesAi = noise === 'rnnoise' || noise === 'gtcrn' || noise === 'dfn';
  // microfone que se apresenta em estéreo (alguns fones/placas USB, às vezes com um lado mudo):
  // passa pelo processador mesmo sem IA/efeito só para virar mono e chegar nos dois lados do fone
  const stereoMic = (track.mediaStreamTrack.getSettings().channelCount ?? 1) > 1;
  if (!usesAi && effect === 'none' && !stereoMic && gate.mode === 'off') {
    if (track.getProcessor()) await track.stopProcessor();
    return;
  }
  // RNNoise e GTCRN trabalham em 48 kHz
  sharedContext ??= new AudioContext({ latencyHint: 'interactive', sampleRate: 48000 });
  track.setAudioContext(sharedContext);
  await track.setProcessor(new VoiceProcessor(noise, effect, gate, level && usesAi, strength));
}
