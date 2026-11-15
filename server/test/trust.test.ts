// Fator de Confiança: a nota (pesos e regras combinadas), as exigências por servidor e canal e a ligação com as
// denúncias (só a confirmada pela equipe pesa).
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { P, has } from '../../shared/permissions.ts';
import { TRUST_WEIGHTS, computeTrust, meetsRequirement, parseTrustRules, strictest, type TrustSignals } from '../../shared/trust.ts';
import { Client, signUp, startServer, type TestServer } from './helpers.ts';

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 10, 15);
const fresh: TrustSignals = { suspended: false, level: 1, twoFactor: false, createdAt: NOW, confirmedAgainst: [], serverBans: [], helpfulReports: 0 };

describe('nota (funções puras)', () => {
  it('conta nova com e-mail fica na faixa Normal; protegida e antiga chega na Alta', () => {
    const t = computeTrust(fresh, NOW);
    assert.equal(t.score, TRUST_WEIGHTS.base + TRUST_WEIGHTS.level[1]);
    assert.equal(t.band, 'normal');
    const old = computeTrust({ ...fresh, twoFactor: true, createdAt: NOW - 300 * DAY }, NOW);
    assert.equal(old.band, 'high');
  });

  it('a ordem combinada: suspensão > denúncia grave > ban em servidor > denúncia leve', () => {
    const base = computeTrust({ ...fresh, createdAt: NOW - 400 * DAY, twoFactor: true }, NOW).score;
    const grave = base - computeTrust({ ...fresh, createdAt: NOW - 400 * DAY, twoFactor: true, confirmedAgainst: [{ category: 'violence', at: NOW }] }, NOW).score;
    const ban = base - computeTrust({ ...fresh, createdAt: NOW - 400 * DAY, twoFactor: true, serverBans: [NOW] }, NOW).score;
    const leve = base - computeTrust({ ...fresh, createdAt: NOW - 400 * DAY, twoFactor: true, confirmedAgainst: [{ category: 'other', at: NOW }] }, NOW).score;
    assert.ok(grave > ban && ban > leve && leve > 0, `${grave} > ${ban} > ${leve}`);
    assert.equal(computeTrust({ ...fresh, suspended: true, twoFactor: true }, NOW).score, 0);
  });

  it('problema antigo pesa a metade e a nota fica entre 0 e 100', () => {
    const recent = computeTrust({ ...fresh, confirmedAgainst: [{ category: 'spam', at: NOW }] }, NOW).score;
    const old = computeTrust({ ...fresh, confirmedAgainst: [{ category: 'spam', at: NOW - 200 * DAY }] }, NOW).score;
    assert.ok(old > recent);
    assert.equal(computeTrust({ ...fresh, confirmedAgainst: [{ category: 'csam', at: NOW }] }, NOW).score, 0);
  });

  it('exigências: valida o que vem do app e no canal vale a mais exigente', () => {
    assert.deepEqual(parseTrustRules({ speak: { level: 1, band: 'normal' }, stream: { level: 0, band: 'any' } }, false), { speak: { level: 1, band: 'normal' } });
    assert.equal(typeof parseTrustRules({ join: { level: 1, band: 'any' } }, true), 'string', 'canal não tem "entrar"');
    assert.equal(typeof parseTrustRules({ speak: { level: 2, band: 'any' } }, false), 'string', 'telefone ainda não existe');
    assert.equal(typeof parseTrustRules({ speak: { level: 0, band: 'altissima' } }, false), 'string');
    assert.deepEqual(strictest({ level: 1, band: 'any' }, { level: 0, band: 'high' }), { level: 1, band: 'high' });
    assert.equal(meetsRequirement({ level: 1, band: 'normal' }, { level: 0, score: 90 }), false);
    assert.equal(meetsRequirement({ level: 0, band: 'high' }, { level: 1, score: 69 }), false);
    assert.equal(meetsRequirement({ level: 0, band: 'high' }, { level: 1, score: 70 }), true);
  });
});

const dir = mkdtempSync(join(tmpdir(), 'concord-trust-'));
const DB_PATH = join(dir, 'concord.db');
let server: TestServer;
let equipe: Client;

before(async () => {
  const first = await startServer({ DB_PATH });
  const c = new Client(first.url);
  assert.equal((await c.post('/auth/register', { username: 'chefe_confianca', password: 'senha-forte-123' })).status, 200);
  await first.stop();
  server = await startServer({ DB_PATH, ADMIN_USERS: 'chefe_confianca' });
  equipe = new Client(server.url);
  equipe.token = (await equipe.post('/auth/login', { username: 'chefe_confianca', password: 'senha-forte-123' })).body.token;
});
after(async () => {
  await server.stop();
  rmSync(dir, { recursive: true, force: true });
});

async function scene() {
  const dono = await signUp(server, 'dono');
  const serverId = (await dono.post('/servers', { name: 'Servidor' })).body.id as string;
  const geral = (await dono.get(`/servers/${serverId}`)).body.channels.find((c: { name: string }) => c.name === 'geral').id as string;
  const code = (await dono.post(`/servers/${serverId}/invites`, {})).body.code as string;
  const membro = await signUp(server, 'membro');
  assert.equal((await membro.post(`/invites/${code}`)).status, 200);
  return { dono, membro, serverId, geral, code };
}

const channelOf = async (c: Client, serverId: string, channelId: string) =>
  (await c.get(`/servers/${serverId}`)).body.channels.find((ch: { id: string }) => ch.id === channelId);

describe('exigências por servidor e canal', () => {
  it('a pessoa vê a própria faixa, não a nota', async () => {
    const { membro } = await scene();
    const res = await membro.get('/me/trust');
    assert.equal(res.status, 200);
    assert.equal(res.body.band, 'normal');
    assert.equal(res.body.level, 0, 'sem e-mail no teste');
    assert.equal(res.body.score, undefined);
  });

  it('só quem gerencia o servidor muda as exigências', async () => {
    const { membro, serverId } = await scene();
    assert.equal((await membro.put(`/servers/${serverId}/trust-rules`, { rules: { speak: { level: 0, band: 'high' } } })).status, 403);
    assert.equal((await membro.get(`/servers/${serverId}/trust-rules`)).status, 403);
  });

  it('confiança Alta para falar: o membro novo perde "Enviar mensagens", o dono não', async () => {
    const { dono, membro, serverId, geral } = await scene();
    assert.equal((await dono.put(`/servers/${serverId}/trust-rules`, { rules: { speak: { level: 0, band: 'high' } } })).status, 200);
    const ch = await channelOf(membro, serverId, geral);
    assert.equal(has(ch.permissions, P.SEND_MESSAGES), false);
    assert.equal(has(ch.permissions, P.VIEW_CHANNEL), true, 'continua lendo');
    assert.deepEqual(ch.trustBlock.speak, { level: 0, band: 'high' });
    assert.equal((await membro.post(`/channels/${geral}/messages`, { content: 'oi' })).status, 403);
    assert.equal((await dono.post(`/channels/${geral}/messages`, { content: 'oi' })).status, 200);

    // tirar a exigência devolve a permissão
    assert.equal((await dono.put(`/servers/${serverId}/trust-rules`, { rules: {} })).status, 200);
    assert.equal((await membro.post(`/channels/${geral}/messages`, { content: 'oi de novo' })).status, 200);
  });

  it('exigência só num canal: os outros canais seguem livres', async () => {
    const { dono, membro, serverId, geral } = await scene();
    const outro = (await dono.post(`/servers/${serverId}/channels`, { name: 'outro', type: 'text' })).body.id as string;
    assert.ok(outro);
    assert.equal((await dono.put(`/channels/${geral}/trust-rules`, { rules: { speak: { level: 1, band: 'any' } } })).status, 200);
    assert.equal((await membro.post(`/channels/${geral}/messages`, { content: 'oi' })).status, 403);
    assert.equal((await membro.post(`/channels/${outro}/messages`, { content: 'oi' })).status, 200);
    const rules = (await dono.get(`/servers/${serverId}/trust-rules`)).body;
    assert.deepEqual(rules.channels[geral], { speak: { level: 1, band: 'any' } });
    assert.equal((await dono.put(`/channels/${geral}/trust-rules`, { rules: { join: { level: 1, band: 'any' } } })).status, 400);
  });

  it('exigência para entrar: o convite recusa e explica, quem já é membro fica', async () => {
    const { dono, membro, serverId, code } = await scene();
    assert.equal((await dono.put(`/servers/${serverId}/trust-rules`, { rules: { join: { level: 1, band: 'any' } } })).status, 200);
    const novo = await signUp(server, 'novo');
    const res = await novo.post(`/invites/${code}`);
    assert.equal(res.status, 403);
    assert.match(res.body.error, /e-mail confirmado/);
    assert.equal((await membro.get(`/servers/${serverId}`)).status, 200);
  });
});

describe('denúncias e confiança', () => {
  async function reportAndResolve(outcome: 'actioned' | 'dismissed', category?: string) {
    const s = await scene();
    const denunciante = await signUp(server, 'denunciante');
    assert.equal((await denunciante.post(`/invites/${s.code}`)).status, 200);
    const msg = await s.membro.post(`/channels/${s.geral}/messages`, { content: 'mensagem ruim' });
    assert.equal((await denunciante.post('/reports', { kind: 'message', id: msg.body.id, category: 'violence' })).status, 200);
    const item = (await equipe.get('/admin/reports')).body.items.find((r: { target: { id: string } }) => r.target.id === s.membro.id);
    assert.ok(item.target.trust, 'a fila mostra a confiança do denunciado');
    assert.equal((await equipe.post(`/admin/reports/${item.id}/resolve`, { outcome, category })).status, 200);
    return { ...s, denunciante, reportId: item.id as string };
  }

  it('denúncia arquivada não muda nada', async () => {
    const { membro } = await reportAndResolve('dismissed');
    const t = (await equipe.get(`/admin/users/${membro.id}`)).body.trust;
    assert.equal(t.score, TRUST_WEIGHTS.base);
  });

  it('confirmada pela equipe: baixa a do denunciado (pelo motivo confirmado) e sobe a de quem denunciou', async () => {
    const { membro, denunciante, reportId, dono, serverId, geral } = await reportAndResolve('actioned', 'spam');
    const detail = (await equipe.get(`/admin/reports/${reportId}`)).body;
    assert.equal(detail.confirmedCategory, 'spam');
    const alvo = (await equipe.get(`/admin/users/${membro.id}`)).body;
    assert.equal(alvo.trust.score, TRUST_WEIGHTS.base - TRUST_WEIGHTS.confirmed.spam);
    assert.equal(alvo.trust.band, 'low');
    assert.equal(alvo.reports.confirmed, 1);
    const quem = (await equipe.get(`/admin/users/${denunciante.id}`)).body;
    assert.equal(quem.trust.score, TRUST_WEIGHTS.base + TRUST_WEIGHTS.helpfulReport);

    // num servidor que pede confiança Normal para falar, o denunciado não fala mais
    await dono.put(`/servers/${serverId}/trust-rules`, { rules: { speak: { level: 0, band: 'normal' } } });
    assert.equal((await membro.post(`/channels/${geral}/messages`, { content: 'oi' })).status, 403);
    assert.equal((await denunciante.post(`/channels/${geral}/messages`, { content: 'oi' })).status, 200);

    // reabrir desfaz
    assert.equal((await equipe.post(`/admin/reports/${reportId}/reopen`, {})).status, 200);
    assert.equal((await equipe.get(`/admin/users/${membro.id}`)).body.trust.score, TRUST_WEIGHTS.base);
  });

  it('ban em servidor baixa a confiança', async () => {
    const { dono, membro, serverId } = await scene();
    assert.equal((await dono.post(`/servers/${serverId}/bans`, { userId: membro.id })).status, 200);
    const t = (await equipe.get(`/admin/users/${membro.id}`)).body.trust;
    assert.equal(t.score, TRUST_WEIGHTS.base - TRUST_WEIGHTS.serverBan);
  });
});
