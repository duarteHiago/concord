// Aba Custos do portal: os gastos mensais do Concord e quanto os Pix de apoio já cobriram no mês. A barra
// paga as faturas na ordem do vencimento, então cada custo mostra se já está coberto (ver server/src/costs.ts).
import { ChevronLeft, ChevronRight, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { formatBRL } from '../../../../shared/supporter.ts';
import { api } from '../../lib/api';
import { toast } from '../../store/toast';
import { Button, Input, cx } from '../ui';
import { Badge, Loading, Page, fmtDate, useAdminData } from './parts';

interface Cost {
  id: string;
  name: string;
  amountCents: number;
  dueDay: number;
  note: string;
}

interface CostsData {
  month: string;
  start: number;
  end: number;
  costs: Cost[];
  raisedCents: number;
  payments: { id: string; amountCents: number; paidAt: number; user: { username: string; displayName: string | null } | null }[];
  history: { month: string; raisedCents: number }[];
}

const monthLabel = (key: string, withYear = true) =>
  new Date(`${key}-15T12:00:00`).toLocaleDateString('pt-BR', { month: 'long', ...(withYear ? { year: 'numeric' } : {}) });

const shiftMonth = (key: string, delta: number) => {
  const [y, m] = key.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
};

/** "49,90", "1.234,56", "R$ 30" -> centavos (null se não der para ler). */
function parseBRL(raw: string): number | null {
  const clean = raw.replace(/[R$\s]/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.');
  const v = Number(clean);
  return clean && Number.isFinite(v) && v > 0 ? Math.round(v * 100) : null;
}

/** Quanto do arrecadado vai para cada custo, pagando na ordem do vencimento. */
function allocate(costs: Cost[], raised: number) {
  let left = raised;
  return costs.map((c) => {
    const covered = Math.min(c.amountCents, Math.max(0, left));
    left -= covered;
    return { ...c, covered };
  });
}

export function CostsPage() {
  const [month, setMonth] = useState<string | null>(null);
  const { data, error, reload } = useAdminData<CostsData>(`/admin/costs${month ? `?month=${month}` : ''}`);
  const [editing, setEditing] = useState<Cost | 'new' | null>(null);

  return (
    <Page
      title="Custos"
      subtitle="Quanto custa manter o Concord no ar, e quanto os apoios já cobriram no mês."
      actions={
        <Button onClick={() => setEditing('new')}>
          <Plus size={16} /> Adicionar custo
        </Button>
      }
    >
      <Loading data={data} error={error}>
        {(d) => {
          const goal = d.costs.reduce((n, c) => n + c.amountCents, 0);
          const rows = allocate(d.costs, d.raisedCents);
          const current = Date.now() >= d.start && Date.now() < d.end;
          return (
            <div className="space-y-8">
              <div className="flex items-center gap-2">
                <button aria-label="Mês anterior" onClick={() => setMonth(shiftMonth(d.month, -1))} className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-3 hover:bg-surface-4">
                  <ChevronLeft size={16} />
                </button>
                <h2 className="min-w-44 text-center font-display text-lg font-bold capitalize">{monthLabel(d.month)}</h2>
                <button aria-label="Próximo mês" onClick={() => setMonth(shiftMonth(d.month, 1))} className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-3 hover:bg-surface-4">
                  <ChevronRight size={16} />
                </button>
                {!current && (
                  <button onClick={() => setMonth(null)} className="ml-2 text-sm font-semibold text-accent hover:underline">
                    Voltar para este mês
                  </button>
                )}
              </div>

              <Progress goal={goal} raised={d.raisedCents} rows={rows} start={d.start} end={d.end} current={current} />

              {editing && (
                <CostForm
                  cost={editing === 'new' ? null : editing}
                  onDone={() => {
                    setEditing(null);
                    reload();
                  }}
                  onCancel={() => setEditing(null)}
                />
              )}

              <section>
                <h2 className="mb-2 text-sm font-bold">Faturas do mês</h2>
                {rows.length === 0 ? (
                  <div className="rounded-3xl border border-dashed border-line-strong p-8 text-center text-sm text-fg-muted">
                    Nenhum custo cadastrado. Adicione o servidor, o domínio e o que mais vocês pagam todo mês.
                  </div>
                ) : (
                  <ul className="divide-y divide-line rounded-3xl ring-1 ring-line">
                    {rows.map((c) => (
                      <CostRow key={c.id} cost={c} month={d.month} current={current} onEdit={() => setEditing(c)} onDeleted={reload} />
                    ))}
                  </ul>
                )}
              </section>

              <div className="grid gap-6 lg:grid-cols-2">
                <section>
                  <h2 className="mb-2 text-sm font-bold">Apoios do mês ({d.payments.length})</h2>
                  {d.payments.length === 0 ? (
                    <p className="text-sm text-fg-subtle">Nenhum Pix confirmado neste mês.</p>
                  ) : (
                    <ul className="max-h-80 divide-y divide-line overflow-y-auto rounded-3xl ring-1 ring-line">
                      {d.payments.map((p) => (
                        <li key={p.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                          <b className="tabular-nums text-ok">{formatBRL(p.amountCents)}</b>
                          <span className="min-w-0 flex-1 truncate">{p.user ? `@${p.user.username}` : 'conta apagada'}</span>
                          <span className="text-xs whitespace-nowrap text-fg-muted">{fmtDate(p.paidAt)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
                <History history={d.history} goal={goal} />
              </div>
            </div>
          );
        }}
      </Loading>
    </Page>
  );
}

// ------------------------------------------------------------------ barra do mês

function Progress({
  goal,
  raised,
  rows,
  start,
  end,
  current,
}: {
  goal: number;
  raised: number;
  rows: (Cost & { covered: number })[];
  start: number;
  end: number;
  current: boolean;
}) {
  const missing = Math.max(0, goal - raised);
  const extra = Math.max(0, raised - goal);
  const pct = goal ? Math.min(100, (raised / goal) * 100) : 0;
  const daysLeft = Math.max(0, Math.ceil((end - Date.now()) / 86_400_000));
  return (
    <section className="rounded-3xl bg-surface-3/60 p-5 ring-1 ring-line">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <div>
          <span className="text-xs font-semibold text-fg-muted">Apoios no mês</span>
          <div className="font-display text-3xl font-extrabold tabular-nums">
            {formatBRL(raised)} <span className="text-lg font-bold text-fg-muted">de {formatBRL(goal)}</span>
          </div>
        </div>
        <div className="text-right">
          {goal === 0 ? (
            <span className="text-sm text-fg-muted">Cadastre os custos para ver a meta.</span>
          ) : missing > 0 ? (
            <>
              <b className="font-display text-xl text-warn tabular-nums">Faltam {formatBRL(missing)}</b>
              {current && <div className="text-xs text-fg-muted">{daysLeft} dia(s) para acabar o mês</div>}
            </>
          ) : (
            <>
              <b className="font-display text-xl text-ok">Mês coberto!</b>
              {extra > 0 && <div className="text-xs text-fg-muted tabular-nums">Sobraram {formatBRL(extra)}</div>}
            </>
          )}
        </div>
      </div>

      {/* uma fatia por custo, do tamanho do valor, enchendo na ordem do vencimento */}
      <div className="mt-4 flex h-5 gap-[3px] overflow-hidden rounded-full" role="progressbar" aria-valuemin={0} aria-valuemax={goal} aria-valuenow={raised} aria-label={`${Math.round(pct)}% dos custos do mês cobertos`}>
        {goal === 0 ? (
          <div className="flex-1 bg-surface-4" />
        ) : (
          rows.map((c) => (
            <div key={c.id} title={`${c.name}: ${formatBRL(c.covered)} de ${formatBRL(c.amountCents)}`} className="relative h-full bg-surface-4" style={{ flexGrow: c.amountCents, flexBasis: 0 }}>
              <div className={cx('h-full transition-all', c.covered >= c.amountCents ? 'bg-ok' : 'bg-accent')} style={{ width: `${(c.covered / c.amountCents) * 100}%` }} />
            </div>
          ))
        )}
      </div>
      {goal > 0 && (
        <div className="mt-2 flex gap-[3px] text-[11px] text-fg-muted">
          {rows.map((c) => (
            <span key={c.id} className="min-w-0 truncate" style={{ flexGrow: c.amountCents, flexBasis: 0 }}>
              {c.name}
            </span>
          ))}
        </div>
      )}
      <div className="mt-3 text-xs text-fg-subtle">
        {Math.round(pct)}% coberto · de {new Date(start).toLocaleDateString('pt-BR')} a {new Date(end - 1).toLocaleDateString('pt-BR')}
      </div>
    </section>
  );
}

// ------------------------------------------------------------------ uma fatura

function CostRow({ cost, month, current, onEdit, onDeleted }: { cost: Cost & { covered: number }; month: string; current: boolean; onEdit: () => void; onDeleted: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const [y, m] = month.split('-').map(Number);
  // dia 31 em mês de 30 dias vence no último dia
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const day = Math.min(cost.dueDay, lastDay);
  const due = new Date(`${month}-${String(day).padStart(2, '0')}T23:59:59-03:00`).getTime();
  const days = Math.ceil((due - Date.now()) / 86_400_000);
  const paidUp = cost.covered >= cost.amountCents;

  let when: string;
  if (!current || days < 0) when = `venceu dia ${day}`;
  else if (days === 0) when = 'vence hoje';
  else when = `vence em ${days} dia(s), dia ${day}`;

  async function remove() {
    try {
      await api.del(`/admin/costs/${cost.id}`);
      onDeleted();
    } catch (err) {
      toast.error(err);
    }
  }

  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="font-semibold">{cost.name}</div>
        <div className={cx('text-xs', current && !paidUp && days >= 0 && days <= 3 ? 'font-semibold text-danger' : 'text-fg-muted')}>
          {when}
          {cost.note && ` · ${cost.note}`}
        </div>
      </div>
      <b className="font-display tabular-nums">{formatBRL(cost.amountCents)}</b>
      {paidUp ? <Badge tone="ok">coberto</Badge> : cost.covered > 0 ? <Badge tone="warn">faltam {formatBRL(cost.amountCents - cost.covered)}</Badge> : <Badge>sem cobertura</Badge>}
      <div className="flex gap-1">
        {confirming ? (
          <>
            <Button variant="ghost" className="h-8 px-3 text-xs" onClick={() => setConfirming(false)}>
              Cancelar
            </Button>
            <Button variant="danger" className="h-8 px-3 text-xs" onClick={() => void remove()}>
              Apagar
            </Button>
          </>
        ) : (
          <>
            <button aria-label={`Editar ${cost.name}`} onClick={onEdit} className="flex h-8 w-8 items-center justify-center rounded-full text-fg-muted hover:bg-surface-3 hover:text-fg">
              <Pencil size={14} />
            </button>
            <button aria-label={`Apagar ${cost.name}`} onClick={() => setConfirming(true)} className="flex h-8 w-8 items-center justify-center rounded-full text-fg-muted hover:bg-danger/15 hover:text-danger">
              <Trash2 size={14} />
            </button>
          </>
        )}
      </div>
    </li>
  );
}

// ------------------------------------------------------------------ cadastro

function CostForm({ cost, onDone, onCancel }: { cost: Cost | null; onDone: () => void; onCancel: () => void }) {
  const [name, setName] = useState(cost?.name ?? '');
  const [amount, setAmount] = useState(cost ? (cost.amountCents / 100).toFixed(2).replace('.', ',') : '');
  const [dueDay, setDueDay] = useState(String(cost?.dueDay ?? ''));
  const [note, setNote] = useState(cost?.note ?? '');
  const [saving, setSaving] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const amountCents = parseBRL(amount);
    const day = Number(dueDay);
    if (!amountCents) return toast.error('Digite o valor, por exemplo 49,90.');
    if (!Number.isInteger(day) || day < 1 || day > 31) return toast.error('O dia do vencimento vai de 1 a 31.');
    setSaving(true);
    try {
      const body = { name, amountCents, dueDay: day, note };
      if (cost) await api.put(`/admin/costs/${cost.id}`, body);
      else await api.post('/admin/costs', body);
      toast.success(cost ? 'Custo atualizado.' : 'Custo adicionado.');
      onDone();
    } catch (err) {
      toast.error(err);
      setSaving(false);
    }
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-3 rounded-3xl bg-surface-3/60 p-5 ring-1 ring-accent/40">
      <h2 className="text-sm font-bold">{cost ? `Editar ${cost.name}` : 'Novo custo mensal'}</h2>
      <div className="grid gap-3 sm:grid-cols-[2fr_1fr_1fr]">
        <Input label="Nome" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="VPS, domínio, Cloudflare..." required autoFocus />
        <Input label="Valor por mês (R$)" value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="49,90" required />
        <Input label="Dia do vencimento" value={dueDay} onChange={(e) => setDueDay(e.target.value.replace(/\D/g, ''))} inputMode="numeric" maxLength={2} placeholder="10" required />
      </div>
      <Input label="Observação (opcional)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder="cartão do Hiago, cobrança em dólar..." />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="submit" loading={saving}>
          {cost ? 'Salvar' : 'Adicionar'}
        </Button>
      </div>
    </form>
  );
}

// ------------------------------------------------------------------ meses anteriores

function History({ history, goal }: { history: CostsData['history']; goal: number }) {
  const max = Math.max(goal, 1, ...history.map((h) => h.raisedCents));
  return (
    <section>
      <h2 className="mb-2 text-sm font-bold">Últimos 6 meses</h2>
      <div className="rounded-3xl bg-surface-3/60 p-4 ring-1 ring-line">
        <div className="relative flex h-32 items-end gap-3">
          {goal > 0 && (
            <div className="pointer-events-none absolute inset-x-0 border-t border-dashed border-danger/60" style={{ bottom: `${(goal / max) * 100}%` }}>
              <span className="absolute -top-4 right-0 text-[10px] text-danger/80">meta {formatBRL(goal)}</span>
            </div>
          )}
          {history.map((h) => (
            <div key={h.month} className="flex h-full flex-1 flex-col justify-end" title={`${monthLabel(h.month)}: ${formatBRL(h.raisedCents)}`}>
              <div className={cx('w-full rounded-t-lg', goal && h.raisedCents >= goal ? 'bg-ok' : 'bg-accent/60')} style={{ height: `${h.raisedCents ? Math.max(3, (h.raisedCents / max) * 100) : 2}%` }} />
            </div>
          ))}
        </div>
        <div className="mt-1.5 flex gap-3 text-center text-[10px] text-fg-subtle capitalize">
          {history.map((h) => (
            <span key={h.month} className="flex-1">
              {monthLabel(h.month, false).slice(0, 3)}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
