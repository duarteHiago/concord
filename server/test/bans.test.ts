// Banir do servidor: a pessoa sai, não volta por convite enquanto o ban existir, e só quem pode banir mexe nisso.
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { signUp, startServer, type TestServer } from './helpers.ts';

let server: TestServer;
before(async () => {
  server = await startServer();
});
after(() => server.stop());

async function setup() {
  const owner = await signUp(server, 'dono');
  const serverId = (await owner.post('/servers', { name: 'Servidor' })).body.id as string;
  const code = (await owner.post(`/servers/${serverId}/invites`, {})).body.code as string;
  const join = async (name: string) => {
    const c = await signUp(server, name);
    assert.equal((await c.post(`/invites/${code}`)).status, 200);
    return c;
  };
  return { owner, serverId, code, join };
}

describe('banir do servidor', () => {
  it('quem é banido sai, não volta pelo convite, e volta depois de desbanido', async () => {
    const { owner, serverId, code, join } = await setup();
    const alvo = await join('alvo');

    const ban = await owner.post(`/servers/${serverId}/bans`, { userId: alvo.id, reason: 'spam' });
    assert.equal(ban.status, 200);
    assert.notEqual((await alvo.get(`/servers/${serverId}`)).status, 200, 'não é mais membro');

    const back = await alvo.post(`/invites/${code}`);
    assert.equal(back.status, 403);
    assert.match(back.body.error, /banido/);

    const list = await owner.get(`/servers/${serverId}/bans`);
    assert.equal(list.status, 200);
    assert.equal(list.body.length, 1);
    assert.equal(list.body[0].userId, alvo.id);
    assert.equal(list.body[0].reason, 'spam');

    assert.equal((await owner.req('DELETE', `/servers/${serverId}/bans/${alvo.id}`)).status, 200);
    assert.equal((await alvo.post(`/invites/${code}`)).status, 200, 'desbanido volta');
  });

  it('membro comum não bane, não vê a lista e não desbane', async () => {
    const { owner, serverId, join } = await setup();
    const comum = await join('comum');
    const outro = await join('outro');
    assert.equal((await comum.post(`/servers/${serverId}/bans`, { userId: outro.id })).status, 403);
    assert.equal((await comum.get(`/servers/${serverId}/bans`)).status, 403);
    await owner.post(`/servers/${serverId}/bans`, { userId: outro.id });
    assert.equal((await comum.req('DELETE', `/servers/${serverId}/bans/${outro.id}`)).status, 403);
  });

  it('ninguém bane o dono nem a si mesmo, e não dá para banir duas vezes', async () => {
    const { owner, serverId, join } = await setup();
    const alvo = await join('alvo2');
    assert.equal((await owner.post(`/servers/${serverId}/bans`, { userId: owner.id })).status, 400);
    assert.equal((await owner.post(`/servers/${serverId}/bans`, { userId: alvo.id })).status, 200);
    assert.equal((await owner.post(`/servers/${serverId}/bans`, { userId: alvo.id })).status, 409);
  });

  it('dá para banir quem já saiu (não volta mais)', async () => {
    const { owner, serverId, code, join } = await setup();
    const saiu = await join('saiu');
    assert.equal((await saiu.post(`/servers/${serverId}/leave`)).status, 200);
    assert.equal((await owner.post(`/servers/${serverId}/bans`, { userId: saiu.id })).status, 200);
    assert.equal((await saiu.post(`/invites/${code}`)).status, 403);
  });
});

