// Feedback das pessoas: manda texto e prints (só imagem de verdade, no máximo 3), acompanha em "Meus envios";
// só a equipe vê a fila e os prints; mudar a situação avisa quem mandou.
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { io, type Socket } from 'socket.io-client';
import { signUp, startServer, type Client, type TestServer } from './helpers.ts';

const dir = mkdtempSync(join(tmpdir(), 'concord-feedback-'));
const dbPath = join(dir, 'concord.db');
let server: TestServer;
let admin: Client;
let pessoa: Client;

// um PNG de 1x1 de verdade
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000b49444154789c63f80f040009fb03fdfb5e6b2b0000000049454e44ae426082', 'hex');

async function upload(c: Client, id: string, body: Buffer) {
  const r = await fetch(`${c.base}/api/feedback/${id}/images`, { method: 'POST', headers: { authorization: `Bearer ${c.token}`, 'content-type': 'application/octet-stream' }, body: new Uint8Array(body) });
  return r.status;
}

before(async () => {
  const first = await startServer({ DB_PATH: dbPath });
  admin = await signUp(first, 'equipe');
  pessoa = await signUp(first, 'pessoa');
  await first.stop();
  server = await startServer({ DB_PATH: dbPath, ADMIN_USERS: admin.username });
  for (const c of [admin, pessoa]) c.base = server.url;
});
after(async () => {
  await server.stop();
  rmSync(dir, { recursive: true, force: true });
});

describe('feedback', () => {
  it('manda, anexa prints, acompanha; a equipe vê, muda a situação e quem mandou recebe aviso', async () => {
    assert.equal((await pessoa.post('/feedback', { kind: 'reclamação', body: 'algo' })).status, 400);
    assert.equal((await pessoa.post('/feedback', { kind: 'bug', body: 'oi' })).status, 400);
    const sent = await pessoa.post('/feedback', { kind: 'bug', body: 'A tela some quando abro a Praça.', context: { commit: 'abc123', path: '/', userAgent: 'teste' } });
    assert.equal(sent.status, 200);
    const id = sent.body.id as string;

    // prints: só imagem de verdade, no máximo 3, e só de quem mandou
    assert.equal(await upload(pessoa, id, Buffer.from('não sou imagem')), 400);
    // imagem com código grudado no fim, ou com marca de script no meio: recusada
    assert.equal(await upload(pessoa, id, Buffer.concat([PNG, Buffer.from('<script>alert(1)</script>')])), 400);
    assert.equal(await upload(pessoa, id, Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from('<html><body>oi</body></html>'), Buffer.from([0xff, 0xd9])])), 400);
    assert.equal(await upload(admin, id, PNG), 404);
    for (let i = 0; i < 3; i++) assert.equal(await upload(pessoa, id, PNG), 200);
    assert.equal(await upload(pessoa, id, PNG), 400);

    const mine = (await pessoa.get('/feedback/mine')).body as { id: string; status: string; images: number }[];
    assert.equal(mine[0].id, id);
    assert.equal(mine[0].status, 'novo');
    assert.equal(mine[0].images, 3);

    // a fila é só da equipe
    assert.equal((await pessoa.get('/admin/feedback')).status, 404);
    const list = (await admin.get('/admin/feedback?status=abertos')).body as { items: { id: string; user: { username: string } }[] };
    assert.equal(list.items[0].id, id);
    assert.equal(list.items[0].user.username, pessoa.username);
    const img = await fetch(`${server.url}/api/admin/feedback/${id}/image/0`, { headers: { authorization: `Bearer ${admin.token}` } });
    assert.equal(img.status, 200);
    assert.equal(img.headers.get('content-type'), 'image/png');
    assert.equal((await fetch(`${server.url}/api/admin/feedback/${id}/image/0`, { headers: { authorization: `Bearer ${pessoa.token}` } })).status, 404);

    // mudar a situação avisa quem mandou
    const socket: Socket = io(server.url, { auth: { token: pessoa.token }, transports: ['websocket'], forceNew: true, reconnection: false });
    await new Promise<void>((r) => socket.once('connect', () => r()));
    const got = new Promise<{ status: string; statusLabel: string; teamNote: string }>((r) => socket.once('feedback:updated', r));
    assert.equal((await admin.patch(`/admin/feedback/${id}`, { status: 'planejado', teamNote: 'Boa! Entra na próxima.' })).status, 200);
    const notice = await got;
    socket.disconnect();
    assert.equal(notice.status, 'planejado');
    assert.equal(notice.statusLabel, 'Vamos fazer');
    assert.equal(notice.teamNote, 'Boa! Entra na próxima.');
    assert.equal(((await pessoa.get('/feedback/mine')).body as { status: string }[])[0].status, 'planejado');
  });
});
