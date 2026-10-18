import { Track, type LocalTrack, type Participant, type RemoteTrack } from 'livekit-client';
import {
  Activity,
  Eye,
  EyeOff,
  HeadphoneOff,
  Headphones,
  LayoutGrid,
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
import { memberName, type Channel, type ServerDetail } from '../lib/types';
import { useActiveDetail, useApp } from '../store/app';
import { usePopover } from '../store/popover';
import { useVoice } from '../store/voice';
import { Composer, MessageFeed } from './ChatView';
import { Avatar, AvatarStack, Button, LivePill, Spinner, cx } from './ui';

export function VoiceView({ channel }: { channel: Channel }) {
  const detail = useActiveDetail()!;
  const status = useVoice((s) => (s.channelId === channel.id ? s.status : 'idle'));
  const states = useApp((s) => s.voiceStates[detail.server.id]) ?? [];
  const inRoom = states.filter((v) => v.channelId === channel.id);
  const streamer = inRoom.find((v) => v.streaming);
  const streamerMember = streamer && detail.members.find((m) => m.id === streamer.userId);
  const canChat = has(channel.permissions, P.VIEW_CHANNEL);

  return (
    <>
      <main className="flex min-w-0 flex-1 flex-col gap-3.5">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-1.5 pt-2">
          <h1 className="text-[30px] leading-tight font-bold">{channel.name}</h1>
          <span className="text-sm text-fg-muted">
            {streamerMember ? `${memberName(streamerMember)} está transmitindo` : inRoom.length ? `${inRoom.length} na sala` : 'Sala vazia'}
          </span>
          {status === 'connected' && <ConnectionQuality />}
        </div>

        <section aria-label="Palco da sala" className="relative min-h-0 flex-1 overflow-hidden rounded-[32px] bg-surface-0">
          {status === 'idle' ? (
            <JoinSplash detail={detail} channel={channel} />
          ) : status === 'connecting' ? (
            <div className="flex h-full flex-col items-center justify-center gap-4 text-fg-muted">
              <Spinner size={40} />
              Entrando na sala…
            </div>
          ) : (
            <Stage detail={detail} />
          )}
        </section>

        {status !== 'idle' && <ControlDock />}
      </main>

      {canChat && (
        <aside aria-label="Papo da sala" className="panel hidden w-[320px] shrink-0 flex-col overflow-hidden xl:flex">
          <h2 className="px-5 pt-5 pb-2 text-lg font-bold">Papo da sala</h2>
          <MessageFeed channel={channel} compact />
          <Composer channel={channel} compact />
        </aside>
      )}
    </>
  );
}

function ConnectionQuality() {
  const room = useVoice((s) => s.room);
  useVoice((s) => s.tick);
  const status = useVoice((s) => s.status);
  const q = room?.localParticipant.connectionQuality ?? 'unknown';
  const label = { excellent: 'excelente', good: 'boa', poor: 'instável', lost: 'perdida', unknown: '—' }[q] ?? '—';
  const bad = status === 'reconnecting' || q === 'poor' || q === 'lost';
  return (
    <span className={cx('ml-auto rounded-full px-3 py-1 text-xs font-bold', bad ? 'bg-warn/15 text-warn' : 'bg-surface-3 text-fg-muted')}>
      {status === 'reconnecting' ? 'reconectando…' : `conexão ${label}`}
    </span>
  );
}

function JoinSplash({ detail, channel }: { detail: ServerDetail; channel: Channel }) {
  const states = useApp((s) => s.voiceStates[detail.server.id]) ?? [];
  const join = useVoice((s) => s.join);
  const inRoom = states.filter((v) => v.channelId === channel.id);
  const canConnect = has(channel.permissions, P.CONNECT);
  const people = inRoom.flatMap((v) => {
    const m = detail.members.find((x) => x.id === v.userId);
    return m ? [{ id: m.id, name: memberName(m), color: m.avatarColor, src: m.avatarUrl }] : [];
  });

  return (
    <div className="flex h-full items-center justify-center p-6">
      <div className="animate-slide-up text-center">
        {people.length > 0 ? (
          <div className="mb-6 flex justify-center">
            <AvatarStack people={people} size={64} max={6} />
          </div>
        ) : (
          <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-[26px] bg-surface-3">
            <Volume2 size={36} className="text-accent" />
          </div>
        )}
        <h2 className="text-2xl font-bold">{people.length ? 'A galera tá aqui' : 'Ninguém por aqui ainda'}</h2>
        <p className="mt-1 text-fg-muted">
          {people.length ? `${people.map((p) => p.name).slice(0, 3).join(', ')}${people.length > 3 ? ' e mais' : ''} na sala` : 'Entre e chame os amigos.'}
        </p>
        <Button className="mt-6 h-12 px-8 text-base" disabled={!canConnect} onClick={() => void join(detail.server.id, channel.id)}>
          {canConnect ? 'Entrar na sala' : 'Sem permissão para entrar'}
        </Button>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ palco

interface TileInfo {
  key: string;
  participant: Participant;
  kind: 'person' | 'screen';
  isLocal: boolean;
}

function buildTiles(participants: Participant[]): TileInfo[] {
  const tiles: TileInfo[] = [];
  for (const p of participants) {
    if (p.getTrackPublication(Track.Source.ScreenShare)) tiles.push({ key: `${p.identity}:screen`, participant: p, kind: 'screen', isLocal: p.isLocal });
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

  if (focused) {
    const others = tiles.filter((t) => t !== focused);
    return (
      <div className="absolute inset-0">
        <Tile detail={detail} tile={focused} focused onClick={() => {}} />
        {/* bolhas dos participantes sobre a transmissão */}
        <div className="pointer-events-none absolute inset-x-0 bottom-5 flex justify-center">
          <div className="pointer-events-auto flex max-w-[90%] items-end gap-3.5 overflow-x-auto px-2 pt-2 pb-1">
            {others.map((t) => (t.kind === 'screen' ? <ScreenChip key={t.key} detail={detail} tile={t} onClick={() => setFocus(t.key)} /> : <Bubble key={t.key} detail={detail} tile={t} />))}
            <button
              title="Ver todos em grade"
              aria-label="Ver todos em grade"
              onClick={() => setFocus(null)}
              className="mb-6 flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-surface-2/90 text-fg-muted backdrop-blur hover:text-fg"
            >
              <LayoutGrid size={18} />
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full items-center justify-center overflow-y-auto p-5">
      <div className="grid w-full max-w-6xl gap-4" style={{ gridTemplateColumns: `repeat(${gridCols(tiles.length)}, minmax(0, 1fr))` }}>
        {tiles.map((t) => (
          <div key={t.key} className="aspect-video">
            <Tile detail={detail} tile={t} onClick={() => setFocus(t.key)} />
          </div>
        ))}
      </div>
    </div>
  );
}

function useMemberInfo(detail: ServerDetail, p: Participant) {
  const member = detail.members.find((m) => m.id === p.identity);
  return {
    name: member ? memberName(member) : (p.name ?? p.identity),
    color: member?.avatarColor ?? '#7c5cff',
    avatarUrl: member?.avatarUrl ?? null,
  };
}

/** Participante em bolha (sobre a transmissão em foco). */
function Bubble({ detail, tile }: { detail: ServerDetail; tile: TileInfo }) {
  const p = tile.participant;
  const { name, color, avatarUrl } = useMemberInfo(detail, p);
  const speaking = useVoice((s) => !!s.speaking[p.identity]);
  const openPopover = usePopover((s) => s.open);
  const micPub = p.getTrackPublication(Track.Source.Microphone);
  const muted = !micPub || micPub.isMuted;
  const camPub = p.getTrackPublication(Track.Source.Camera);
  const camTrack = camPub && !camPub.isMuted ? (camPub.track as LocalTrack | RemoteTrack | undefined) : undefined;

  return (
    <button
      onClick={(e) => openPopover(p.identity, detail.server.id, e.currentTarget.getBoundingClientRect())}
      className="flex shrink-0 flex-col items-center gap-1.5"
    >
      <span className={cx('relative block h-16 w-16 overflow-hidden rounded-full ring-4 transition-shadow', speaking && !muted ? 'ring-accent' : 'ring-surface-1')}>
        {camTrack ? <VideoEl track={camTrack} fit="cover" mirror={tile.isLocal} /> : <Avatar name={name} color={color} src={avatarUrl} size={64} />}
      </span>
      <span className="flex max-w-24 items-center gap-1 rounded-full bg-surface-1/85 px-2.5 py-0.5 text-xs font-bold backdrop-blur">
        {muted && <MicOff size={11} className="shrink-0 text-danger" />}
        <span className="truncate">{tile.isLocal ? 'você' : name}</span>
      </span>
    </button>
  );
}

function ScreenChip({ detail, tile, onClick }: { detail: ServerDetail; tile: TileInfo; onClick: () => void }) {
  const { name } = useMemberInfo(detail, tile.participant);
  return (
    <button onClick={onClick} className="mb-6 flex h-11 shrink-0 items-center gap-2 rounded-full bg-surface-2/90 px-4 text-sm font-bold backdrop-blur hover:bg-surface-3">
      <MonitorUp size={16} className="text-accent" /> Tela de {tile.isLocal ? 'você' : name}
    </button>
  );
}

function Tile({ detail, tile, focused, onClick }: { detail: ServerDetail; tile: TileInfo; focused?: boolean; onClick: () => void }) {
  const { participant: p, kind, isLocal } = tile;
  const { name, color, avatarUrl } = useMemberInfo(detail, p);
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

  const shape = focused ? 'h-full w-full' : 'h-full w-full rounded-[24px]';

  if (kind === 'screen') {
    const pub = p.getTrackPublication(Track.Source.ScreenShare);
    const track = pub?.track as LocalTrack | RemoteTrack | undefined;
    const canView = isLocal || watching;

    return (
      <div
        ref={ref}
        onDoubleClick={toggleFullscreen}
        onClick={canView && !focused && !isFullscreen ? onClick : undefined}
        className={cx('group relative overflow-hidden bg-black', shape, !focused && canView && 'cursor-pointer')}
      >
        {canView && track ? (
          <VideoEl track={track} fit="contain" />
        ) : canView ? (
          <div className="flex h-full items-center justify-center">
            <Spinner />
          </div>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 bg-surface-2 p-4 text-center">
            <Avatar name={name} color={color} src={avatarUrl} size={focused ? 88 : 56} speaking />
            <p className="font-display text-lg font-bold">{name} está transmitindo</p>
            <Button
              onClick={(e) => {
                e.stopPropagation();
                setWatching(p.identity, true);
              }}
            >
              <Eye size={16} /> Assistir
            </Button>
          </div>
        )}

        <div className="pointer-events-none absolute top-5 left-5 flex items-center gap-2">
          <LivePill className="px-3 py-1 text-xs">ao vivo</LivePill>
          {showStats && track && <StatsBadge track={track} />}
        </div>

        {!focused && (
          <span className="pointer-events-none absolute bottom-3 left-3 rounded-full bg-surface-1/85 px-3 py-1 text-xs font-bold backdrop-blur">
            Tela de {isLocal ? 'você' : name}
          </span>
        )}

        {canView && (
          <div className="absolute top-4 right-4 flex gap-1.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100" onClick={(e) => e.stopPropagation()}>
            {!isLocal && <StreamVolume identity={p.identity} />}
            <OverlayButton label="Estatísticas" active={showStats} onClick={() => setShowStats(!showStats)}>
              <Activity size={16} />
            </OverlayButton>
            {!isLocal && (
              <OverlayButton label="Parar de assistir" onClick={() => setWatching(p.identity, false)}>
                <EyeOff size={16} />
              </OverlayButton>
            )}
            <OverlayButton label={isFullscreen ? 'Sair da tela cheia' : 'Tela cheia'} onClick={toggleFullscreen}>
              {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
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
      className={cx('relative flex cursor-pointer items-center justify-center overflow-hidden bg-surface-2 transition-shadow', shape, speaking && !muted && 'ring-4 ring-accent')}
    >
      {camTrack ? (
        <VideoEl track={camTrack} fit={focused ? 'contain' : 'cover'} mirror={isLocal} />
      ) : (
        <Avatar name={name} color={color} src={avatarUrl} size={focused ? 128 : 84} speaking={speaking && !muted} />
      )}
      <span className="pointer-events-none absolute bottom-3 left-3 flex max-w-[85%] items-center gap-1.5 rounded-full bg-surface-1/85 px-3 py-1 text-xs font-bold backdrop-blur">
        {muted ? <MicOff size={12} className="shrink-0 text-danger" /> : <Mic size={12} className="shrink-0" />}
        <span className="truncate">{isLocal ? `${name} (você)` : name}</span>
      </span>
    </div>
  );
}

function OverlayButton({ label, active, onClick, children }: { label: string; active?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      title={label}
      aria-label={label}
      onClick={onClick}
      className={cx('flex h-10 w-10 items-center justify-center rounded-full backdrop-blur transition-colors', active ? 'bg-accent text-on-accent' : 'bg-surface-1/80 text-fg hover:bg-surface-1')}
    >
      {children}
    </button>
  );
}

function StreamVolume({ identity }: { identity: string }) {
  const volume = useVoice((s) => s.streamVolumes[identity] ?? 1);
  const setVolume = useVoice((s) => s.setVolume);
  return (
    <label className="flex h-10 items-center gap-2 rounded-full bg-surface-1/80 px-3 backdrop-blur" title="Volume da transmissão">
      <Volume2 size={15} />
      <span className="sr-only">Volume da transmissão</span>
      <input type="range" min={0} max={1} step={0.05} value={volume} onChange={(e) => setVolume(identity, Number(e.target.value), true)} className="w-20" />
    </label>
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
  return <video ref={ref} autoPlay playsInline muted className={cx('h-full w-full', fit === 'contain' ? 'object-contain' : 'object-cover', mirror && '-scale-x-100')} />;
}

// ------------------------------------------------------------------ estatísticas

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
    <span className="rounded-full bg-surface-1/85 px-3 py-1 text-xs font-bold text-fg backdrop-blur">
      {stats.width}×{stats.height} · <span className={stats.fps >= 55 ? 'text-ok' : stats.fps >= 30 ? 'text-warn' : 'text-danger'}>{stats.fps} fps</span> ·{' '}
      {(stats.kbps / 1000).toFixed(1)} Mbps · {stats.codec}
    </span>
  );
}

// ------------------------------------------------------------------ controles

function ControlDock() {
  const { micOn, deafened, cameraOn, sharing, serverMuted, toggleMic, toggleDeafen, toggleCamera, stopShare, leave } = useVoice();
  const openModal = useApp((s) => s.openModal);

  const round = (label: string, onClick: () => void, icon: ReactNode, tone: 'default' | 'off' | 'danger' = 'default') => (
    <button
      title={label}
      aria-label={label}
      onClick={onClick}
      className={cx(
        'flex h-[52px] w-[52px] items-center justify-center rounded-full transition-all hover:scale-105',
        tone === 'default' && 'bg-surface-3 text-fg hover:bg-surface-4',
        tone === 'off' && 'bg-fg text-surface-1',
        tone === 'danger' && 'bg-danger text-white hover:brightness-110',
      )}
    >
      {icon}
    </button>
  );

  return (
    <div className="flex shrink-0 justify-center">
      <div className="flex items-center gap-2.5 rounded-full bg-surface-2 p-2.5">
        {round(serverMuted ? 'Silenciado por um moderador' : micOn ? 'Silenciar' : 'Ativar microfone', () => void toggleMic(), micOn ? <Mic size={20} /> : <MicOff size={20} />, micOn ? 'default' : 'off')}
        {round(deafened ? 'Ativar áudio' : 'Ensurdecer', () => void toggleDeafen(), deafened ? <HeadphoneOff size={20} /> : <Headphones size={20} />, deafened ? 'off' : 'default')}
        {round(cameraOn ? 'Desligar câmera' : 'Ligar câmera', () => void toggleCamera(), cameraOn ? <Video size={20} /> : <VideoOff size={20} />)}
        <button
          onClick={() => (sharing ? void stopShare() : openModal({ type: 'shareScreen' }))}
          className={cx(
            'flex h-[52px] items-center gap-2 rounded-full px-6 font-display text-[15px] font-bold transition-all hover:scale-[1.03]',
            sharing ? 'bg-fg text-surface-1' : 'bg-accent text-on-accent',
          )}
        >
          {sharing ? <ScreenShareOff size={19} /> : <MonitorUp size={19} />}
          {sharing ? 'Parar transmissão' : 'Transmitir tela'}
        </button>
        {sharing && round('Trocar qualidade ou fonte', () => openModal({ type: 'shareScreen' }), <Settings2 size={20} />)}
        {round('Sair da sala', () => void leave(), <PhoneOff size={20} />, 'danger')}
      </div>
    </div>
  );
}
