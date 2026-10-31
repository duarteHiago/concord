// Contratos de Mecenato no portal: lista (com as saídas por segurança esperando revisão) e o detalhe para
// auditoria: liderança, contribuições que entram na multa, Escudos, multas e o histórico inteiro. A equipe pode
// encerrar um contrato, revisar a saída por segurança, dispensar multa e devolver a foto original.
import { useState } from 'react';
import { formatBRL } from '../../../../shared/supporter.ts';
import { api } from '../../lib/api';
import { endReasonText, eventText, fmtSpan } from '../../lib/contractText';
import type { Contract, ContractBrief, ContractFine, ContractUser } from '../../lib/types';
import { toast } from '../../store/toast';
import { Avatar, Button, cx } from '../ui';
import { Badge, Loading, Page, RowLink, Table, fmtDate, useAdminData } from './parts';

type Item = ContractBrief & { review: string | null; fines: ContractFine[] };

const FILTERS = [
  { id: '', label: 'Todos' },
  { id: 'active', label: 'Em vigor' },
  { id: 'pending', label: 'Convites' },
  { id: 'ended', label: 'Encerrados' },
  { id: 'review', label: 'Revisão pendente' },
] as const;

const STATUS: Record<string, string> = { pending: 'convite', active: 'em vigor', ended: 'encerrado' };
const FINE_STATUS: Record<string, string> = { open: 'em aberto', paid: 'paga', waived: 'dispensada', cancelled: 'cancelada' };

function Pair({ a, b }: { a: ContractUser; b: ContractUser }) {
  return (
    <span className="flex items-center gap-2">
      <Avatar name={a.displayName} color={a.avatarColor} src={a.avatarUrl} size={24} />
      <span className="truncate font-semibold">@{a.username}</span>
      <span className="text-fg-subtle">×</span>
      <Avatar name={b.displayName} color={b.avatarColor} src={b.avatarUrl} size={24} />
      <span className="truncate font-semibold">@{b.username}</span>
    </span>
  );
}

export function ContractsList() {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['id']>('');
  const path = filter === 'review' ? '/admin/contracts?review=pending' : `/admin/contracts?status=${filter}`;
  const { data, error } = useAdminData<{ items: Item[]; pendingReviews: number; openFines: number }>(path);
  return (
    <Page title="Contratos de Mecenato" subtitle="Quem tem contrato com quem, o estado de cada um e o histórico para auditoria.">
      <div className="mb-4 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={cx('h-9 rounded-full px-4 text-sm font-bold', filter === f.id ? 'bg-accent text-on-accent' : 'bg-surface-3 text-fg-muted hover:text-fg')}
          >
            {f.label}
            {f.id === 'review' && data?.pendingReviews ? ` (${data.pendingReviews})` : ''}
          </button>
        ))}
      </div>
      <Loading data={data} error={error}>
        {(d) =>
          d.items.length ? (
            <Table head={['Participantes', 'Estado', 'Criado', 'Multas']}>
              {d.items.map((c) => (
                <RowLink
                  key={c.id}
                  href={`#contratos/${c.id}`}
                  cells={[
                    <Pair a={c.creator} b={c.invitee} />,
                    <span className="flex flex-wrap gap-1">
                      <Badge tone={c.status === 'active' ? 'ok' : 'muted'}>{STATUS[c.status]}</Badge>
                      {c.renewal && <Badge>renovação</Badge>}
                      {c.review === 'pending' && <Badge tone="warn">revisar</Badge>}
                      {c.status === 'ended' && <span className="text-xs text-fg-muted">{endReasonText(c.endReason)}</span>}
                    </span>,
                    <span className="text-fg-muted">{fmtDate(c.createdAt)}</span>,
                    c.fines.length ? c.fines.map((f) => `${formatBRL(f.amountCents)} (${FINE_STATUS[f.status]})`).join(', ') : '—',
                  ]}
                />
              ))}
            </Table>
          ) : (
            <p className="text-sm text-fg-muted">Nenhum contrato aqui.</p>
          )
        }
      </Loading>
    </Page>
  );
}

type Detail = Contract & {
  review: string | null;
  contributions: { id: string; userId: string; amountCents: number; paidAt: number }[];
  fines: ContractFine[];
};

export function ContractDetail({ id }: { id: string }) {
  const { data, error, reload } = useAdminData<Detail>(`/admin/contracts/${id}`);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState('');

  const act = async (key: string, path: string, body: unknown = {}) => {
    setBusy(key);
    try {
      await api.post(path, body);
      toast.success('Feito.');
      reload();
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Loading data={data} error={error}>
      {(c) => {
        const people = [c.creator, c.invitee];
        const name = (uid: string | null | undefined) => {
          const p = people.find((x) => x.id === uid);
          return p ? `@${p.username}` : uid ? 'equipe' : 'o sistema';
        };
        return (
          <Page title={<Pair a={c.creator} b={c.invitee} />} subtitle={`Contrato ${STATUS[c.status]}${c.renewal ? ' (renovação do par antigo)' : ''}`} back="#contratos">
            <div className="grid gap-4 lg:grid-cols-2">
              <section className="panel space-y-1 p-5 text-sm">
                <h2 className="mb-2 font-bold">Resumo</h2>
                <p>Criado: {fmtDate(c.createdAt)}</p>
                {c.startedAt && <p>Começou: {fmtDate(c.startedAt)}</p>}
                {c.endsAt && <p>Prazo: {fmtDate(c.endsAt)}</p>}
                {c.endedAt && (
                  <p>
                    Terminou: {fmtDate(c.endedAt)} · {endReasonText(c.endReason)} {c.endedBy ? `por ${name(c.endedBy)}` : ''}
                  </p>
                )}
                {c.endNote && <p className="rounded-xl bg-surface-0 p-3 text-fg-muted">“{c.endNote}”</p>}
                <p>Duração: {fmtSpan(c.durationMs)} · intervalo do Escudo: {fmtSpan(c.cooldownMs)}</p>
                <p>Cláusula de empate: {c.tieClause ? 'sim' : 'não'}</p>
                <p>Mecenas agora: {c.holders.length ? c.holders.map(name).join(' e ') : '—'}</p>
                {people.map((p) => (
                  <p key={p.id}>
                    Apoio de @{p.username} no contrato: {formatBRL(c.totals[p.id] ?? 0)}
                  </p>
                ))}
                {c.shields &&
                  people.map((p) => (
                    <p key={p.id}>
                      Escudo de @{p.username}: {c.shields![p.id].active ? 'ligado' : 'desligado'} · saldo {fmtSpan(c.shields![p.id].balanceMs)}
                      {c.shields![p.id].restoresAt ? ` · volta em ${fmtDate(c.shields![p.id].restoresAt!)}` : ''}
                    </p>
                  ))}
                {c.avatarOverrides.length > 0 && <p>Foto trocada pelo Mecenas: {c.avatarOverrides.map(name).join(', ')}</p>}
              </section>

              <section className="panel space-y-3 p-5 text-sm">
                <h2 className="font-bold">Ações da equipe</h2>
                {c.review === 'pending' && (
                  <div className="space-y-2 rounded-xl bg-warn/10 p-3">
                    <p className="text-warn">Saída por segurança esperando revisão.</p>
                    <div className="flex flex-wrap gap-2">
                      <Button loading={busy === 'confirm'} onClick={() => void act('confirm', `/admin/contracts/${c.id}/review`, { decision: 'confirm' })}>
                        Confirmar (sem multa)
                      </Button>
                      <Button variant="danger" loading={busy === 'fine'} onClick={() => void act('fine', `/admin/contracts/${c.id}/review`, { decision: 'fine' })}>
                        Reaplicar a multa
                      </Button>
                    </div>
                  </div>
                )}
                {c.status !== 'ended' && (
                  <div className="space-y-2">
                    <textarea
                      value={note}
                      maxLength={500}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder="Motivo (fica no histórico)"
                      className="h-16 w-full resize-none rounded-xl bg-surface-0 p-3 outline-none"
                    />
                    <Button variant="danger" loading={busy === 'end'} onClick={() => void act('end', `/admin/contracts/${c.id}/end`, { note })}>
                      Encerrar o contrato (sem multa)
                    </Button>
                  </div>
                )}
                {c.avatarOverrides.length > 0 && (
                  <Button variant="secondary" loading={busy === 'avatar'} onClick={() => void act('avatar', `/admin/contracts/${c.id}/restore-avatar`)}>
                    Devolver a foto original
                  </Button>
                )}
                <div>
                  <h3 className="mb-1 font-semibold">Multas</h3>
                  {c.fines.length ? (
                    <ul className="space-y-1">
                      {c.fines.map((f) => (
                        <li key={f.id} className="flex items-center gap-2">
                          <span className="min-w-0 flex-1">
                            {name(f.userId)}: {formatBRL(f.amountCents)} (base {formatBRL(f.baseCents)}) · {FINE_STATUS[f.status]}
                          </span>
                          {f.status === 'open' && (
                            <Button variant="ghost" loading={busy === f.id} onClick={() => void act(f.id, `/admin/fines/${f.id}/waive`, { note })}>
                              Dispensar
                            </Button>
                          )}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-fg-muted">Nenhuma.</p>
                  )}
                </div>
              </section>

              <section className="panel p-5 text-sm">
                <h2 className="mb-2 font-bold">Contribuições que entram na multa</h2>
                {c.contributions.length ? (
                  <ul className="space-y-1">
                    {c.contributions.map((p) => (
                      <li key={p.id}>
                        {fmtDate(p.paidAt)} · {name(p.userId)} · {formatBRL(p.amountCents)}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-fg-muted">Nenhuma durante o contrato.</p>
                )}
              </section>

              <section className="panel p-5 text-sm">
                <h2 className="mb-2 font-bold">Histórico completo</h2>
                <ol className="max-h-[480px] space-y-1 overflow-y-auto">
                  {c.events.map((e) => (
                    <li key={e.id} className="flex gap-3">
                      <span className="w-36 shrink-0 text-xs text-fg-subtle">{fmtDate(e.at)}</span>
                      <span className="min-w-0">{eventText(e, name)}</span>
                    </li>
                  ))}
                </ol>
              </section>
            </div>
          </Page>
        );
      }}
    </Loading>
  );
}
