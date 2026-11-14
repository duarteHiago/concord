// Processamento do microfone como um processador do LiveKit (WebAudio):
// mono (sem cancelar fase) → medidor → supressão de ruído por IA (DeepFilterNet3, GTCRN ou RNNoise) → portão de
// voz → nivelador → medidor → efeito de voz. O processador sobrevive a trocas de microfone (o LiveKit chama
// restart() quando a faixa reinicia) e a si mesmo: um vigia compara o que entra com o que sai e, se o som sumiu
// no meio do caminho (modelo que quebrou, contexto suspenso), remonta a cadeia e avisa. Tudo o que muda a cadeia
// passa por uma fila, uma mudança de cada vez.
import { GtcrnWorkletNode, RnnoiseWorkletNode, loadGtcrn, loadRnnoise } from '@sapphi-red/web-noise-suppressor';
import gtcrnWasmUrl from '@sapphi-red/web-noise-suppressor/gtcrn.wasm?url';
import gtcrnWorkletUrl from '@sapphi-red/web-noise-suppressor/gtcrnWorklet.js?url';
import rnnoiseWasmUrl from '@sapphi-red/web-noise-suppressor/rnnoise.wasm?url';
import rnnoiseSimdWasmUrl from '@sapphi-red/web-noise-suppressor/rnnoise_simd.wasm?url';
import rnnoiseWorkletUrl from '@sapphi-red/web-noise-suppressor/rnnoiseWorklet.js?url';
import type { AudioProcessorOptions, LocalAudioTrack, Track, TrackProcessor } from 'livekit-client';
import { AUTO_INITIAL, autoStep, type AutoState } from './noiseAuto';
import dfnWorkletUrl from './worklets/deepfilter.worklet.js?url';
import meterWorkletUrl from './worklets/meter.worklet.js?url';
import monoWorkletUrl from './worklets/mono.worklet.js?url';
import smartGateWorkletUrl from './worklets/smartgate.worklet.js?url';

/**
 * off: nenhum; browser: filtro do navegador; dfn / rnnoise / gtcrn: redes neurais (rodam no seu PC).
 * Experimentais (aparecem com "Modos experimentais" ligado em Configurações): dfn-auto (DFN3 com a força
 * escolhida pelo ruído da sala) e browser-iso (isolamento de voz do próprio navegador, onde existir).
 */
export type NoiseMode = 'off' | 'browser' | 'rnnoise' | 'gtcrn' | 'dfn' | 'dfn-auto' | 'browser-iso';

/** O navegador oferece o isolamento de voz nativo (restrição voiceIsolation do getUserMedia)? */
export const canVoiceIsolation = () => {
  try {
    return (navigator.mediaDevices?.getSupportedConstraints?.() as { voiceIsolation?: boolean } | undefined)?.voiceIsolation === true;
  } catch {
    return false;
  }
};

export const NOISE_MODES: { id: NoiseMode; label: string; hint: string; lab?: boolean }[] = [
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
  {
    id: 'dfn-auto',
    label: 'IA máxima automática',
    hint: 'O DeepFilterNet 3 com a força escolhida sozinha pelo ruído da sua sala: aperta quando está silêncio, alivia quando há barulho, para não cortar a voz.',
    lab: true,
  },
  {
    id: 'browser-iso',
    label: 'Isolamento de voz do navegador',
    hint: 'O isolamento de voz do próprio navegador, quando o sistema oferece. Leve, mas depende do seu computador.',
    lab: true,
  },
];

export const NOISE_LABEL: Record<NoiseMode, string> = {
  dfn: 'IA máxima',
  'dfn-auto': 'IA máxima automática',
  gtcrn: 'IA natural',
  rnnoise: 'IA básica',
  browser: 'do navegador',
  'browser-iso': 'isolamento do navegador',
  off: 'desligada',
};

export const isAiMode = (m: NoiseMode) => m === 'dfn' || m === 'dfn-auto' || m === 'gtcrn' || m === 'rnnoise';
/** Modos em que o filtro do próprio navegador faz o trabalho (nenhum modelo nosso). */
export const isBrowserMode = (m: NoiseMode) => m === 'browser' || m === 'browser-iso';

/** Se um modelo falha, cai para o seguinte (e avisa): dfn → gtcrn → rnnoise → nenhum. */
const FALLBACK: Record<NoiseMode, NoiseMode | null> = { 'dfn-auto': 'gtcrn', dfn: 'gtcrn', gtcrn: 'rnnoise', rnnoise: 'off', browser: null, 'browser-iso': null, off: null };

// ---------------------------------------------------------------- carregamento (wasm, modelos, worklets)

const binaries = new Map<string, Promise<ArrayBuffer>>();
const wasm = (key: string, load: () => Promise<ArrayBuffer>) => {
  let p = binaries.get(key);
  if (!p) {
    p = load().catch((err) => {
      binaries.delete(key); // tenta de novo na próxima
      throw err;
    });
    binaries.set(key, p);
  }
  return p;
};

const modulesLoaded = new WeakMap<BaseAudioContext, Map<string, Promise<void>>>();
function addModule(ctx: BaseAudioContext, url: string) {
  let map = modulesLoaded.get(ctx);
  if (!map) {
    map = new Map();
    modulesLoaded.set(ctx, map);
  }
  let p = map.get(url);
  if (!p) {
    p = ctx.audioWorklet.addModule(url).catch((err) => {
      map!.delete(url);
      throw err;
    });
    map.set(url, p);
  }
  return p;
}

/** Baixa com até 3 tentativas (espera 0,5 s e 1,5 s): o wasm do DFN3 tem 16 MB e uma falha de rede passageira é comum. */
async function fetchRetry(url: string, tries = 3): Promise<Response> {
  let last: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { credentials: 'same-origin' });
      if (r.ok) return r;
      last = new Error(`${r.status} ao baixar ${url}`);
    } catch (err) {
      last = err;
    }
    if (i < tries - 1) await new Promise((r) => setTimeout(r, 500 * (i * 2 + 1)));
  }
  throw last instanceof Error ? last : new Error(String(last));
}

// DeepFilterNet3: arquivos servidos pelo próprio Concord (client/public/vendor/deepfilternet3)
export const DFN_BASE = '/vendor/deepfilternet3/v3';

/**
 * O modelo tem que chegar ao wasm como tar.gz. Alguns servidores (o Vite em desenvolvimento, proxies) mandam o
 * .tar.gz com "Content-Encoding: gzip" e o navegador entrega o tar já aberto: o wasm então falhava com
 * "unreachable" e a IA máxima caía para a natural sem a pessoa saber por quê. Se não vier comprimido, comprime aqui.
 */
async function ensureGzip(bytes: ArrayBuffer): Promise<ArrayBuffer> {
  const head = new Uint8Array(bytes, 0, 2);
  if (head[0] === 0x1f && head[1] === 0x8b) return bytes;
  if (typeof CompressionStream === 'undefined') throw new Error('modelo do DeepFilterNet3 chegou sem compressão');
  return new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer();
}
interface DfnAssets {
  wasmModule: WebAssembly.Module;
  modelBytes: ArrayBuffer;
}
let dfnAssets: Promise<DfnAssets> | null = null;
function loadDfnAssets(): Promise<DfnAssets> {
  dfnAssets ??= (async () => {
    const [wasmModule, model] = await Promise.all([
      fetchRetry(`${DFN_BASE}/pkg/df_bg.wasm`).then((r) => ('compileStreaming' in WebAssembly ? WebAssembly.compileStreaming(r) : r.arrayBuffer().then((b) => WebAssembly.compile(b)))),
      fetchRetry(`${DFN_BASE}/models/DeepFilterNet3_onnx.tar.gz`).then((r) => r.arrayBuffer()).then(ensureGzip),
    ]);
    return { wasmModule, modelBytes: model };
  })().catch((err) => {
    dfnAssets = null; // tenta de novo na próxima vez
    throw err;
  });
  return dfnAssets;
}

/** Baixa o modelo do DeepFilterNet3 com antecedência (ex.: ao entrar numa sala). */
export const preloadDfn = () => void loadDfnAssets().catch(() => {});

/**
 * Força da supressão (limite de atenuação em dB do DeepFilterNet3): mais alto = tira mais ruído, mas abafa a voz.
 * Medido com voz real + teclado: 100 dB distorcia mais a voz e cortava 0,6% da fala; 45 dB tira o teclado
 * quase todo (-77 dB nas pausas) sem cortes.
 */
export const DEFAULT_NOISE_STRENGTH = 45;

// depois de uma falha de um modelo, espera um pouco antes de tentar de novo nesta mesma sessão: alguns
// programas de mixagem de áudio (ex.: VoiceMeeter) reiniciam o próprio motor de áudio de vez em quando, o que
// reinicia a faixa do microfone e, com ela, essa montagem — tentar de novo imediatamente a cada reinício tende
// a falhar pela mesma razão. Depois do intervalo, volta a tentar sozinho.
const cooldownUntil: Partial<Record<NoiseMode, number>> = {};
const COOLDOWN_MS = 5 * 60_000;
const inCooldown = (m: NoiseMode) => (cooldownUntil[m] ?? 0) > Date.now();

/** Quanto tempo o modelo tem para dizer que carregou dentro do worklet (o DFN3 leva ~0,5 s numa máquina comum). */
const READY_TIMEOUT_MS = 15_000;

interface DenoiseNode {
  node: AudioWorkletNode;
  mode: NoiseMode;
  destroy(): void;
  setStrength?(db: number): void;
  setBeta?(beta: number): void;
}

/** Monta o nó de um modelo. Lança se não deu (quem chama decide o plano B). */
async function makeDenoise(ctx: BaseAudioContext, mode: NoiseMode, strength: number, onError: (err: Error) => void): Promise<DenoiseNode | null> {
  if (mode === 'dfn' || mode === 'dfn-auto') {
    const [assets] = await Promise.all([loadDfnAssets(), addModule(ctx, dfnWorkletUrl)]);
    const node = new AudioWorkletNode(ctx, 'deepfilter-audio-processor', {
      channelCount: 1,
      channelCountMode: 'explicit',
      outputChannelCount: [1],
      processorOptions: {
        wasmModule: assets.wasmModule,
        modelBytes: assets.modelBytes,
        suppressionLevel: mode === 'dfn-auto' ? AUTO_INITIAL.strength : strength,
        postFilterBeta: mode === 'dfn-auto' ? AUTO_INITIAL.beta : 0,
      },
    });
    // o worklet avisa quando o modelo ficou pronto; sem isso ele passaria o som cru em silêncio
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('DeepFilterNet3 não respondeu')), READY_TIMEOUT_MS);
      node.port.onmessage = (e: MessageEvent<{ type: string; message?: string }>) => {
        if (e.data?.type === 'ready') {
          clearTimeout(timer);
          node.port.onmessage = (ev: MessageEvent<{ type: string; message?: string }>) => {
            if (ev.data?.type === 'error') onError(new Error(`DeepFilterNet3: ${ev.data.message ?? 'erro no processamento'}`));
          };
          resolve();
        } else if (e.data?.type === 'error') {
          clearTimeout(timer);
          reject(new Error(`DeepFilterNet3: ${e.data.message ?? 'não carregou'}`));
        }
      };
    }).catch((err) => {
      node.port.postMessage('destroy');
      throw err;
    });
    return {
      node,
      mode,
      destroy: () => node.port.postMessage('destroy'),
      setStrength: (db) => node.port.postMessage({ type: 'SET_SUPPRESSION_LEVEL', value: Math.round(db) }),
      setBeta: (beta) => node.port.postMessage({ type: 'SET_POST_FILTER_BETA', value: beta }),
    };
  }
  if (mode === 'gtcrn') {
    const [wasmBinary] = await Promise.all([wasm('gtcrn', () => loadGtcrn({ url: gtcrnWasmUrl })), addModule(ctx, gtcrnWorkletUrl)]);
    const node = new GtcrnWorkletNode(ctx as AudioContext, { maxChannels: 1, wasmBinary });
    return { node, mode, destroy: () => node.destroy() };
  }
  if (mode === 'rnnoise') {
    const [wasmBinary] = await Promise.all([
      wasm('rnnoise', () => loadRnnoise({ url: rnnoiseWasmUrl, simdUrl: rnnoiseSimdWasmUrl })),
      addModule(ctx, rnnoiseWorkletUrl),
    ]);
    const node = new RnnoiseWorkletNode(ctx as AudioContext, { maxChannels: 1, wasmBinary });
    return { node, mode, destroy: () => node.destroy() };
  }
  return null;
}

/**
 * O modelo pedido ou, se ele não carregou (rede, navegador antigo, modelo em pausa depois de uma falha), o próximo
 * da fila. Devolve também qual ficou valendo e por quê.
 */
async function denoiseWithFallback(ctx: BaseAudioContext, wanted: NoiseMode, strength: number, onError: (err: Error) => void): Promise<{ denoise: DenoiseNode | null; active: NoiseMode; reason: string | null }> {
  let mode: NoiseMode | null = wanted;
  let reason: string | null = null;
  while (mode) {
    if (isAiMode(mode) && inCooldown(mode)) {
      reason ??= `${NOISE_LABEL[mode]} falhou há pouco`;
      mode = FALLBACK[mode];
      continue;
    }
    try {
      const denoise = await makeDenoise(ctx, mode, strength, onError);
      return { denoise, active: mode, reason: mode === wanted ? null : reason };
    } catch (err) {
      console.warn(`[voz] ${mode} indisponível`, err);
      cooldownUntil[mode] = Date.now() + COOLDOWN_MS;
      reason ??= (err as Error).message;
      mode = FALLBACK[mode];
    }
  }
  return { denoise: null, active: isBrowserMode(wanted) ? wanted : 'off', reason };
}

// ---------------------------------------------------------------- avisos e saúde (para a UI e o diagnóstico)

/**
 * Avisos do processamento:
 * - 'active' { wanted, active, reason }: a cadeia foi montada; `active` é o que está valendo agora
 * - 'fallback' detail: string: o modelo pedido não carregou e outro entrou no lugar
 * - 'rebuilt' { reason, count }: o vigia remontou a cadeia
 * - 'stuck' { reason }: remontou várias vezes e não resolveu; a pessoa precisa religar o microfone
 * - 'suspended': o navegador suspendeu o áudio e só um clique destrava
 */
export const voiceNotices = new EventTarget();
export interface ActiveNotice {
  wanted: NoiseMode;
  active: NoiseMode;
  reason: string | null;
}
const notify = (type: string, detail?: unknown) => voiceNotices.dispatchEvent(new CustomEvent(type, { detail }));

export interface VoiceHealth {
  /** modelo valendo na chamada agora (null = sem processador montado) */
  active: NoiseMode | null;
  wanted: NoiseMode | null;
  contextState: AudioContextState | null;
  /** nível do que entra do microfone e do que sai da cadeia (dBFS, média de 200 ms) */
  inDb: number | null;
  outDb: number | null;
  /** como o estéreo virou mono ('avg', 'left', 'right', 'inv'; null = chegou em mono) */
  mono: string | null;
  /** força do DeepFilterNet3 escolhida pela "IA máxima automática" agora (null fora desse modo) */
  autoStrength: number | null;
  /** remontagens feitas pelo vigia nesta sessão */
  rebuilds: number;
  lastError: string | null;
  lastErrorAt: number | null;
}
const health: VoiceHealth = { active: null, wanted: null, contextState: null, inDb: null, outDb: null, mono: null, autoStrength: null, rebuilds: 0, lastError: null, lastErrorAt: null };
/** Fotografia do estado do processamento (para o diagnóstico e o modo desenvolvedor). */
export const getVoiceHealth = (): VoiceHealth => ({ ...health, contextState: sharedContext?.state ?? health.contextState });
const noteError = (err: Error) => {
  health.lastError = err.message;
  health.lastErrorAt = Date.now();
};

// ---------------------------------------------------------------- efeitos de voz

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
    this.win = 1200; this.phase = 0; this.dead = false;
    this.port.onmessage = (e) => { if (e.data === 'destroy') this.dead = true; };
  }
  read(pos) {
    const i = Math.floor(pos); const f = pos - i;
    const a = this.buf[(i + this.size) % this.size]; const b = this.buf[(i + 1 + this.size) % this.size];
    return a + (b - a) * f;
  }
  process(inputs, outputs, params) {
    if (this.dead) return false;
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
    this.mode = 'auto'; this.threshold = -50; this.dead = false;
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
      if (e.data === 'destroy') { this.dead = true; return; }
      if (e.data.mode) this.mode = e.data.mode;
      if (typeof e.data.threshold === 'number') this.threshold = e.data.threshold;
    };
  }
  process(inputs, outputs) {
    if (this.dead) return false;
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

/** smart (experimental): guiado pela IA, abre pelo que a supressão deixou passar; sem IA ativa vale como 'auto'. */
export type GateMode = 'auto' | 'manual' | 'off' | 'smart';
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

const inlineModules = new WeakMap<BaseAudioContext, Map<string, Promise<void>>>();
function loadInlineWorklet(ctx: BaseAudioContext, name: string, code: string) {
  let map = inlineModules.get(ctx);
  if (!map) {
    map = new Map();
    inlineModules.set(ctx, map);
  }
  let p = map.get(name);
  if (!p) {
    const url = URL.createObjectURL(new Blob([code], { type: 'application/javascript' }));
    p = ctx.audioWorklet.addModule(url).finally(() => URL.revokeObjectURL(url));
    map.set(name, p);
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

function impulse(ctx: BaseAudioContext, seconds: number, decay: number) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const data = buf.getChannelData(c);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len) ** decay;
  }
  return buf;
}

/** Monta o grafo do efeito entre a entrada e a saída. Devolve os nós para desligar depois. */
async function buildEffect(ctx: BaseAudioContext, effect: EffectId, src: AudioNode, dest: AudioNode): Promise<AudioNode[]> {
  const nodes: AudioNode[] = [];
  const add = <T extends AudioNode>(n: T) => (nodes.push(n), n);

  switch (effect) {
    case 'deep':
    case 'chipmunk': {
      await loadInlineWorklet(ctx, 'concord-pitch', PITCH_WORKLET);
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

// ---------------------------------------------------------------- a cadeia

export interface ChainSettings {
  noise: NoiseMode;
  strength: number;
  gate: GateSettings;
  /** nivelador de volume depois da limpeza (só com IA) */
  level: boolean;
  effect: EffectId;
}

interface ChainHooks {
  onLevel?: (level: MicLevel) => void;
  /** o som entra e não sai, ou um nó quebrou: quem montou decide remontar */
  onBroken?: (reason: string) => void;
  /** só a cadeia do microfone da chamada alimenta a saúde global e os avisos */
  primary?: boolean;
}

// o vigia: voz entrando (acima de -45 dBFS) por 4 s seguidos sem nada saindo (50 dB abaixo) = cadeia quebrada
const WATCH_IN_DB = -45;
const WATCH_GAP_DB = 50;
const WATCH_SECONDS = 4;

/**
 * Uma montagem da cadeia entre a fonte e o destino. `build()` monta, `teardown()` desmonta de verdade (cada
 * worklet recebe "destroy" e devolve false, senão o navegador o mantém vivo para sempre).
 */
export class Chain {
  nodes: AudioNode[] = [];
  denoise: DenoiseNode | null = null;
  gate: AudioWorkletNode | null = null;
  active: NoiseMode | null = null;
  reason: string | null = null;
  private inDb = -120;
  private outDb = -120;
  private silentSince: number | null = null;
  private broken = false;
  private gateOpen = true;
  private done = false;
  private auto: AutoState | null = null;
  /** o portão em uso é o guiado pela IA (duas entradas) */
  private smart = false;

  constructor(
    private ctx: BaseAudioContext,
    private src: AudioNode,
    private dest: AudioNode,
    private settings: ChainSettings,
    private hooks: ChainHooks,
  ) {}

  private fail(reason: string) {
    if (this.broken || this.done) return;
    this.broken = true;
    noteError(new Error(reason));
    this.hooks.onBroken?.(reason);
  }

  private watchWorklet(node: AudioWorkletNode, what: string) {
    node.onprocessorerror = () => this.fail(`${what} parou de processar`);
  }

  async build() {
    const { ctx, settings } = this;
    const add = <T extends AudioNode>(n: T) => (this.nodes.push(n), n);
    await Promise.all([
      addModule(ctx, monoWorkletUrl),
      addModule(ctx, meterWorkletUrl),
      loadInlineWorklet(ctx, 'concord-gate', GATE_WORKLET),
      settings.gate.mode === 'smart' ? addModule(ctx, smartGateWorkletUrl) : Promise.resolve(),
    ]);
    if (this.done) return;

    // tudo em mono: a supressão de ruído só processa um canal; se o microfone vier em estéreo, o 2º canal ficaria
    // mudo e a voz chegaria só num lado do fone de quem ouve. A mistura é segura contra canais em oposição de fase.
    const mono = add(new AudioWorkletNode(ctx, 'concord-mono', { channelCount: 2, channelCountMode: 'clamped-max', outputChannelCount: [1] }));
    mono.port.onmessage = (e: MessageEvent<{ mode: string }>) => {
      if (this.hooks.primary) health.mono = e.data.mode;
    };
    this.watchWorklet(mono, 'a mistura para mono');
    this.src.connect(mono);

    const meterIn = add(new AudioWorkletNode(ctx, 'concord-meter', { channelCount: 1, channelCountMode: 'explicit', outputChannelCount: [1] }));
    meterIn.port.onmessage = (e: MessageEvent<{ db: number }>) => this.onIn(e.data.db);
    mono.connect(meterIn);
    let input: AudioNode = meterIn;

    const { denoise, active, reason } = await denoiseWithFallback(ctx, settings.noise, settings.strength, (err) => this.fail(err.message));
    if (this.done) {
      denoise?.destroy();
      return;
    }
    this.active = active;
    this.reason = reason;
    if (denoise) {
      this.denoise = denoise;
      this.watchWorklet(denoise.node, NOISE_LABEL[denoise.mode]);
      input.connect(denoise.node);
      input = denoise.node;
      this.nodes.push(denoise.node);
    }
    if (active === 'dfn-auto' && denoise) this.auto = { ...AUTO_INITIAL, lastChangeAt: Date.now() };

    // portão depois da IA (decide pelo som já limpo) e antes do efeito (não corta o eco/reverb)
    this.smart = settings.gate.mode === 'smart' && !!denoise;
    const gate = this.smart
      ? add(new AudioWorkletNode(ctx, 'concord-smartgate', { numberOfInputs: 2, channelCount: 1, channelCountMode: 'explicit', outputChannelCount: [1] }))
      : add(new AudioWorkletNode(ctx, 'concord-gate', { channelCount: 1, channelCountMode: 'explicit', outputChannelCount: [1] }));
    // 'smart' sem IA ativa (modelo não carregou, modo do navegador): vale como o automático por volume
    if (!this.smart) gate.port.postMessage(settings.gate.mode === 'smart' ? { ...settings.gate, mode: 'auto' } : settings.gate);
    gate.port.onmessage = (e: MessageEvent<MicLevel>) => {
      this.gateOpen = e.data.open;
      this.hooks.onLevel?.(e.data);
    };
    this.watchWorklet(gate, 'o portão de voz');
    input.connect(gate, 0, 0);
    if (this.smart) meterIn.connect(gate, 0, 1); // o som cru, para comparar com o que a IA deixou
    input = gate;
    this.gate = gate;

    if (settings.level && isAiMode(settings.noise)) {
      // nivelador de volume depois da limpeza: deixa a voz uniforme sem "subir" o ruído
      // (o ganho automático do navegador fica desligado: ele aumentava o barulho nas pausas)
      const comp = add(ctx.createDynamicsCompressor());
      comp.threshold.value = -28;
      comp.knee.value = 12;
      comp.ratio.value = 3.5;
      comp.attack.value = 0.004;
      comp.release.value = 0.25;
      // o compressor do navegador já aplica um ganho de compensação automático
      const makeup = add(ctx.createGain());
      makeup.gain.value = 1;
      input.connect(comp);
      comp.connect(makeup);
      input = makeup;
    }

    const meterOut = add(new AudioWorkletNode(ctx, 'concord-meter', { channelCount: 1, channelCountMode: 'explicit', outputChannelCount: [1] }));
    meterOut.port.onmessage = (e: MessageEvent<{ db: number }>) => this.onOut(e.data.db);
    input.connect(meterOut);
    input = meterOut;

    this.nodes.push(...(await buildEffect(ctx, settings.effect, input, this.dest)));
    if (this.done) return this.teardown();

    if (this.hooks.primary) {
      health.active = active;
      health.wanted = settings.noise;
      health.mono = null;
      notify('active', { wanted: settings.noise, active, reason } satisfies ActiveNotice);
      if (reason) notify('fallback', reason);
    }
  }

  private onIn(db: number) {
    this.inDb = db;
    if (this.hooks.primary) health.inDb = db;
    if (this.auto && this.denoise) {
      const next = autoStep(this.auto, db, Date.now());
      if (next.strength !== this.auto.strength) {
        this.denoise.setStrength?.(next.strength);
        this.denoise.setBeta?.(next.beta);
      }
      this.auto = next;
      if (this.hooks.primary) health.autoStrength = next.strength;
    }
  }

  private onOut(db: number) {
    this.outDb = db;
    if (this.hooks.primary) health.outDb = db;
    // vigia: o portão fechado abaixa de propósito (não conta); efeito nenhum apaga o som
    const voiceIn = this.inDb > WATCH_IN_DB;
    const nothingOut = this.outDb < this.inDb - WATCH_GAP_DB;
    const expectedOpen = this.settings.gate.mode === 'off' || this.gateOpen;
    if (voiceIn && nothingOut && expectedOpen) {
      this.silentSince ??= Date.now();
      if (Date.now() - this.silentSince > WATCH_SECONDS * 1000) this.fail('o som entra no microfone e não sai da limpeza');
    } else this.silentSince = null;
  }

  /** Troca a sensibilidade na hora. Devolve false quando a troca pede remontar (entrar ou sair do portão guiado pela IA). */
  updateGate(gate: GateSettings): boolean {
    const wasSmart = this.settings.gate.mode === 'smart';
    this.settings = { ...this.settings, gate };
    if (wasSmart !== (gate.mode === 'smart')) return false;
    if (!this.smart) this.gate?.port.postMessage(gate.mode === 'smart' ? { ...gate, mode: 'auto' } : gate);
    return true;
  }

  setStrength(db: number) {
    this.settings = { ...this.settings, strength: db };
    if (!this.auto) this.denoise?.setStrength?.(db);
  }

  teardown() {
    this.done = true;
    this.denoise?.destroy();
    for (const n of this.nodes) {
      try {
        if (n instanceof OscillatorNode) n.stop();
        else if (n instanceof AudioWorkletNode && n !== this.denoise?.node) n.port.postMessage('destroy');
        n.disconnect();
      } catch {
        // já desligado
      }
    }
    try {
      this.src.disconnect();
    } catch {
      // já desligado
    }
    this.nodes = [];
    this.denoise = null;
    this.gate = null;
  }
}

/** Uma operação de cada vez na cadeia (montar, desmontar, remontar): sem isso duas trocas rápidas se atropelam. */
class Queue {
  private tail: Promise<unknown> = Promise.resolve();
  run<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.tail.then(fn, fn);
    this.tail = next.catch(() => {});
    return next;
  }
}

/** Remontagens seguidas antes de desistir e pedir para a pessoa religar o microfone. */
const MAX_REBUILDS = 3;
const REBUILD_WINDOW_MS = 60_000;

let liveChain: Chain | null = null;
/** Muda a sensibilidade na hora, sem reiniciar o microfone. False = precisa remontar (quem chama reaplica). */
export function updateGate(gate: GateSettings): boolean {
  return liveChain?.updateGate(gate) ?? true;
}
/** Muda a intensidade do DeepFilterNet3 na hora (sem reiniciar o microfone). */
export function updateNoiseStrength(level: number) {
  liveChain?.setStrength(level);
}

class VoiceProcessor implements TrackProcessor<Track.Kind.Audio, AudioProcessorOptions> {
  name = 'concord-voice';
  processedTrack?: MediaStreamTrack;
  private queue = new Queue();
  private chain: Chain | null = null;
  private source?: MediaStreamAudioSourceNode;
  private dest?: MediaStreamAudioDestinationNode;
  private ctx?: AudioContext;
  private track?: MediaStreamTrack;
  private rebuilds: number[] = [];
  private closed = false;

  constructor(private settings: ChainSettings) {}

  init(opts: AudioProcessorOptions) {
    return this.queue.run(async () => {
      const ctx = opts.audioContext;
      this.ctx = ctx;
      this.track = opts.track;
      if (ctx.state === 'suspended') await ctx.resume().catch(() => {});
      // o destino é um só para toda a vida do processador: remontar a cadeia por dentro não troca a faixa
      // publicada (o LiveKit só troca quando ele mesmo pede um restart)
      this.dest ??= ctx.createMediaStreamDestination();
      this.dest.channelCount = 1;
      this.dest.channelCountMode = 'explicit';
      this.processedTrack = this.dest.stream.getAudioTracks()[0];
      this.watchTrack(opts.track);
      await this.mount();
    });
  }

  private async mount() {
    if (!this.ctx || !this.dest || !this.track || this.closed) return;
    this.chain?.teardown();
    this.source?.disconnect();
    this.source = this.ctx.createMediaStreamSource(new MediaStream([this.track]));
    const chain = new Chain(this.ctx, this.source, this.dest, this.settings, {
      primary: true,
      onLevel: (level) => micLevels.dispatchEvent(new CustomEvent<MicLevel>('level', { detail: level })),
      onBroken: (reason) => void this.recover(reason),
    });
    this.chain = chain;
    liveChain = chain;
    await chain.build();
  }

  /** A cadeia quebrou: remonta (o modelo que falhou já está em pausa e o próximo entra). */
  private recover(reason: string) {
    if (this.closed) return;
    const now = Date.now();
    this.rebuilds = this.rebuilds.filter((t) => now - t < REBUILD_WINDOW_MS);
    if (this.rebuilds.length >= MAX_REBUILDS) {
      notify('stuck', { reason });
      return;
    }
    this.rebuilds.push(now);
    health.rebuilds++;
    console.warn('[voz] remontando a cadeia do microfone:', reason);
    void this.queue.run(async () => {
      if (this.chain?.active && isAiMode(this.chain.active) && /parou|não sai|DeepFilterNet|GTCRN|RNNoise/i.test(reason)) {
        cooldownUntil[this.chain.active] = Date.now() + COOLDOWN_MS;
      }
      await this.mount();
      notify('rebuilt', { reason, count: this.rebuilds.length });
    });
  }

  // a faixa do microfone acabou ou ficou muda (driver reiniciou, dispositivo saiu): o LiveKit reinicia a faixa e
  // chama restart(); aqui só registramos, para o diagnóstico mostrar o porquê de um buraco no áudio
  private watchTrack(track: MediaStreamTrack) {
    track.addEventListener('ended', () => noteError(new Error('a faixa do microfone acabou')), { once: true });
    track.addEventListener('mute', () => noteError(new Error('a faixa do microfone ficou muda (sem som do dispositivo)')));
  }

  restart(opts: AudioProcessorOptions) {
    return this.queue.run(async () => {
      this.ctx = opts.audioContext;
      this.track = opts.track;
      this.watchTrack(opts.track);
      await this.mount();
    });
  }

  destroy() {
    this.closed = true;
    return this.queue.run(async () => {
      this.chain?.teardown();
      if (liveChain === this.chain) {
        liveChain = null;
        health.active = null;
        health.wanted = null;
        health.inDb = null;
        health.outDb = null;
        health.mono = null;
        health.autoStrength = null;
      }
      this.chain = null;
      this.source?.disconnect();
      this.source = undefined;
    });
  }
}

let sharedContext: AudioContext | null = null;
function getSharedContext() {
  if (!sharedContext) {
    // RNNoise e GTCRN trabalham em 48 kHz
    sharedContext = new AudioContext({ latencyHint: 'interactive', sampleRate: 48000 });
    // o navegador pode suspender o contexto (aba em segundo plano no celular, política de autoplay depois de um
    // reinício): sem isso o microfone publicaria silêncio sem ninguém saber
    sharedContext.addEventListener('statechange', () => {
      const ctx = sharedContext!;
      health.contextState = ctx.state;
      if (ctx.state !== 'suspended') return;
      void ctx.resume().catch(() => {});
      setTimeout(() => {
        if (ctx.state !== 'suspended') return;
        notify('suspended');
        const resume = () => void ctx.resume().catch(() => {});
        window.addEventListener('pointerdown', resume, { once: true, capture: true });
        window.addEventListener('keydown', resume, { once: true, capture: true });
      }, 1000);
    });
  }
  return sharedContext;
}

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
export async function startMicTest(
  deviceId: string,
  outputId: string,
  initial: MicTestSettings,
  onLevel: (level: MicLevel) => void,
  onActive?: (notice: ActiveNotice) => void,
): Promise<MicTestHandle> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { deviceId: deviceId ? { exact: deviceId } : undefined, echoCancellation: false, noiseSuppression: false, autoGainControl: false },
  });
  const ctx = new AudioContext({ latencyHint: 'interactive', sampleRate: 48000 });
  await ctx.resume().catch(() => {});
  const ctxWithSink = ctx as AudioContext & { setSinkId?: (id: string) => Promise<void> };
  if (outputId && ctxWithSink.setSinkId) void ctxWithSink.setSinkId(outputId).catch(() => {});

  const source = ctx.createMediaStreamSource(stream);
  const monitor = ctx.createGain();
  monitor.connect(ctx.destination);

  let settings = initial;
  let chain: Chain | null = null;
  const queue = new Queue();
  let stopped = false;

  const rebuild = () =>
    queue.run(async () => {
      chain?.teardown();
      if (stopped) return;
      chain = new Chain(ctx, source, monitor, { ...settings, effect: 'none', level: settings.level && settings.noise !== 'off' }, { onLevel, onBroken: () => void rebuild() });
      await chain.build();
      if (chain.active && onActive) onActive({ wanted: settings.noise, active: chain.active, reason: chain.reason });
    });
  await rebuild();

  return {
    update(next) {
      // só a sensibilidade e a força mudam sem remontar
      const same = next.noise === settings.noise && next.level === settings.level;
      settings = next;
      if (same && chain?.updateGate(next.gate) !== false) chain?.setStrength(next.strength);
      else void rebuild();
    },
    setMonitorVolume(v) {
      monitor.gain.value = v;
    },
    stop() {
      stopped = true;
      void queue.run(async () => {
        chain?.teardown();
        chain = null;
        monitor.disconnect();
        source.disconnect();
        stream.getTracks().forEach((t) => t.stop());
        void ctx.close();
      });
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
  const usesAi = isAiMode(noise);
  // microfone que se apresenta em estéreo (alguns fones/placas USB, às vezes com um lado mudo):
  // passa pelo processador mesmo sem IA/efeito só para virar mono e chegar nos dois lados do fone
  const stereoMic = (track.mediaStreamTrack.getSettings().channelCount ?? 1) > 1;
  if (!usesAi && effect === 'none' && !stereoMic && gate.mode === 'off') {
    if (track.getProcessor()) await track.stopProcessor();
    return;
  }
  track.setAudioContext(getSharedContext());
  await track.setProcessor(new VoiceProcessor({ noise, strength, gate, level: level && usesAi, effect }));
}
