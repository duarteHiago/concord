// Servidor da comunidade: com COMMUNITY_INVITE, quem cria conta já entra nele (e o app abre esse servidor).
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { signUp, startServer, type TestServer } from './helpers.ts';

describe('conta nova entra no servidor da comunidade', () => {
  const dir = mkdtempSync(join(tmpdir(), 'concord-community-'));
  const DB_PATH = join(dir, 'concord.db');
  let server: TestServer;
  let communityId = '';
  let code = '';
  before(async () => {
    // o convite precisa existir antes de o servidor ler COMMUNITY_INVITE
    const first = await startServer({ DB_PATH });
    const dono = await signUp(first, 'dono');
    communityId = (await dono.post('/servers', { name: 'Comunidade Concord' })).body.id as string;
    code = (await dono.post(`/servers/${communityId}/invites`, {})).body.code as string;
    await first.stop();
    server = await startServer({ DB_PATH, COMMUNITY_INVITE: `https://concord.test/invite/${code}` });
  });
  after(async () => {
    await server.stop();
    rmSync(dir, { recursive: true, force: true });
  });

  it('já começa membro dela (e é o único servidor da lista)', async () => {
    const novo = await signUp(server, 'novato');
    const servers = (await novo.get('/servers')).body as { id: string }[];
    assert.deepEqual(
      servers.map((s) => s.id),
      [communityId],
    );
  });
});
