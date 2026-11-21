// Sala AFK: só quem gerencia o servidor configura, o tempo vai de 10 min a 2 h, na sala AFK ninguém fala nem transmite,
// e apagar a sala desliga a função.
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { P, has } from '../../shared/permissions.ts';
import { signUp, startServer, type TestServer } from './helpers.ts';

let server: TestServer;
before(async () => {
  server = await startServer();
});
after(async () => {
  await server.stop();
});

async function scene() {
  const dono = await signUp(server, 'afk_dono');
  const serverId = (await dono.post('/servers', { name: 'Com AFK' })).body.id as string;
  const afk = (await dono.post(`/servers/${serverId}/channels`, { name: 'AFK', type: 'voice' })).body.id as string;
  const texto = (await dono.get(`/servers/${serverId}`)).body.channels.find((c: { type: string }) => c.type === 'text').id as string;
  const code = (await dono.post(`/servers/${serverId}/invites`, {})).body.code as string;
  const membro = await signUp(server, 'afk_membro');
  assert.equal((await membro.post(`/invites/${code}`)).status, 200);
  return { dono, membro, serverId, afk, texto };
}

describe('sala AFK', () => {
  it('só quem gerencia configura; a sala tem que ser de voz e o tempo de 10 a 120 min', async () => {
    const { dono, membro, serverId, afk, texto } = await scene();
    assert.equal((await membro.patch(`/servers/${serverId}`, { afkChannelId: afk })).status, 403);
    assert.equal((await dono.patch(`/servers/${serverId}`, { afkChannelId: texto })).status, 400, 'canal de texto');
    assert.equal((await dono.patch(`/servers/${serverId}`, { afkTimeout: 5 })).status, 400, 'menos de 10 min');
    assert.equal((await dono.patch(`/servers/${serverId}`, { afkTimeout: 121 })).status, 400, 'mais de 2 h');
    const ok = await dono.patch(`/servers/${serverId}`, { afkChannelId: afk, afkTimeout: 10 });
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    assert.equal(ok.body.afkChannelId, afk);
    assert.equal(ok.body.afkTimeout, 10);
    const off = await dono.patch(`/servers/${serverId}`, { afkChannelId: null });
    assert.equal(off.body.afkChannelId, null);
  });

  it('na sala AFK ninguém fala nem transmite, nem o dono; nas outras salas, tudo normal', async () => {
    const { dono, membro, serverId, afk } = await scene();
    const outra = (await dono.post(`/servers/${serverId}/channels`, { name: 'Papo', type: 'voice' })).body.id as string;
    await dono.patch(`/servers/${serverId}`, { afkChannelId: afk });
    for (const c of [membro, dono]) {
      const channels = (await c.get(`/servers/${serverId}`)).body.channels as { id: string; permissions: number }[];
      const inAfk = channels.find((ch) => ch.id === afk)!.permissions;
      const inOther = channels.find((ch) => ch.id === outra)!.permissions;
      assert.equal(has(inAfk, P.CONNECT), true, 'entra na AFK');
      assert.equal(has(inAfk, P.SPEAK), false, 'sem microfone na AFK');
      assert.equal(has(inAfk, P.STREAM), false, 'sem transmitir na AFK');
      assert.equal(has(inOther, P.SPEAK), true, 'fala nas outras');
    }
  });

  it('apagar a sala AFK desliga a função', async () => {
    const { dono, serverId, afk } = await scene();
    await dono.patch(`/servers/${serverId}`, { afkChannelId: afk });
    assert.equal((await dono.del(`/channels/${afk}`)).status, 200);
    assert.equal((await dono.get(`/servers/${serverId}`)).body.server.afkChannelId, null);
  });
});
