// Contratos de Mecenato valem só nos servidores escolhidos por quem propõe (nunca no servidor oficial):
// os poderes param na porta dos outros servidores, e a foto do Mecenas é uma camada só nos escolhidos.
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { signUp, startServer, type Client, type TestServer } from './helpers.ts';

const dir = mkdtempSync(join(tmpdir(), 'concord-scope-'));
const DB_PATH = join(dir, 'concord.db');
const env = { DB_PATH, PAYMENTS_FAKE: 'true' };
let server: TestServer;
let official = '';

// o servidor oficial precisa existir antes de o app saber qual é: cria, reinicia com AUTHORITY_SERVER_ID
before(async () => {
  const first = await startServer(env);
  const staff = await signUp(first, 'equipe');
  official = (await staff.post('/servers', { name: 'Concord oficial' })).body.id;
  await first.stop();
  server = await startServer({ ...env, AUTHORITY_SERVER_ID: official });
});
after(async () => {
  await server.stop();
  rmSync(dir, { recursive: true, force: true });
});

const terms = { durationDays: 7, cooldownHours: 1, tieClause: false, acceptTerms: true };
// PNG 1x1
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

async function support(c: Client, amountCents: number) {
  const pix = await c.post('/support/pix', { amountCents });
  await c.post(`/support/pix/${pix.body.id}/simulate`);
}

async function serverWith(owner: Client, guest: Client, name: string) {
  const id = (await owner.post('/servers', { name })).body.id as string;
  const invite = await owner.post(`/servers/${id}/invites`, {});
  assert.equal((await guest.post(`/invites/${invite.body.code}`)).status, 200);
  return id;
}

describe('servidores do contrato', () => {
  it('pelo menos 1 servidor de quem propõe, e nunca o oficial', async () => {
    const [a, b] = [await signUp(server, 'esc_a'), await signUp(server, 'esc_b')];
    await support(a, 500);
    const mine = (await a.post('/servers', { name: 'Meu' })).body.id;
    const others = (await b.post('/servers', { name: 'Do outro' })).body.id;
    assert.equal((await a.post('/contracts', { ...terms, username: b.username })).status, 400, 'sem servidores');
    assert.equal((await a.post('/contracts', { ...terms, username: b.username, serverIds: [] })).status, 400, 'lista vazia');
    assert.equal((await a.post('/contracts', { ...terms, username: b.username, serverIds: [others] })).status, 400, 'servidor em que não está');
    assert.equal((await a.post('/contracts', { ...terms, username: b.username, serverIds: [official] })).status, 400, 'servidor oficial');
    const ok = await a.post('/contracts', { ...terms, username: b.username, serverIds: [mine, mine] });
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    // quem foi convidado vê a lista escolhida (mesmo sem estar no servidor)
    const seen = (await b.get('/contracts/me')).body.current;
    assert.deepEqual(
      seen.servers.map((s: { id: string; name: string }) => s.name),
      ['Meu'],
    );
  });

  it('os poderes valem nos escolhidos e param nos outros', async () => {
    const [a, b] = [await signUp(server, 'pod_a'), await signUp(server, 'pod_b')];
    const inside = await serverWith(a, b, 'Dentro');
    // fora do contrato, e com dono b (a não tem cargo para moderar lá)
    const outside = await serverWith(b, a, 'Fora');
    await support(b, 500);
    const proposed = await b.post('/contracts', { ...terms, username: a.username, serverIds: [inside] });
    assert.equal(proposed.status, 200, JSON.stringify(proposed.body));
    const id = proposed.body.id;
    await support(a, 500);
    assert.equal((await a.post(`/contracts/${id}/accept`, { acceptTerms: true })).status, 200);
    await support(a, 900); // a passa na frente durante o contrato: a é o Mecenas
    const nick = (sid: string) => a.post(`/contracts/${id}/powers`, { power: 'nickname', serverId: sid, nickname: 'capacho' });
    assert.equal((await nick(inside)).status, 200);
    assert.equal((await nick(outside)).status, 403);
    // pelo mini perfil também: fora do contrato, a é um membro comum sem permissão
    assert.equal((await a.req('PUT', `/servers/${outside}/members/${b.id}/nickname`, { nickname: 'capacho' })).status, 403);
    assert.equal((await a.req('PUT', `/servers/${inside}/members/${b.id}/nickname`, { nickname: 'capacho 2' })).status, 200);
    // a lista de onde dá para usar os poderes só traz os escolhidos
    const mine = (await a.get('/contracts/me')).body.current;
    assert.deepEqual(
      mine.mutualServers.map((s: { id: string }) => s.id),
      [inside],
    );
  });

  it('a foto do Mecenas aparece só nos servidores do contrato; a foto da conta não muda', async () => {
    const [a, b] = [await signUp(server, 'foto_a'), await signUp(server, 'foto_b')];
    const inside = await serverWith(a, b, 'Com foto');
    const outside = await serverWith(a, b, 'Sem foto');
    await support(a, 500);
    const id = (await a.post('/contracts', { ...terms, username: b.username, serverIds: [inside] })).body.id;
    await support(b, 500);
    assert.equal((await b.post(`/contracts/${id}/accept`, { acceptTerms: true })).status, 200);
    await support(a, 900);
    const res = await fetch(`${server.url}/api/contracts/${id}/avatar`, { method: 'POST', headers: { authorization: `Bearer ${a.token}` }, body: PNG });
    assert.equal(res.status, 200, await res.text());

    const avatarIn = async (sid: string) =>
      ((await a.get(`/servers/${sid}`)).body.members as { id: string; avatarUrl: string | null }[]).find((m) => m.id === b.id)!.avatarUrl;
    assert.ok(await avatarIn(inside), 'no servidor do contrato, aparece a foto do Mecenas');
    assert.equal(await avatarIn(outside), null, 'fora, continua a foto da pessoa (nenhuma)');
    assert.equal((await a.get(`/users/${b.id}/profile`)).body.user.avatarUrl, null, 'o perfil mostra a foto da conta');
    // a pessoa pode trocar a própria foto: a do Mecenas segue por cima só no servidor do contrato
    const own = await fetch(`${server.url}/api/me/avatar`, { method: 'POST', headers: { authorization: `Bearer ${b.token}` }, body: PNG });
    assert.equal(own.status, 200);
    const accountAvatar = (await b.get('/me')).body.avatarUrl as string;
    assert.ok(accountAvatar);
    assert.equal(await avatarIn(outside), accountAvatar);
    assert.notEqual(await avatarIn(inside), accountAvatar);
  });
});
