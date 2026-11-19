import { Crown, Gamepad2, Headphones, MonitorUp, Search, Volume2 } from 'lucide-react';
import { useState } from 'react';
import { memberName, type Activity, type Member, type Presence, type ServerDetail } from '../lib/types';
import { memberColor, useActiveDetail, useApp } from '../store/app';
import { profileTriggers } from '../store/popover';
import { Avatar, Modal, VerifiedBadge, cx } from './ui';

/** A lista de membros numa janela (o "N pessoas online" do topo, e telas onde o painel lateral não cabe). */
export function MembersModal() {
  const close = useApp((s) => s.closeModal);
  return (
    <Modal title="Membros" onClose={close} width={420}>
      <div className="-mx-3 flex h-[min(70vh,640px)] flex-col">
        <MemberListBody />
      </div>
    </Modal>
  );
}

/** Painel lateral com a lista de membros (canais de texto). */
export function MemberList() {
  return (
    <aside aria-label="Membros" className="panel hidden w-64 shrink-0 flex-col overflow-hidden xl:flex">
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
  const onlyOnline = useApp((s) => s.membersOnlineOnly);
  const [query, setQuery] = useState('');
  if (!detail) return null;

  const q = query.trim().toLowerCase();
  const visible = q
    ? detail.members.filter((m) => `${m.displayName} ${m.nickname ?? ''} ${m.username}`.toLowerCase().includes(q))
    : detail.members;
  const onlineCount = detail.members.filter((m) => online[m.id]).length;

  const hoisted = detail.roles.filter((r) => r.hoist && !r.isDefault).sort((a, b) => b.position - a.position);
  const groups: { title: string; members: Member[] }[] = [];
  const placed = new Set<string>();
  const sortByName = (a: Member, b: Member) => memberName(a).localeCompare(memberName(b));

  for (const role of hoisted) {
    const ms = visible.filter((m) => online[m.id] && !placed.has(m.id) && m.roleIds.includes(role.id)).sort(sortByName);
    ms.forEach((m) => placed.add(m.id));
    // o cargo em destaque só junta quem está online: o título diz isso
    if (ms.length) groups.push({ title: `${role.name} · online`, members: ms });
  }
  const restOnline = visible.filter((m) => online[m.id] && !placed.has(m.id)).sort(sortByName);
  if (restOnline.length) groups.push({ title: 'Online', members: restOnline });
  const offline = visible.filter((m) => !online[m.id]).sort(sortByName);
  if (offline.length && !onlyOnline) groups.push({ title: 'Offline', members: offline });

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
      <div className="flex items-center gap-1.5 px-3 pb-1">
        {(
          [
            [false, `Todos · ${detail.members.length}`],
            [true, `Só online · ${onlineCount}`],
          ] as const
        ).map(([value, label]) => (
          <button
            key={label}
            onClick={() => useApp.setState({ membersOnlineOnly: value })}
            aria-pressed={onlyOnline === value}
            className={cx(
              'flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-bold transition-colors',
              onlyOnline === value ? 'bg-accent text-on-accent' : 'bg-surface-3 text-fg-muted hover:text-fg',
            )}
          >
            {value && <span className="h-2 w-2 rounded-full bg-ok" />}
            {label}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
        {groups.length === 0 && <p className="px-2 py-4 text-sm text-fg-muted">{onlyOnline && !q ? 'Ninguém online agora.' : 'Ninguém encontrado.'}</p>}
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
  const voice = useApp((s) => s.voiceStates[detail.server.id]?.find((v) => v.userId === member.id));
  const room = voice ? detail.channels.find((c) => c.id === voice.channelId)?.name : undefined;
  const online = !!presence;
  // até 2 atividades ao mesmo tempo (ex.: jogando e ouvindo Spotify), já vêm limitadas pelo servidor
  const activities = presence?.activities ?? [];

  return (
    <button
      {...profileTriggers(member.id, detail.server.id, () => useApp.getState().openProfile(member.id, detail.server.id))}
      className={cx('flex w-full items-center gap-3 rounded-2xl px-2 py-2 text-left hover:bg-surface-3', !online && 'opacity-40 hover:opacity-100')}
    >
      <Avatar name={memberName(member)} color={member.avatarColor} src={member.avatarUrl} frame={member.frame} size={34} status={presence?.status ?? 'offline'} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1">
          <span className="truncate text-sm font-semibold" style={{ color: memberColor(detail, member.id) }}>
            {memberName(member)}
          </span>
          {member.verified && <VerifiedBadge size={13} />}
          {member.bot && <span className="shrink-0 rounded bg-accent-2/20 px-1 text-[9px] leading-4 font-bold text-accent-2">BOT</span>}
          {detail.server.ownerId === member.id && <Crown size={13} className="shrink-0 text-warn" />}
        </div>
        {voice?.streaming ? (
          <div className="flex items-center gap-1 text-xs text-accent">
            <MonitorUp size={12} className="shrink-0" /> <span className="truncate">Transmitindo{room ? ` em ${room}` : ''}</span>
          </div>
        ) : voice ? (
          <div className="flex items-center gap-1 text-xs text-ok">
            <Volume2 size={12} className="shrink-0" /> <span className="truncate">{room ? `Na sala ${room}` : 'Em chamada'}</span>
          </div>
        ) : activities.length ? (
          activities.map((a, i) => (
            <div key={i} className="flex items-center gap-1 text-xs text-fg-muted">
              {a.type === 'playing' ? <Gamepad2 size={12} className="shrink-0" /> : <Headphones size={12} className="shrink-0" />}
              <span className="truncate">{activityLabel(a)}</span>
            </div>
          ))
        ) : presence?.customStatus ? (
          <div className="flex items-center gap-1 text-xs text-fg-muted">
            <span className="truncate">{presence.customStatus}</span>
          </div>
        ) : null}
      </div>
    </button>
  );
}
