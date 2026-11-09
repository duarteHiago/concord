// Mecenato de cortesia (testers sem apoio por Pix) e o modo gravação da equipe.
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { signUp, startServer, type Client, type TestServer } from './helpers.ts';

const dir = mkdtempSync(join(tmpdir(), 'concord-gravacao-'));
const RESERVED = `livre${Date.now().toString(36)}`;
const dbPath = join(dir, 'concord.db');
let server: TestServer;
let admin: Client;
let listed: Client;
let member: Client;
let teamServerId: string;
let teamVoiceId: string;

before(async () => {
  // antes: as contas e o servidor da equipe existem (o nome da equipe fica reservado depois que entra na lista)
  const first = await startServer({ DB_PATH: dbPath });
  admin = await signUp(first, 'diretor');
  listed = await signUp(first, 'lista');
  member = await signUp(first, 'membro');
  teamServerId = (await admin.post('/servers', { name: 'founders' })).body.id;
  const code = (await admin.post(`/servers/${teamServerId}/invites`, {})).body.code;
  await member.post(`/invites/${code}`);
  await first.stop();
  // depois: a equipe, o servidor da equipe e a lista de cortesia na configuração
  server = await startServer({
    DB_PATH: dbPath,
    PAYMENTS_FAKE: 'true',
    ADMIN_USERS: admin.username,
    AUTHORITY_SERVER_ID: teamServerId,
    MECENATO_COURTESY: `@${listed.username}, ${RESERVED}`,
  });
  for (const c of [admin, listed, member]) c.base = server.url;
  const detail = (await admin.get(`/servers/${teamServerId}`)).body;
  teamVoiceId = detail.channels.find((c: { type: string }) => c.type === 'voice').id;
});
after(async () => {
  await server.stop();
  rmSync(dir, { recursive: true, force: true });
});

const terms = { durationDays: 7, cooldownHours: 1, tieClause: false, acceptTerms: true };

describe('Mecenato de cortesia', () => {
  it('nome da lista sem conta fica reservado (ninguém pega o lugar de quem foi liberado)', async () => {
    const res = await fetch(`${server.url}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: RESERVED, password: 'senha-forte-123' }),
    });
    assert.equal(res.status, 409);
  });

  it('quem está na lista propõe sem apoiar; o contrato vem com empate', async () => {
    const friend = await signUp(server, 'amigo');
    assert.equal((await listed.get('/contracts/me')).body.courtesy, true);
    const created = await listed.post('/contracts', { ...terms, username: friend.username });
    assert.equal(created.status, 200, JSON.stringify(created.body));
    assert.equal(created.body.courtesy, true);
    assert.equal(created.body.tieClause, true, 'cortesia liga o empate');
    // quem é convidado também precisa estar liberado (ou ter apoiado)
    assert.equal((await friend.post(`/contracts/${created.body.id}/accept`, { acceptTerms: true })).status, 402);
    await listed.post(`/contracts/${created.body.id}/decline`);
  });

  it('a equipe libera pelo portal; os dois no 0 a 0 têm poder e a rescisão sai sem multa', async () => {
    const a = await signUp(server, 'cort_a');
    const b = await signUp(server, 'cort_b');
    assert.equal((await a.post('/contracts', { ...terms, username: b.username })).status, 403, 'sem apoio e sem cortesia');
    for (const c of [a, b]) {
      const on = await admin.post(`/admin/users/${c.id}/mecenato`, { on: true });
      assert.equal(on.status, 200, JSON.stringify(on.body));
    }
    assert.equal((await a.post(`/admin/users/${b.id}/mecenato`, { on: false })).status, 404, 'só a equipe libera (o portal nem aparece para os outros)');

    const created = await a.post('/contracts', { ...terms, username: b.username });
    assert.equal(created.status, 200, JSON.stringify(created.body));
    const accepted = await b.post(`/contracts/${created.body.id}/accept`, { acceptTerms: true });
    assert.equal(accepted.status, 200, JSON.stringify(accepted.body));
    assert.equal(accepted.body.status, 'active');
    assert.deepEqual([...accepted.body.holders].sort(), [a.id, b.id].sort(), 'empate: os dois têm poder');
    assert.equal(accepted.body.fineEstimateCents, 0);

    const rescind = await a.post(`/contracts/${created.body.id}/rescind`, { confirmCents: 0 });
    assert.equal(rescind.status, 200, JSON.stringify(rescind.body));
    assert.equal(rescind.body.fine, null);

    const detail = await admin.get(`/admin/users/${a.id}`);
    assert.equal(detail.body.mecenatoCourtesy, true);
    assert.ok(detail.body.actions.some((x: { action: string }) => x.action === 'mecenato_on'));
  });
});

describe('modo gravação', () => {
  it('a equipe liga na sala do servidor da equipe; a sala mostra o selo', async () => {
    const memberView = (await member.get(`/servers/${teamServerId}`)).body.channels.find((c: { id: string }) => c.id === teamVoiceId);
    assert.equal(memberView.canRecord, false);
    assert.equal((await admin.get(`/servers/${teamServerId}`)).body.channels.find((c: { id: string }) => c.id === teamVoiceId).canRecord, true);

    assert.equal((await member.post(`/channels/${teamVoiceId}/recording`, { on: true })).status, 403, 'membro comum não liga');
    assert.equal((await admin.post(`/channels/${teamVoiceId}/director`, { userId: member.id, action: 'shake' })).status, 409, 'desligado, nada dispara');

    const on = await admin.post(`/channels/${teamVoiceId}/recording`, { on: true });
    assert.equal(on.status, 200, JSON.stringify(on.body));
    assert.ok(on.body.recording.until > Date.now());
    const seen = (await member.get(`/servers/${teamServerId}`)).body.channels.find((c: { id: string }) => c.id === teamVoiceId);
    assert.ok(seen.recording?.until, 'quem está na sala vê que está gravando');

    // só em quem está na sala, e só ações conhecidas
    const away = await admin.post(`/channels/${teamVoiceId}/director`, { userId: member.id, action: 'shake' });
    assert.equal(away.status, 409);
    assert.match(away.body.error, /não está nesta sala/);
    assert.equal((await member.post(`/channels/${teamVoiceId}/director`, { userId: admin.id, action: 'shake' })).status, 403);

    const off = await admin.post(`/channels/${teamVoiceId}/recording`, { on: false });
    assert.equal(off.body.recording, null);
  });

  it('fora do servidor da equipe não liga, nem para a equipe', async () => {
    const other = (await admin.post('/servers', { name: 'outro' })).body.id;
    const voice = (await admin.get(`/servers/${other}`)).body.channels.find((c: { type: string }) => c.type === 'voice');
    assert.equal(voice.canRecord, false);
    const res = await admin.post(`/channels/${voice.id}/recording`, { on: true });
    assert.equal(res.status, 403);
    assert.match(res.body.error, /servidor da equipe/);
  });
});
