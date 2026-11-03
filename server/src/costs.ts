// Custos da instalação no portal da equipe (aba Custos): a equipe cadastra os gastos mensais (servidor,
// domínio...) com o dia do vencimento, e o portal compara com os Pix de apoio confirmados no mês (support.ts).
// Os meses seguem o horário de Brasília. Só quem está em ADMIN_USERS chega aqui (admin.ts).
import { randomUUID } from 'node:crypto';
import type { Router } from 'express';
import { all, get, run } from './db.ts';
import { fail, int, str } from './http.ts';

interface CostRow {
  id: string;
  name: string;
  amount_cents: number;
  due_day: number;
  note: string;
  every_months: number;
  start_month: string | null;
  created_at: number;
  updated_at: number;
}

// horário de Brasília (UTC-3, sem horário de verão desde 2019)
const BRT = 3 * 3_600_000;
const monthStart = (year: number, month: number) => Date.UTC(year, month, 1) + BRT;
const monthKey = (year: number, month: number) => `${year}-${String(month + 1).padStart(2, '0')}`;
const keyOf = (ms: number) => {
  const d = new Date(ms - BRT);
  return monthKey(d.getUTCFullYear(), d.getUTCMonth());
};

/** Mês da primeira cobrança: o escolhido, ou o mês em que o custo foi cadastrado. */
const startOf = (c: Pick<CostRow, 'start_month' | 'created_at'>) => c.start_month ?? keyOf(c.created_at);

/** Se o custo cobra no mês (0-11) do ano: a partir do mês da primeira cobrança, a cada every_months. */
function chargedIn(c: Pick<CostRow, 'start_month' | 'created_at' | 'every_months'>, year: number, month: number) {
  const [sy, sm] = startOf(c).split('-').map(Number);
  const diff = year * 12 + month - (sy * 12 + sm - 1);
  return diff >= 0 && diff % c.every_months === 0;
}

const costJson = (c: CostRow) => ({
  id: c.id,
  name: c.name,
  amountCents: c.amount_cents,
  dueDay: c.due_day,
  note: c.note,
  everyMonths: c.every_months,
  startMonth: startOf(c),
  updatedAt: c.updated_at,
});

/** Ano e mês (0-11) de "AAAA-MM", ou do mês atual em Brasília. */
function parseMonth(raw: unknown): [number, number] {
  if (typeof raw === 'string' && /^\d{4}-\d{2}$/.test(raw)) {
    const [y, m] = raw.split('-').map(Number);
    if (m >= 1 && m <= 12) return [y, m - 1];
  }
  const now = new Date(Date.now() - BRT);
  return [now.getUTCFullYear(), now.getUTCMonth()];
}

const raisedBetween = (from: number, to: number) =>
  get<{ n: number | null }>("SELECT SUM(amount_cents) AS n FROM payments WHERE status = 'paid' AND paid_at >= ? AND paid_at < ?", from, to)?.n ?? 0;

/**
 * Sobra que chega ao mês que começa em `until`: soma o saldo de cada mês desde o primeiro custo cadastrado, e a
 * sobra de um mês passa para o seguinte. Mês que fechou no vermelho zera o saldo (a equipe pagou do bolso, não
 * fica dívida para os apoios do mês seguinte). A meta de cada mês são os custos que cobraram nele.
 */
function carriedInto(until: number) {
  const costs = all<CostRow>('SELECT * FROM costs');
  if (!costs.length) return 0;
  let [year, month] = costs.map(startOf).sort()[0].split('-').map(Number);
  month--;
  let balance = 0;
  while (monthStart(year, month) < until) {
    const start = monthStart(year, month);
    const end = monthStart(year, month + 1);
    const goal = costs.filter((c) => chargedIn(c, year, month)).reduce((n, c) => n + c.amount_cents, 0);
    balance = Math.max(0, balance + raisedBetween(start, end) - goal);
    month++;
  }
  return balance;
}

function readCost(body: unknown) {
  const b = (body ?? {}) as Record<string, unknown>;
  const amountCents = int(b.amountCents, 'valor');
  if (amountCents <= 0 || amountCents > 100_000_000) fail(400, 'Valor inválido');
  const dueDay = int(b.dueDay, 'dia do vencimento');
  if (dueDay < 1 || dueDay > 31) fail(400, 'O dia do vencimento vai de 1 a 31');
  const note = typeof b.note === 'string' ? b.note.trim().slice(0, 200) : '';
  const everyMonths = b.everyMonths === undefined ? 1 : int(b.everyMonths, 'repetição');
  if (everyMonths < 1 || everyMonths > 24) fail(400, 'A repetição vai de 1 a 24 meses');
  const startMonth = typeof b.startMonth === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(b.startMonth) ? b.startMonth : null;
  if (b.startMonth !== undefined && b.startMonth !== null && !startMonth) fail(400, 'Mês da primeira cobrança inválido');
  return { name: str(b.name, 'nome', 1, 60), amountCents, dueDay, note, everyMonths, startMonth };
}

export function registerCostRoutes(api: Router) {
  /** Custos, o que entrou de apoio no mês (com os Pix), a sobra dos meses anteriores e os 6 meses para comparar. */
  api.get('/admin/costs', (req, res) => {
    const [year, month] = parseMonth(req.query.month);
    const start = monthStart(year, month);
    const end = monthStart(year, month + 1);
    const payments = all<{ id: string; amount_cents: number; paid_at: number; username: string | null; display_name: string | null }>(
      `SELECT p.id, p.amount_cents, p.paid_at, u.username, u.display_name FROM payments p LEFT JOIN users u ON u.id = p.user_id
       WHERE p.status = 'paid' AND p.paid_at >= ? AND p.paid_at < ? ORDER BY p.paid_at DESC`,
      start,
      end,
    );
    const history = Array.from({ length: 6 }, (_, i) => {
      const m = month - 5 + i;
      const d = new Date(Date.UTC(year, m, 1));
      return { month: monthKey(d.getUTCFullYear(), d.getUTCMonth()), raisedCents: raisedBetween(monthStart(year, m), monthStart(year, m + 1)) };
    });
    res.json({
      month: monthKey(year, month),
      start,
      end,
      // todos os custos, com charged dizendo se cobram neste mês (quem não cobra fica fora da meta)
      costs: all<CostRow>('SELECT * FROM costs ORDER BY due_day, name').map((c) => ({ ...costJson(c), charged: chargedIn(c, year, month) })),
      raisedCents: payments.reduce((n, p) => n + p.amount_cents, 0),
      carriedCents: carriedInto(start),
      payments: payments.map((p) => ({
        id: p.id,
        amountCents: p.amount_cents,
        paidAt: p.paid_at,
        user: p.username ? { username: p.username, displayName: p.display_name } : null,
      })),
      history,
    });
  });

  api.post('/admin/costs', (req, res) => {
    const c = readCost(req.body);
    const id = randomUUID();
    const now = Date.now();
    run(
      'INSERT INTO costs (id, name, amount_cents, due_day, note, every_months, start_month, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      id, c.name, c.amountCents, c.dueDay, c.note, c.everyMonths, c.startMonth, now, now,
    );
    res.status(201).json(costJson(get<CostRow>('SELECT * FROM costs WHERE id = ?', id)!));
  });

  api.put('/admin/costs/:id', (req, res) => {
    if (!get('SELECT 1 FROM costs WHERE id = ?', req.params.id)) fail(404, 'Custo não encontrado');
    const c = readCost(req.body);
    run(
      'UPDATE costs SET name = ?, amount_cents = ?, due_day = ?, note = ?, every_months = ?, start_month = COALESCE(?, start_month), updated_at = ? WHERE id = ?',
      c.name, c.amountCents, c.dueDay, c.note, c.everyMonths, c.startMonth, Date.now(), req.params.id,
    );
    res.json(costJson(get<CostRow>('SELECT * FROM costs WHERE id = ?', req.params.id)!));
  });

  api.delete('/admin/costs/:id', (req, res) => {
    run('DELETE FROM costs WHERE id = ?', req.params.id);
    res.json({ ok: true });
  });
}
