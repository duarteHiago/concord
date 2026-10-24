// Gravação de diagnóstico: guarda cada leitura (a cada 2 s) enquanto estiver gravando e, ao parar,
// a pessoa escolhe: mandar para a equipe (vai para o portal /admin, ver server/src/diagnostics.ts),
// baixar o .json ou descartar. Roda na janela principal (o app), então não
// depende da janela de diagnóstico ficar aberta; ela só mostra e controla esta mesma gravação
// pelo BroadcastChannel (ver devStats.ts). O que não muda durante a sessão (versões, GPU,
// processador) vai uma vez só no cabeçalho, para o arquivo não inchar.
import { create } from 'zustand';
import { getToken } from './api';
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
  /** gravação parada, esperando a pessoa escolher o que fazer com ela */
  finished: { startedAt: number; endedAt: number; count: number; markers: number } | null;
  sending: boolean;
  /** última tentativa de envio: deu certo, ou a mensagem do erro */
  sendResult: { ok: true } | { ok: false; error: string } | null;
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
/** o arquivo da última gravação parada, até a pessoa mandar, baixar ou descartar */
let pending: { name: string; data: unknown } | null = null;

async function gzip(text: string): Promise<Blob> {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Response(stream).blob();
}

/** Manda para a equipe. A nota vai num cabeçalho porque o corpo é o arquivo compactado. */
async function upload(data: unknown, note: string) {
  const token = getToken();
  const res = await fetch('/api/diagnostics', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/gzip',
      'X-Diagnostic-Note': encodeURIComponent(note.slice(0, 1000)),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: await gzip(JSON.stringify(data)),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? (res.status === 413 ? 'A gravação ficou grande demais para enviar. Baixe o arquivo e mande por outro caminho.' : `Erro ${res.status}`));
  }
}

export const useDevRecording = create<
  RecordingState & {
    start: () => void;
    stop: () => void;
    mark: (note: string) => void;
    send: (note: string) => Promise<void>;
    download: () => void;
    discard: () => void;
    /** chamado pelo coletor (devStats.ts) a cada leitura nova */
    add: (snapshot: DevSnapshot) => void;
  }
>((set, get) => ({
  recording: false,
  startedAt: null,
  count: 0,
  markers: 0,
  finished: null,
  sending: false,
  sendResult: null,

  start() {
    if (get().recording) return;
    header = null;
    samples = [];
    markers = [];
    pending = null;
    set({ recording: true, startedAt: Date.now(), count: 0, markers: 0, finished: null, sendResult: null });
  },

  stop() {
    const { recording, startedAt } = get();
    if (!recording || !startedAt) return;
    const start = new Date(startedAt);
    const end = new Date();
    pending = {
      name: `concord-diagnostico_${stamp(start)}.json`,
      data: {
        format: 'concord-diagnostico/1',
        startedAt: start.toISOString(),
        endedAt: end.toISOString(),
        intervalSec: 2,
        environment: header,
        markers,
        samples,
      },
    };
    const finished = { startedAt, endedAt: end.getTime(), count: samples.length, markers: markers.length };
    header = null;
    samples = [];
    markers = [];
    set({ recording: false, startedAt: null, count: 0, markers: 0, finished, sendResult: null });
  },

  async send(note) {
    if (!pending || get().sending) return;
    set({ sending: true, sendResult: null });
    try {
      await upload(pending.data, note);
      pending = null;
      set({ sending: false, finished: null, sendResult: { ok: true } });
    } catch (err) {
      set({ sending: false, sendResult: { ok: false, error: err instanceof Error ? err.message : String(err) } });
    }
  },

  download() {
    if (pending) download(pending.name, pending.data);
  },

  discard() {
    pending = null;
    set({ finished: null, sendResult: null });
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
