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
  MessageSquare,
  PictureInPicture2,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { P, has } from '../../../shared/permissions.ts';
import { memberName, type Channel, type ServerDetail } from '../lib/types';
import { useActiveDetail, useApp } from '../store/app';
import { usePopover } from '../store/popover';
import { useVoice } from '../store/voice';
import { Composer, MessageFeed } from './ChatView';
import { MemberListBody } from './MemberList';
import { SoundboardButton, SoundToast } from './Soundboard';
import { ReactionLayer, ReactionsButton } from './Reactions';
import { VoiceEffectsButton } from './VoiceEffectsButton';
import { StickerButton, StickerLayer } from './Stickers';
import { isPoppedOut, popOutVideo } from '../lib/popout';
import { toast } from '../store/toast';
import { Avatar, AvatarStack, Button, LivePill, Spinner, cx } from './ui';

export function VoiceView({ channel }: { channel: Channel }) {
  const detail = useActiveDetail()!;
  const status = useVoice((s) => (s.channelId === channel.id ? s.status : 'idle'));
  const states = useApp((s) => s.voiceStates[detail.server.id]) ?? [];
  const inRoom = states.filter((v) => v.channelId === channel.id);
  const streamer = inRoom.find((v) => v.streaming);
  const streamerMember = streamer && detail.members.find((m) => m.id === streamer.userId);
  const canChat = has(channel.permissions, P.VIEW_CHANNEL);
  const [chatOpen, setChatOpen] = useState(() => readFlag('concord.roomChat', true));
  const [panelTab, setPanelTab] = useState<'chat' | 'members'>('chat');
  const toggleChat = () => {
    setChatOpen(!chatOpen);
    writeFlag('concord.roomChat', !chatOpen);
  };

  return (
    <>
      <main className="flex min-w-0 flex-1 flex-col gap-3.5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-1.5 pt-2">
          <h1 className="text-[30px] leading-tight font-bold">{channel.name}</h1>
          <span className="text-sm text-fg-muted">
            {streamerMember ? `${memberName(streamerMember)} está transmitindo` : inRoom.length ? `${inRoom.length} na sala` : 'Sala vazia'}
          </span>
          <div className="ml-auto flex items-center gap-2">
            {status === 'connected' && <ConnectionQuality />}
            {canChat && (
              <button
                onClick={toggleChat}
                title={chatOpen ? 'Fechar o papo da sala' : 'Abrir o papo da sala'}
                aria-label={chatOpen ? 'Fechar o papo da sala' : 'Abrir o papo da sala'}
                aria-pressed={chatOpen}
                className={cx(
                  'hidden h-10 w-10 items-center justify-center rounded-full transition-colors xl:flex',
                  chatOpen ? 'bg-surface-3 text-fg' : 'text-fg-muted hover:bg-surface-3 hover:text-fg',
                )}
              >
                <MessageSquare size={18} />
              </button>
            )}
          </div>
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
            <>
              <Stage detail={detail} />
              <StickerLayer channel={channel} />
              <SoundToast />
              <ReactionLayer />
            </>
          )}
        </section>

        {status !== 'idle' && <ControlDock channel={channel} />}
      </main>

      {canChat && chatOpen && (
        <aside aria-label="Painel da sala" className="panel hidden w-[320px] shrink-0 flex-col overflow-hidden xl:flex">
          <div className="flex items-center gap-1 px-3 pt-3 pb-1">
            <div role="tablist" className="flex flex-1 gap-1 rounded-full bg-surface-0 p-1">
              {(
                [
                  ['chat', 'Papo'],
                  ['members', `Membros · ${detail.members.length}`],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  role="tab"
                  aria-selected={panelTab === id}
                  onClick={() => setPanelTab(id)}
                  className={cx(
                    'h-8 flex-1 rounded-full font-display text-sm font-bold transition-colors',
                    panelTab === id ? 'bg-surface-3 text-fg' : 'text-fg-muted hover:text-fg',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            <button onClick={toggleChat} aria-label="Fechar o painel" title="Fechar" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-fg-muted hover:bg-surface-3 hover:text-fg">
              <X size={16} />
            </button>
          </div>
          {panelTab === 'chat' ? (
            <>
              <MessageFeed channel={channel} compact />
              <Composer channel={channel} compact />
            </>
          ) : (
            <MemberListBody />
          )}
        </aside>
      )}
    </>
  );
}

function readFlag(key: string, fallback: boolean) {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : v === '1';
  } catch {
    return fallback;
  }
}

function writeFlag(key: string, value: boolean) {
  try {
    localStorage.setItem(key, value ? '1' : '0');
  } catch {
    // ignorado
  }
}

function ConnectionQuality() {
  const room = useVoice((s) => s.room);
  useVoice((s) => s.tick);
  const status = useVoice((s) => s.status);
  const q = room?.localParticipant.connectionQuality ?? 'unknown';
  const label = { excellent: 'excelente', good: 'boa', poor: 'instável', lost: 'perdida', unknown: '—' }[q] ?? '—';
  const bad = status === 'reconnecting' || q === 'poor' || q === 'lost';
  return (
    <span className={cx('rounded-full px-3 py-1 text-xs font-bold', bad ? 'bg-warn/15 text-warn' : 'bg-surface-3 text-fg-muted')}>
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
    return m ? [{ id: m.id, name: memberName(m), color: m.avatarColor, src: m.avatarUrl, frame: m.frame }] : [];
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
    frame: member?.frame ?? null,
  };
}

/** Participante em bolha (sobre a transmissão em foco). */
function Bubble({ detail, tile }: { detail: ServerDetail; tile: TileInfo }) {
  const p = tile.participant;
  const { name, color, avatarUrl, frame } = useMemberInfo(detail, p);
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
        {camTrack ? <VideoEl track={camTrack} fit="cover" mirror={tile.isLocal} /> : <Avatar name={name} color={color} src={avatarUrl} frame={frame} size={64} />}
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
  const { name, color, avatarUrl, frame } = useMemberInfo(detail, p);
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
          <ZoomableVideo track={track} />
        ) : canView ? (
          <div className="flex h-full items-center justify-center">
            <Spinner />
          </div>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 bg-surface-2 p-4 text-center">
            <Avatar name={name} color={color} src={avatarUrl} frame={frame} size={focused ? 88 : 56} speaking />
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
            {track && (
              <OverlayButton
                label="Abrir em outra janela (para outro monitor ou tela cheia)"
                active={isPoppedOut(track)}
                onClick={() => {
                  if (!popOutVideo(track, `${isLocal ? 'Sua tela' : `Tela de ${name}`} · Concord`)) {
                    toast.error('A janela foi bloqueada. Permita pop-ups para este site e tente de novo.');
                  }
                }}
              >
                <PictureInPicture2 size={16} />
              </OverlayButton>
            )}
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
      // clique abre o perfil (com as opções da pessoa); duplo clique destaca o quadro
      onClick={(e) => openPopover(p.identity, detail.server.id, { left: e.clientX, right: e.clientX, top: e.clientY })}
      onDoubleClick={onClick}
      onContextMenu={(e) => {
        e.preventDefault();
        openPopover(p.identity, detail.server.id, { left: e.clientX, right: e.clientX, top: e.clientY });
      }}
      title="Clique para ver o perfil · duplo clique para destacar"
      className={cx('relative flex cursor-pointer items-center justify-center overflow-hidden bg-surface-2 transition-shadow', shape, speaking && !muted && 'ring-4 ring-accent')}
    >
      {camTrack ? (
        <VideoEl track={camTrack} fit={focused ? 'contain' : 'cover'} mirror={isLocal} />
      ) : (
        <Avatar name={name} color={color} src={avatarUrl} frame={frame} size={focused ? 128 : 84} speaking={speaking && !muted} />
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

function ControlDock({ channel }: { channel: Channel }) {
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
        <VoiceEffectsButton />
        <SoundboardButton />
        <ReactionsButton />
        <StickerButton channel={channel} />
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

// ------------------------------------------------------------------ zoom na transmissão

/** Vídeo da transmissão com zoom pela rolagem do mouse (no ponto do cursor) e arraste para mover. */
function ZoomableVideo({ track }: { track: LocalTrack | RemoteTrack }) {
  const box = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ scale: 1, x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  const clampOffset = (scale: number, x: number, y: number) => {
    const rect = box.current?.getBoundingClientRect();
    if (!rect) return { x, y };
    const maxX = (rect.width * (scale - 1)) / 2;
    const maxY = (rect.height * (scale - 1)) / 2;
    return { x: Math.max(-maxX, Math.min(maxX, x)), y: Math.max(-maxY, Math.min(maxY, y)) };
  };

  // o listener de wheel precisa ser não-passivo para impedir a rolagem da página
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      setView((prev) => {
        const scale = Math.min(6, Math.max(1, prev.scale * Math.exp(-e.deltaY * 0.0015)));
        if (scale === 1) return { scale: 1, x: 0, y: 0 };
        // mantém parado o ponto que está sob o cursor
        const cx = e.clientX - rect.left - rect.width / 2;
        const cy = e.clientY - rect.top - rect.height / 2;
        const k = scale / prev.scale;
        return { scale, ...clampOffset(scale, cx - (cx - prev.x) * k, cy - (cy - prev.y) * k) };
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const zoomed = view.scale > 1.01;

  return (
    <div
      ref={box}
      className={cx('relative h-full w-full overflow-hidden', zoomed && (drag.current ? 'cursor-grabbing' : 'cursor-grab'))}
      onPointerDown={(e) => {
        if (!zoomed || e.button !== 0) return;
        e.stopPropagation();
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        drag.current = { x: e.clientX, y: e.clientY, ox: view.x, oy: view.y };
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d) return;
        setView((prev) => ({ ...prev, ...clampOffset(prev.scale, d.ox + e.clientX - d.x, d.oy + e.clientY - d.y) }));
      }}
      onPointerUp={() => {
        drag.current = null;
      }}
      onClick={(e) => zoomed && e.stopPropagation()}
    >
      <div className="h-full w-full" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`, transformOrigin: 'center' }}>
        <VideoEl track={track} fit="contain" />
      </div>
      {zoomed && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            setView({ scale: 1, x: 0, y: 0 });
          }}
          className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-surface-1/85 px-4 py-1.5 text-xs font-bold backdrop-blur hover:bg-surface-1"
        >
          {Math.round(view.scale * 100)}% · voltar ao normal
        </button>
      )}
    </div>
  );
}
