// Integração com o Concord Desktop (Electron). Fora do app desktop, `desktop` é undefined.

import pcmPlayerWorkletUrl from './worklets/pcm-player.worklet.js?url';

export interface DesktopSource {
  id: string;
  name: string;
  kind: 'screen' | 'window';
  thumbnail: string | null;
  icon: string | null;
}

export interface UpdateState {
  state: 'idle' | 'dev' | 'checking' | 'latest' | 'downloading' | 'verifying' | 'ready' | 'error';
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

// não muda durante a sessão: pede só uma vez e guarda em cache (getGPUInfo é lento)
export interface DesktopDevInfoStatic {
  versions: Record<string, string>;
  osRelease: string;
  cpuModel: string | null;
  cpuCores: number;
  totalMemMB: number;
  gpu: unknown;
}

// muda a cada leitura: livre pra pedir com frequência
export interface DesktopDevInfoLive {
  freeMemMB: number;
  onBattery: boolean;
  appMetrics: DesktopAppMetric[];
}

export type DesktopDevInfo = DesktopDevInfoStatic & DesktopDevInfoLive;

interface DesktopBridge {
  info(): Promise<DesktopInfo>;
  // ausentes em versões antigas do app desktop
  devInfoStatic?(): Promise<DesktopDevInfoStatic>;
  devInfoLive?(): Promise<DesktopDevInfoLive>;
  openDevWindow?(): Promise<void>;
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
  /** troca o ícone da janela/barra de tarefas (PNG em data URL); null volta ao ícone padrão */
  setAppIcon?(pngDataUrl: string | null): Promise<void>;
  /** barra de título própria (a janela vem sem a do sistema); ausente em versões antigas do app desktop */
  windowControl?(action: 'minimize' | 'maximize' | 'close' | 'close-ack' | 'state'): Promise<{ maximized: boolean; fullscreen: boolean; platform: string } | null>;
  onWindowState?(cb: (s: { maximized: boolean; fullscreen: boolean }) => void): () => void;
  /** Alt+F4 ou fechar pela barra de tarefas: o app pergunta à página antes (ver lib/closeGuard.ts) */
  onCloseRequest?(cb: () => void): () => void;
  showClip?(data: { text: string; from: string; autoCopy: boolean }): Promise<boolean>;
  /** mensagem opcional da tremida: janelinha por cima de tudo, igual à do código compartilhado, sem copiar */
  showNudgeMessage?(data: { text: string; from: string }): Promise<boolean>;
  /** prioridade alta para os processos de captura enquanto transmite */
  setStreaming?(on: boolean): Promise<number[]>;
  onNotificationClick?(cb: (data: unknown) => void): () => void;
  /**
   * Aviso de mensagem/menção por cima de tudo (app minimizado ou atrás), no mesmo desenho do cartão de dentro do
   * app, com as cores do tema. O clique volta por onNotificationClick com `target`. Ausente em versões antigas.
   */
  showNotice?(data: {
    who: string;
    where: string;
    text: string;
    avatar: { url: string | null; color: string };
    mention: boolean;
    target: unknown;
    theme: { card: string; fg: string; muted: string; subtle: string; accent: string; dark: boolean };
  }): Promise<boolean>;
  getActivity?(): Promise<unknown>;
  refreshActivity?(): Promise<unknown>;
  onActivity?(cb: (activity: unknown) => void): () => void;
  /** liga/desliga a varredura de Steam/Spotify no processo principal (ausente em versões antigas do app) */
  setActivitySharing?(enabled: boolean): Promise<void>;
  setGlobalShortcuts?(map: Record<string, string>): Promise<Record<string, boolean>>;
  onShortcut?(cb: (action: string) => void): () => void;
  /**
   * Login com Google no navegador padrão, com a volta para o próprio app (endereço local). Devolve o código e o
   * segredo para trocar em POST /auth/handoff, ou null se cancelou/expirou. Ausente em versões antigas do app.
   */
  googleAuth?(link?: string): Promise<{ code: string; verifier: string } | null>;
  googleAuthCancel?(): Promise<void>;
}

export const desktop: DesktopBridge | undefined = (window as unknown as { concordDesktop?: DesktopBridge }).concordDesktop;

let infoCache: Promise<DesktopInfo> | null = null;
export const desktopInfo = () => (infoCache ??= desktop!.info());

/** Janela de diagnóstico: no app desktop é uma janela própria; no navegador, um pop-up em /diagnostico. */
export function openDiagnosticsWindow() {
  if (desktop?.openDevWindow) void desktop.openDevWindow();
  else window.open('/diagnostico', 'concord-diagnostico', 'width=840,height=680,menubar=no,toolbar=no');
}

// O som do app desktop toca num worklet que é um arquivo do próprio site (worklets/pcm-player.worklet.js): a CSP não
// deixa carregar worklet de blob: ou data:.

export interface DesktopAudio {
  track: MediaStreamTrack;
  stop(): Promise<void>;
}

/** Inicia a captura de áudio sem retorno e devolve uma faixa pronta para publicar. */
export async function startDesktopAudio(sourceId: string, onEnded: (message: string) => void): Promise<DesktopAudio> {
  const bridge = desktop!;
  const ctx = new AudioContext({ sampleRate: 48000, latencyHint: 'interactive' });
  await ctx.audioWorklet.addModule(pcmPlayerWorkletUrl);
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
