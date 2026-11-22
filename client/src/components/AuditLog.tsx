// Registro de auditoria do servidor (aba "Auditoria" das configurações): quem fez o quê, do mais novo para o mais
// velho, com filtro por tipo de ação e por quem fez. Quem grava é o servidor (server/src/audit.ts).
import { Bot, ChevronDown, Gavel, Hash, Link2, MessageSquare, Mic, RefreshCw, Shield, Sticker, Users, Wrench } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { AUDIT_ACTIONS, AUDIT_GROUPS, type AuditChange, type AuditEntry, type AuditGroup } from '../../../shared/audit.ts';
import { api } from '../lib/api';
import { toast } from '../store/toast';
import { Avatar, Button, IconButton, Spinner, cx } from './ui';

interface Page {
  entries: AuditEntry[];
  next: number | null;
  actors: { id: string; name: string }[];
  days: number;
}

const GROUP_ICON: Record<AuditGroup, ReactNode> = {
  server: <Wrench size={12} />,
  channels: <Hash size={12} />,
  roles: <Shield size={12} />,
  members: <Users size={12} />,
  moderation: <Gavel size={12} />,
  voice: <Mic size={12} />,
  messages: <MessageSquare size={12} />,
  invites: <Link2 size={12} />,
  content: <Sticker size={12} />,
  integrations: <Bot size={12} />,
};

const selectCls = 'h-9 rounded-md bg-surface-0 px-3 text-sm text-fg outline-none focus:ring-2 focus:ring-accent';

function when(ms: number) {
  const d = new Date(ms);
  const time = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const today = new Date();
  const yesterday = new Date(today.getTime() - 86_400_000);
  if (d.toDateString() === today.toDateString()) return `hoje às ${time}`;
  if (d.toDateString() === yesterday.toDateString()) return `ontem às ${time}`;
  return `${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: d.getFullYear() === today.getFullYear() ? undefined : '2-digit' })} às ${time}`;
}

function ChangeLine({ c }: { c: AuditChange }) {
  if (c.added || c.removed) {
    return (
      <li className="flex flex-wrap items-center gap-1.5">
        <span className="text-fg-muted">{c.field}:</span>
        {c.added?.map((x) => (
          <span key={`+${x}`} className="rounded bg-ok/15 px-1.5 py-0.5 text-xs font-medium text-ok">
            + {x}
          </span>
        ))}
        {c.removed?.map((x) => (
          <span key={`-${x}`} className="rounded bg-danger/15 px-1.5 py-0.5 text-xs font-medium text-danger">
            − {x}
          </span>
        ))}
      </li>
    );
  }
  return (
    <li className="break-words">
      <span className="text-fg-muted">{c.field}: </span>
      {c.from != null && c.to != null ? (
        <>
          <span className="text-fg-subtle line-through">{c.from}</span>
          <span className="text-fg-subtle"> → </span>
          <span className="font-medium">{c.to}</span>
        </>
      ) : c.to != null ? (
        <span className="font-medium">{c.to}</span>
      ) : (
        <>
          <span className="text-fg-subtle line-through">{c.from}</span>
          <span className="text-fg-subtle"> → (vazio)</span>
        </>
      )}
    </li>
  );
}

function Entry({ e }: { e: AuditEntry }) {
  const info = AUDIT_ACTIONS[e.action];
  const details = e.changes.length > 0 || !!e.reason;
  const [open, setOpen] = useState(false);
  const target = e.target?.name;
  return (
    <div>
      <button
        type="button"
        onClick={() => details && setOpen((o) => !o)}
        aria-expanded={details ? open : undefined}
        className={cx('flex w-full items-center gap-3 px-4 py-3 text-left', details ? 'hover:bg-white/[0.03]' : 'cursor-default')}
      >
        <div className="relative shrink-0">
          <Avatar name={e.actor.name} color={e.actor.avatarColor} src={e.actor.avatarUrl} size={36} />
          <span className="absolute -right-1 -bottom-1 grid h-5 w-5 place-items-center rounded-full bg-surface-3 text-fg-muted ring-2 ring-surface-1" title={AUDIT_GROUPS[info.group]}>
            {GROUP_ICON[info.group]}
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm leading-snug">
            <span className="font-semibold">{e.actor.name}</span> <span className="text-fg-muted">{info.verb}</span>
            {target && <span className="font-semibold"> {target}</span>}
          </div>
          <div className="text-xs text-fg-subtle">{when(e.createdAt)}</div>
        </div>
        {details && <ChevronDown size={16} className={cx('shrink-0 text-fg-subtle transition-transform', open && 'rotate-180')} />}
      </button>
      {open && (
        <ul className="mx-4 mb-3 ml-[4.25rem] space-y-1 rounded-lg bg-surface-0 px-3 py-2 text-sm">
          {e.changes.map((c, i) => (
            <ChangeLine key={i} c={c} />
          ))}
          {e.reason && (
            <li>
              <span className="text-fg-muted">Motivo: </span>
              {e.reason}
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

export function AuditLog({ serverId }: { serverId: string }) {
  const [group, setGroup] = useState('');
  const [actor, setActor] = useState('');
  const [page, setPage] = useState<Page | null>(null);
  const [loading, setLoading] = useState(false);

  const query = (before?: number) => {
    const q = new URLSearchParams();
    if (group) q.set('action', group);
    if (actor) q.set('actor', actor);
    if (before) q.set('before', String(before));
    const s = q.toString();
    return api.get<Page>(`/servers/${serverId}/audit-log${s ? `?${s}` : ''}`);
  };

  const load = () => {
    setLoading(true);
    query()
      .then(setPage)
      .catch(toast.error)
      .finally(() => setLoading(false));
  };

  useEffect(load, [serverId, group, actor]); // eslint-disable-line react-hooks/exhaustive-deps

  const more = () => {
    if (!page?.next) return;
    setLoading(true);
    query(page.next)
      .then((p) => setPage({ ...p, entries: [...page.entries, ...p.entries] }))
      .catch(toast.error)
      .finally(() => setLoading(false));
  };

  return (
    <section>
      <div className="mb-1 flex items-center justify-between gap-3">
        <h2 className="text-xl font-bold">Registro de auditoria</h2>
        <IconButton label="Atualizar" onClick={load}>
          <RefreshCw size={16} className={cx(loading && 'animate-spin')} />
        </IconButton>
      </div>
      <p className="mb-4 text-sm text-fg-muted">
        Quem mudou o quê no servidor: cargos, canais, convites, expulsões, banimentos e mais. Cada registro fica guardado por {page?.days ?? 90} dias.
      </p>

      <div className="mb-3 flex flex-wrap gap-2">
        <select value={group} onChange={(e) => setGroup(e.target.value)} aria-label="Filtrar por tipo de ação" className={selectCls}>
          <option value="">Todas as ações</option>
          {(Object.keys(AUDIT_GROUPS) as AuditGroup[]).map((g) => (
            <option key={g} value={g}>
              {AUDIT_GROUPS[g]}
            </option>
          ))}
        </select>
        <select value={actor} onChange={(e) => setActor(e.target.value)} aria-label="Filtrar por quem fez" className={selectCls}>
          <option value="">Qualquer pessoa</option>
          {page?.actors.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </div>

      <div className="divide-y divide-line rounded-xl bg-surface-1">
        {!page && (
          <div className="grid place-items-center p-8">
            <Spinner />
          </div>
        )}
        {page?.entries.length === 0 && (
          <p className="p-4 text-sm text-fg-muted">{group || actor ? 'Nada com esse filtro.' : 'Nada registrado ainda. As próximas mudanças no servidor aparecem aqui.'}</p>
        )}
        {page?.entries.map((e) => (
          <Entry key={e.id} e={e} />
        ))}
      </div>
      {page?.next && (
        <div className="mt-3 flex justify-center">
          <Button variant="secondary" onClick={more} disabled={loading}>
            Carregar mais
          </Button>
        </div>
      )}
    </section>
  );
}
