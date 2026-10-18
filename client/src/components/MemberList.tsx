import { Crown, Gamepad2, Headphones, MonitorUp, Search } from 'lucide-react';
import { useState } from 'react';
import { memberName, type Activity, type Member, type Presence, type ServerDetail } from '../lib/types';
import { memberColor, useActiveDetail, useApp } from '../store/app';
import { usePopover } from '../store/popover';
import { Avatar, cx } from './ui';

/** Painel lateral com a lista de membros (canais de texto). */
export function MemberList() {
  return (
    <aside aria-label="Membros" className="panel hidden w-64 shrink-0 flex-col overflow-hidden lg:flex">
      <MemberListBody />
    </aside>
  );
}

export function activityLabel(a: Activity): string {
  return a.type === 'playing' ? `Jogando ${a.name}` : `Ouvindo ${a.details ? `${a.details}` : a.name}`;
}

/** Lista de membros com busca, agrupada por cargos em destaque, online e offline. */
export function MemberListBody() {
  const detail = useActiveDetail();
  const online = useApp((s) => s.online);
  const [query, setQuery] = useState('');
  if (!detail) return null;

  const q = query.trim().toLowerCase();
  const visible = q
    ? detail.members.filter((m) => `${m.displayName} ${m.nickname ?? ''} ${m.username}`.toLowerCase().includes(q))
    : detail.members;

  const hoisted = detail.roles.filter((r) => r.hoist && !r.isDefault).sort((a, b) => b.position - a.position);
  const groups: { title: string; members: Member[] }[] = [];
  const placed = new Set<string>();
  const sortByName = (a: Member, b: Member) => memberName(a).localeCompare(memberName(b));

  for (const role of hoisted) {
    const ms = visible.filter((m) => online[m.id] && !placed.has(m.id) && m.roleIds.includes(role.id)).sort(sortByName);
    ms.forEach((m) => placed.add(m.id));
    if (ms.length) groups.push({ title: role.name, members: ms });
  }
  const restOnline = visible.filter((m) => online[m.id] && !placed.has(m.id)).sort(sortByName);
  if (restOnline.length) groups.push({ title: 'Online', members: restOnline });
  const offline = visible.filter((m) => !online[m.id]).sort(sortByName);
  if (offline.length) groups.push({ title: 'Offline', members: offline });

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="relative px-3 pt-4 pb-2">
        <Search size={15} className="pointer-events-none absolute top-1/2 left-6 mt-1 -translate-y-1/2 text-fg-subtle" />
        <label className="sr-only" htmlFor="member-search">
          Buscar membros
        </label>
        <input
          id="member-search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`Buscar entre ${detail.members.length} membros`}
          className="h-10 w-full rounded-full bg-surface-3 pr-3 pl-9 text-sm outline-none placeholder:text-fg-subtle focus:ring-2 focus:ring-accent/60"
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
        {groups.length === 0 && <p className="px-2 py-4 text-sm text-fg-muted">Ninguém encontrado.</p>}
        {groups.map((g) => (
          <section key={g.title} className="mt-3">
            <h3 className="mb-1.5 px-2 font-sans text-xs font-bold text-fg-subtle">
              {g.title} — {g.members.length}
            </h3>
            {g.members.map((m) => (
              <MemberRow key={m.id} detail={detail} member={m} presence={online[m.id]} />
            ))}
          </section>
        ))}
      </div>
    </div>
  );
}

function MemberRow({ detail, member, presence }: { detail: ServerDetail; member: Member; presence: Presence | undefined }) {
  const openPopover = usePopover((s) => s.open);
  const streaming = useApp((s) => s.voiceStates[detail.server.id]?.find((v) => v.userId === member.id)?.streaming);
  const online = !!presence;
  const activity = presence?.activity;

  let subtitle: React.ReactNode = null;
  if (streaming) {
    subtitle = (
      <>
        <MonitorUp size={12} className="shrink-0" /> Transmitindo
      </>
    );
  } else if (activity) {
    subtitle = (
      <>
        {activity.type === 'playing' ? <Gamepad2 size={12} className="shrink-0" /> : <Headphones size={12} className="shrink-0" />}
        <span className="truncate">{activityLabel(activity)}</span>
      </>
    );
  } else if (presence?.customStatus) {
    subtitle = <span className="truncate">{presence.customStatus}</span>;
  }

  return (
    <button
      onClick={(e) => openPopover(member.id, detail.server.id, e.currentTarget.getBoundingClientRect())}
      className={cx('flex w-full items-center gap-3 rounded-2xl px-2 py-2 text-left hover:bg-surface-3', !online && 'opacity-40 hover:opacity-100')}
    >
      <Avatar name={memberName(member)} color={member.avatarColor} src={member.avatarUrl} frame={member.frame} size={34} status={presence?.status ?? 'offline'} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1">
          <span className="truncate text-sm font-semibold" style={{ color: memberColor(detail, member.id) }}>
            {memberName(member)}
          </span>
          {member.bot && <span className="shrink-0 rounded bg-accent-2/20 px-1 text-[9px] leading-4 font-bold text-accent-2">BOT</span>}
          {detail.server.ownerId === member.id && <Crown size={13} className="shrink-0 text-warn" />}
        </div>
        {subtitle && <div className={cx('flex items-center gap-1 text-xs', streaming ? 'text-accent' : 'text-fg-muted')}>{subtitle}</div>}
      </div>
    </button>
  );
}
