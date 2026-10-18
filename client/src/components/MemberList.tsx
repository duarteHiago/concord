import { Crown, MonitorUp } from 'lucide-react';
import type { Member, ServerDetail } from '../lib/types';
import { memberColor, useActiveDetail, useApp } from '../store/app';
import { usePopover } from '../store/popover';
import { Avatar, cx } from './ui';

export function MemberList() {
  const detail = useActiveDetail();
  const online = useApp((s) => s.online);
  if (!detail) return null;

  const hoisted = detail.roles.filter((r) => r.hoist && !r.isDefault).sort((a, b) => b.position - a.position);
  const groups: { title: string; members: Member[] }[] = [];
  const placed = new Set<string>();
  const sortByName = (a: Member, b: Member) => a.displayName.localeCompare(b.displayName);

  for (const role of hoisted) {
    const ms = detail.members.filter((m) => online[m.id] && !placed.has(m.id) && m.roleIds.includes(role.id)).sort(sortByName);
    ms.forEach((m) => placed.add(m.id));
    if (ms.length) groups.push({ title: role.name, members: ms });
  }
  const restOnline = detail.members.filter((m) => online[m.id] && !placed.has(m.id)).sort(sortByName);
  if (restOnline.length) groups.push({ title: 'Online', members: restOnline });
  const offline = detail.members.filter((m) => !online[m.id]).sort(sortByName);
  if (offline.length) groups.push({ title: 'Offline', members: offline });

  return (
    <aside className="hidden w-60 shrink-0 overflow-y-auto bg-surface-1 px-2 py-4 lg:block">
      {groups.map((g) => (
        <div key={g.title} className="mb-5">
          <h3 className="mb-1 px-2 text-[11px] font-bold tracking-wider text-fg-subtle uppercase">
            {g.title} — {g.members.length}
          </h3>
          {g.members.map((m) => (
            <MemberRow key={m.id} detail={detail} member={m} online={!!online[m.id]} />
          ))}
        </div>
      ))}
    </aside>
  );
}

function MemberRow({ detail, member, online }: { detail: ServerDetail; member: Member; online: boolean }) {
  const openPopover = usePopover((s) => s.open);
  const streaming = useApp((s) => s.voiceStates[detail.server.id]?.find((v) => v.userId === member.id)?.streaming);
  return (
    <button
      onClick={(e) => openPopover(member.id, detail.server.id, e.currentTarget.getBoundingClientRect())}
      className={cx('flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left hover:bg-white/5', !online && 'opacity-40 hover:opacity-100')}
    >
      <Avatar name={member.displayName} color={member.avatarColor} size={34} status={online ? 'online' : 'offline'} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1">
          <span className="truncate text-sm font-medium" style={{ color: memberColor(detail, member.id) }}>
            {member.displayName}
          </span>
          {detail.server.ownerId === member.id && <Crown size={13} className="shrink-0 text-warn" />}
        </div>
        {streaming && (
          <div className="flex items-center gap-1 text-xs text-live">
            <MonitorUp size={12} /> Transmitindo
          </div>
        )}
      </div>
    </button>
  );
}
