// Gravação da janela de diagnóstico: guarda cada leitura (a cada 2 s) enquanto estiver gravando e,
// ao parar, baixa um .json para mandar a quem vai analisar. O que não muda durante a sessão
// (versões, GPU, processador) vai uma vez só no cabeçalho, para o arquivo não inchar.
import { useEffect, useRef, useState } from 'react';
import type { DevSnapshot } from './devStats';

// 3 horas de leituras a cada 2 s; passou disso, para sozinho e salva
const MAX_SAMPLES = 5400;

interface Marker {
  t: string;
  note: string;
}

function sampleOf(s: DevSnapshot) {
  return {
    t: new Date().toISOString(),
    latencyMs: s.health.latencyMs,
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

export function useDevRecording(snapshot: DevSnapshot | null) {
  const [recording, setRecording] = useState(false);
  const [count, setCount] = useState(0);
  const started = useRef<Date | null>(null);
  const header = useRef<ReturnType<typeof headerOf> | null>(null);
  const samples = useRef<ReturnType<typeof sampleOf>[]>([]);
  const markers = useRef<Marker[]>([]);

  function stop() {
    if (!started.current) return;
    const end = new Date();
    download(`concord-diagnostico_${stamp(started.current)}.json`, {
      format: 'concord-diagnostico/1',
      startedAt: started.current.toISOString(),
      endedAt: end.toISOString(),
      intervalSec: 2,
      environment: header.current,
      markers: markers.current,
      samples: samples.current,
    });
    started.current = null;
    setRecording(false);
  }

  // cada leitura nova entra na gravação
  useEffect(() => {
    if (!recording || !snapshot) return;
    header.current ??= headerOf(snapshot);
    samples.current.push(sampleOf(snapshot));
    setCount(samples.current.length);
    if (samples.current.length >= MAX_SAMPLES) stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot]);

  return {
    recording,
    count,
    /** duração em segundos */
    elapsed: started.current ? Math.round((Date.now() - started.current.getTime()) / 1000) : 0,
    start() {
      started.current = new Date();
      header.current = null;
      samples.current = [];
      markers.current = [];
      setCount(0);
      setRecording(true);
    },
    stop,
    mark(note: string) {
      markers.current.push({ t: new Date().toISOString(), note: note.trim() || 'marcado' });
    },
    markerCount: () => markers.current.length,
  };
}
