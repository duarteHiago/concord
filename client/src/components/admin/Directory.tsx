// Contas e servidores no portal: listas com busca e o detalhe de cada um (servidores da pessoa com os cargos
// dela; cargos, canais e membros de um servidor). Só leitura: ações de moderação ficam para depois.
import { Crown, Hash, MessagesSquare, ShieldCheck, Trash2, UserX, Volume2 } from 'lucide-react';
import { useState } from 'react';
import { api } from '../../lib/api';
import { toast } from '../../store/toast';
import { Avatar, Button, cx } from '../ui';
import type { DiagnosticMeta } from './Diagnostics';
import { Badge, Loading, Page, Pager, RowLink, SearchBox, Table, fmtDate, fmtDay, fmtDuration, fmtNumber, useAdminData, useDebounced } from './parts';

interface UserSummary {
  id: string;
  username: string;
  displayName: string;
  avatarColor: string;
  avatarUrl: string | null;
  bot: boolean;
  verified: boolean;
  createdAt: number;
  servers: number;
  google: boolean;
  twoFactor: boolean;
  hasEmail: boolean;
  supportCents: number;
  online: boolean;
  admin: boolean;
  banned: boolean;
  /** liberado para o Mecenato sem apoio (cortesia) */
  mecenatoCourtesy?: boolean;
  /** liberado pela lista MECENATO_COURTESY da configuração */
  mecenatoCourtesyList?: boolean;
}

interface Paged<T> {
  items: T[];
  total: number;
  pageSize: number;
}

function UserFlags({ u }: { u: UserSummary }) {
  return (
    <span className="flex flex-wrap gap-1">
      {u.banned && <Badge tone="warn">suspensa</Badge>}
      {u.admin && <Badge tone="accent">equipe</Badge>}
      {u.bot && <Badge>bot</Badge>}
      {u.verified && <Badge tone="ok">verificado</Badge>}
      {u.supportCents > 0 && <Badge tone="warn">apoiador</Badge>}
      {(u.mecenatoCourtesy || u.mecenatoCourtesyList) && <Badge tone="accent">Mecenato cortesia</Badge>}
      {u.twoFactor && <Badge>2 etapas</Badge>}
      {u.google && <Badge>Google</Badge>}
      {u.hasEmail && <Badge>e-mail</Badge>}
    </span>
  );
}

function Person({ name, username, color, src, online, size = 32 }: { name: string; username: string; color: string; src: string | null; online?: boolean; size?: number }) {
  return (
    <span className="flex items-center gap-2.5">
      <Avatar name={name} color={color} src={src} size={size} status={online ? 'online' : undefined} />
      <span className="min-w-0 leading-tight">
        <span className="block truncate font-semibold">{name}</span>
        <span className="block truncate text-xs text-fg-muted">@{username}</span>
      </span>
    </span>
  );
}

// ------------------------------------------------------------------ contas

export function UsersList() {
  const [q, setQ] = useState('');
  const [page, setPage] = useState(0);
  const query = useDebounced(q);
  const { data, error } = useAdminData<Paged<UserSummary>>(`/admin/users?q=${encodeURIComponent(query)}&page=${page}`);
  return (
    <Page
      title="Contas"
      subtitle="Todas as contas da instalação, das mais novas para as mais antigas."
      actions={
        <SearchBox
          value={q}
          onChange={(v) => {
            setQ(v);
            setPage(0);
          }}
          placeholder="Buscar por nome ou @usuário"
        />
      }
    >
      <Loading data={data} error={error}>
        {(d) => (
          <>
            <p className="mb-3 text-sm text-fg-muted">{fmtNumber(d.total)} conta(s)</p>
            <Table head={['Conta', 'Criada em', 'Servidores', 'Detalhes']}>
              {d.items.map((u) => (
                <RowLink
                  key={u.id}
                  href={`#contas/${u.id}`}
                  cells={[
                    <Person name={u.displayName} username={u.username} color={u.avatarColor} src={u.avatarUrl} online={u.online} />,
                    <span className="whitespace-nowrap text-fg-muted">{fmtDay(u.createdAt)}</span>,
                    <span className="tabular-nums">{u.servers}</span>,
                    <UserFlags u={u} />,
                  ]}
                />
              ))}
            </Table>
            <Pager page={page} total={d.total} pageSize={d.pageSize} onPage={setPage} />
          </>
        )}
      </Loading>
    </Page>
  );
}

interface UserDetailData extends Omit<UserSummary, 'servers'> {
  messages: number;
  bots: { id: string; username: string }[];
  servers: { id: string; name: string; iconUrl: string | null; iconColor: string; owner: boolean; joinedAt: number; nickname: string | null; roles: { name: string; color: string | null }[] }[];
  diagnostics: DiagnosticMeta[];
  email: string | null;
  emailPending: string | null;
  ban: { at: number; reason: string | null; by: string | null } | null;
  actions: { id: number; action: string; reason: string | null; at: number; by: string | null }[];
}

const ACTION_LABEL: Record<string, string> = {
  ban: 'Suspendeu',
  unban: 'Reativou',
  delete: 'Apagou',
  mecenato_on: 'Liberou o Mecenato de cortesia',
  mecenato_off: 'Tirou o Mecenato de cortesia',
  director_fx: 'Efeito de voz (modo gravação)',
  director_fx_off: 'Tirou o efeito de voz (modo gravação)',
  director_shake: 'Tremeu a tela (modo gravação)',
};

/** Mecenato de cortesia: contratos sem apoio por Pix, para testers e para gravar os vídeos. */
function CourtesyToggle({ u, reload }: { u: UserDetailData; reload: () => void }) {
  const [busy, setBusy] = useState(false);
  if (u.bot) return null;
  const on = !!u.mecenatoCourtesy;
  const toggle = async () => {
    setBusy(true);
    try {
      await api.post(`/admin/users/${u.id}/mecenato`, { on: !on });
      toast.success(on ? 'Mecenato de cortesia retirado.' : 'Mecenato de cortesia liberado.');
      reload();
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-surface-3/60 p-4 ring-1 ring-line">
      <div className="min-w-0 flex-1 text-sm">
        <b>Mecenato de cortesia</b>
        <p className="text-xs text-fg-muted">Entra em contratos sem apoiar. O contrato vem com empate (os dois têm poder) e sem multa.</p>
      </div>
      {u.mecenatoCourtesyList ? (
        <span className="text-xs font-semibold text-fg-muted">Liberado pela lista da configuração</span>
      ) : (
        <Button variant={on ? 'secondary' : 'primary'} loading={busy} onClick={() => void toggle()}>
          {on ? 'Tirar' : 'Liberar'}
        </Button>
      )}
    </div>
  );
}

/** Suspender, reativar ou apagar a conta (sempre com motivo, que fica registrado). */
function AccountActions({ u, reload }: { u: UserDetailData; reload: () => void }) {
  const [reason, setReason] = useState('');
  const [confirmName, setConfirmName] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  if (u.admin) return <p className="text-sm text-fg-subtle">Contas da equipe não podem ser suspensas nem apagadas por aqui.</p>;

  const act = async (key: string, run: () => Promise<unknown>, done: string) => {
    setBusy(key);
    try {
      await run();
      toast.success(done);
      setReason('');
      if (key === 'delete') location.hash = 'contas';
      else reload();
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(null);
    }
  };
  const ownsServer = u.servers.some((s) => s.owner);

  return (
    <div className="space-y-3 rounded-2xl bg-surface-3/60 p-4 ring-1 ring-line">
      {u.ban && (
        <p className="rounded-xl bg-danger/10 px-3 py-2 text-sm text-red-300">
          Suspensa em {fmtDate(u.ban.at)}
          {u.ban.by && ` por @${u.ban.by}`}: {u.ban.reason}
        </p>
      )}
      <textarea
        value={reason}
        maxLength={500}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Motivo (fica registrado)"
        className="h-16 w-full resize-none rounded-xl bg-surface-1 p-3 text-sm outline-none"
      />
      <div className="flex flex-wrap items-center gap-2">
        {u.ban ? (
          <Button
            variant="secondary"
            loading={busy === 'unban'}
            onClick={() => void act('unban', () => api.post(`/admin/users/${u.id}/unban`, { reason }), 'Conta reativada.')}
          >
            <ShieldCheck size={15} /> Reativar
          </Button>
        ) : (
          <Button
            variant="danger"
            disabled={!reason.trim()}
            loading={busy === 'ban'}
            onClick={() => void act('ban', () => api.post(`/admin/users/${u.id}/ban`, { reason }), 'Conta suspensa: as sessões dela caíram.')}
          >
            <UserX size={15} /> Suspender
          </Button>
        )}
      </div>
      <details className="text-sm">
        <summary className="cursor-pointer font-semibold text-fg-muted">Apagar de vez</summary>
        <div className="mt-2 space-y-2">
          <p className="text-xs text-fg-muted">
            Some a conta, as mensagens, as conversas privadas e os bots dela. Não dá para desfazer. Use para contas falsas ou vazias; no resto, prefira suspender.
          </p>
          {ownsServer ? (
            <p className="text-xs text-warn">Essa conta é dona de servidor: suspenda em vez de apagar.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              <input
                value={confirmName}
                onChange={(e) => setConfirmName(e.target.value)}
                placeholder={`Digite ${u.username} para confirmar`}
                className="h-9 min-w-0 flex-1 rounded-xl bg-surface-1 px-3 text-sm outline-none"
              />
              <Button
                variant="danger"
                disabled={confirmName !== u.username}
                loading={busy === 'delete'}
                onClick={() =>
                  void act(
                    'delete',
                    () => api.del(`/admin/users/${u.id}?confirm=${encodeURIComponent(confirmName)}&reason=${encodeURIComponent(reason)}`),
                    'Conta apagada.',
                  )
                }
              >
                <Trash2 size={15} /> Apagar
              </Button>
            </div>
          )}
        </div>
      </details>
      {u.actions.length > 0 && (
        <ul className="space-y-1 border-t border-line pt-3 text-xs text-fg-muted">
          {u.actions.map((a) => (
            <li key={a.id}>
              {fmtDate(a.at)} · {ACTION_LABEL[a.action] ?? a.action}
              {a.by && ` (@${a.by})`}
              {a.reason && `: ${a.reason}`}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function UserDetail({ id }: { id: string }) {
  const { data, error, reload } = useAdminData<UserDetailData>(`/admin/users/${id}`);
  return (
    <Loading data={data} error={error}>
      {(u) => (
        <Page back="#contas" title={<Person name={u.displayName} username={u.username} color={u.avatarColor} src={u.avatarUrl} online={u.online} size={48} />}>
          <div className="space-y-6">
            <section>
              <h2 className="mb-2 text-sm font-bold">Ações da equipe</h2>
              <div className="space-y-3">
                <AccountActions u={u} reload={reload} />
                <CourtesyToggle u={u} reload={reload} />
              </div>
            </section>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-fg-muted">
              <span>Conta criada em {fmtDate(u.createdAt)}</span>
              <span>{u.online ? 'Online agora' : 'Offline'}</span>
              <span>{fmtNumber(u.messages)} mensagem(ns) em canais</span>
              <span>
                {u.email ? (
                  <>
                    E-mail: <b className="text-fg select-all">{u.email}</b>
                  </>
                ) : u.google ? (
                  'Entra pelo Google (sem e-mail guardado)'
                ) : (
                  'Sem e-mail confirmado'
                )}
                {u.emailPending && u.emailPending !== u.email && ` · esperando confirmação de ${u.emailPending}`}
              </span>
              <UserFlags u={{ ...u, servers: u.servers.length }} />
            </div>

            <section>
              <h2 className="mb-2 text-sm font-bold">Servidores ({u.servers.length})</h2>
              {u.servers.length === 0 ? (
                <p className="text-sm text-fg-subtle">Não está em nenhum servidor.</p>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2">
                  {u.servers.map((s) => (
                    <a key={s.id} href={`#servidores/${s.id}`} className="flex items-start gap-3 rounded-2xl bg-surface-3/60 p-3 ring-1 ring-line hover:bg-surface-3">
                      <ServerIcon name={s.name} url={s.iconUrl} color={s.iconColor} />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5 font-semibold">
                          <span className="truncate">{s.name}</span>
                          {s.owner && <Crown size={13} className="shrink-0 text-warn" aria-label="dono" />}
                        </span>
                        <span className="block text-xs text-fg-muted">
                          entrou em {fmtDay(s.joinedAt)}
                          {s.nickname && ` · apelido "${s.nickname}"`}
                        </span>
                        {s.roles.length > 0 && (
                          <span className="mt-1.5 flex flex-wrap gap-1">
                            {s.roles.map((r) => (
                              <RoleChip key={r.name} name={r.name} color={r.color} />
                            ))}
                          </span>
                        )}
                      </span>
                    </a>
                  ))}
                </div>
              )}
            </section>

            {u.bots.length > 0 && (
              <section>
                <h2 className="mb-2 text-sm font-bold">Bots criados</h2>
                <div className="flex flex-wrap gap-2">
                  {u.bots.map((b) => (
                    <a key={b.id} href={`#contas/${b.id}`} className="rounded-full bg-surface-3 px-3 py-1 text-sm hover:bg-surface-4">
                      @{b.username}
                    </a>
                  ))}
                </div>
              </section>
            )}

            <section>
              <h2 className="mb-2 text-sm font-bold">Diagnósticos enviados</h2>
              {u.diagnostics.length === 0 ? (
                <p className="text-sm text-fg-subtle">Nenhum.</p>
              ) : (
                <ul className="space-y-2">
                  {u.diagnostics.map((d) => (
                    <li key={d.id}>
                      <a href={`#diagnosticos/${d.id}`} className="flex flex-wrap items-baseline gap-x-3 rounded-2xl bg-surface-3/60 px-4 py-2.5 text-sm ring-1 ring-line hover:bg-surface-3">
                        <span className="text-fg-muted">{fmtDate(d.createdAt)}</span>
                        <span className="tabular-nums">{fmtDuration(d.endedAt - d.startedAt)}</span>
                        <span className="min-w-0 flex-1 truncate">{d.note || <i className="text-fg-subtle">sem descrição</i>}</span>
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </Page>
      )}
    </Loading>
  );
}

// ------------------------------------------------------------------ servidores

interface ServerSummary {
  id: string;
  name: string;
  iconUrl: string | null;
  iconColor: string;
  verified: boolean;
  createdAt: number;
  owner: string | null;
  members: number;
  channels: number;
  roles: number;
}

function ServerIcon({ name, url, color, size = 40 }: { name: string; url: string | null; color: string; size?: number }) {
  return url ? (
    <img src={url} alt="" className="shrink-0 rounded-2xl object-cover" style={{ width: size, height: size }} />
  ) : (
    <span className="flex shrink-0 items-center justify-center rounded-2xl font-display text-sm font-bold text-white" style={{ width: size, height: size, background: color }}>
      {name.slice(0, 2).toUpperCase()}
    </span>
  );
}

function RoleChip({ name, color }: { name: string; color: string | null }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-surface-4 px-2 py-px text-[11px] font-semibold">
      <span className="h-2 w-2 rounded-full" style={{ background: color ?? 'var(--color-fg-subtle)' }} />
      {name}
    </span>
  );
}

export function ServersList() {
  const [q, setQ] = useState('');
  const [page, setPage] = useState(0);
  const query = useDebounced(q);
  const { data, error } = useAdminData<Paged<ServerSummary>>(`/admin/servers?q=${encodeURIComponent(query)}&page=${page}`);
  return (
    <Page
      title="Servidores"
      subtitle="Do mais cheio para o mais vazio."
      actions={
        <SearchBox
          value={q}
          onChange={(v) => {
            setQ(v);
            setPage(0);
          }}
          placeholder="Buscar servidor"
        />
      }
    >
      <Loading data={data} error={error}>
        {(d) => (
          <>
            <p className="mb-3 text-sm text-fg-muted">{fmtNumber(d.total)} servidor(es)</p>
            <Table head={['Servidor', 'Dono', 'Membros', 'Canais', 'Cargos', 'Criado em']}>
              {d.items.map((s) => (
                <RowLink
                  key={s.id}
                  href={`#servidores/${s.id}`}
                  cells={[
                    <span className="flex items-center gap-2.5">
                      <ServerIcon name={s.name} url={s.iconUrl} color={s.iconColor} size={32} />
                      <span className="font-semibold">{s.name}</span>
                      {s.verified && <Badge tone="ok">verificado</Badge>}
                    </span>,
                    <span className="text-fg-muted">{s.owner ? `@${s.owner}` : '—'}</span>,
                    <span className="tabular-nums">{s.members}</span>,
                    <span className="tabular-nums">{s.channels}</span>,
                    <span className="tabular-nums">{s.roles}</span>,
                    <span className="whitespace-nowrap text-fg-muted">{fmtDay(s.createdAt)}</span>,
                  ]}
                />
              ))}
            </Table>
            <Pager page={page} total={d.total} pageSize={d.pageSize} onPage={setPage} />
          </>
        )}
      </Loading>
    </Page>
  );
}

interface ServerDetailData {
  id: string;
  name: string;
  iconUrl: string | null;
  iconColor: string;
  verified: boolean;
  createdAt: number;
  ownerId: string;
  messages: number;
  roles: { id: string; name: string; color: string | null; position: number; isDefault: boolean; administrator: boolean; members: number }[];
  channels: { id: string; name: string; type: 'text' | 'voice' | 'forum' }[];
  members: { id: string; username: string; displayName: string; avatarColor: string; avatarUrl: string | null; bot: boolean; nickname: string | null; joinedAt: number; online: boolean; roleIds: string[] }[];
}

const CHANNEL_ICON = { text: Hash, voice: Volume2, forum: MessagesSquare };

export function ServerDetail({ id }: { id: string }) {
  const { data, error } = useAdminData<ServerDetailData>(`/admin/servers/${id}`);
  const [roleFilter, setRoleFilter] = useState<string | null>(null);
  return (
    <Loading data={data} error={error}>
      {(s) => {
        const roleById = new Map(s.roles.map((r) => [r.id, r]));
        const members = roleFilter ? s.members.filter((m) => m.roleIds.includes(roleFilter)) : s.members;
        return (
          <Page
            back="#servidores"
            title={
              <span className="flex items-center gap-3">
                <ServerIcon name={s.name} url={s.iconUrl} color={s.iconColor} size={48} />
                {s.name}
                {s.verified && <Badge tone="ok">verificado</Badge>}
              </span>
            }
            subtitle={`Criado em ${fmtDate(s.createdAt)} · ${s.members.length} membro(s) · ${fmtNumber(s.messages)} mensagem(ns)`}
          >
            <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
              <section className="min-w-0">
                <h2 className="mb-2 text-sm font-bold">
                  Membros {roleFilter && <span className="font-normal text-fg-muted">com o cargo {roleById.get(roleFilter)?.name}</span>}
                </h2>
                <ul className="divide-y divide-line rounded-3xl ring-1 ring-line">
                  {members.map((m) => (
                    <li key={m.id}>
                      <a href={`#contas/${m.id}`} className="flex flex-wrap items-center gap-3 px-4 py-2.5 hover:bg-surface-3/50">
                        <Person name={m.nickname || m.displayName} username={m.username} color={m.avatarColor} src={m.avatarUrl} online={m.online} />
                        {m.id === s.ownerId && <Crown size={14} className="text-warn" aria-label="dono" />}
                        {m.bot && <Badge>bot</Badge>}
                        <span className="ml-auto flex flex-wrap justify-end gap-1">
                          {m.roleIds
                            .map((rid) => roleById.get(rid))
                            .filter((r): r is ServerDetailData['roles'][number] => !!r)
                            .sort((a, b) => b.position - a.position)
                            .map((r) => (
                              <RoleChip key={r.id} name={r.name} color={r.color} />
                            ))}
                        </span>
                      </a>
                    </li>
                  ))}
                  {members.length === 0 && <li className="px-4 py-6 text-center text-sm text-fg-subtle">Ninguém com esse cargo.</li>}
                </ul>
              </section>
              <aside className="space-y-6">
                <section>
                  <h2 className="mb-2 text-sm font-bold">Cargos</h2>
                  <ul className="space-y-1">
                    {s.roles.map((r) => {
                      const active = roleFilter === r.id;
                      return (
                        <li key={r.id}>
                          <button
                            onClick={() => setRoleFilter(active || r.isDefault ? null : r.id)}
                            aria-pressed={active}
                            className={cx('flex w-full items-center gap-2 rounded-2xl px-3 py-1.5 text-left text-sm hover:bg-surface-3', active && 'bg-surface-3 ring-1 ring-accent')}
                          >
                            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: r.color ?? 'var(--color-fg-subtle)' }} />
                            <span className="min-w-0 flex-1 truncate">{r.name}</span>
                            {r.administrator && <ShieldCheck size={14} className="text-accent" aria-label="Administrador" />}
                            <span className="text-xs text-fg-muted tabular-nums">{r.members}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </section>
                <section>
                  <h2 className="mb-2 text-sm font-bold">Canais</h2>
                  <ul className="space-y-0.5 text-sm">
                    {s.channels.map((c) => {
                      const Icon = CHANNEL_ICON[c.type] ?? Hash;
                      return (
                        <li key={c.id} className="flex items-center gap-2 px-3 py-1 text-fg-muted">
                          <Icon size={14} className="shrink-0" />
                          <span className="truncate">{c.name}</span>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              </aside>
            </div>
          </Page>
        );
      }}
    </Loading>
  );
}
