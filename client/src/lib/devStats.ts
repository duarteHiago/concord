// Coleta os dados do "Modo desenvolvedor" das configurações: ambiente, conexão, áudio/vídeo
// ativo, desempenho do próprio app e do sistema. Só métricas agregadas — nada de arquivos,
// DLLs ou registro de terceiros (ver issue #12).
import { useEffect, useState } from 'react';
import { Track, type Participant, type Room } from 'livekit-client';
import { desktop, desktopInfo, type DesktopDevInfo, type DesktopInfo } from './desktop';

export interface DevTrackStat {
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

// bitrate é uma média entre duas leituras: guarda a leitura anterior de cada track aqui
const prevByTrack = new Map<string, { bytes: number; ts: number }>();

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
      const prev = prevByTrack.get(key);
      prevByTrack.set(key, { bytes, ts });
      const bitrateKbps = prev && ts > prev.ts ? Math.max(0, Math.round(((bytes - prev.bytes) * 8) / (ts - prev.ts))) : 0;

      out.push({
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

/** Atualiza a cada poucos segundos enquanto `enabled` for true (ex.: só com a aba de diagnóstico aberta). */
export function useDevSnapshot(room: Room | null, enabled: boolean): DevSnapshot | null {
  const [snapshot, setSnapshot] = useState<DevSnapshot | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    const tick = async () => {
      const [health, tracks, info, extra] = await Promise.all([
        fetchHealth(),
        collectTrackStats(room),
        desktop ? desktopInfo().catch(() => undefined) : Promise.resolve(undefined),
        (desktop?.devInfo?.() ?? Promise.resolve(undefined)).catch(() => undefined),
      ]);
      if (!alive) return;
      const mem = (performance as unknown as { memory?: { usedJSHeapSize: number; totalJSHeapSize: number } }).memory;
      setSnapshot({
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
      });
    };
    void tick();
    const id = setInterval(() => void tick(), 3000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [room, enabled]);
  return snapshot;
}
