// Gravar a sala: a gravação acontece no aparelho de quem grava; o servidor só libera por servidor
// (RECORDING_SERVERS) e pela permissão RECORD_CALLS, e guarda o aviso de quem está gravando.
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { DEFAULT_EVERYONE, DEFAULT_MODERATOR, P, has } from '../../shared/permissions.ts';
import { signUp, startServer, type TestServer } from './helpers.ts';

describe('gravar a sala: permissão', () => {
  it('vem ligada para moderadores e desligada para o cargo de todos', () => {
    assert.equal(has(DEFAULT_MODERATOR, P.RECORD_CALLS), true);
    assert.equal(has(DEFAULT_EVERYONE, P.RECORD_CALLS), false);
  });
});

describe('gravar a sala: liberada só nos servidores da lista', () => {
  let server: TestServer;
  before(async () => {
    server = await startServer({ RECORDING_SERVERS: 'servidor-que-nao-existe' });
  });
  after(() => server.stop());

  it('servidor fora da lista vem com a gravação desligada', async () => {
    const owner = await signUp(server, 'dono');
    const id = (await owner.post('/servers', { name: 'Fora da lista' })).body.id as string;
    assert.equal((await owner.get(`/servers/${id}`)).body.recording, false);
  });
});

describe('gravar a sala: sem lista, liberada em todos', () => {
  let server: TestServer;
  before(async () => {
    server = await startServer();
  });
  after(() => server.stop());

  it('qualquer servidor vem com a gravação ligada', async () => {
    const owner = await signUp(server, 'dono');
    const id = (await owner.post('/servers', { name: 'Qualquer' })).body.id as string;
    assert.equal((await owner.get(`/servers/${id}`)).body.recording, true);
  });
});
