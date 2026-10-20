// Integração com o Concord Desktop (Electron). Fora do app desktop, `desktop` é undefined.

export interface DesktopSource {
  id: string;
  name: string;
  kind: 'screen' | 'window';
  thumbnail: string | null;
  icon: string | null;
}

export interface UpdateState {
  state: 'idle' | 'dev' | 'checking' | 'latest' | 'downloading' | 'ready' | 'error';
  version: string | null;
  progress: number;
  error: string | null;
}

export interface DesktopInfo {
  platform: string;
  version: string;
  processAudio: boolean;
  server: string;
}

export interface DesktopAppMetric {
  type: string;
  pid: number;
  cpuPercent: number | null;
  memoryMB: number | null;
}

export interface DesktopDevInfo {
  versions: Record<string, string>;
  osRelease: string;
  cpuModel: string | null;
  cpuCores: number;
  totalMemMB: number;
  freeMemMB: number;
  onBattery: boolean;
  appMetrics: DesktopAppMetric[];
  gpu: unknown;
}

interface DesktopBridge {
  info(): Promise<DesktopInfo>;
  // ausente em versões antigas do app desktop
  devInfo?(): Promise<DesktopDevInfo>;
  getSources(): Promise<DesktopSource[]>;
  selectSource(id: string): Promise<void>;
  startAudio(sourceId: string): Promise<void>;
  stopAudio(): Promise<void>;
  onAudioData(cb: (chunk: Uint8Array) => void): () => void;
  onAudioEnded(cb: (e: { code: number; message: string }) => void): () => void;
  setServer(url: string): Promise<void>;
  reload(): Promise<void>;
  // ausentes em versões antigas do app desktop
  updateStatus?(): Promise<{ version: string } | null>;
  onUpdateReady?(cb: (info: { version: string }) => void): () => void;
  installUpdate?(): Promise<void>;
  checkForUpdates?(): Promise<UpdateState>;
  updateState?(): Promise<UpdateState | null>;
  onUpdateState?(cb: (s: UpdateState) => void): () => void;
  notify?(opts: { title: string; body: string; data?: unknown }): Promise<void>;
  shakeWindow?(): Promise<void>;
  showClip?(data: { text: string; from: string; autoCopy: boolean }): Promise<boolean>;
  /** prioridade alta para os processos de captura enquanto transmite */
  setStreaming?(on: boolean): Promise<number[]>;
  onNotificationClick?(cb: (data: unknown) => void): () => void;
  getActivity?(): Promise<unknown>;
  refreshActivity?(): Promise<unknown>;
  onActivity?(cb: (activity: unknown) => void): () => void;
  /** liga/desliga a varredura de Steam/Spotify no processo principal (ausente em versões antigas do app) */
  setActivitySharing?(enabled: boolean): Promise<void>;
  setGlobalShortcuts?(map: Record<string, string>): Promise<Record<string, boolean>>;
  onShortcut?(cb: (action: string) => void): () => void;
}

export const desktop: DesktopBridge | undefined = (window as unknown as { concordDesktop?: DesktopBridge }).concordDesktop;

let infoCache: Promise<DesktopInfo> | null = null;
export const desktopInfo = () => (infoCache ??= desktop!.info());

// Toca o PCM recebido (16 bits, 48 kHz, estéreo) com um buffer curto para manter baixa latência.
const WORKLET = `
class PcmPlayer extends AudioWorkletProcessor {
  constructor() {
    super();
    this.size = 48000 * 2;            // 0,5 s estéreo
    this.buf = new Float32Array(this.size);
    this.r = 0; this.w = 0; this.n = 0;
    this.max = 48000 * 2 * 0.12;      // acima de 120 ms acumulados, descarta o excesso
    this.port.onmessage = (e) => this.push(new Int16Array(e.data));
  }
  push(s) {
    for (let i = 0; i < s.length; i++) {
      this.buf[this.w] = s[i] / 32768;
      this.w = (this.w + 1) % this.size;
      if (this.n < this.size) this.n++; else this.r = (this.r + 1) % this.size;
    }
    if (this.n > this.max) {
      const drop = (this.n - 48000 * 2 * 0.04) & ~1;
      this.r = (this.r + drop) % this.size;
      this.n -= drop;
    }
  }
  process(_inputs, outputs) {
    const l = outputs[0][0], r = outputs[0][1] || outputs[0][0];
    for (let i = 0; i < l.length; i++) {
      if (this.n >= 2) {
        l[i] = this.buf[this.r]; r[i] = this.buf[(this.r + 1) % this.size];
        this.r = (this.r + 2) % this.size; this.n -= 2;
      } else { l[i] = 0; r[i] = 0; }
    }
    return true;
  }
}
registerProcessor('concord-pcm-player', PcmPlayer);
`;

export interface DesktopAudio {
  track: MediaStreamTrack;
  stop(): Promise<void>;
}

/** Inicia a captura de áudio sem retorno e devolve uma faixa pronta para publicar. */
export async function startDesktopAudio(sourceId: string, onEnded: (message: string) => void): Promise<DesktopAudio> {
  const bridge = desktop!;
  const ctx = new AudioContext({ sampleRate: 48000, latencyHint: 'interactive' });
  const moduleUrl = URL.createObjectURL(new Blob([WORKLET], { type: 'application/javascript' }));
  await ctx.audioWorklet.addModule(moduleUrl);
  URL.revokeObjectURL(moduleUrl);
  const node = new AudioWorkletNode(ctx, 'concord-pcm-player', { numberOfInputs: 0, outputChannelCount: [2] });
  const dest = ctx.createMediaStreamDestination();
  dest.channelCount = 2;
  node.connect(dest);
  await ctx.resume();

  // os pedaços do pipe podem cortar um quadro (4 bytes) no meio: guarda a sobra
  let rest = new Uint8Array(0);
  const offData = bridge.onAudioData((chunk) => {
    const data = new Uint8Array(rest.length + chunk.length);
    data.set(rest);
    data.set(chunk, rest.length);
    const usable = data.length - (data.length % 4);
    rest = data.slice(usable);
    if (usable) {
      const frames = data.slice(0, usable);
      node.port.postMessage(frames.buffer, [frames.buffer]);
    }
  });
  const offEnded = bridge.onAudioEnded((e) => onEnded(e.message || `código ${e.code}`));

  try {
    await bridge.startAudio(sourceId);
  } catch (err) {
    offData();
    offEnded();
    await ctx.close();
    throw err;
  }

  return {
    track: dest.stream.getAudioTracks()[0],
    stop: async () => {
      offData();
      offEnded();
      await bridge.stopAudio().catch(() => {});
      await ctx.close().catch(() => {});
    },
  };
}
