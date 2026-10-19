import {
  ChevronDown,
  Hash,
  HeadphoneOff,
  Headphones,
  HelpCircle,
  Lock,
  LogOut,
  MessagesSquare,
  Mic,
  MicOff,
  MonitorUp,
  Pencil,
  PhoneOff,
  Plus,
  Settings,
  Shirt,
  Trash2,
  UserPlus,
  Video,
  VideoOff,
  Volume2,
} from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { P, has } from '../../../shared/permissions.ts';
import { api } from '../lib/api';
import { memberName, type Channel, type ServerDetail, type VoiceState } from '../lib/types';
import { HOME, memberColor, useActiveDetail, useApp } from '../store/app';
import { DmSidebar } from './DirectMessages';
import { usePopover } from '../store/popover';
import { toast } from '../store/toast';
import { useVoice } from '../store/voice';
import { ServerStrip } from './ServerRail';
import { DeviceSplitButton } from './DeviceMenu';
import { Avatar, AvatarStack, IconButton, LivePill, VerifiedBadge, cx } from './ui';

export function ChannelSidebar() {
  const detail = useActiveDetail();
  const home = useApp((s) => s.activeServerId === HOME);
  return (
    <aside className="panel flex w-[290px] shrink-0 flex-col overflow-hidden">
      <ServerStrip />
      {home ? (
        <DmSidebar />
      ) : detail ? (
        <>
          <ServerHeader detail={detail} />
          <div className="flex-1 space-y-5 overflow-y-auto px-3 pb-3">
            <ChannelGroup detail={detail} kind="voice" />
            <ChannelGroup detail={detail} kind="forum" />
            <ChannelGroup detail={detail} kind="text" />
          </div>
        </>
      ) : (
        <div className="flex-1 px-5 py-6 text-sm text-fg-muted">Escolha um servidor acima ou crie um novo no +.</div>
      )}
      <VoicePanel />
      <UserCard />
    </aside>
  );
}

// ------------------------------------------------------------------ cabeçalho do servidor

function ServerHeader({ detail }: { detail: ServerDetail }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const me = useApp((s) => s.me)!;
  const online = useApp((s) => s.online);
  const openModal = useApp((s) => s.openModal);
  const perms = detail.permissions;
  const isOwner = detail.server.ownerId === me.id;
  const onlineCount = detail.members.filter((m) => online[m.id]).length;

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [open]);

  const item = (label: string, icon: ReactNode, onClick: () => void, danger = false) => (
    <button
      onClick={() => {
        setOpen(false);
        onClick();
      }}
      className={cx(
        'flex w-full items-center justify-between rounded-2xl px-3 py-2.5 text-sm font-semibold',
        danger ? 'text-danger hover:bg-danger hover:text-white' : 'text-fg-muted hover:bg-surface-4 hover:text-fg',
      )}
    >
      {label}
      {icon}
    </button>
  );

  return (
    <div ref={ref} className="relative px-5 pt-5 pb-3">
      <button onClick={() => setOpen(!open)} className="group flex w-full items-center gap-2 text-left" aria-expanded={open}>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <div className="truncate font-display text-[22px] leading-tight font-bold">{detail.server.name}</div>
            {detail.server.verified && <VerifiedBadge size={17} className="shrink-0" />}
          </div>
          <div className="text-[13px] text-fg-muted">
            {onlineCount} {onlineCount === 1 ? 'pessoa online' : 'pessoas online'}
          </div>
        </div>
        <ChevronDown size={20} className={cx('shrink-0 text-fg-muted transition-transform group-hover:text-fg', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="absolute top-full right-3 left-3 z-30 animate-pop-in space-y-0.5 rounded-3xl bg-popover p-2 shadow-2xl ring-1 ring-line">
          {has(perms, P.CREATE_INVITE) && item('Convidar amigos', <UserPlus size={16} />, () => openModal({ type: 'invite', serverId: detail.server.id }))}
          {(has(perms, P.CHANGE_NICKNAME) || has(perms, P.MANAGE_NICKNAMES)) &&
            item('Meu apelido aqui', <Pencil size={16} />, () => openModal({ type: 'nickname', serverId: detail.server.id, userId: me.id }))}
          {(has(perms, P.MANAGE_SERVER) || has(perms, P.MANAGE_ROLES) || has(perms, P.KICK_MEMBERS) || me.isAuthority) &&
            item('Configurações do servidor', <Settings size={16} />, () => openModal({ type: 'serverSettings', serverId: detail.server.id }))}
          {item('Patches do servidor', <Shirt size={16} />, () => openModal({ type: 'serverSettings', serverId: detail.server.id, tab: 'patches' }))}
          {has(perms, P.MANAGE_CHANNELS) && item('Criar sala ou canal', <Plus size={16} />, () => openModal({ type: 'createChannel', serverId: detail.server.id, kind: 'voice' }))}
          <div className="mx-2 my-1 h-px bg-line" />
          {isOwner
            ? item(
                'Apagar servidor',
                <Trash2 size={16} />,
                () =>
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
                true,
              )
            : item(
                'Sair do servidor',
                <LogOut size={16} />,
                () =>
                  openModal({
                    type: 'confirm',
                    title: `Sair de "${detail.server.name}"`,
                    message: 'Você só poderá voltar com um novo convite.',
                    confirmLabel: 'Sair',
                    danger: true,
                    onConfirm: async () => {
                      await api.post(`/servers/${detail.server.id}/leave`);
                      void useApp.getState().loadServers();
                    },
                  }),
                true,
              )}
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ salas e canais

const GROUP_LABEL = { voice: 'Salas', forum: 'Fóruns', text: 'Conversas' } as const;
const CREATE_LABEL = { voice: 'Criar sala', forum: 'Criar fórum', text: 'Criar canal de texto' } as const;

function ChannelGroup({ detail, kind }: { detail: ServerDetail; kind: 'text' | 'voice' | 'forum' }) {
  const channels = detail.channels.filter((c) => c.type === kind).sort((a, b) => a.position - b.position);
  const openModal = useApp((s) => s.openModal);
  const canManage = has(detail.permissions, P.MANAGE_CHANNELS);
  // servidor sem fóruns não mostra o grupo vazio
  if (kind === 'forum' && channels.length === 0) return null;

  return (
    <section>
      <div className="group mb-1.5 flex items-center justify-between px-2">
        <h2 className="font-sans text-xs font-bold text-fg-subtle">{GROUP_LABEL[kind]}</h2>
        {canManage && (
          <IconButton
            label={CREATE_LABEL[kind]}
            className="h-6 w-6 opacity-0 group-hover:opacity-100 focus:opacity-100"
            onClick={() => openModal({ type: 'createChannel', serverId: detail.server.id, kind })}
          >
            <Plus size={15} />
          </IconButton>
        )}
      </div>
      <div className={kind === 'voice' ? 'space-y-2' : 'space-y-0.5'}>
        {channels.map((c) => (kind === 'voice' ? <RoomCard key={c.id} detail={detail} channel={c} /> : <TextChannelRow key={c.id} detail={detail} channel={c} />))}
      </div>
    </section>
  );
}

function useChannelBasics(detail: ServerDetail, channel: Channel) {
  const serverId = detail.server.id;
  const active = useApp((s) => s.activeChannels[serverId] === channel.id);
  const openChannel = useApp((s) => s.openChannel);
  const openModal = useApp((s) => s.openModal);
  const everyoneId = detail.roles.find((r) => r.isDefault)?.id;
  const isPrivate = channel.overwrites.some((o) => o.roleId === everyoneId && o.deny & P.VIEW_CHANNEL);
  const settingsButton = has(channel.permissions, P.MANAGE_CHANNELS) && (
    <IconButton
      label="Editar"
      className="h-7 w-7 shrink-0 opacity-0 group-hover:opacity-100 focus:opacity-100"
      onClick={(e) => {
        e.stopPropagation();
        openModal({ type: 'channelSettings', channelId: channel.id, serverId });
      }}
    >
      <Settings size={14} />
    </IconButton>
  );
  return { serverId, active, openChannel, isPrivate, settingsButton };
}

function TextChannelRow({ detail, channel }: { detail: ServerDetail; channel: Channel }) {
  const { serverId, active, openChannel, isPrivate, settingsButton } = useChannelBasics(detail, channel);
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => openChannel(serverId, channel.id)}
      onKeyDown={(e) => e.key === 'Enter' && openChannel(serverId, channel.id)}
      className={cx(
        'group flex h-11 cursor-pointer items-center gap-2 rounded-2xl px-3 text-[15px] transition-colors',
        active ? 'bg-surface-3 text-fg' : 'text-fg-muted hover:bg-surface-3/60 hover:text-fg',
      )}
    >
      {channel.type === 'forum' ? <MessagesSquare size={17} className="shrink-0 opacity-70" /> : <Hash size={17} className="shrink-0 opacity-70" />}
      <span className="flex-1 truncate font-semibold">{channel.name}</span>
      {isPrivate && <Lock size={13} className="shrink-0 opacity-60" />}
      {settingsButton}
    </div>
  );
}

function RoomCard({ detail, channel }: { detail: ServerDetail; channel: Channel }) {
  const { serverId, active, openChannel, isPrivate, settingsButton } = useChannelBasics(detail, channel);
  const states = useApp((s) => s.voiceStates[serverId]) ?? [];
  const join = useVoice((s) => s.join);
  const connectedHere = useVoice((s) => s.channelId === channel.id && s.status !== 'idle');
  const speaking = useVoice((s) => (s.channelId === channel.id ? s.speaking : null));
  const participants = states.filter((v) => v.channelId === channel.id);
  const streamer = participants.find((v) => v.streaming);
  const streamerName = streamer && detail.members.find((m) => m.id === streamer.userId);
  const expanded = active || connectedHere;

  function onClick() {
    openChannel(serverId, channel.id);
    if (!connectedHere) {
      if (!has(channel.permissions, P.CONNECT)) return toast.info('Você não tem permissão para entrar nesta sala.');
      void join(serverId, channel.id);
    }
  }

  const people = participants.flatMap((v) => {
    const m = detail.members.find((x) => x.id === v.userId);
    return m ? [{ id: m.id, name: memberName(m), color: m.avatarColor, src: m.avatarUrl, frame: m.frame, speaking: !!speaking?.[m.id] && !v.muted }] : [];
  });

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => e.key === 'Enter' && onClick()}
      className={cx(
        'group cursor-pointer rounded-[20px] p-3.5 transition-colors',
        expanded ? 'bg-surface-3' : 'hover:bg-surface-3/60',
        connectedHere && 'ring-1 ring-accent/40',
      )}
    >
      <div className="flex items-center gap-2">
        {!participants.length && <Volume2 size={17} className="shrink-0 text-fg-subtle" />}
        <span className={cx('flex-1 truncate text-[15px] font-bold', expanded || participants.length ? 'text-fg' : 'text-fg-muted')}>{channel.name}</span>
        {isPrivate && <Lock size={13} className="shrink-0 text-fg-subtle" />}
        {streamer ? (
          <LivePill />
        ) : participants.length ? (
          <span className="text-[13px] text-fg-muted">{participants.length}{channel.userLimit ? `/${channel.userLimit}` : ''}</span>
        ) : channel.userLimit ? (
          <span className="text-[13px] text-fg-subtle">0/{channel.userLimit}</span>
        ) : null}
        {settingsButton}
      </div>

      {participants.length > 0 && !expanded && (
        <div className="mt-3 flex items-center gap-2.5">
          <AvatarStack people={people} size={30} />
          <span className="truncate text-[13px] text-fg-muted">
            {streamerName ? `${memberName(streamerName)} está transmitindo` : `${participants.length} ${participants.length === 1 ? 'pessoa' : 'pessoas'}`}
          </span>
        </div>
      )}

      {participants.length > 0 && expanded && (
        <div className="mt-2.5 space-y-0.5">
          {participants.map((v) => (
            <VoiceParticipant key={v.userId} detail={detail} state={v} speaking={!!speaking?.[v.userId]} />
          ))}
        </div>
      )}
    </div>
  );
}

function VoiceParticipant({ detail, state, speaking }: { detail: ServerDetail; state: VoiceState; speaking: boolean }) {
  const member = detail.members.find((m) => m.id === state.userId);
  const openPopover = usePopover((s) => s.open);
  if (!member) return null;
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        openPopover(member.id, detail.server.id, e.currentTarget.getBoundingClientRect());
      }}
      className="flex h-9 w-full items-center gap-2.5 rounded-xl px-1.5 text-left text-sm text-fg-muted hover:bg-surface-4 hover:text-fg"
    >
      <Avatar name={memberName(member)} color={member.avatarColor} src={member.avatarUrl} frame={member.frame} size={26} speaking={speaking && !state.muted} />
      <span className="flex-1 truncate font-semibold" style={{ color: memberColor(detail, member.id) }}>
        {memberName(member)}
      </span>
      {state.streaming && <MonitorUp size={14} className="text-accent" aria-label="transmitindo" />}
      {state.camera && <Video size={14} className="text-fg-subtle" aria-label="câmera ligada" />}
      {state.deafened ? (
        <HeadphoneOff size={14} className="text-danger" aria-label="ensurdecido" />
      ) : state.muted ? (
        <MicOff size={14} className={state.serverMuted ? 'text-danger' : 'text-fg-subtle'} aria-label="microfone desligado" />
      ) : null}
    </button>
  );
}

// ------------------------------------------------------------------ rodapé: conexão de voz e usuário

function VoicePanel() {
  const { status, channelId, serverId, cameraOn, sharing, leave, toggleCamera, stopShare } = useVoice();
  const details = useApp((s) => s.details);
  const openChannel = useApp((s) => s.openChannel);
  const openServer = useApp((s) => s.openServer);
  const openModal = useApp((s) => s.openModal);
  if (status === 'idle' || !serverId || !channelId) return null;
  const detail = details[serverId];
  const channel = detail?.channels.find((c) => c.id === channelId);

  const round = 'flex h-9 w-9 items-center justify-center rounded-full transition-colors';
  return (
    <div className="mx-3 mb-2 rounded-[20px] bg-surface-3 p-3">
      <div className="flex items-center gap-2">
        <span className={cx('h-2.5 w-2.5 shrink-0 rounded-full', status === 'connected' ? 'bg-ok' : 'animate-pulse bg-warn')} />
        <button
          className="min-w-0 flex-1 text-left"
          onClick={() => {
            openServer(serverId);
            openChannel(serverId, channelId);
          }}
        >
          <div className="text-[13px] font-bold">{status === 'connected' ? 'Na sala' : status === 'connecting' ? 'Conectando…' : 'Reconectando…'}</div>
          <div className="truncate text-xs text-fg-muted">
            {channel?.name ?? 'Sala'} · {detail?.server.name}
          </div>
        </button>
        <DeviceSplitButton kind="videoinput" label={cameraOn ? 'Desligar câmera' : 'Ligar câmera'} onClick={() => void toggleCamera()}>
          {cameraOn ? <VideoOff size={16} className="text-accent" /> : <Video size={16} />}
        </DeviceSplitButton>
        <button
          title={sharing ? 'Parar transmissão' : 'Transmitir tela'}
          onClick={() => (sharing ? void stopShare() : openModal({ type: 'shareScreen' }))}
          className={cx(round, sharing ? 'bg-accent text-on-accent' : 'bg-surface-4 text-fg-muted hover:text-fg')}
        >
          <MonitorUp size={16} />
        </button>
        <button title="Sair da sala" onClick={() => void leave()} className={cx(round, 'bg-danger text-white hover:brightness-110')}>
          <PhoneOff size={16} />
        </button>
      </div>
    </div>
  );
}

function UserCard() {
  const me = useApp((s) => s.me)!;
  const openModal = useApp((s) => s.openModal);
  const { status, micOn, deafened, serverMuted, toggleMic, toggleDeafen } = useVoice();
  const saveSettings = useApp((s) => s.saveSettings);
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const inCall = status !== 'idle';
  const micOff = (inCall && !micOn) || serverMuted;
  const presence = me.settings.status === 'dnd' ? 'dnd' : 'online';

  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => !menuRef.current?.contains(e.target as Node) && setMenu(false);
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [menu]);

  const option = (value: 'online' | 'dnd', label: string, hint: string) => (
    <button
      onClick={() => {
        setMenu(false);
        void saveSettings({ status: value });
      }}
      className={cx('flex w-full items-start gap-3 rounded-2xl px-3 py-2.5 text-left hover:bg-surface-4', presence === value && 'bg-surface-4')}
    >
      <span className={cx('mt-1 h-3 w-3 shrink-0 rounded-full', value === 'online' ? 'bg-ok' : 'bg-danger')} />
      <span>
        <span className="block text-sm font-bold">{label}</span>
        <span className="block text-xs text-fg-muted">{hint}</span>
      </span>
    </button>
  );

  return (
    <div ref={menuRef} className="relative mx-3 mb-3 flex items-center gap-1 rounded-[20px] bg-surface-3 p-2.5">
      {menu && (
        <div className="absolute right-0 bottom-full left-0 z-30 mb-2 animate-pop-in space-y-0.5 rounded-3xl bg-popover p-2 shadow-2xl ring-1 ring-line">
          {option('online', 'Online', 'Recebe chamadas de atenção e avisos')}
          {option('dnd', 'Não perturbe', 'Ninguém consegue chamar sua atenção')}
          <div className="mx-2 my-1 h-px bg-line" />
          <button
            onClick={() => {
              setMenu(false);
              openModal({ type: 'userSettings' });
            }}
            className="w-full rounded-2xl px-3 py-2.5 text-left text-sm font-semibold text-fg-muted hover:bg-surface-4 hover:text-fg"
          >
            Editar perfil e notificações
          </button>
        </div>
      )}
      <button onClick={() => setMenu(!menu)} className="flex min-w-0 flex-1 items-center gap-2.5 text-left" title="Status e perfil" aria-expanded={menu}>
        <Avatar name={me.displayName} color={me.avatarColor} src={me.avatarUrl} frame={me.frame} size={40} status={presence} />
        <div className="min-w-0 leading-tight">
          <div className="truncate text-sm font-bold">{me.displayName}</div>
          <div className={cx('truncate text-xs', presence === 'dnd' ? 'text-danger' : 'text-fg-muted')}>
            {presence === 'dnd' ? 'Não perturbe' : me.bio || `@${me.username}`}
          </div>
        </div>
      </button>
      <DeviceSplitButton
        kind="audioinput"
        label={serverMuted ? 'Silenciado por um moderador' : micOn ? 'Silenciar' : 'Ativar microfone'}
        danger={micOff}
        onClick={() => (inCall ? void toggleMic() : toast.info('Entre em uma sala para usar o microfone.'))}
      >
        {micOff ? <MicOff size={18} /> : <Mic size={18} />}
      </DeviceSplitButton>
      <DeviceSplitButton kind="audiooutput" label={deafened ? 'Ativar áudio' : 'Ensurdecer'} danger={deafened} onClick={() => void toggleDeafen()}>
        {deafened ? <HeadphoneOff size={18} /> : <Headphones size={18} />}
      </DeviceSplitButton>
      <IconButton label="Como o Concord funciona" className="h-9 w-8 shrink-0" onClick={() => openModal({ type: 'onboarding' })}>
        <HelpCircle size={18} />
      </IconButton>
      <IconButton label="Configurações" className="h-9 w-8 shrink-0" onClick={() => openModal({ type: 'userSettings' })}>
        <Settings size={18} />
      </IconButton>
    </div>
  );
}
