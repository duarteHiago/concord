import {
  ChevronDown,
  Hash,
  HeadphoneOff,
  Headphones,
  Lock,
  LogOut,
  Mic,
  MicOff,
  MonitorUp,
  PhoneOff,
  Plus,
  Settings,
  Trash2,
  UserPlus,
  Video,
  VideoOff,
  Volume2,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { P, has } from '../../../shared/permissions.ts';
import { api } from '../lib/api';
import type { Channel, ServerDetail, VoiceState } from '../lib/types';
import { memberColor, useActiveDetail, useApp } from '../store/app';
import { usePopover } from '../store/popover';
import { toast } from '../store/toast';
import { useVoice } from '../store/voice';
import { Avatar, IconButton, cx } from './ui';

export function ChannelSidebar() {
  const detail = useActiveDetail();
  if (!detail) return <aside className="w-60 shrink-0 bg-surface-1" />;
  return (
    <aside className="flex w-60 shrink-0 flex-col bg-surface-1">
      <ServerHeader detail={detail} />
      <div className="flex-1 space-y-4 overflow-y-auto px-2 py-3">
        <ChannelGroup detail={detail} kind="text" />
        <ChannelGroup detail={detail} kind="voice" />
      </div>
      <VoicePanel />
      <UserPanel />
    </aside>
  );
}

function ServerHeader({ detail }: { detail: ServerDetail }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const me = useApp((s) => s.me)!;
  const openModal = useApp((s) => s.openModal);
  const perms = detail.permissions;
  const isOwner = detail.server.ownerId === me.id;

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [open]);

  const item = (label: string, icon: React.ReactNode, onClick: () => void, danger = false) => (
    <button
      onClick={() => {
        setOpen(false);
        onClick();
      }}
      className={cx(
        'flex w-full items-center justify-between rounded-md px-2.5 py-2 text-sm font-medium',
        danger ? 'text-danger hover:bg-danger hover:text-white' : 'text-fg-muted hover:bg-accent hover:text-white',
      )}
    >
      {label}
      {icon}
    </button>
  );

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex h-12 w-full items-center justify-between border-b border-line px-4 font-bold transition-colors hover:bg-white/5"
      >
        <span className="truncate">{detail.server.name}</span>
        <ChevronDown size={18} className={cx('transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="absolute top-13 right-2 left-2 z-30 animate-pop-in space-y-0.5 rounded-xl border border-line bg-surface-0 p-1.5 shadow-2xl">
          {has(perms, P.CREATE_INVITE) && item('Convidar pessoas', <UserPlus size={16} />, () => openModal({ type: 'invite', serverId: detail.server.id }))}
          {(has(perms, P.MANAGE_SERVER) || has(perms, P.MANAGE_ROLES) || has(perms, P.KICK_MEMBERS)) &&
            item('Configurações do servidor', <Settings size={16} />, () => openModal({ type: 'serverSettings', serverId: detail.server.id }))}
          {has(perms, P.MANAGE_CHANNELS) && item('Criar canal', <Plus size={16} />, () => openModal({ type: 'createChannel', serverId: detail.server.id, kind: 'text' }))}
          <div className="my-1 h-px bg-line" />
          {isOwner
            ? item('Apagar servidor', <Trash2 size={16} />, () =>
                openModal({
                  type: 'confirm',
                  title: `Apagar "${detail.server.name}"`,
                  message: 'Todos os canais, mensagens e cargos serão apagados para sempre. Esta ação não pode ser desfeita.',
                  confirmLabel: 'Apagar servidor',
                  danger: true,
                  onConfirm: async () => {
                    await api.del(`/servers/${detail.server.id}`);
                  },
                }),
              true)
            : item('Sair do servidor', <LogOut size={16} />, () =>
                openModal({
                  type: 'confirm',
                  title: `Sair de "${detail.server.name}"`,
                  message: 'Você só poderá voltar com um novo convite.',
                  confirmLabel: 'Sair',
                  danger: true,
                  onConfirm: async () => {
                    await api.post(`/servers/${detail.server.id}/leave`);
                    useApp.getState().details[detail.server.id] && void useApp.getState().loadServers();
                  },
                }),
              true)}
        </div>
      )}
    </div>
  );
}

function ChannelGroup({ detail, kind }: { detail: ServerDetail; kind: 'text' | 'voice' }) {
  const channels = detail.channels.filter((c) => c.type === kind).sort((a, b) => a.position - b.position);
  const openModal = useApp((s) => s.openModal);
  const canManage = has(detail.permissions, P.MANAGE_CHANNELS);

  return (
    <div>
      <div className="group mb-1 flex items-center justify-between px-2">
        <span className="text-[11px] font-bold tracking-wider text-fg-subtle uppercase">
          {kind === 'text' ? 'Canais de texto' : 'Salas de voz'}
        </span>
        {canManage && (
          <IconButton
            label="Criar canal"
            className="h-5 w-5 opacity-0 group-hover:opacity-100"
            onClick={() => openModal({ type: 'createChannel', serverId: detail.server.id, kind })}
          >
            <Plus size={15} />
          </IconButton>
        )}
      </div>
      <div className="space-y-0.5">
        {channels.map((c) => (
          <ChannelItem key={c.id} detail={detail} channel={c} />
        ))}
      </div>
    </div>
  );
}

function ChannelItem({ detail, channel }: { detail: ServerDetail; channel: Channel }) {
  const serverId = detail.server.id;
  const active = useApp((s) => s.activeChannels[serverId] === channel.id);
  const openChannel = useApp((s) => s.openChannel);
  const openModal = useApp((s) => s.openModal);
  const states = useApp((s) => s.voiceStates[serverId]) ?? [];
  const join = useVoice((s) => s.join);
  const connectedHere = useVoice((s) => s.channelId === channel.id && s.status !== 'idle');
  const isPrivate = channel.overwrites.some((o) => o.roleId === detail.roles.find((r) => r.isDefault)?.id && o.deny & P.VIEW_CHANNEL);
  const participants = states.filter((v) => v.channelId === channel.id);
  const Icon = channel.type === 'text' ? Hash : Volume2;

  function onClick() {
    openChannel(serverId, channel.id);
    if (channel.type === 'voice' && !connectedHere) {
      if (!has(channel.permissions, P.CONNECT)) return toast.info('Você não tem permissão para entrar nesta sala.');
      void join(serverId, channel.id);
    }
  }

  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        onClick={onClick}
        onKeyDown={(e) => e.key === 'Enter' && onClick()}
        className={cx(
          'group flex h-8 cursor-pointer items-center gap-1.5 rounded-md px-2 text-[15px] transition-colors',
          active ? 'bg-white/10 text-fg' : 'text-fg-subtle hover:bg-white/5 hover:text-fg-muted',
        )}
      >
        <Icon size={18} className="shrink-0 opacity-80" />
        <span className={cx('flex-1 truncate font-medium', connectedHere && 'text-ok')}>{channel.name}</span>
        {isPrivate && <Lock size={12} className="shrink-0 opacity-60" />}
        {channel.userLimit > 0 && (
          <span className="rounded bg-surface-0 px-1 text-[10px] font-semibold text-fg-subtle">
            {participants.length}/{channel.userLimit}
          </span>
        )}
        {has(channel.permissions, P.MANAGE_CHANNELS) && (
          <IconButton
            label="Editar canal"
            className="h-5 w-5 opacity-0 group-hover:opacity-100"
            onClick={(e) => {
              e.stopPropagation();
              openModal({ type: 'channelSettings', channelId: channel.id, serverId });
            }}
          >
            <Settings size={14} />
          </IconButton>
        )}
      </div>
      {participants.length > 0 && (
        <div className="mt-0.5 mb-1 space-y-0.5 pl-6">
          {participants.map((v) => (
            <VoiceParticipant key={v.userId} detail={detail} state={v} />
          ))}
        </div>
      )}
    </div>
  );
}

function VoiceParticipant({ detail, state }: { detail: ServerDetail; state: VoiceState }) {
  const member = detail.members.find((m) => m.id === state.userId);
  const speaking = useVoice((s) => s.channelId === state.channelId && !!s.speaking[state.userId]);
  const openPopover = usePopover((s) => s.open);
  if (!member) return null;
  return (
    <button
      onClick={(e) => openPopover(member.id, detail.server.id, e.currentTarget.getBoundingClientRect())}
      className="flex h-7 w-full items-center gap-2 rounded-md px-1.5 text-left text-sm text-fg-muted hover:bg-white/5 hover:text-fg"
    >
      <Avatar name={member.displayName} color={member.avatarColor} size={22} speaking={speaking && !state.muted} />
      <span className="flex-1 truncate" style={{ color: memberColor(detail, member.id) }}>
        {member.displayName}
      </span>
      {state.streaming && <span className="rounded bg-live px-1 text-[9px] leading-4 font-bold text-white">AO VIVO</span>}
      {state.camera && <Video size={13} className="text-fg-subtle" />}
      {state.deafened ? (
        <HeadphoneOff size={13} className="text-danger" />
      ) : state.muted ? (
        <MicOff size={13} className={state.serverMuted ? 'text-danger' : 'text-fg-subtle'} />
      ) : null}
    </button>
  );
}

function VoicePanel() {
  const { status, channelId, serverId, cameraOn, sharing, leave, toggleCamera, stopShare } = useVoice();
  const details = useApp((s) => s.details);
  const openChannel = useApp((s) => s.openChannel);
  const openServer = useApp((s) => s.openServer);
  const openModal = useApp((s) => s.openModal);
  if (status === 'idle' || !serverId || !channelId) return null;
  const detail = details[serverId];
  const channel = detail?.channels.find((c) => c.id === channelId);

  return (
    <div className="border-t border-line bg-surface-0/60 px-2.5 py-2">
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <div className={cx('flex items-center gap-1.5 text-sm font-bold', status === 'connected' ? 'text-ok' : 'text-warn')}>
            <SignalBars />
            {status === 'connected' ? 'Voz conectada' : status === 'connecting' ? 'Conectando…' : 'Reconectando…'}
          </div>
          <button
            className="block max-w-full truncate text-xs text-fg-muted hover:underline"
            onClick={() => {
              openServer(serverId);
              openChannel(serverId, channelId);
            }}
          >
            {channel?.name ?? 'Sala'} / {detail?.server.name}
          </button>
        </div>
        <IconButton label="Desconectar" className="h-8 w-8" onClick={() => void leave()}>
          <PhoneOff size={18} />
        </IconButton>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-1.5">
        <button
          onClick={() => void toggleCamera()}
          className={cx(
            'flex h-8 items-center justify-center gap-1.5 rounded-md text-xs font-semibold transition-colors',
            cameraOn ? 'bg-white/15 text-fg' : 'bg-surface-3 text-fg-muted hover:bg-surface-4 hover:text-fg',
          )}
        >
          {cameraOn ? <VideoOff size={16} /> : <Video size={16} />} Câmera
        </button>
        <button
          onClick={() => (sharing ? void stopShare() : openModal({ type: 'shareScreen' }))}
          className={cx(
            'flex h-8 items-center justify-center gap-1.5 rounded-md text-xs font-semibold transition-colors',
            sharing ? 'bg-live text-white hover:bg-rose-600' : 'bg-surface-3 text-fg-muted hover:bg-surface-4 hover:text-fg',
          )}
        >
          <MonitorUp size={16} /> {sharing ? 'Parar' : 'Tela'}
        </button>
      </div>
    </div>
  );
}

function SignalBars() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
      <rect x="1" y="9" width="3" height="4" rx="1" />
      <rect x="5.5" y="5.5" width="3" height="7.5" rx="1" />
      <rect x="10" y="2" width="3" height="11" rx="1" />
    </svg>
  );
}

function UserPanel() {
  const me = useApp((s) => s.me)!;
  const openModal = useApp((s) => s.openModal);
  const { status, micOn, deafened, serverMuted, toggleMic, toggleDeafen } = useVoice();
  const inCall = status !== 'idle';
  const mutedVisual = inCall ? !micOn : false;

  return (
    <div className="flex h-[60px] items-center gap-2 bg-surface-0 px-2">
      <div className="flex min-w-0 flex-1 items-center gap-2 rounded-md p-1">
        <Avatar name={me.displayName} color={me.avatarColor} size={34} status="online" />
        <div className="min-w-0 leading-tight">
          <div className="truncate text-sm font-semibold">{me.displayName}</div>
          <div className="truncate text-xs text-fg-subtle">@{me.username}</div>
        </div>
      </div>
      <IconButton
        label={serverMuted ? 'Silenciado por um moderador' : micOn ? 'Silenciar' : 'Ativar microfone'}
        className={cx('h-8 w-8', (mutedVisual || serverMuted) && 'text-danger')}
        onClick={() => (inCall ? void toggleMic() : toast.info('Entre em uma sala de voz para usar o microfone.'))}
      >
        {mutedVisual || serverMuted ? <MicOff size={19} /> : <Mic size={19} />}
      </IconButton>
      <IconButton label={deafened ? 'Ativar áudio' : 'Ensurdecer'} className={cx('h-8 w-8', deafened && 'text-danger')} onClick={() => void toggleDeafen()}>
        {deafened ? <HeadphoneOff size={19} /> : <Headphones size={19} />}
      </IconButton>
      <IconButton label="Configurações de usuário" className="h-8 w-8" onClick={() => openModal({ type: 'userSettings' })}>
        <Settings size={19} />
      </IconButton>
    </div>
  );
}
