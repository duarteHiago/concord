// Praça do servidor: só abre nos servidores liberados e só para quem é membro; o servidor confere cada passo
// com o mesmo mapa do app, limpa os balões e não entrega o balão a quem bloqueou (ou foi bloqueado por) quem falou.
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { io, type Socket } from 'socket.io-client';
import { buildLayout, cleanSay, findPath, sanitizeAvatar, walkable } from '../../shared/plaza.ts';
import { signUp, startServer, type Client, type TestServer } from './helpers.ts';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('praça: mapa e validação (shared)', () => {
  it('mesas, cadeiras, TV e prédio não dão para pisar; o portal dá', () => {
    const layout = buildLayout(4);
    assert.equal(layout.tables.length, 4);
    for (const t of layout.tables) {
      assert.equal(walkable(layout, t.x, t.y), false);
      assert.equal(walkable(layout, t.tv.x, t.tv.y), false);
      for (const s of t.seats) assert.equal(walkable(layout, s.x, s.y), false);
      assert.equal(walkable(layout, t.front.x, t.front.y), true);
      // dá para chegar na frente de toda mesa saindo do portal
      assert.ok(findPath(layout, layout.spawn, t.front).length > 0);
    }
    assert.equal(walkable(layout, layout.spawn.x, layout.spawn.y), true);
    assert.equal(walkable(layout, -1, 0), false);
    assert.equal(walkable(layout, 1.5, 4), false);
  });

  it('avatar com valor inválido volta para o padrão; balão vira uma linha limpa', () => {
    const a = sanitizeAvatar({ skin: 99, hair: -1, hairColor: 'x', accessory: 2 }, 'alguem');
    const base = sanitizeAvatar(null, 'alguem');
    assert.equal(a.skin, base.skin);
    assert.equal(a.hair, base.hair);
    assert.equal(a.accessory, 2);
    assert.equal(cleanSay('  oi\n\ntudo‮ bem?  '), 'oi tudo bem?');
    assert.equal(cleanSay('x'.repeat(500)).length, 120);
    assert.equal(cleanSay(42), '');
  });
});

describe('praça: desligada fora da lista', () => {
  let server: TestServer;
  before(async () => {
    server = await startServer();
  });
  after(() => server.stop());

  it('sem PLAZA_SERVERS (e fora do teste) o servidor vem sem praça e não deixa entrar', async () => {
    const owner = await signUp(server, 'dono');
    const id = (await owner.post('/servers', { name: 'Sem praça' })).body.id as string;
    assert.equal((await owner.get(`/servers/${id}`)).body.plaza, null);
    const s = await connect(server, owner);
    const r = await emitAck(s, 'plaza:enter', { serverId: id });
    assert.equal(r.ok, false);
    s.disconnect();
  });
});

describe('praça: andando e conversando', () => {
  let server: TestServer;
  const sockets: Socket[] = [];
  before(async () => {
    server = await startServer({ PLAZA_SERVERS: '*' });
  });
  after(async () => {
    for (const s of sockets) s.disconnect();
    await server.stop();
  });

  async function setup() {
    const [ana, bia, caio, fora] = [await signUp(server, 'ana'), await signUp(server, 'bia'), await signUp(server, 'caio'), await signUp(server, 'fora')];
    const serverId = (await ana.post('/servers', { name: 'Praça' })).body.id as string;
    await ana.post(`/servers/${serverId}/channels`, { name: 'mesa-1', type: 'voice' });
    const code = (await ana.post(`/servers/${serverId}/invites`, {})).body.code as string;
    for (const m of [bia, caio]) assert.equal((await m.post(`/invites/${code}`)).status, 200);
    const [a, b, c, f] = await Promise.all([ana, bia, caio, fora].map((p) => connect(server, p)));
    sockets.push(a, b, c, f);
    return { ana, bia, caio, serverId, a, b, c, f };
  }

  it('só membro entra; quem entra aparece no portal e o número sobe', async () => {
    const { ana, serverId, a, f } = await setup();
    assert.equal((await emitAck(f, 'plaza:enter', { serverId })).ok, false);
    const r = await emitAck(a, 'plaza:enter', { serverId });
    assert.equal(r.ok, true);
    const tables = r.tables as (string | null)[];
    assert.ok(tables.length >= 1);
    const layout = buildLayout(tables.length);
    const self = (r.walkers as { userId: string; x: number; y: number }[]).find((w) => w.userId === ana.id)!;
    // chega no portal ou numa casa livre em volta dele
    assert.ok(Math.abs(self.x - layout.spawn.x) <= 2 && Math.abs(self.y - layout.spawn.y) <= 2);
    assert.equal(walkable(layout, self.x, self.y), true);
    assert.equal((await ana.get(`/servers/${serverId}`)).body.plaza.count, 1);
  });

  it('passo para casa bloqueada é ignorado; passo válido chega aos outros', async () => {
    const { ana, serverId, a, b } = await setup();
    const r = await emitAck(a, 'plaza:enter', { serverId });
    await emitAck(b, 'plaza:enter', { serverId });
    const layout = buildLayout((r.tables as unknown[]).length);
    const moves: { userId: string; x: number; y: number }[] = [];
    b.on('plaza:move', (m) => moves.push(m));
    const table = layout.tables[0];
    a.emit('plaza:move', { serverId, x: table.x, y: table.y });
    a.emit('plaza:move', { serverId, x: 999, y: 0 });
    a.emit('plaza:move', { serverId, x: table.front.x, y: table.front.y });
    await sleep(300);
    assert.deepEqual(moves, [{ serverId, userId: ana.id, x: table.front.x, y: table.front.y }]);
  });

  it('balão sai limpo, e quem bloqueou não recebe', async () => {
    const { ana, caio, serverId, a, b, c } = await setup();
    for (const s of [a, b, c]) await emitAck(s, 'plaza:enter', { serverId });
    assert.equal((await caio.post(`/friends/${ana.id}/block`)).status, 200);
    const gotB: { text: string }[] = [];
    const gotC: unknown[] = [];
    b.on('plaza:say', (m) => gotB.push(m));
    c.on('plaza:say', (m) => gotC.push(m));
    assert.equal((await emitAck(a, 'plaza:say', { serverId, text: '  olá\npraça ' })).ok, true);
    assert.equal((await emitAck(a, 'plaza:say', { serverId, text: '   ' })).ok, false);
    await sleep(300);
    assert.equal(gotB.length, 1);
    assert.equal(gotB[0].text, 'olá praça');
    assert.equal(gotC.length, 0);
  });

  it('quem sai do servidor sai da praça', async () => {
    const { bia, serverId, a, b } = await setup();
    await emitAck(a, 'plaza:enter', { serverId });
    await emitAck(b, 'plaza:enter', { serverId });
    const left: string[] = [];
    a.on('plaza:left', (m: { userId: string }) => left.push(m.userId));
    assert.equal((await bia.post(`/servers/${serverId}/leave`)).status, 200);
    await sleep(300);
    assert.deepEqual(left, [bia.id]);
  });
});

async function connect(server: TestServer, c: Client) {
  const socket: Socket = io(server.url, { auth: { token: c.token }, transports: ['websocket'], forceNew: true, reconnection: false, timeout: 5000 });
  await new Promise<void>((resolve, reject) => {
    socket.once('connect', () => resolve());
    socket.once('connect_error', reject);
  });
  return socket;
}

function emitAck(socket: Socket, event: string, data: unknown): Promise<Record<string, unknown>> {
  return new Promise((resolve) => socket.emit(event, data, (r: Record<string, unknown>) => resolve(r)));
}
