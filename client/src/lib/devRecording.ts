// Gravação de diagnóstico: guarda cada leitura (a cada 2 s) enquanto estiver gravando e, ao parar,
// baixa um .json para mandar a quem vai analisar. Roda na janela principal (o app), então não
// depende da janela de diagnóstico ficar aberta; ela só mostra e controla esta mesma gravação
// pelo BroadcastChannel (ver devStats.ts). O que não muda durante a sessão (versões, GPU,
// processador) vai uma vez só no cabeçalho, para o arquivo não inchar.
import { create } from 'zustand';
import type { DevSnapshot } from './devStats';

// 3 horas de leituras a cada 2 s; passou disso, para sozinho e salva
const MAX_SAMPLES = 5400;

export interface RecordingState {
  recording: boolean;
  /** início da gravação (ms) */
  startedAt: number | null;
  /** leituras gravadas */
  count: number;
  /** momentos marcados */
  markers: number;
}

interface Marker {
  t: string;
  note: string;
}

function sampleOf(s: DevSnapshot) {
  return {
    t: new Date().toISOString(),
    latencyMs: s.health.latencyMs,
    connection: s.connection,
    ui: s.ui,
    mic: s.mic,
    noiseFallback: s.noiseFallback,
    jsHeapUsedMB: s.performance.jsHeapUsedMB,
    jsHeapTotalMB: s.performance.jsHeapTotalMB,
    domNodes: s.performance.domNodes,
    freeMemMB: s.desktopInfo?.freeMemMB,
    onBattery: s.desktopInfo?.onBattery,
    processes: s.desktopInfo?.appMetrics,
    voice: s.voice,
    tracks: s.tracks,
  };
}

function headerOf(s: DevSnapshot) {
  const { appMetrics: _m, freeMemMB: _f, onBattery: _b, ...staticInfo } = s.desktopInfo ?? ({} as NonNullable<DevSnapshot['desktopInfo']>);
  return {
    mode: s.mode,
    userAgent: s.userAgent,
    clientBuildTime: s.clientBuildTime,
    clientCommit: s.clientCommit,
    devices: s.devices,
    desktop: s.desktop,
    server: { version: s.health.version, nodeVersion: s.health.nodeVersion },
    cpuCores: s.cpuCores,
    gpuAdapter: s.gpuAdapter,
    system: s.desktopInfo ? staticInfo : undefined,
  };
}

function download(name: string, data: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

const stamp = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}_${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}`;

// as leituras ficam fora do estado do React: só os contadores precisam redesenhar a tela
let header: ReturnType<typeof headerOf> | null = null;
let samples: ReturnType<typeof sampleOf>[] = [];
let markers: Marker[] = [];

export const useDevRecording = create<
  RecordingState & {
    start: () => void;
    stop: () => void;
    mark: (note: string) => void;
    /** chamado pelo coletor (devStats.ts) a cada leitura nova */
    add: (snapshot: DevSnapshot) => void;
  }
>((set, get) => ({
  recording: false,
  startedAt: null,
  count: 0,
  markers: 0,

  start() {
    if (get().recording) return;
    header = null;
    samples = [];
    markers = [];
    set({ recording: true, startedAt: Date.now(), count: 0, markers: 0 });
  },

  stop() {
    const { recording, startedAt } = get();
    if (!recording || !startedAt) return;
    const start = new Date(startedAt);
    download(`concord-diagnostico_${stamp(start)}.json`, {
      format: 'concord-diagnostico/1',
      startedAt: start.toISOString(),
      endedAt: new Date().toISOString(),
      intervalSec: 2,
      environment: header,
      markers,
      samples,
    });
    header = null;
    samples = [];
    markers = [];
    set({ recording: false, startedAt: null, count: 0, markers: 0 });
  },

  mark(note) {
    if (!get().recording) return;
    markers.push({ t: new Date().toISOString(), note: note.trim() || 'marcado' });
    set({ markers: markers.length });
  },

  add(snapshot) {
    if (!get().recording) return;
    header ??= headerOf(snapshot);
    samples.push(sampleOf(snapshot));
    set({ count: samples.length });
    if (samples.length >= MAX_SAMPLES) get().stop();
  },
}));
