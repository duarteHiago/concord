// Denúncias: quem pode denunciar o quê, a prova guardada na hora e o que só a equipe (/admin) vê e faz.
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { Client, signUp, startServer, type TestServer } from './helpers.ts';

const dir = mkdtempSync(join(tmpdir(), 'concord-reports-'));
const DB_PATH = join(dir, 'concord.db');
let server: TestServer;
let equipe: Client;

before(async () => {
  // a conta da equipe precisa existir antes de entrar em ADMIN_USERS (nome da lista sem conta fica reservado)
  const first = await startServer({ DB_PATH });
  const c = new Client(first.url);
  assert.equal((await c.post('/auth/register', { username: 'chefe_equipe', password: 'senha-forte-123' })).status, 200);
  await first.stop();
  server = await startServer({ DB_PATH, ADMIN_USERS: 'chefe_equipe' });
  equipe = new Client(server.url);
  const login = await equipe.post('/auth/login', { username: 'chefe_equipe', password: 'senha-forte-123' });
  equipe.token = login.body.token;
});
after(async () => {
  await server.stop();
  rmSync(dir, { recursive: true, force: true });
});

/** Servidor com um autor, uma pessoa que denuncia (os dois membros) e uma mensagem no #geral. */
async function scene() {
  const dono = await signUp(server, 'dono');
  const created = await dono.post('/servers', { name: 'Servidor' });
  const serverId = created.body.id as string;
  const detail = (await dono.get(`/servers/${serverId}`)).body;
  const geral = detail.channels.find((c: { name: string }) => c.name === 'geral').id as string;
  const code = (await dono.post(`/servers/${serverId}/invites`, {})).body.code as string;
  const autor = await signUp(server, 'autor');
  const denunciante = await signUp(server, 'denunciante');
  await autor.post(`/invites/${code}`);
  await denunciante.post(`/invites/${code}`);
  const msg = await autor.post(`/channels/${geral}/messages`, { content: 'mensagem ofensiva de teste' });
  assert.equal(msg.status, 200);
  return { dono, autor, denunciante, serverId, geral, messageId: msg.body.id as string };
}

describe('denúncias', () => {
  it('quem vê a mensagem denuncia; repetir ou denunciar a si mesmo não vale', async () => {
    const { autor, denunciante, messageId } = await scene();
    const ok = await denunciante.post('/reports', { kind: 'message', id: messageId, category: 'harassment', details: 'xingou todo mundo' });
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    const again = await denunciante.post('/reports', { kind: 'message', id: messageId, category: 'harassment' });
    assert.equal(again.status, 409);
    assert.equal((await autor.post('/reports', { kind: 'message', id: messageId, category: 'spam' })).status, 400);
  });

  it('quem não está no servidor não denuncia a mensagem (nem descobre que ela existe)', async () => {
    const { messageId } = await scene();
    const fora = await signUp(server, 'fora');
    const res = await fora.post('/reports', { kind: 'message', id: messageId, category: 'spam' });
    assert.ok(res.status === 403 || res.status === 404, String(res.status));
  });

  it('motivo e tipo inválidos são recusados', async () => {
    const { denunciante, messageId } = await scene();
    assert.equal((await denunciante.post('/reports', { kind: 'message', id: messageId, category: 'qualquer' })).status, 400);
    assert.equal((await denunciante.post('/reports', { kind: 'outra', id: messageId, category: 'spam' })).status, 400);
  });

  it('transmissão só se denuncia de quem está na mesma sala', async () => {
    const { autor, denunciante } = await scene();
    const res = await denunciante.post('/reports', { kind: 'stream', userId: autor.id, category: 'nudity' });
    assert.equal(res.status, 400);
  });

  it('DM: só quem está na conversa denuncia', async () => {
    const { autor, denunciante } = await scene();
    const dm = (await autor.post('/dms', { userId: denunciante.id })).body;
    const m = await autor.post(`/dms/${dm.id}/messages`, { content: 'oi, me passa seu whatsapp' });
    assert.equal(m.status, 200);
    const intruso = await signUp(server, 'intruso');
    assert.equal((await intruso.post('/reports', { kind: 'dm_message', id: m.body.id, category: 'harassment' })).status, 404);
    assert.equal((await denunciante.post('/reports', { kind: 'dm_message', id: m.body.id, category: 'harassment' })).status, 200);
  });

  it('só a equipe vê a fila', async () => {
    const { denunciante } = await scene();
    assert.equal((await denunciante.get('/admin/reports')).status, 404);
  });

  it('a equipe vê a prova, apaga a mensagem e a cópia guardada fica', async () => {
    const { autor, denunciante, geral, messageId } = await scene();
    await denunciante.post('/reports', { kind: 'message', id: messageId, category: 'violence', details: 'ameaça' });

    const list = await equipe.get('/admin/reports');
    assert.equal(list.status, 200);
    const item = list.body.items.find((r: { target: { id: string } }) => r.target.id === autor.id);
    assert.ok(item, 'a denúncia aparece na fila');
    assert.equal(item.category, 'violence');

    const detail = await equipe.get(`/admin/reports/${item.id}`);
    assert.equal(detail.body.message.content, 'mensagem ofensiva de teste');
    assert.equal(detail.body.message.stillThere, true);
    assert.equal(detail.body.details, 'ameaça');

    assert.equal((await equipe.post(`/admin/reports/${item.id}/delete-message`, {})).status, 200);
    const msgs = (await denunciante.get(`/channels/${geral}/messages`)).body as { id: string }[];
    assert.ok(!msgs.some((m) => m.id === messageId), 'a mensagem sumiu do canal');

    const after = await equipe.get(`/admin/reports/${item.id}`);
    assert.equal(after.body.status, 'resolved');
    assert.equal(after.body.outcome, 'actioned');
    assert.equal(after.body.message.content, 'mensagem ofensiva de teste', 'a cópia da prova fica');
    assert.equal(after.body.message.stillThere, false);
  });

  it('a equipe arquiva e reabre', async () => {
    const { autor, denunciante } = await scene();
    await denunciante.post('/reports', { kind: 'user', userId: autor.id, category: 'spam' });
    const item = (await equipe.get('/admin/reports')).body.items.find((r: { target: { id: string }; kind: string }) => r.target.id === autor.id && r.kind === 'user');
    assert.equal((await equipe.post(`/admin/reports/${item.id}/resolve`, { outcome: 'dismissed', note: 'nada demais' })).status, 200);
    const resolved = await equipe.get('/admin/reports?status=resolved');
    assert.ok(resolved.body.items.some((r: { id: string }) => r.id === item.id));
    assert.equal((await equipe.post(`/admin/reports/${item.id}/reopen`, {})).status, 200);
    assert.equal((await equipe.get(`/admin/reports/${item.id}`)).body.status, 'open');
  });
});
