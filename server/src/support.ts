// Apoio voluntário por Pix. A pessoa escolhe quanto quer dar, paga pelo QR e ganha o patch de apoiador;
// o acabamento do patch sobe conforme o total apoiado (shared/supporter.ts).
//
// O dinheiro cai na conta do Mercado Pago de quem administra o Concord. Quem confirma o pagamento é
// sempre a API do Mercado Pago: o webhook só avisa "olhe o pagamento X" (e é validado pela assinatura),
// e a consulta de status também serve de reserva caso o webhook não chegue.
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import type { Request, Response, Router } from 'express';
import {
  SUPPORTER_TIERS,
  SUPPORT_MAX_CENTS,
  SUPPORT_MIN_CENTS,
  SUPPORT_PIX_TTL_MS,
  SUPPORT_PRESETS,
  isSupporterTier,
  topTier,
  unlockedTiers,
  type SupporterTier,
} from '../../shared/supporter.ts';
import { config } from './config.ts';
import { all, get, run, tx, type PaymentRow, type UserRow } from './db.ts';
import { fail, humansOnly, int, uid } from './http.ts';

const now = () => Date.now();

// ------------------------------------------------------------------ provedores

type RemoteStatus = 'pending' | 'paid' | 'expired' | 'refunded';

interface PixCharge {
  providerId: string;
  qrCode: string;
  qrBase64: string | null;
}

interface Provider {
  name: 'mercadopago' | 'fake';
  create(p: { id: string; amountCents: number; email: string; description: string }): Promise<PixCharge>;
  status(providerId: string): Promise<{ status: RemoteStatus; amountCents: number; reference: string | null }>;
}

const MP_API = 'https://api.mercadopago.com/v1/payments';

const mercadoPago: Provider = {
  name: 'mercadopago',
  async create({ id, amountCents, email, description }) {
    const res = await fetch(MP_API, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.payments.mpAccessToken}`,
        'Content-Type': 'application/json',
        // repetir o pedido não cria uma segunda cobrança
        'X-Idempotency-Key': id,
      },
      body: JSON.stringify({
        transaction_amount: amountCents / 100,
        payment_method_id: 'pix',
        description,
        external_reference: id,
        notification_url: config.publicUrl ? `${config.publicUrl}/api/support/webhook/mercadopago` : undefined,
        date_of_expiration: new Date(now() + SUPPORT_PIX_TTL_MS).toISOString().replace('Z', '+00:00'),
        payer: { email },
      }),
    });
    const body = (await res.json().catch(() => ({}))) as {
      id?: number;
      message?: string;
      point_of_interaction?: { transaction_data?: { qr_code?: string; qr_code_base64?: string } };
    };
    const data = body.point_of_interaction?.transaction_data;
    if (!res.ok || !body.id || !data?.qr_code) {
      console.error('[apoio] Mercado Pago recusou a cobrança:', res.status, body.message ?? '');
      return fail(502, 'Não foi possível gerar o Pix agora. Tente de novo em instantes.');
    }
    return { providerId: String(body.id), qrCode: data.qr_code, qrBase64: data.qr_code_base64 ?? null };
  },
  async status(providerId) {
    const res = await fetch(`${MP_API}/${encodeURIComponent(providerId)}`, {
      headers: { Authorization: `Bearer ${config.payments.mpAccessToken}` },
    });
    if (!res.ok) throw new Error(`Mercado Pago respondeu ${res.status}`);
    const p = (await res.json()) as { status?: string; transaction_amount?: number; external_reference?: string };
    const map: Record<string, RemoteStatus> = {
      approved: 'paid',
      pending: 'pending',
      in_process: 'pending',
      authorized: 'pending',
      cancelled: 'expired',
      rejected: 'expired',
      refunded: 'refunded',
      charged_back: 'refunded',
    };
    return {
      status: map[p.status ?? ''] ?? 'pending',
      amountCents: Math.round((p.transaction_amount ?? 0) * 100),
      reference: p.external_reference ?? null,
    };
  },
};

// Teste local (PAYMENTS_FAKE=true fora de produção): fica "pendente" até alguém apertar "simular pagamento".
const fakePaid = new Set<string>();
const fake: Provider = {
  name: 'fake',
  async create({ id }) {
    return { providerId: `fake-${id}`, qrCode: `00020126580014BR.GOV.BCB.PIX-TESTE-CONCORD-${id.slice(0, 8)}`, qrBase64: null };
  },
  async status(providerId) {
    const p = get<PaymentRow>('SELECT * FROM payments WHERE provider_id = ?', providerId);
    return { status: fakePaid.has(providerId) ? 'paid' : 'pending', amountCents: p?.amount_cents ?? 0, reference: p?.id ?? null };
  },
};

const provider = (): Provider | null => (config.payments.fake ? fake : config.payments.mpAccessToken ? mercadoPago : null);

// ------------------------------------------------------------------ patch de apoiador

interface StyleWithSupporter {
  supporter?: { tier: SupporterTier | null; since: number };
  [k: string]: unknown;
}

const readStyle = (raw: string | null | undefined): StyleWithSupporter => {
  try {
    const v = JSON.parse(raw || '{}');
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
};

/** O acabamento que aparece no perfil (null: não apoiou ou escolheu esconder). Só o servidor grava isso. */
export function supporterJson(profileStyle: string | null | undefined): { tier: SupporterTier } | null {
  const s = readStyle(profileStyle).supporter;
  return s && isSupporterTier(s.tier) ? { tier: s.tier } : null;
}

/** Hooks do api.ts: avisar a própria pessoa (me:updated) e os servidores dela (perfil mudou). */
let hooks: { meUpdated: (userId: string) => void; profileChanged: (userId: string) => void } = {
  meUpdated: () => {},
  profileChanged: () => {},
};
export const setSupportHooks = (h: typeof hooks) => {
  hooks = h;
};

/** Quem mais quer saber de um Pix confirmado ou devolvido (os contratos de Mecenato, ver contracts.ts). */
type PaymentListener = (p: PaymentRow, status: 'paid' | 'refunded') => void;
const listeners: PaymentListener[] = [];
export const onPayment = (fn: PaymentListener) => {
  listeners.push(fn);
};
const notify = (p: PaymentRow, status: 'paid' | 'refunded') => {
  for (const fn of listeners) {
    try {
      fn(p, status);
    } catch (err) {
      console.error('[apoio] falha ao avisar do pagamento', p.id, err);
    }
  }
};

/** Pagamento confirmado: soma no total e, se a pessoa estava mostrando o melhor acabamento, sobe para o novo. */
function markPaid(p: PaymentRow, amountCents: number) {
  if (p.kind === 'fine') return markFinePaid(p, amountCents);
  const done = tx(() => {
    const fresh = get<PaymentRow>('SELECT * FROM payments WHERE id = ?', p.id)!;
    if (fresh.status === 'paid') return false; // webhook repetido
    run("UPDATE payments SET status = 'paid', paid_at = ?, amount_cents = ? WHERE id = ?", now(), amountCents, p.id);
    const user = get<UserRow>('SELECT * FROM users WHERE id = ?', p.user_id)!;
    const before = user.support_total_cents ?? 0;
    const total = before + amountCents;
    const style = readStyle(user.profile_style);
    const shown = style.supporter?.tier;
    // primeira vez, ou mostrando o melhor que tinha: passa a mostrar o melhor novo. Quem escolheu outro
    // acabamento (ou esconder) continua com a escolha.
    const keep = style.supporter && shown !== topTier(before);
    style.supporter = { tier: keep ? (shown ?? null) : topTier(total), since: style.supporter?.since ?? now() };
    run('UPDATE users SET support_total_cents = ?, profile_style = ? WHERE id = ?', total, JSON.stringify(style), p.user_id);
    return true;
  });
  if (done) {
    console.log(`[apoio] pagamento ${p.id} confirmado: R$ ${(amountCents / 100).toFixed(2)}`);
    hooks.meUpdated(p.user_id);
    hooks.profileChanged(p.user_id);
    notify(get<PaymentRow>('SELECT * FROM payments WHERE id = ?', p.id)!, 'paid');
  }
}

/** Multa paga: não soma no total de apoio (pagar multa não dá patch nem vantagem no contrato). */
function markFinePaid(p: PaymentRow, amountCents: number) {
  const done = tx(() => {
    const fresh = get<PaymentRow>('SELECT * FROM payments WHERE id = ?', p.id)!;
    if (fresh.status === 'paid') return false;
    run("UPDATE payments SET status = 'paid', paid_at = ?, amount_cents = ? WHERE id = ?", now(), amountCents, p.id);
    return true;
  });
  if (done) {
    console.log(`[apoio] multa ${p.fine_id} paga pelo pagamento ${p.id}`);
    notify(get<PaymentRow>('SELECT * FROM payments WHERE id = ?', p.id)!, 'paid');
  }
}

/** Devolução (MED do Pix, estorno): tira do total. */
function markRefunded(p: PaymentRow) {
  if (p.kind === 'fine') {
    const wasPaid = get<PaymentRow>('SELECT * FROM payments WHERE id = ?', p.id)!.status === 'paid';
    run("UPDATE payments SET status = 'refunded' WHERE id = ?", p.id);
    if (wasPaid) notify(get<PaymentRow>('SELECT * FROM payments WHERE id = ?', p.id)!, 'refunded');
    return;
  }
  const done = tx(() => {
    const fresh = get<PaymentRow>('SELECT * FROM payments WHERE id = ?', p.id)!;
    if (fresh.status !== 'paid') {
      run("UPDATE payments SET status = 'refunded' WHERE id = ?", p.id);
      return false;
    }
    run("UPDATE payments SET status = 'refunded' WHERE id = ?", p.id);
    const user = get<UserRow>('SELECT * FROM users WHERE id = ?', p.user_id)!;
    const total = Math.max(0, (user.support_total_cents ?? 0) - fresh.amount_cents);
    const style = readStyle(user.profile_style);
    if (style.supporter) {
      const unlocked = unlockedTiers(total);
      if (!unlocked.length) delete style.supporter;
      else if (style.supporter.tier && !unlocked.includes(style.supporter.tier)) style.supporter.tier = topTier(total);
    }
    run('UPDATE users SET support_total_cents = ?, profile_style = ? WHERE id = ?', total, JSON.stringify(style), p.user_id);
    return true;
  });
  if (done) {
    hooks.meUpdated(p.user_id);
    hooks.profileChanged(p.user_id);
    notify(get<PaymentRow>('SELECT * FROM payments WHERE id = ?', p.id)!, 'refunded');
  }
}

/** Confere o pagamento na API do provedor e aplica o resultado. */
async function refresh(p: PaymentRow): Promise<PaymentRow> {
  const prov = provider();
  if (!prov || prov.name !== p.provider || !p.provider_id) return p;
  run('UPDATE payments SET checked_at = ? WHERE id = ?', now(), p.id);
  const remote = await prov.status(p.provider_id);
  if (remote.reference && remote.reference !== p.id) return p; // não é este pagamento
  if (remote.status === 'paid' && p.status !== 'paid') {
    // pagou menos que o combinado (não deveria acontecer com Pix dinâmico): não libera
    if (remote.amountCents < p.amount_cents) console.warn(`[apoio] pagamento ${p.id} veio com valor menor: ${remote.amountCents}`);
    else markPaid(p, remote.amountCents);
  } else if (remote.status === 'refunded' && p.status !== 'refunded') {
    markRefunded(p);
  } else if (remote.status === 'expired' && p.status === 'pending') {
    run("UPDATE payments SET status = 'expired' WHERE id = ?", p.id);
  }
  return get<PaymentRow>('SELECT * FROM payments WHERE id = ?', p.id)!;
}

const paymentJson = (p: PaymentRow) => ({
  id: p.id,
  amountCents: p.amount_cents,
  status: p.status === 'pending' && p.expires_at < now() ? 'expired' : p.status,
  qrCode: p.status === 'pending' ? p.qr_code : null,
  qrBase64: p.status === 'pending' ? p.qr_base64 : null,
  expiresAt: p.expires_at,
  test: p.provider === 'fake',
  kind: p.kind,
});

// ------------------------------------------------------------------ rotas

/** Mercado Pago: x-signature = "ts=...,v1=..."; assina "id:<data.id>;request-id:<x-request-id>;ts:<ts>;". */
function validMercadoPagoSignature(req: Request, dataId: string): boolean {
  const secret = config.payments.mpWebhookSecret;
  if (!secret) return true; // sem segredo configurado: a consulta na API continua sendo a confirmação
  const header = String(req.headers['x-signature'] ?? '');
  const parts = Object.fromEntries(header.split(',').map((kv) => kv.trim().split('=') as [string, string]));
  if (!parts.ts || !parts.v1) return false;
  const manifest = `id:${dataId};request-id:${req.headers['x-request-id'] ?? ''};ts:${parts.ts};`;
  const expected = createHmac('sha256', secret).update(manifest).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(parts.v1);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Antes do requireAuth: quem chama é o Mercado Pago. */
export function registerSupportWebhook(api: Router) {
  api.post('/support/webhook/mercadopago', async (req: Request, res: Response) => {
    // o id vem na query (data.id) e no corpo; ids alfanuméricos são assinados em minúsculas
    const raw = String(req.query['data.id'] ?? (req.body as { data?: { id?: unknown } })?.data?.id ?? '');
    const dataId = /^[a-z0-9]+$/i.test(raw) ? raw.toLowerCase() : raw;
    if (!dataId || provider()?.name !== 'mercadopago') return res.status(200).end();
    if (!validMercadoPagoSignature(req, dataId)) return res.status(401).end();
    // responde logo (o Mercado Pago reenvia se demorar) e confere em seguida
    res.status(200).end();
    const p = get<PaymentRow>("SELECT * FROM payments WHERE provider = 'mercadopago' AND provider_id = ?", raw);
    if (p) await refresh(p).catch((err) => console.error('[apoio] falha ao conferir pagamento', p.id, err));
  });
}

/**
 * Gera (ou reaproveita) um QR do Pix. Sem `fineId` é apoio; com, é o pagamento da multa de um contrato
 * (ver contracts.ts), que tem descrição própria e não soma no total de apoio.
 */
export async function createPix(me: string, amountCents: number, fineId: string | null = null) {
  const prov = provider() ?? fail(503, 'O Pix ainda não está disponível.');
  const kind = fineId ? 'fine' : 'support';
  // QR em aberto e ainda válido com o mesmo valor: reaproveita (clique duplo, reabrir a janela)
  const open = get<PaymentRow>(
    "SELECT * FROM payments WHERE user_id = ? AND status = 'pending' AND amount_cents = ? AND kind = ? AND fine_id IS ? AND expires_at > ? ORDER BY created_at DESC LIMIT 1",
    me,
    amountCents,
    kind,
    fineId,
    now() + 5 * 60_000,
  );
  if (open && open.provider === prov.name) return paymentJson(open);
  const recent = all('SELECT 1 FROM payments WHERE user_id = ? AND created_at > ?', me, now() - 10 * 60_000).length;
  if (recent >= 6) fail(429, 'Muitos QR codes gerados agora. Espere alguns minutos.');

  const user = get<UserRow>('SELECT * FROM users WHERE id = ?', me)!;
  const id = randomUUID();
  // o Mercado Pago exige um e-mail de quem paga; sem e-mail confirmado na conta, vai um endereço da instalação
  const host = config.publicUrl ? new URL(config.publicUrl).hostname : 'concord.local';
  const email = user.email || `apoio+${me.slice(0, 12)}@${host}`;
  const description = fineId ? 'Multa de rescisão de contrato — Concord' : 'Apoio ao Concord';
  const charge = await prov.create({ id, amountCents, email, description });
  const createdAt = now();
  run(
    'INSERT INTO payments (id, user_id, provider, provider_id, amount_cents, status, qr_code, qr_base64, expires_at, created_at, kind, fine_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    id,
    me,
    prov.name,
    charge.providerId,
    amountCents,
    'pending',
    charge.qrCode,
    charge.qrBase64,
    createdAt + SUPPORT_PIX_TTL_MS,
    createdAt,
    kind,
    fineId,
  );
  return paymentJson(get<PaymentRow>('SELECT * FROM payments WHERE id = ?', id)!);
}

/** Para a landing page (sem login): se o apoio está ligado e os acabamentos. */
export const supportPublicConfig = () => ({ enabled: !!provider(), minCents: SUPPORT_MIN_CENTS, tiers: SUPPORTER_TIERS });

export function registerSupportRoutes(api: Router) {
  /** O que o app precisa para mostrar (ou esconder) o apoio. */
  api.get('/support', (_req, res) => {
    const prov = provider();
    res.json({
      enabled: !!prov,
      test: prov?.name === 'fake',
      minCents: SUPPORT_MIN_CENTS,
      maxCents: SUPPORT_MAX_CENTS,
      presets: SUPPORT_PRESETS,
      tiers: SUPPORTER_TIERS,
    });
  });

  api.post('/support/pix', humansOnly, async (req, res) => {
    const amountCents = int(req.body?.amountCents, 'Valor');
    if (amountCents < SUPPORT_MIN_CENTS || amountCents > SUPPORT_MAX_CENTS) {
      fail(400, `Escolha um valor entre R$ ${SUPPORT_MIN_CENTS / 100} e R$ ${SUPPORT_MAX_CENTS / 100}.`);
    }
    res.json(await createPix(uid(res), amountCents));
  });

  /** A janela do Pix pergunta a cada poucos segundos; de vez em quando confere direto no provedor (se o webhook falhar). */
  api.get('/support/pix/:id', async (req, res) => {
    let p = get<PaymentRow>('SELECT * FROM payments WHERE id = ? AND user_id = ?', req.params.id, uid(res)) ?? fail(404, 'Pagamento não encontrado');
    if (p.status === 'pending' && p.expires_at + 60_000 > now() && (!p.checked_at || now() - p.checked_at > 8_000)) {
      p = await refresh(p).catch(() => p);
    }
    res.json(paymentJson(p));
  });

  /** Só no modo de teste: finge que o Pix foi pago. */
  api.post('/support/pix/:id/simulate', async (req, res) => {
    if (provider()?.name !== 'fake') fail(404, 'Rota não encontrada');
    const p = get<PaymentRow>('SELECT * FROM payments WHERE id = ? AND user_id = ?', req.params.id, uid(res)) ?? fail(404, 'Pagamento não encontrado');
    fakePaid.add(p.provider_id!);
    res.json(paymentJson(await refresh(p)));
  });

  /** Qual acabamento mostrar no perfil (entre os liberados), ou null para esconder o patch. */
  api.patch('/me/supporter', (req, res) => {
    const me = uid(res);
    const tier = req.body?.tier === null ? null : isSupporterTier(req.body?.tier) ? req.body.tier : fail(400, 'Acabamento inválido');
    const user = get<UserRow>('SELECT * FROM users WHERE id = ?', me)!;
    const unlocked = unlockedTiers(user.support_total_cents ?? 0);
    if (!unlocked.length) fail(403, 'O patch de apoiador aparece depois do primeiro apoio.');
    if (tier && !unlocked.includes(tier)) fail(403, 'Esse acabamento ainda não foi liberado.');
    const style = readStyle(user.profile_style);
    style.supporter = { tier, since: style.supporter?.since ?? now() };
    run('UPDATE users SET profile_style = ? WHERE id = ?', JSON.stringify(style), me);
    hooks.meUpdated(me);
    hooks.profileChanged(me);
    res.status(204).end();
  });
}
