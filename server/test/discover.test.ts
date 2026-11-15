// Servidores públicos ("Descobrir"): só quem gerencia liga; aparecem na lista e qualquer um entra sem convite;
// banido não vê nem entra; privado não aparece e não aceita entrar sem convite.
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { signUp, startServer, type TestServer } from './helpers.ts';

describe('servidores públicos', () => {
  let server: TestServer;
  before(async () => {
    server = await startServer();
  });
  after(() => server.stop());

  it('privado não aparece nem aceita entrar; público aparece e aceita; banido fica de fora', async () => {
    const [dona, curiosa, banido] = [await signUp(server, 'dona'), await signUp(server, 'curiosa'), await signUp(server, 'banido')];
    const id = (await dona.post('/servers', { name: 'Clube Aberto' })).body.id as string;

    // privado
    assert.equal(((await curiosa.get('/discover')).body as { id: string }[]).some((s) => s.id === id), false);
    assert.equal((await curiosa.post(`/servers/${id}/join`)).status, 404);

    // só quem gerencia torna público
    const code = (await dona.post(`/servers/${id}/invites`, {})).body.code as string;
    assert.equal((await banido.post(`/invites/${code}`)).status, 200);
    assert.equal((await banido.patch(`/servers/${id}`, { public: true })).status, 403);
    assert.equal((await dona.patch(`/servers/${id}`, { public: true, description: '  um clube   para todos  ' })).status, 200);
    assert.equal((await dona.post(`/servers/${id}/bans`, { userId: banido.id })).status, 200);

    // público: aparece (com a descrição limpa) e entra sem convite
    const list = (await curiosa.get('/discover?q=clube')).body as { id: string; description: string; joined: boolean; memberCount: number }[];
    const found = list.find((s) => s.id === id)!;
    assert.equal(found.description, 'um clube para todos');
    assert.equal(found.joined, false);
    assert.equal((await curiosa.post(`/servers/${id}/join`)).status, 200);
    assert.ok(((await curiosa.get('/servers')).body as { id: string }[]).some((s) => s.id === id));
    assert.equal(((await curiosa.get('/discover')).body as { id: string; joined: boolean }[]).find((s) => s.id === id)!.joined, true);

    // banido: não vê e não entra
    assert.equal(((await banido.get('/discover')).body as { id: string }[]).some((s) => s.id === id), false);
    assert.equal((await banido.post(`/servers/${id}/join`)).status, 403);
  });
});
