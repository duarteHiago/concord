// Busca de mensagens: varre os canais que a pessoa vê no servidor (texto e chat das salas de voz) ou as conversas
// privadas dela; nunca devolve mensagem de canal escondido nem de DM alheia.
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { signUp, startServer, type TestServer } from './helpers.ts';

let server: TestServer;
before(async () => {
  server = await startServer();
});
after(async () => {
  await server.stop();
});

async function scene() {
  const dono = await signUp(server, 'busca_dono');
  const serverId = (await dono.post('/servers', { name: 'Busca' })).body.id as string;
  const geral = (await dono.get(`/servers/${serverId}`)).body.channels.find((c: { name: string }) => c.name === 'geral').id as string;
  const sala = (await dono.post(`/servers/${serverId}/channels`, { name: 'Sala', type: 'voice' })).body.id as string;
  const secreto = (await dono.post(`/servers/${serverId}/channels`, { name: 'secreto', type: 'text', private: true })).body.id as string;
  const code = (await dono.post(`/servers/${serverId}/invites`, {})).body.code as string;
  const membro = await signUp(server, 'busca_membro');
  assert.equal((await membro.post(`/invites/${code}`)).status, 200);
  return { dono, membro, serverId, geral, sala, secreto };
}

describe('busca de mensagens', () => {
  it('acha nos canais de texto e no chat das salas, com o nome do canal', async () => {
    const { dono, membro, serverId, geral, sala } = await scene();
    assert.equal((await dono.post(`/channels/${geral}/messages`, { content: 'vamos jogar valorant hoje?' })).status, 200);
    assert.equal((await dono.post(`/channels/${sala}/messages`, { content: 'Valorant na sala agora' })).status, 200);
    await dono.post(`/channels/${geral}/messages`, { content: 'outra coisa' });
    const res = await membro.get(`/servers/${serverId}/search?q=valorant`);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const places = res.body.results.map((r: { place: { name: string } }) => r.place.name).sort();
    assert.deepEqual(places, ['Sala', 'geral']);
    assert.equal(res.body.results[0].content, 'Valorant na sala agora', 'a mais nova primeiro');
  });

  it('canal escondido não aparece para quem não vê', async () => {
    const { dono, membro, serverId, secreto } = await scene();
    assert.equal((await dono.post(`/channels/${secreto}/messages`, { content: 'senha do wifi é abacaxi' })).status, 200);
    assert.equal((await membro.get(`/servers/${serverId}/search?q=abacaxi`)).body.results.length, 0);
    assert.equal((await dono.get(`/servers/${serverId}/search?q=abacaxi`)).body.results.length, 1);
  });

  it('quem não é do servidor não busca nele; termo curto e % são tratados', async () => {
    const { dono, serverId, geral } = await scene();
    const fora = await signUp(server, 'busca_fora');
    assert.equal((await fora.get(`/servers/${serverId}/search?q=oi`)).status, 404);
    assert.equal((await dono.get(`/servers/${serverId}/search?q=a`)).status, 400);
    await dono.post(`/channels/${geral}/messages`, { content: 'nada a ver' });
    assert.equal((await dono.get(`/servers/${serverId}/search?q=${encodeURIComponent('%%')}`)).body.results.length, 0, '% não vira curinga');
  });

  it('nas DMs, só as conversas da própria pessoa', async () => {
    // conversa privada só entre quem divide um servidor (ou é amigo)
    const { dono: a, membro: b } = await scene();
    const c = await signUp(server, 'busca_c');
    const dm = (await a.post('/dms', { userId: b.id })).body;
    assert.equal((await a.post(`/dms/${dm.id}/messages`, { content: 'o churrasco é sábado' })).status, 200);
    const mine = await b.get(`/dms/search?q=churrasco`);
    assert.equal(mine.status, 200);
    assert.equal(mine.body.results.length, 1);
    assert.equal(mine.body.results[0].place.kind, 'dm');
    assert.equal((await c.get(`/dms/search?q=churrasco`)).body.results.length, 0);
  });
});
