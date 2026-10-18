import { Track, type LocalTrack, type Participant, type RemoteTrack } from 'livekit-client';
import {
  Activity,
  Eye,
  EyeOff,
  Headphones,
  HeadphoneOff,
  Maximize2,
  Mic,
  MicOff,
  Minimize2,
  MonitorUp,
  PhoneOff,
  ScreenShareOff,
  Settings2,
  Video,
  VideoOff,
  Volume2,
} from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { P, has } from '../../../shared/permissions.ts';
import type { Channel, ServerDetail } from '../lib/types';
import { memberColor, useActiveDetail, useApp } from '../store/app';
import { usePopover } from '../store/popover';
import { useVoice } from '../store/voice';
import { Avatar, Button, Spinner, cx } from './ui';

export function VoiceView({ channel }: { channel: Channel }) {
  const detail = useActiveDetail()!;
  const status = useVoice((s) => (s.channelId === channel.id ? s.status : 'idle'));

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-surface-0">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-line bg-surface-2 px-4">
        <Volume2 size={20} className="text-fg-subtle" />
        <h1 className="font-bold">{channel.name}</h1>
        {status === 'connected' && <ConnectionQuality />}
      </header>
      {status === 'idle' ? (
        <JoinSplash detail={detail} channel={channel} />
      ) : status === 'connecting' ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 text-fg-muted">
          <Spinner size={40} />
          Conectando à sala…
        </div>
      ) : (
        <Stage detail={detail} />
      )}
    </div>
  );
}

function ConnectionQuality() {
  const room = useVoice((s) => s.room);
  useVoice((s) => s.tick);
  const status = useVoice((s) => s.status);
  const q = room?.localParticipant.connectionQuality ?? 'unknown';
  const label = { excellent: 'Excelente', good: 'Boa', poor: 'Ruim', lost: 'Perdida', unknown: '—' }[q] ?? '—';
  return (
    <span
      className={cx(
        'ml-2 rounded-full px-2 py-0.5 text-xs font-semibold',
        status === 'reconnecting' ? 'bg-warn/15 text-warn' : q === 'poor' || q === 'lost' ? 'bg-danger/15 text-danger' : 'bg-ok/15 text-ok',
      )}
    >
      {status === 'reconnecting' ? 'Reconectando…' : `Conexão: ${label}`}
    </span>
  );
}

function JoinSplash({ detail, channel }: { detail: ServerDetail; channel: Channel }) {
  const states = useApp((s) => s.voiceStates[detail.server.id]) ?? [];
  const join = useVoice((s) => s.join);
  const inRoom = states.filter((v) => v.channelId === channel.id);
  const canConnect = has(channel.permissions, P.CONNECT);

  return (
    <div className="relative flex flex-1 items-center justify-center overflow-hidden">
      <div className="pointer-events-none absolute h-[480px] w-[480px] rounded-full bg-accent/15 blur-[120px]" />
      <div className="relative animate-slide-up text-center">
        <div className="mx-auto mb-6 flex h-24 w-24 items-center justify-center rounded-3xl bg-brand shadow-2xl shadow-accent/30">
          <Volume2 size={44} className="text-white" />
        </div>
        <h2 className="text-3xl font-extrabold">{channel.name}</h2>
        <p className="mt-2 text-fg-muted">
          {inRoom.length === 0 ? 'Ninguém está aqui ainda. Que tal começar?' : `${inRoom.length} pessoa(s) na sala agora`}
        </p>
        {inRoom.length > 0 && (
          <div className="mt-5 flex justify-center -space-x-2">
            {inRoom.slice(0, 8).map((v) => {
              const m = detail.members.find((x) => x.id === v.userId);
              return m ? <Avatar key={v.userId} name={m.displayName} color={m.avatarColor} size={40} className="rounded-full ring-4 ring-surface-0" /> : null;
            })}
          </div>
        )}
        <Button className="mt-8 h-12 px-8 text-base" disabled={!canConnect} onClick={() => void join(detail.server.id, channel.id)}>
          {canConnect ? 'Entrar na sala' : 'Sem permissão para entrar'}
        </Button>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ Palco

interface TileInfo {
  key: string;
  participant: Participant;
  kind: 'person' | 'screen';
  isLocal: boolean;
}

function buildTiles(participants: Participant[]): TileInfo[] {
  const tiles: TileInfo[] = [];
  for (const p of participants) {
    const isLocal = p.isLocal;
    if (p.getTrackPublication(Track.Source.ScreenShare)) tiles.push({ key: `${p.identity}:screen`, participant: p, kind: 'screen', isLocal });
  }
  for (const p of participants) tiles.push({ key: `${p.identity}:cam`, participant: p, kind: 'person', isLocal: p.isLocal });
  return tiles;
}

function gridCols(n: number) {
  if (n <= 1) return 1;
  if (n <= 4) return 2;
  if (n <= 9) return 3;
  return 4;
}

function Stage({ detail }: { detail: ServerDetail }) {
  const room = useVoice((s) => s.room);
  useVoice((s) => s.tick);
  const focus = useVoice((s) => s.focus);
  const setFocus = useVoice((s) => s.setFocus);
  if (!room) return null;

  const participants: Participant[] = [room.localParticipant, ...room.remoteParticipants.values()];
  const tiles = buildTiles(participants);
  const focused = tiles.find((t) => t.key === focus);
  const others = focused ? tiles.filter((t) => t !== focused) : tiles;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {focused ? (
        <div className="flex min-h-0 flex-1 flex-col gap-3 p-3">
          <div className="min-h-0 flex-1">
            <Tile detail={detail} tile={focused} focused onClick={() => setFocus(null)} />
          </div>
          {others.length > 0 && (
            <div className="flex h-32 shrink-0 justify-center gap-3 overflow-x-auto">
              {others.map((t) => (
                <div key={t.key} className="aspect-video h-full shrink-0">
                  <Tile detail={detail} tile={t} compact onClick={() => setFocus(t.key)} />
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto p-4">
          <div
            className="grid w-full max-w-7xl gap-3"
            style={{ gridTemplateColumns: `repeat(${gridCols(tiles.length)}, minmax(0, 1fr))` }}
          >
            {tiles.map((t) => (
              <div key={t.key} className="aspect-video">
                <Tile detail={detail} tile={t} onClick={() => setFocus(t.key)} />
              </div>
            ))}
          </div>
        </div>
      )}
      <ControlBar />
    </div>
  );
}

function Tile({
  detail,
  tile,
  focused,
  compact,
  onClick,
}: {
  detail: ServerDetail;
  tile: TileInfo;
  focused?: boolean;
  compact?: boolean;
  onClick: () => void;
}) {
  const { participant: p, kind, isLocal } = tile;
  const member = detail.members.find((m) => m.id === p.identity);
  const name = member?.displayName ?? p.name ?? p.identity;
  const color = member?.avatarColor ?? '#5865f2';
  const speaking = useVoice((s) => !!s.speaking[p.identity]);
  const watching = useVoice((s) => !!s.watching[p.identity]);
  const setWatching = useVoice((s) => s.setWatching);
  const ref = useRef<HTMLDivElement>(null);
  const [isFullscreen, setFullscreen] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const openPopover = usePopover((s) => s.open);

  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement === ref.current);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void ref.current?.requestFullscreen();
  };

  if (kind === 'screen') {
    const pub = p.getTrackPublication(Track.Source.ScreenShare);
    const track = pub?.track as LocalTrack | RemoteTrack | undefined;
    const canView = isLocal || watching;

    return (
      <div
        ref={ref}
        onDoubleClick={toggleFullscreen}
        className={cx(
          'group relative h-full w-full overflow-hidden rounded-xl bg-black ring-1 ring-line',
          !focused && 'cursor-pointer hover:ring-accent/60',
        )}
        onClick={canView && !isFullscreen ? onClick : undefined}
      >
        {canView && track ? (
          <VideoEl track={track} fit="contain" />
        ) : canView ? (
          <div className="flex h-full items-center justify-center">
            <Spinner />
          </div>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 bg-gradient-to-br from-surface-3 to-surface-1 p-3 text-center">
            {!compact && <Avatar name={name} color={color} size={56} />}
            <p className={cx('font-semibold', compact ? 'text-xs' : 'text-sm')}>{name} está transmitindo</p>
            <Button className={compact ? 'h-7 px-2 text-xs' : ''} onClick={(e) => { e.stopPropagation(); setWatching(p.identity, true); }}>
              <Eye size={16} /> Assistir
            </Button>
          </div>
        )}

        <div className="pointer-events-none absolute top-2 left-2 flex items-center gap-1.5">
          <span className="rounded-md bg-live px-1.5 py-0.5 text-[10px] font-bold text-white">AO VIVO</span>
          {showStats && track && <StatsBadge track={track} />}
        </div>

        <TileLabel name={isLocal ? `${name} (você)` : name} icon={<MonitorUp size={13} />} />

        {canView && (
          <div className="absolute top-2 right-2 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100" onClick={(e) => e.stopPropagation()}>
            {!isLocal && <StreamVolume identity={p.identity} />}
            <OverlayButton label="Estatísticas" active={showStats} onClick={() => setShowStats(!showStats)}>
              <Activity size={15} />
            </OverlayButton>
            {!isLocal && (
              <OverlayButton label="Parar de assistir" onClick={() => setWatching(p.identity, false)}>
                <EyeOff size={15} />
              </OverlayButton>
            )}
            <OverlayButton label={isFullscreen ? 'Sair da tela cheia' : 'Tela cheia'} onClick={toggleFullscreen}>
              {isFullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
            </OverlayButton>
          </div>
        )}
      </div>
    );
  }

  const camPub = p.getTrackPublication(Track.Source.Camera);
  const camTrack = camPub && !camPub.isMuted ? (camPub.track as LocalTrack | RemoteTrack | undefined) : undefined;
  const micPub = p.getTrackPublication(Track.Source.Microphone);
  const muted = !micPub || micPub.isMuted;

  return (
    <div
      ref={ref}
      onClick={onClick}
      onContextMenu={(e) => {
        e.preventDefault();
        openPopover(p.identity, detail.server.id, { left: e.clientX, right: e.clientX, top: e.clientY });
      }}
      className={cx(
        'relative flex h-full w-full cursor-pointer items-center justify-center overflow-hidden rounded-xl bg-surface-3 ring-1 ring-line transition-shadow',
        speaking && !muted && 'ring-2 ring-ok',
      )}
      style={!camTrack ? { background: `radial-gradient(circle at 50% 40%, ${color}33, transparent 70%), var(--color-surface-3)` } : undefined}
    >
      {camTrack ? (
        <VideoEl track={camTrack} fit={focused ? 'contain' : 'cover'} mirror={isLocal} />
      ) : (
        <Avatar name={name} color={color} size={compact ? 44 : focused ? 128 : 80} speaking={speaking && !muted} />
      )}
      <TileLabel
        name={isLocal ? `${name} (você)` : name}
        color={memberColor(detail, p.identity)}
        icon={muted ? <MicOff size={13} className="text-danger" /> : <Mic size={13} />}
      />
    </div>
  );
}

function TileLabel({ name, icon, color }: { name: string; icon: ReactNode; color?: string }) {
  return (
    <div className="pointer-events-none absolute bottom-2 left-2 flex max-w-[85%] items-center gap-1.5 rounded-md bg-black/60 px-2 py-1 text-xs font-semibold backdrop-blur">
      {icon}
      <span className="truncate" style={{ color }}>
        {name}
      </span>
    </div>
  );
}

function OverlayButton({ label, active, onClick, children }: { label: string; active?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      title={label}
      onClick={onClick}
      className={cx('flex h-8 w-8 items-center justify-center rounded-md backdrop-blur transition-colors', active ? 'bg-accent text-white' : 'bg-black/60 text-white hover:bg-black/80')}
    >
      {children}
    </button>
  );
}

function StreamVolume({ identity }: { identity: string }) {
  const volume = useVoice((s) => s.streamVolumes[identity] ?? 1);
  const setVolume = useVoice((s) => s.setVolume);
  return (
    <div className="flex h-8 items-center gap-1.5 rounded-md bg-black/60 px-2 backdrop-blur" title="Volume da transmissão">
      <Volume2 size={14} />
      <input type="range" min={0} max={1} step={0.05} value={volume} onChange={(e) => setVolume(identity, Number(e.target.value), true)} className="w-20" />
    </div>
  );
}

function VideoEl({ track, fit, mirror }: { track: LocalTrack | RemoteTrack; fit: 'contain' | 'cover'; mirror?: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    track.attach(el);
    return () => {
      track.detach(el);
    };
  }, [track]);
  return (
    <video
      ref={ref}
      autoPlay
      playsInline
      muted
      className={cx('h-full w-full', fit === 'contain' ? 'object-contain' : 'object-cover', mirror && '-scale-x-100')}
    />
  );
}

// ------------------------------------------------------------------ Estatísticas

interface Stats {
  fps: number;
  width: number;
  height: number;
  kbps: number;
  codec: string;
}

function StatsBadge({ track }: { track: LocalTrack | RemoteTrack }) {
  const [stats, setStats] = useState<Stats | null>(null);
  useEffect(() => {
    let prevBytes = 0;
    let prevTs = 0;
    const id = setInterval(async () => {
      const report = await track.getRTCStatsReport().catch(() => undefined);
      if (!report) return;
      let best: Record<string, number | string> | undefined;
      let totalBytes = 0;
      let ts = 0;
      report.forEach((s: Record<string, number | string>) => {
        if ((s.type === 'inbound-rtp' || s.type === 'outbound-rtp') && s.kind === 'video') {
          totalBytes += Number(s.bytesReceived ?? s.bytesSent ?? 0);
          ts = Number(s.timestamp);
          if (!best || Number(s.frameWidth ?? 0) > Number(best.frameWidth ?? 0)) best = s;
        }
      });
      if (!best) return;
      const codec = (report.get(String(best.codecId)) as { mimeType?: string } | undefined)?.mimeType?.split('/')[1] ?? '?';
      const kbps = prevTs ? ((totalBytes - prevBytes) * 8) / (ts - prevTs) : 0;
      prevBytes = totalBytes;
      prevTs = ts;
      setStats({
        fps: Math.round(Number(best.framesPerSecond ?? 0)),
        width: Number(best.frameWidth ?? 0),
        height: Number(best.frameHeight ?? 0),
        kbps: Math.round(kbps),
        codec,
      });
    }, 1000);
    return () => clearInterval(id);
  }, [track]);

  if (!stats) return null;
  return (
    <span className="rounded-md bg-black/70 px-1.5 py-0.5 font-mono text-[10px] text-white backdrop-blur">
      {stats.width}×{stats.height} · <b className={stats.fps >= 55 ? 'text-ok' : stats.fps >= 30 ? 'text-warn' : 'text-danger'}>{stats.fps} fps</b> ·{' '}
      {(stats.kbps / 1000).toFixed(1)} Mbps · {stats.codec}
    </span>
  );
}

// ------------------------------------------------------------------ Barra de controles

function ControlBar() {
  const { micOn, deafened, cameraOn, sharing, serverMuted, toggleMic, toggleDeafen, toggleCamera, stopShare, leave } = useVoice();
  const openModal = useApp((s) => s.openModal);

  const btn = (label: string, on: boolean, onClick: () => void, icon: ReactNode, tone: 'default' | 'off' | 'live' | 'danger' = 'default') => (
    <button
      title={label}
      onClick={onClick}
      className={cx(
        'flex h-12 w-12 items-center justify-center rounded-full transition-all hover:scale-105',
        tone === 'danger' && 'bg-danger text-white hover:bg-red-600',
        tone === 'live' && 'bg-live text-white',
        tone === 'off' && 'bg-white text-surface-0',
        tone === 'default' && (on ? 'bg-surface-4 text-fg hover:bg-white/20' : 'bg-surface-3 text-fg-muted hover:bg-surface-4'),
      )}
    >
      {icon}
    </button>
  );

  return (
    <div className="flex shrink-0 justify-center pb-4">
      <div className="flex items-center gap-2 rounded-full border border-line bg-surface-2/90 p-2 shadow-2xl backdrop-blur">
        {btn(serverMuted ? 'Silenciado por moderador' : micOn ? 'Silenciar' : 'Ativar microfone', micOn, () => void toggleMic(), micOn ? <Mic size={20} /> : <MicOff size={20} />, micOn ? 'default' : 'off')}
        {btn(deafened ? 'Ativar áudio' : 'Ensurdecer', !deafened, () => void toggleDeafen(), deafened ? <HeadphoneOff size={20} /> : <Headphones size={20} />, deafened ? 'off' : 'default')}
        {btn(cameraOn ? 'Desligar câmera' : 'Ligar câmera', cameraOn, () => void toggleCamera(), cameraOn ? <Video size={20} /> : <VideoOff size={20} />)}
        {btn(
          sharing ? 'Parar transmissão' : 'Transmitir tela',
          sharing,
          () => (sharing ? void stopShare() : openModal({ type: 'shareScreen' })),
          sharing ? <ScreenShareOff size={20} /> : <MonitorUp size={20} />,
          sharing ? 'live' : 'default',
        )}
        {sharing && btn('Trocar qualidade / fonte', true, () => openModal({ type: 'shareScreen' }), <Settings2 size={20} />)}
        <div className="mx-1 h-8 w-px bg-line-strong" />
        {btn('Sair da sala', false, () => void leave(), <PhoneOff size={20} />, 'danger')}
      </div>
    </div>
  );
}
