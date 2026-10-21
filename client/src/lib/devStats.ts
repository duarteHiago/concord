// Coleta os dados da janela de diagnóstico ("Modo desenvolvedor"): ambiente, conexão,
// áudio/vídeo ativo, desempenho do próprio app e do sistema. Só métricas agregadas — nada
// de arquivos, DLLs ou registro de terceiros (ver issue #12).
//
// A coleta roda na janela principal (só ela tem acesso à Room do LiveKit e à ponte do
// desktop); a janela de diagnóstico é uma janela/aba separada e por isso não vê nada disso
// diretamente — ela recebe cada leitura pelo BroadcastChannel abaixo.
import { useEffect, useRef, useState } from 'react';
import { Track, type Participant, type Room } from 'livekit-client';
import { desktop, desktopInfo, type DesktopAppMetric, type DesktopDevInfo, type DesktopInfo } from './desktop';
import { useVoice } from '../store/voice';

export interface DevTrackStat {
  key: string;
  participant: string;
  isLocal: boolean;
  source: string;
  kind: 'audio' | 'video';
  codec: string;
  bitrateKbps: number;
  width?: number;
  height?: number;
  fps?: number;
  packetsLost?: number;
  jitterMs?: number;
  roundTripMs?: number;
  encodeMs?: number;
  encoderImpl?: string;
  hardwareAccelerated: boolean | null;
  qualityLimitation?: string;
  candidateType?: string;
  protocol?: string;
}

export interface DevHealth {
  latencyMs: number | null;
  version?: string;
  nodeVersion?: string;
  uptimeSec?: number;
}

export interface DevSnapshot {
  mode: 'web' | 'desktop';
  userAgent: string;
  clientBuildTime: string;
  desktop?: DesktopInfo;
  health: DevHealth;
  tracks: DevTrackStat[];
  performance: {
    jsHeapUsedMB?: number;
    jsHeapTotalMB?: number;
    domNodes: number;
  };
  cpuCores: number;
  desktopInfo?: DesktopDevInfo;
  voice?: { noiseMode: string; gateOn: boolean };
}

async function fetchHealth(): Promise<DevHealth> {
  const t0 = performance.now();
  try {
    const res = await fetch('/health', { cache: 'no-store' });
    const latencyMs = Math.round(performance.now() - t0);
    if (!res.ok) return { latencyMs };
    const body = (await res.json()) as { version?: string; nodeVersion?: string; uptimeSec?: number };
    return { latencyMs, version: body.version, nodeVersion: body.nodeVersion, uptimeSec: body.uptimeSec };
  } catch {
    return { latencyMs: null };
  }
}

type RtcStat = Record<string, number | string | boolean | undefined>;

// bitrate e tempo de codificação são médias entre duas leituras: guarda a leitura anterior de cada track aqui
const prevByTrack = new Map<string, { bytes: number; ts: number; encodeTime: number; encodeFrames: number }>();

async function collectTrackStats(room: Room | null): Promise<DevTrackStat[]> {
  if (!room) return [];
  const participants: Participant[] = [room.localParticipant, ...room.remoteParticipants.values()];
  const out: DevTrackStat[] = [];
  for (const p of participants) {
    for (const pub of p.trackPublications.values()) {
      const track = pub.track;
      if (!track) continue;
      const report = await track.getRTCStatsReport().catch(() => undefined);
      if (!report) continue;
      let media: RtcStat | undefined;
      let candidatePair: RtcStat | undefined;
      report.forEach((s: RtcStat) => {
        if ((s.type === 'inbound-rtp' || s.type === 'outbound-rtp') && !media) media = s;
        if (s.type === 'candidate-pair' && (s.nominated || s.selected)) candidatePair = s;
      });
      if (!media) continue;
      const codec = report.get(String(media.codecId)) as { mimeType?: string } | undefined;
      const localCandidate = candidatePair ? (report.get(String(candidatePair.localCandidateId)) as RtcStat | undefined) : undefined;

      const key = pub.trackSid;
      const bytes = Number(media.bytesSent ?? media.bytesReceived ?? 0);
      const ts = Number(media.timestamp);
      const encodeTime = Number(media.totalEncodeTime ?? media.totalDecodeTime ?? 0);
      const encodeFrames = Number(media.framesEncoded ?? media.framesDecoded ?? 0);
      const prev = prevByTrack.get(key);
      prevByTrack.set(key, { bytes, ts, encodeTime, encodeFrames });
      const bitrateKbps = prev && ts > prev.ts ? Math.max(0, Math.round(((bytes - prev.bytes) * 8) / (ts - prev.ts))) : 0;
      const encodeMs =
        prev && encodeFrames > prev.encodeFrames ? ((encodeTime - prev.encodeTime) * 1000) / (encodeFrames - prev.encodeFrames) : undefined;

      out.push({
        key,
        participant: p.isLocal ? 'Você' : p.identity || '?',
        isLocal: p.isLocal,
        source: String(pub.source),
        kind: track.kind === Track.Kind.Video ? 'video' : 'audio',
        codec: codec?.mimeType?.split('/')[1] ?? '?',
        bitrateKbps,
        width: media.frameWidth ? Number(media.frameWidth) : undefined,
        height: media.frameHeight ? Number(media.frameHeight) : undefined,
        fps: media.framesPerSecond ? Math.round(Number(media.framesPerSecond)) : undefined,
        packetsLost: media.packetsLost !== undefined ? Number(media.packetsLost) : undefined,
        jitterMs: media.jitter !== undefined ? Math.round(Number(media.jitter) * 1000) : undefined,
        roundTripMs: candidatePair?.currentRoundTripTime !== undefined ? Math.round(Number(candidatePair.currentRoundTripTime) * 1000) : undefined,
        encodeMs: encodeMs !== undefined ? Math.round(encodeMs * 10) / 10 : undefined,
        encoderImpl:
          media.encoderImplementation !== undefined
            ? String(media.encoderImplementation)
            : media.decoderImplementation !== undefined
              ? String(media.decoderImplementation)
              : undefined,
        hardwareAccelerated:
          typeof media.powerEfficientEncoder === 'boolean' ? media.powerEfficientEncoder : typeof media.powerEfficientDecoder === 'boolean' ? media.powerEfficientDecoder : null,
        qualityLimitation: media.qualityLimitationReason !== undefined ? String(media.qualityLimitationReason) : undefined,
        candidateType: localCandidate?.candidateType !== undefined ? String(localCandidate.candidateType) : undefined,
        protocol: localCandidate?.protocol !== undefined ? String(localCandidate.protocol) : undefined,
      });
    }
  }
  return out;
}

async function collectSnapshot(room: Room | null): Promise<DevSnapshot> {
  const [health, tracks, info, extra] = await Promise.all([
    fetchHealth(),
    collectTrackStats(room),
    desktop ? desktopInfo().catch(() => undefined) : Promise.resolve(undefined),
    (desktop?.devInfo?.() ?? Promise.resolve(undefined)).catch(() => undefined),
  ]);
  const mem = (performance as unknown as { memory?: { usedJSHeapSize: number; totalJSHeapSize: number } }).memory;
  return {
    mode: desktop ? 'desktop' : 'web',
    userAgent: navigator.userAgent,
    clientBuildTime: __BUILD_TIME__,
    desktop: info,
    health,
    tracks,
    performance: {
      jsHeapUsedMB: mem ? Math.round(mem.usedJSHeapSize / (1024 * 1024)) : undefined,
      jsHeapTotalMB: mem ? Math.round(mem.totalJSHeapSize / (1024 * 1024)) : undefined,
      domNodes: document.getElementsByTagName('*').length,
    },
    cpuCores: navigator.hardwareConcurrency ?? 0,
    desktopInfo: extra,
  };
}

/** Atualiza a cada poucos segundos enquanto `enabled` for true. */
export function useDevSnapshot(room: Room | null, enabled: boolean): DevSnapshot | null {
  const [snapshot, setSnapshot] = useState<DevSnapshot | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    const tick = async () => {
      const snap = await collectSnapshot(room);
      if (alive) setSnapshot(snap);
    };
    void tick();
    const id = setInterval(() => void tick(), 2000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [room, enabled]);
  return snapshot;
}

// ------------------------------------------------------------------ janela independente

const CHANNEL = 'concord-dev-stats';
type ChannelMsg = { kind: 'subscribe' } | { kind: 'unsubscribe' } | { kind: 'snapshot'; data: DevSnapshot };

/** Roda na janela principal: só coleta e transmite enquanto a janela de diagnóstico estiver pedindo. */
export function useDevStatsPublisher(room: Room | null) {
  const [subscribed, setSubscribed] = useState(false);
  const channelRef = useRef<BroadcastChannel | null>(null);
  const audioSettings = useVoice((s) => s.audioSettings);
  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return;
    const bc = new BroadcastChannel(CHANNEL);
    channelRef.current = bc;
    bc.onmessage = (e: MessageEvent<ChannelMsg>) => {
      if (e.data.kind === 'subscribe') setSubscribed(true);
      if (e.data.kind === 'unsubscribe') setSubscribed(false);
    };
    return () => {
      bc.close();
      channelRef.current = null;
    };
  }, []);
  const snapshot = useDevSnapshot(room, subscribed);
  useEffect(() => {
    if (!snapshot) return;
    const data: DevSnapshot = { ...snapshot, voice: { noiseMode: audioSettings.noiseMode, gateOn: audioSettings.gate.mode !== 'off' } };
    channelRef.current?.postMessage({ kind: 'snapshot', data } satisfies ChannelMsg);
  }, [snapshot, audioSettings]);
}

/** Roda na janela de diagnóstico: pede pra janela principal começar a transmitir e escuta. */
export function useDevStatsSubscriber(): DevSnapshot | null {
  const [snapshot, setSnapshot] = useState<DevSnapshot | null>(null);
  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return;
    const bc = new BroadcastChannel(CHANNEL);
    bc.onmessage = (e: MessageEvent<ChannelMsg>) => {
      if (e.data.kind === 'snapshot') setSnapshot(e.data.data);
    };
    const subscribe = () => bc.postMessage({ kind: 'subscribe' } satisfies ChannelMsg);
    subscribe();
    // repete de vez em quando: cobre o caso da janela principal ter recarregado depois desta já estar aberta
    const id = setInterval(subscribe, 4000);
    return () => {
      bc.postMessage({ kind: 'unsubscribe' } satisfies ChannelMsg);
      clearInterval(id);
      bc.close();
    };
  }, []);
  return snapshot;
}

// ------------------------------------------------------------------ histórico pra gráficos

const MAX_POINTS = 60;

function push(arr: number[], v: number | null | undefined) {
  if (v === null || v === undefined || Number.isNaN(v)) return;
  arr.push(v);
  if (arr.length > MAX_POINTS) arr.shift();
}

export interface TrackHistory {
  meta: DevTrackStat;
  bitrateKbps: number[];
  jitterMs: number[];
  roundTripMs: number[];
  encodeMs: number[];
}

export interface ProcessHistory {
  meta: DesktopAppMetric;
  cpuPercent: number[];
  memoryMB: number[];
}

export interface DevHistory {
  latencyMs: number[];
  jsHeapUsedMB: number[];
  tracks: Record<string, TrackHistory>;
  processes: Record<string, ProcessHistory>;
}

/** Acumula uma janela deslizante de cada métrica numérica a cada nova leitura, pros gráficos. */
export function useDevHistory(snapshot: DevSnapshot | null): DevHistory {
  const ref = useRef<DevHistory>({ latencyMs: [], jsHeapUsedMB: [], tracks: {}, processes: {} });
  const [, bump] = useState(0);
  useEffect(() => {
    if (!snapshot) return;
    const h = ref.current;
    push(h.latencyMs, snapshot.health.latencyMs);
    push(h.jsHeapUsedMB, snapshot.performance.jsHeapUsedMB);

    const seenTracks = new Set<string>();
    for (const t of snapshot.tracks) {
      seenTracks.add(t.key);
      const entry = (h.tracks[t.key] ??= { meta: t, bitrateKbps: [], jitterMs: [], roundTripMs: [], encodeMs: [] });
      entry.meta = t;
      push(entry.bitrateKbps, t.bitrateKbps);
      push(entry.jitterMs, t.jitterMs);
      push(entry.roundTripMs, t.roundTripMs);
      push(entry.encodeMs, t.encodeMs);
    }
    for (const key of Object.keys(h.tracks)) if (!seenTracks.has(key)) delete h.tracks[key];

    if (snapshot.desktopInfo) {
      const seenPids = new Set<string>();
      for (const m of snapshot.desktopInfo.appMetrics) {
        const pidKey = String(m.pid);
        seenPids.add(pidKey);
        const entry = (h.processes[pidKey] ??= { meta: m, cpuPercent: [], memoryMB: [] });
        entry.meta = m;
        push(entry.cpuPercent, m.cpuPercent);
        push(entry.memoryMB, m.memoryMB);
      }
      for (const key of Object.keys(h.processes)) if (!seenPids.has(key)) delete h.processes[key];
    }
    bump((x) => x + 1);
  }, [snapshot]);
  return ref.current;
}
