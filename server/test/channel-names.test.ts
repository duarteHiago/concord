// Nome de canal, sala e categoria: até 100 caracteres, salvo inteiro; acima disso, erro (nunca cortado em silêncio).
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { CHANNEL_NAME_MAX } from '../../shared/channels.ts';
import { signUp, startServer, type TestServer } from './helpers.ts';

let server: TestServer;
before(async () => {
  server = await startServer();
});
after(() => server.stop());

const LONG = 'ASTI - Assessoria de Segurança da Tecnologia da Informação'; // 58 caracteres, o do relato

describe('tamanho do nome de canais', () => {
  it('sala com nome de 58 caracteres é criada e editada com o nome inteiro', async () => {
    const owner = await signUp(server, 'dono');
    const srv = (await owner.post('/servers', { name: 'DCON' })).body.id as string;
    const created = await owner.post(`/servers/${srv}/channels`, { name: LONG, type: 'voice' });
    assert.equal(created.status, 200, JSON.stringify(created.body));
    const nameOf = async (id: string) =>
      ((await owner.get(`/servers/${srv}`)).body as { channels: { id: string; name: string }[] }).channels.find((c) => c.id === id)!.name;
    assert.equal(await nameOf(created.body.id), LONG);
    const renamed = await owner.patch(`/channels/${created.body.id}`, { name: `${LONG} (2)` });
    assert.equal(renamed.status, 200, JSON.stringify(renamed.body));
    assert.equal(await nameOf(created.body.id), `${LONG} (2)`);
  });

  it('acima do limite dá erro, para canal, sala e categoria', async () => {
    const owner = await signUp(server, 'dono');
    const srv = (await owner.post('/servers', { name: 'DCON' })).body.id as string;
    const tooLong = 'a'.repeat(CHANNEL_NAME_MAX + 1);
    assert.equal((await owner.post(`/servers/${srv}/channels`, { name: tooLong, type: 'voice' })).status, 400);
    assert.equal((await owner.post(`/servers/${srv}/channels`, { name: tooLong })).status, 400);
    assert.equal((await owner.post(`/servers/${srv}/categories`, { name: tooLong })).status, 400);
    const exact = await owner.post(`/servers/${srv}/categories`, { name: 'c'.repeat(CHANNEL_NAME_MAX) });
    assert.equal(exact.status, 200, JSON.stringify(exact.body));
  });
});
