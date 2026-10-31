// Contratos de Mecenato: as contas do Escudo e da liderança (shared/contracts.ts) e o fluxo de ponta a ponta,
// com o Pix de teste (PAYMENTS_FAKE): apoiar, convidar, aceitar, disputar a liderança, Escudo, rescisão e multa.
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import {
  FINE_FIXED_CENTS,
  SHIELD_MAX_MS,
  SHIELD_RESTORE_MS,
  decideLeader,
  fineCents,
  freshShield,
  settleShield,
  shieldBalance,
  shieldBlocked,
  stopShield,
  type ShieldState,
} from '../../shared/contracts.ts';
import { signUp, startServer, type Client, type TestServer } from './helpers.ts';

const H = 3_600_000;
const COOLDOWN = 2 * H;

/** Liga o Escudo em `at` e desliga `for` depois (já pondo em dia antes, como o servidor faz). */
function use(s: ShieldState, at: number, forMs: number): ShieldState {
  const ready = settleShield(s, at, COOLDOWN).state;
  assert.equal(shieldBlocked(ready, at), null);
  const on = { ...ready, activeSince: at };
  const end = at + forMs;
  const settledAtEnd = settleShield(on, end, COOLDOWN).state;
  return settledAtEnd.activeSince === null ? settledAtEnd : stopShield(settledAtEnd, end, COOLDOWN).state;
}

describe('Escudo (contas)', () => {
  it('começa com 3 h', () => {
    assert.equal(freshShield().balanceMs, SHIELD_MAX_MS);
  });

  it('gasta aos poucos e só começa as 24 h quando zera (exemplo do documento)', () => {
    let s = freshShield();
    s = use(s, 0, H);
    assert.equal(s.balanceMs, 2 * H);
    assert.equal(s.depletedAt, null);
    s = use(s, 10 * H, H);
    assert.equal(s.balanceMs, H);
    assert.equal(s.depletedAt, null);
    s = use(s, 20 * H, H);
    assert.equal(s.balanceMs, 0);
    assert.equal(s.depletedAt, 21 * H, 'a contagem começa no instante exato em que zerou');
    // sem saldo durante as 24 h, mesmo depois do cooldown
    assert.equal(shieldBlocked(settleShield(s, 21 * H + 23 * H, COOLDOWN).state, 44 * H), 'empty');
    // completou 24 h: volta inteiro
    const back = settleShield(s, 21 * H + SHIELD_RESTORE_MS, COOLDOWN).state;
    assert.equal(back.balanceMs, SHIELD_MAX_MS);
    assert.equal(back.depletedAt, null);
  });

  it('esgota sozinho com ele ligado, no instante exato', () => {
    const on = { ...freshShield(), activeSince: 1_000 };
    const { state, events } = settleShield(on, 1_000 + 5 * H, COOLDOWN);
    assert.equal(state.activeSince, null);
    assert.equal(state.balanceMs, 0);
    assert.equal(state.depletedAt, 1_000 + SHIELD_MAX_MS);
    assert.deepEqual(events, [{ type: 'depleted', at: 1_000 + SHIELD_MAX_MS }]);
  });

  it('não tem recarga parcial: 23 h depois de zerar continua em zero', () => {
    const s: ShieldState = { balanceMs: 0, activeSince: null, depletedAt: 0, cooldownUntil: null };
    assert.equal(settleShield(s, SHIELD_RESTORE_MS - 1, COOLDOWN).state.balanceMs, 0);
  });

  it('restaurar é idempotente: o mesmo ciclo rende uma restauração só', () => {
    const s: ShieldState = { balanceMs: 0, activeSince: null, depletedAt: 0, cooldownUntil: null };
    const first = settleShield(s, SHIELD_RESTORE_MS + 5, COOLDOWN);
    assert.equal(first.events.length, 1);
    const again = settleShield(first.state, SHIELD_RESTORE_MS + 10, COOLDOWN);
    assert.equal(again.events.length, 0);
    assert.equal(again.state.balanceMs, SHIELD_MAX_MS);
  });

  it('o saldo nunca passa de 3 h', () => {
    const s: ShieldState = { balanceMs: 10 * H, activeSince: null, depletedAt: null, cooldownUntil: null };
    assert.equal(settleShield(s, 0, COOLDOWN).state.balanceMs, SHIELD_MAX_MS);
  });

  it('cooldown separado do saldo: bloqueia religar, mas não começa as 24 h (exemplo do documento)', () => {
    const s = use(freshShield(), 0, H);
    assert.equal(s.balanceMs, 2 * H);
    assert.equal(s.cooldownUntil, H + COOLDOWN);
    assert.equal(shieldBlocked(s, H + COOLDOWN - 1), 'cooldown');
    assert.equal(shieldBlocked(s, H + COOLDOWN), null);
    assert.equal(s.depletedAt, null);
  });

  it('saldo em tempo real com ele ligado', () => {
    assert.equal(shieldBalance({ ...freshShield(), activeSince: 0 }, H), 2 * H);
  });
});

describe('liderança e multa (contas)', () => {
  it('quem tem mais apoio manda; no empate fica quem já era', () => {
    assert.deepEqual(decideLeader({ a: 'a', aCents: 500, b: 'b', bCents: 300, leaderId: null, tieClause: false }).holders, ['a']);
    assert.deepEqual(decideLeader({ a: 'a', aCents: 500, b: 'b', bCents: 600, leaderId: 'a', tieClause: false }).holders, ['b']);
    assert.deepEqual(decideLeader({ a: 'a', aCents: 500, b: 'b', bCents: 500, leaderId: 'b', tieClause: false }).holders, ['b']);
  });

  it('empate sem líder e sem cláusula: ninguém; com a cláusula: os dois', () => {
    assert.deepEqual(decideLeader({ a: 'a', aCents: 300, b: 'b', bCents: 300, leaderId: null, tieClause: false }).holders, []);
    assert.deepEqual(decideLeader({ a: 'a', aCents: 300, b: 'b', bCents: 300, leaderId: 'a', tieClause: true }).holders, ['a', 'b']);
  });

  it('multa = R$ 25 + 10% do apoiado durante o contrato', () => {
    assert.equal(fineCents(0), FINE_FIXED_CENTS);
    assert.equal(fineCents(2_000), 2_700);
    assert.equal(fineCents(30_000), 5_500);
    assert.equal(fineCents(1), 2_501, 'arredonda para cima no centavo');
  });
});

// ------------------------------------------------------------------ de ponta a ponta

let server: TestServer;
before(async () => {
  server = await startServer({ PAYMENTS_FAKE: 'true' });
});
after(() => server.stop());

/** Apoia pelo Pix de teste (gera o QR e "paga"). */
async function support(c: Client, amountCents: number) {
  const pix = await c.post('/support/pix', { amountCents });
  assert.equal(pix.status, 200, JSON.stringify(pix.body));
  const paid = await c.post(`/support/pix/${pix.body.id}/simulate`);
  assert.equal(paid.body.status, 'paid');
}

const terms = { durationDays: 7, cooldownHours: 1, tieClause: false, acceptTerms: true };

describe('contratos (API)', () => {
  it('só quem apoiou propõe; o convidado só aceita depois de apoiar', async () => {
    const a = await signUp(server, 'mec_a');
    const b = await signUp(server, 'mec_b');
    assert.equal((await a.post('/contracts', { ...terms, username: b.username })).status, 403);
    await support(a, 500);
    assert.equal((await a.post('/contracts', { ...terms, username: b.username, acceptTerms: false })).status, 400);
    assert.equal((await a.post('/contracts', { ...terms, username: b.username, durationDays: 31 })).status, 400);
    const created = await a.post('/contracts', { ...terms, username: b.username });
    assert.equal(created.status, 200, JSON.stringify(created.body));
    assert.equal(created.body.status, 'pending');
    // convite não dá poder nenhum
    assert.deepEqual(created.body.holders, []);
    assert.equal((await b.post(`/contracts/${created.body.id}/accept`, { acceptTerms: true })).status, 402);
    await support(b, 300);
    const accepted = await b.post(`/contracts/${created.body.id}/accept`, { acceptTerms: true });
    assert.equal(accepted.status, 200, JSON.stringify(accepted.body));
    assert.equal(accepted.body.status, 'active');
    // o apoio de antes não conta: começa no 0 a 0, sem Mecenas
    assert.deepEqual(accepted.body.totals, { [a.id]: 0, [b.id]: 0 });
    assert.equal(accepted.body.leaderId, null);
    assert.deepEqual(accepted.body.holders, []);
  });

  it('um contrato por pessoa, contando convites em aberto', async () => {
    const a = await signUp(server, 'um_a');
    const b = await signUp(server, 'um_b');
    const c = await signUp(server, 'um_c');
    await support(a, 300);
    await support(c, 300);
    assert.equal((await a.post('/contracts', { ...terms, username: b.username })).status, 200);
    assert.equal((await c.post('/contracts', { ...terms, username: b.username })).status, 409, 'b já tem convite');
    assert.equal((await c.post('/contracts', { ...terms, username: a.username })).status, 409, 'a já tem convite');
    assert.equal((await a.post('/contracts', { ...terms, username: c.username })).status, 409, 'a não manda dois');
    // recusar libera as duas pessoas
    const id = (await b.get('/contracts/me')).body.current.id;
    assert.equal((await b.post(`/contracts/${id}/decline`)).status, 200);
    assert.equal((await c.post('/contracts', { ...terms, username: b.username })).status, 200);
  });

  it('liderança vira com o apoio, poderes e Escudo valem, e a rescisão gera a multa certa', async () => {
    const a = await signUp(server, 'lid_a');
    const b = await signUp(server, 'lid_b');
    await support(a, 500);
    await support(b, 300);
    // os dois num servidor em comum, para o apelido
    const srv = await a.post('/servers', { name: 'Mecenato' });
    const invite = await a.post(`/servers/${srv.body.id}/invites`, {});
    assert.equal((await b.post(`/invites/${invite.body.code}`)).status, 200);

    const id = (await a.post('/contracts', { ...terms, username: b.username })).body.id;
    assert.equal((await b.post(`/contracts/${id}/accept`, { acceptTerms: true })).status, 200);
    const nick = (c: Client, nickname: string) => c.post(`/contracts/${id}/powers`, { power: 'nickname', serverId: srv.body.id, nickname });

    // 0 a 0 no começo (o R$ 5 de a antes do contrato não conta): ninguém manda
    assert.equal((await nick(a, 'capacho')).status, 403);
    assert.equal((await nick(b, 'chefe')).status, 403);

    // a apoia primeiro: manda; b não pode, a pode
    await support(a, 400);
    assert.equal((await nick(b, 'chefe')).status, 403);
    assert.equal((await nick(a, 'capacho')).status, 200);
    // selo público
    assert.equal((await b.get(`/users/${a.id}/profile`)).body.user.mecenas, true);
    assert.equal((await a.get(`/users/${b.id}/profile`)).body.user.mecenasBy, a.username);

    // b apoia mais durante o contrato (500 > 400, mesmo com menos no total: R$ 8 contra R$ 9): vira o Mecenas
    await support(b, 500);
    const now = (await a.get('/contracts/me')).body.current;
    assert.equal(now.leaderId, b.id);
    assert.deepEqual(now.totals, { [a.id]: 400, [b.id]: 500 });
    assert.equal(now.contributedCents, 900);
    assert.equal((await nick(a, 'chefe')).status, 403);
    assert.equal((await nick(b, 'ex-chefe')).status, 200);

    // Escudo de a bloqueia o poder de b
    const shield = await a.post('/contracts/shield', { on: true });
    assert.equal(shield.status, 200);
    assert.equal(shield.body.active, true);
    assert.equal((await nick(b, 'de novo')).status, 409);
    // desligou: entra no intervalo (não religa) e o saldo caiu um pouco
    const off = await a.post('/contracts/shield', { on: false });
    assert.equal(off.body.active, false);
    assert.ok(off.body.cooldownUntil > Date.now());
    assert.equal((await a.post('/contracts/shield', { on: true })).status, 409);
    assert.equal((await nick(b, 'de novo')).status, 200);

    // o histórico mostra as ações para os dois
    const events = (await a.get(`/contracts/${id}`)).body.events as { type: string }[];
    assert.ok(events.some((e) => e.type === 'leader_changed'));
    assert.ok(events.some((e) => e.type === 'power'));

    // rescisão: precisa confirmar o valor; R$ 25 + 10% de R$ 9 (só o que entrou durante o contrato)
    assert.equal(now.fineEstimateCents, 2_590);
    assert.equal((await a.post(`/contracts/${id}/rescind`, { confirmCents: 100 })).status, 409);
    const rescinded = await a.post(`/contracts/${id}/rescind`, { confirmCents: 2_590 });
    assert.equal(rescinded.status, 200, JSON.stringify(rescinded.body));
    assert.equal(rescinded.body.fine.amountCents, 2_590);
    assert.equal((await a.get('/contracts/me')).body.current, null);
    assert.equal((await b.get(`/users/${a.id}/profile`)).body.user.mecenasBy, undefined);

    // multa em aberto: a não entra em outro contrato; b (que não rescindiu) entra
    const c = await signUp(server, 'lid_c');
    assert.equal((await a.post('/contracts', { ...terms, username: c.username })).status, 409);

    // paga a multa pelo Pix de teste: não soma no total de apoio
    const before = (await a.get('/me')).body.supportTotal;
    const pix = await a.post(`/contracts/fines/${rescinded.body.fine.id}/pix`);
    assert.equal(pix.status, 200);
    assert.equal(pix.body.amountCents, 2_590);
    await a.post(`/support/pix/${pix.body.id}/simulate`);
    assert.equal((await a.get('/me')).body.supportTotal, before);
    assert.equal((await a.get('/contracts/me')).body.fines[0].status, 'paid');
    assert.equal((await a.post('/contracts', { ...terms, username: c.username })).status, 200);
  });

  it('sair por segurança não gera multa e vai para revisão', async () => {
    const a = await signUp(server, 'seg_a');
    const b = await signUp(server, 'seg_b');
    await support(a, 300);
    await support(b, 300);
    const id = (await a.post('/contracts', { ...terms, username: b.username })).body.id;
    await b.post(`/contracts/${id}/accept`, { acceptTerms: true });
    assert.equal((await b.post(`/contracts/${id}/safety-end`, { note: 'passou do ponto' })).status, 200);
    const me = (await b.get('/contracts/me')).body;
    assert.equal(me.current, null);
    assert.equal(me.fines.length, 0);
    assert.equal(me.history[0].endReason, 'safety');
  });

  it('quem não participa não vê nem mexe no contrato', async () => {
    const a = await signUp(server, 'priv_a');
    const b = await signUp(server, 'priv_b');
    const x = await signUp(server, 'priv_x');
    await support(a, 300);
    const id = (await a.post('/contracts', { ...terms, username: b.username })).body.id;
    assert.equal((await x.get(`/contracts/${id}`)).status, 404);
    assert.equal((await x.post(`/contracts/${id}/accept`, { acceptTerms: true })).status, 404);
    assert.equal((await x.get('/admin/contracts')).status, 404);
  });
});
