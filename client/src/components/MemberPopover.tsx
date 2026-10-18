import { Crown, MicOff, MonitorX, PhoneOff, Plus, UserX, Volume2, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { P, has } from '../../../shared/permissions.ts';
import { api } from '../lib/api';
import { memberPosition, useApp } from '../store/app';
import { usePopover } from '../store/popover';
import { toast } from '../store/toast';
import { useVoice } from '../store/voice';
import { Avatar, RoleDot, cx } from './ui';

export function MemberPopover() {
  const { userId, serverId, x, y, close } = usePopover();
  const ref = useRef<HTMLDivElement>(null);
  const [addingRole, setAddingRole] = useState(false);
  const detail = useApp((s) => (serverId ? s.details[serverId] : undefined));
  const me = useApp((s) => s.me);
  const online = useApp((s) => (userId ? !!s.online[userId] : false));
  const voiceState = useApp((s) => (serverId && userId ? s.voiceStates[serverId]?.find((v) => v.userId === userId) : undefined));
  const myChannel = useVoice((s) => s.channelId);
  const volume = useVoice((s) => (userId ? (s.volumes[userId] ?? 1) : 1));
  const setVolume = useVoice((s) => s.setVolume);
  const openModal = useApp((s) => s.openModal);

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
  const roles = detail.roles.filter((r) => member.roleIds.includes(r.id)).sort((a, b) => b.position - a.position);
  const canManageRoles = has(perms, P.MANAGE_ROLES) && (isMe || outranks);
  const assignable = detail.roles.filter((r) => !r.isDefault && r.position < myPos && !member.roleIds.includes(r.id));
  const topColor = roles.find((r) => r.color)?.color ?? member.avatarColor;
  const sameRoom = voiceState && voiceState.channelId === myChannel;

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
      className="fixed z-40 w-80 animate-pop-in overflow-hidden rounded-2xl border border-line bg-surface-1 shadow-2xl"
      style={{ left: x, top: Math.max(8, y) }}
    >
      <div className="h-16" style={{ background: `linear-gradient(135deg, ${topColor}, ${topColor}55)` }} />
      <div className="px-4 pb-4">
        <div className="-mt-9 mb-2">
          <Avatar name={member.displayName} color={member.avatarColor} size={72} status={online ? 'online' : 'offline'} className="rounded-full ring-[6px] ring-surface-1" />
        </div>
        <div className="rounded-xl bg-surface-0 p-3">
          <div className="flex items-center gap-1.5 text-lg font-bold">
            {member.displayName}
            {detail.server.ownerId === member.id && <Crown size={16} className="text-warn" />}
          </div>
          <div className="text-sm text-fg-muted">@{member.username}</div>
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

          {sameRoom && !isMe && (
            <>
              <div className="mt-3 mb-1 text-[11px] font-bold tracking-wider text-fg-subtle uppercase">Volume do usuário</div>
              <div className="flex items-center gap-2">
                <Volume2 size={16} className="text-fg-muted" />
                <input type="range" min={0} max={1} step={0.05} value={volume} onChange={(e) => setVolume(member.id, Number(e.target.value))} className="flex-1" />
                <span className="w-9 text-right text-xs text-fg-muted">{Math.round(volume * 100)}%</span>
              </div>
            </>
          )}

          {canModerate && (
            <div className="mt-3 space-y-1">
              {voiceState && has(perms, P.MUTE_MEMBERS) && (
                <ModButton
                  icon={<MicOff size={15} />}
                  label={voiceState.serverMuted ? 'Remover silenciamento' : 'Silenciar na sala'}
                  onClick={() => void action('voice-mute', { muted: !voiceState.serverMuted })}
                />
              )}
              {voiceState?.streaming && has(perms, P.MUTE_MEMBERS) && (
                <ModButton icon={<MonitorX size={15} />} label="Encerrar transmissão" onClick={() => void action('stop-stream', {}, 'Transmissão encerrada')} />
              )}
              {voiceState && has(perms, P.MOVE_MEMBERS) && (
                <ModButton icon={<PhoneOff size={15} />} label="Desconectar da sala" onClick={() => void action('voice-disconnect')} danger />
              )}
              {has(perms, P.KICK_MEMBERS) && (
                <ModButton
                  icon={<UserX size={15} />}
                  label={`Expulsar ${member.displayName}`}
                  danger
                  onClick={() => {
                    close();
                    openModal({
                      type: 'confirm',
                      title: `Expulsar ${member.displayName}`,
                      message: `${member.displayName} será removido do servidor e só poderá voltar com um novo convite.`,
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
