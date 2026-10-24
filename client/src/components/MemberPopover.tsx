import { BadgeCheck, Bell, BellOff, Crown, Gamepad2, Gem, Headphones, MessageCircle, MicOff, MonitorX, Pencil, PhoneOff, Plus, UserX, Volume2, X, Zap } from 'lucide-react';
import { sendNudge } from '../lib/nudge';
import { memberName } from '../lib/types';
import { useEffect, useRef, useState } from 'react';
import { P, has } from '../../../shared/permissions.ts';
import { api } from '../lib/api';
import { memberPosition, useApp } from '../store/app';
import { usePopover } from '../store/popover';
import { toast } from '../store/toast';
import { useVoice } from '../store/voice';
import { Avatar, RoleDot, VerifiedBadge, cx } from './ui';
import { PATCH_TILTS, PatchBadge } from './PatchBadge';
import { SupporterPatch } from './SupporterPatch';
import { usePatchInspect } from '../store/patchInspect';

export function MemberPopover() {
  const { userId, serverId, x, y, close } = usePopover();
  const ref = useRef<HTMLDivElement>(null);
  const [addingRole, setAddingRole] = useState(false);
  const detail = useApp((s) => (serverId ? s.details[serverId] : undefined));
  const me = useApp((s) => s.me);
  const presenceInfo = useApp((s) => (userId ? s.online[userId] : undefined));
  const presence = presenceInfo?.status;
  const online = !!presence;
  const voiceState = useApp((s) => (serverId && userId ? s.voiceStates[serverId]?.find((v) => v.userId === userId) : undefined));
  const myChannel = useVoice((s) => s.channelId);
  const volume = useVoice((s) => (userId ? (s.volumes[userId] ?? 1) : 1));
  const setVolume = useVoice((s) => s.setVolume);
  const toggleLocalMute = useVoice((s) => s.toggleLocalMute);
  const localMuted = useVoice((s) => (userId ? !!s.localMuted[userId] : false));
  const openModal = useApp((s) => s.openModal);
  const saveSettings = useApp((s) => s.saveSettings);
  const openDm = useApp((s) => s.openDm);

  useEffect(() => {
    if (!userId) return;
    setAddingRole(false);
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && close();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [userId, close]);

  if (!userId || !detail || !me) return null;
  const member = detail.members.find((m) => m.id === userId);
  if (!member) return null;

  const isMe = me.id === member.id;
  const perms = detail.permissions;
  const myPos = memberPosition(detail, me.id);
  const outranks = member.id !== detail.server.ownerId && myPos > memberPosition(detail, member.id);
  const canModerate = !isMe && outranks;
  // o Mecenas tem poderes sobre o alvo dele, com ou sem cargo no servidor
  const mecenasPower = !isMe && me.mecenasPowers?.target.id === member.id;
  const roles = detail.roles.filter((r) => member.roleIds.includes(r.id)).sort((a, b) => b.position - a.position);
  const canManageRoles = has(perms, P.MANAGE_ROLES) && (isMe || outranks);
  const assignable = detail.roles.filter((r) => !r.isDefault && r.position < myPos && !member.roleIds.includes(r.id));
  const topColor = member.bannerColor ?? roles.find((r) => r.color)?.color ?? member.avatarColor;
  const name = memberName(member);
  const canNick = isMe
    ? has(perms, P.CHANGE_NICKNAME) || has(perms, P.MANAGE_NICKNAMES)
    : (has(perms, P.MANAGE_NICKNAMES) && outranks) || mecenasPower;

  function editNickname() {
    close();
    openModal({ type: 'nickname', serverId: detail!.server.id, userId: member!.id });
  }
  const sameRoom = voiceState && voiceState.channelId === myChannel;
  const mutedNudges = me.settings.mutedNudges ?? [];
  const nudgeMuted = mutedNudges.includes(member.id);

  async function setRoles(roleIds: string[]) {
    await api.put(`/servers/${detail!.server.id}/members/${member!.id}/roles`, { roleIds }).catch(toast.error);
  }

  async function action(path: string, body: unknown = {}, ok?: string) {
    try {
      await api.post(`/servers/${detail!.server.id}/members/${member!.id}/${path}`, body);
      if (ok) toast.success(ok);
    } catch (err) {
      toast.error(err);
    }
  }

  return (
    <div
      ref={ref}
      className="fixed z-40 max-h-[calc(100vh-16px)] w-80 animate-pop-in overflow-y-auto rounded-[24px] bg-popover bg-cover bg-center shadow-2xl ring-1 ring-line"
      style={{
        left: x,
        top: Math.max(8, y),
        ...(member.cardBgUrl ? { backgroundImage: `linear-gradient(rgb(0 0 0 / 0.15), rgb(0 0 0 / 0.45)), url("${member.cardBgUrl}")` } : {}),
      }}
    >
      {member.bannerUrl ? (
        <button
          aria-label="Ver capa em tamanho grande"
          onClick={() => {
            close();
            openModal({ type: 'image', src: member.bannerUrl!, alt: `Capa de ${name}` });
          }}
          className="block aspect-[3/1] w-full"
        >
          <img src={member.bannerUrl} alt="" className="h-full w-full object-cover" />
        </button>
      ) : (
        <div className="h-16" style={member.cardBgUrl ? undefined : { background: `linear-gradient(135deg, ${topColor}, ${topColor}55)` }} />
      )}
      <div className="px-4 pb-4">
        <div className="-mt-9 mb-2 flex items-end justify-between gap-2">
          <button
            aria-label={member.avatarUrl ? 'Ver foto em tamanho grande' : undefined}
            disabled={!member.avatarUrl}
            onClick={() => {
              close();
              openModal({ type: 'image', src: member.avatarUrl!, alt: `Foto de ${name}` });
            }}
            className="rounded-full enabled:cursor-zoom-in"
          >
            <Avatar name={name} color={member.avatarColor} src={member.avatarUrl} frame={member.frame} size={72} status={presence ?? 'offline'} className="rounded-full ring-[6px] ring-surface-1" />
          </button>
          {(!!member.patches?.length || member.supporter) && (
            <div aria-label="Patches" className="flex flex-wrap justify-end pb-0.5 pl-2">
              {member.supporter && (
                <button
                  aria-label="Ver de perto o patch de apoiador do Concord"
                  title="Apoiador do Concord: clique para ver de perto"
                  onClick={() => {
                    close();
                    usePatchInspect.getState().openSupporter(member.supporter!.tier, `no perfil de ${name}`);
                  }}
                  className="-ml-1.5 cursor-zoom-in rounded-full"
                >
                  <SupporterPatch tier={member.supporter.tier} size={member.patches && member.patches.length > 3 ? 38 : 44} />
                </button>
              )}
              {(member.patches ?? []).map((p, i) => (
                <button
                  key={p.id}
                  aria-label={`Ver o patch ${p.text || ''} de perto`}
                  title="Clique para ver de perto"
                  onClick={() => {
                    close();
                    usePatchInspect.getState().open(p, `no perfil de ${name}`);
                  }}
                  className="-ml-1.5 cursor-zoom-in rounded-full"
                >
                  <PatchBadge patch={p} size={member.patches!.length > 3 ? 34 : 40} tilt={PATCH_TILTS[i % PATCH_TILTS.length]} />
                </button>
              ))}
            </div>
          )}
        </div>
        <div className={cx('rounded-2xl p-3', member.cardBgUrl ? 'bg-surface-0/80 backdrop-blur-md' : 'bg-surface-0')}>
          <div className="flex items-center gap-1.5 text-lg font-bold">
            <span className="truncate">{name}</span>
            {member.verified && <VerifiedBadge size={16} />}
            {member.mecenas && (
              <span title="Mecenas do Concord" className="flex shrink-0 items-center gap-1 rounded-full bg-warn/15 px-2 text-[10px] leading-5 font-extrabold tracking-wide text-warn">
                <Gem size={11} /> MECENAS
              </span>
            )}
            {member.bot && <span className="shrink-0 rounded bg-accent-2/20 px-1.5 text-[10px] leading-5 font-bold text-accent-2">BOT</span>}
            {detail.server.ownerId === member.id && <Crown size={16} className="shrink-0 text-warn" />}
            {canNick && (
              <button title="Alterar apelido neste servidor" onClick={editNickname} className="ml-auto text-fg-subtle hover:text-fg">
                <Pencil size={14} />
              </button>
            )}
          </div>
          <div className="text-sm text-fg-muted">
            {member.nickname ? `${member.displayName} · ` : ''}@{member.username}
          </div>
          {member.mecenasBy && (
            <div className="mt-1 flex items-center gap-1 text-xs font-semibold text-warn">
              <Gem size={12} /> Mecenas: @{member.mecenasBy}
            </div>
          )}
          {presenceInfo?.customStatus && <p className="mt-2 text-sm break-words">{presenceInfo.customStatus}</p>}
          {presenceInfo?.activity && (
            <div className="mt-3 flex items-center gap-2.5 rounded-xl bg-surface-2 p-2.5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-accent">
                {presenceInfo.activity.type === 'playing' ? <Gamepad2 size={18} /> : <Headphones size={18} />}
              </span>
              <div className="min-w-0 text-sm leading-tight">
                <div className="text-[11px] font-bold text-fg-subtle">{presenceInfo.activity.type === 'playing' ? 'Jogando' : 'Ouvindo no Spotify'}</div>
                <div className="truncate font-semibold">{presenceInfo.activity.type === 'playing' ? presenceInfo.activity.name : presenceInfo.activity.details}</div>
                <div className="text-xs text-fg-muted">há {elapsed(presenceInfo.activity.since)}</div>
              </div>
            </div>
          )}
          {member.bio && (
            <>
              <div className="my-3 h-px bg-line" />
              <div className="text-[11px] font-bold tracking-wider text-fg-subtle uppercase">Sobre mim</div>
              <p className="mt-1 text-sm break-words whitespace-pre-wrap">{member.bio}</p>
            </>
          )}
          <div className="my-3 h-px bg-line" />
          <div className="text-[11px] font-bold tracking-wider text-fg-subtle uppercase">Membro desde</div>
          <div className="mb-3 text-sm">{new Date(member.joinedAt).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', year: 'numeric' })}</div>

          <div className="mb-1.5 text-[11px] font-bold tracking-wider text-fg-subtle uppercase">Cargos</div>
          <div className="flex flex-wrap gap-1.5">
            {roles.map((r) => (
              <span key={r.id} className="group flex items-center gap-1.5 rounded-md bg-surface-3 px-2 py-1 text-xs font-medium">
                <RoleDot color={r.color} />
                {r.name}
                {canManageRoles && r.position < myPos && (
                  <button
                    title="Remover cargo"
                    className="hidden text-fg-subtle group-hover:block hover:text-danger"
                    onClick={() => void setRoles(member.roleIds.filter((id) => id !== r.id))}
                  >
                    <X size={12} />
                  </button>
                )}
              </span>
            ))}
            {roles.length === 0 && !canManageRoles && <span className="text-xs text-fg-subtle">Nenhum cargo</span>}
            {canManageRoles && assignable.length > 0 && (
              <div className="relative">
                <button
                  title="Adicionar cargo"
                  onClick={() => setAddingRole(!addingRole)}
                  className="flex h-6 w-6 items-center justify-center rounded-md bg-surface-3 text-fg-muted hover:text-fg"
                >
                  <Plus size={14} />
                </button>
                {addingRole && (
                  <div className="absolute top-7 left-0 z-10 w-48 space-y-0.5 rounded-lg border border-line bg-surface-3 p-1 shadow-xl">
                    {assignable.map((r) => (
                      <button
                        key={r.id}
                        onClick={() => {
                          setAddingRole(false);
                          void setRoles([...member.roleIds, r.id]);
                        }}
                        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-white/10"
                      >
                        <RoleDot color={r.color} /> {r.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {!isMe && (
            <div className="mt-3 flex gap-2">
              <button
                onClick={() => {
                  close();
                  void openDm(member.id);
                }}
                title={`Conversa privada com ${name}`}
                aria-label={`Mensagem para ${name}`}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-3 text-fg-muted transition-colors hover:text-fg"
              >
                <MessageCircle size={16} />
              </button>
              <button
                disabled={!online || presence === 'dnd'}
                onClick={() => void sendNudge(detail.server.id, member.id, name)}
                title={!online ? `${name} está offline` : presence === 'dnd' ? `${name} está em "Não perturbe"` : 'Faz a tela da pessoa tremer, com som e notificação'}
                className="flex h-10 flex-1 items-center justify-center gap-2 rounded-full bg-accent font-display text-sm font-bold text-on-accent transition-all hover:bg-accent-hover active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Zap size={16} /> {presence === 'dnd' ? 'Não perturbe' : 'Chamar atenção'}
              </button>
              <button
                onClick={() =>
                  void saveSettings({
                    mutedNudges: nudgeMuted ? mutedNudges.filter((id) => id !== member.id) : [...mutedNudges, member.id],
                  })
                }
                title={nudgeMuted ? `Voltar a receber chamadas de atenção de ${name}` : `Não receber chamadas de atenção de ${name}`}
                aria-label={nudgeMuted ? 'Permitir chamadas de atenção desta pessoa' : 'Silenciar chamadas de atenção desta pessoa'}
                className={cx(
                  'flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors',
                  nudgeMuted ? 'bg-danger/15 text-danger' : 'bg-surface-3 text-fg-muted hover:text-fg',
                )}
              >
                {nudgeMuted ? <BellOff size={16} /> : <Bell size={16} />}
              </button>
            </div>
          )}

          {sameRoom && !isMe && (
            <>
              <div className="mt-3 mb-1 text-[11px] font-bold tracking-wider text-fg-subtle uppercase">Volume do usuário</div>
              <div className="flex items-center gap-2">
                <Volume2 size={16} className="text-fg-muted" />
                <input
                  type="range"
                  min={0}
                  max={3}
                  step={0.05}
                  value={volume}
                  disabled={localMuted}
                  aria-label="Volume do usuário"
                  onChange={(e) => setVolume(member.id, Number(e.target.value))}
                  className="flex-1 disabled:opacity-40"
                />
                <span className="w-9 text-right text-xs text-fg-muted">{localMuted ? '0%' : `${Math.round(volume * 100)}%`}</span>
              </div>
              <button
                onClick={() => toggleLocalMute(member.id)}
                className={cx(
                  'mt-2 flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-sm font-medium transition-colors',
                  localMuted ? 'bg-danger/15 text-danger' : 'text-fg-muted hover:bg-white/10 hover:text-fg',
                )}
              >
                <MicOff size={15} />
                {localMuted ? 'Silenciado para mim (toque para ouvir)' : 'Silenciar para mim'}
              </button>
            </>
          )}

          {me.isAuthority && (
            <div className="mt-3 space-y-1">
              <ModButton
                icon={<BadgeCheck size={15} />}
                label={member.verified ? 'Remover selo de verificado' : 'Marcar como verificado'}
                onClick={() => void api.put(`/users/${member.id}/verified`, { verified: !member.verified }).catch(toast.error)}
              />
            </div>
          )}

          {(canModerate || mecenasPower) && (
            <div className="mt-3 space-y-1">
              {voiceState && ((canModerate && has(perms, P.MUTE_MEMBERS)) || mecenasPower) && (
                <ModButton
                  icon={<MicOff size={15} />}
                  label={voiceState.serverMuted ? 'Remover silenciamento' : 'Silenciar na sala'}
                  onClick={() => void action('voice-mute', { muted: !voiceState.serverMuted })}
                />
              )}
              {canModerate && voiceState?.streaming && has(perms, P.MUTE_MEMBERS) && (
                <ModButton icon={<MonitorX size={15} />} label="Encerrar transmissão" onClick={() => void action('stop-stream', {}, 'Transmissão encerrada')} />
              )}
              {voiceState && ((canModerate && has(perms, P.MOVE_MEMBERS)) || mecenasPower) && (
                <ModButton icon={<PhoneOff size={15} />} label="Desconectar da sala" onClick={() => void action('voice-disconnect')} danger />
              )}
              {canModerate && has(perms, P.KICK_MEMBERS) && (
                <ModButton
                  icon={<UserX size={15} />}
                  label={`Expulsar ${name}`}
                  danger
                  onClick={() => {
                    close();
                    openModal({
                      type: 'confirm',
                      title: `Expulsar ${name}`,
                      message: `${name} será removido do servidor e só poderá voltar com um novo convite.`,
                      confirmLabel: 'Expulsar',
                      danger: true,
                      onConfirm: async () => {
                        await api.del(`/servers/${detail.server.id}/members/${member.id}`);
                      },
                    });
                  }}
                />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ModButton({ icon, label, onClick, danger }: { icon: React.ReactNode; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={cx(
        'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium transition-colors',
        danger ? 'text-danger hover:bg-danger hover:text-white' : 'text-fg-muted hover:bg-white/10 hover:text-fg',
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function elapsed(since: number) {
  const min = Math.max(1, Math.round((Date.now() - since) / 60_000));
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  return `${h} h${min % 60 ? ` ${min % 60} min` : ''}`;
}
