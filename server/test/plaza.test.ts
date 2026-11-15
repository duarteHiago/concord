// Praça do servidor: só abre nos servidores liberados e só para quem é membro; o servidor confere cada passo
// com o mesmo mapa do app, limpa os balões e não entrega o balão a quem bloqueou (ou foi bloqueado por) quem falou.
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { io, type Socket } from 'socket.io-client';
import { buildLayout, buildLobby, cleanSay, defaultStyle, findPath, layoutFor, planFloors, sanitizeAvatar, validateStyle, walkable } from '../../shared/plaza.ts';
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

describe('praça: editor (shared)', () => {
  it('o padrão vale; móvel em cima do prédio, fora do mapa ou fechando a porta não vale', () => {
    const base = defaultStyle('lobby');
    assert.equal(validateStyle(base, 'lobby', 0).ok, true);
    const lobby = buildLobby();
    const onBuilding = { ...base, items: [...base.items, { k: 'plant', x: lobby.building.x0, y: 1, r: 0, c: 0 }] };
    assert.equal(validateStyle(onBuilding, 'lobby', 0).ok, false);
    const outside = { ...base, items: [{ k: 'sofa', x: lobby.w - 1, y: 5, r: 0, c: 0 }] };
    assert.equal(validateStyle(outside, 'lobby', 0).ok, false);
    // um muro de sofás em volta da porta fecha a passagem
    const d = lobby.door;
    const wall = { floor: 0, wall: 0, items: [
      { k: 'sofa', x: d.x - 2, y: d.y + 2, r: 0, c: 0 },
      { k: 'sofa', x: d.x, y: d.y + 2, r: 0, c: 0 },
      { k: 'plant', x: d.x + 2, y: d.y + 2, r: 0, c: 0 },
      { k: 'plant', x: d.x - 2, y: d.y + 1, r: 0, c: 0 },
      { k: 'plant', x: d.x - 1, y: d.y + 1, r: 0, c: 0 },
      { k: 'plant', x: d.x + 1, y: d.y + 1, r: 0, c: 0 },
      { k: 'plant', x: d.x + 2, y: d.y + 1, r: 0, c: 0 },
      { k: 'plant', x: d.x - 1, y: d.y, r: 0, c: 0 },
      { k: 'plant', x: d.x + 1, y: d.y, r: 0, c: 0 },
    ] };
    const check = validateStyle(wall, 'lobby', 0);
    assert.equal(check.ok, false);
    // móvel só de dentro não vai no lobby; tapete não bloqueia o caminho
    assert.equal(validateStyle({ ...base, items: [{ k: 'shelf', x: 3, y: 5, r: 0, c: 0 }] }, 'lobby', 0).ok, false);
    const rug = validateStyle({ floor: 2, wall: 0, items: [{ k: 'rug', x: d.x - 1, y: d.y + 2, r: 0, c: 3 }] }, 'lobby', 0);
    assert.equal(rug.ok, true);
  });
});

describe('praça: andares (shared)', () => {
  it('térreo até 6, depois 2 por andar; a escolha do admin vale se couber; sem andar vazio no meio', () => {
    const ids = Array.from({ length: 9 }, (_, i) => `c${i}`);
    assert.deepEqual(planFloors(ids).map((f) => f.length), [6, 2, 1]);
    const plan = planFloors(ids, { c0: 3, c1: 3, c2: 3 });
    // c0 e c1 ficam juntos no andar escolhido (que sobe para logo depois dos outros, sem andar vazio);
    // c2 não cabe e volta para o fluxo automático
    assert.ok(plan.some((f) => f.length === 2 && f.includes('c0') && f.includes('c1')));
    assert.ok(plan[0].includes('c2'));
    assert.ok(plan.every((f, i) => i === 0 || f.length > 0));
    // andar de cima tem elevador e não tem saída; o térreo também tem elevador (andares e quartos)
    const up = layoutFor('inside', 2, null, 1);
    assert.ok(up.elevator && walkable(up, up.elevator.x, up.elevator.y));
    assert.equal(up.door.x < 0, true);
    assert.ok(layoutFor('inside', 6, null, 0).elevator);
    assert.ok(layoutFor('inside', 3, null, 0).elevator);
  });

  it('corredor com uma porta por quarto; quarto com escrivaninha, TV e cama fixas e só o dono monta', () => {
    const hall = layoutFor('hall', 3);
    assert.equal(hall.doors.length, 3);
    assert.ok(hall.doors.every((d) => walkable(hall, d.x, d.y)));
    assert.ok(hall.elevator && walkable(hall, hall.elevator.x, hall.elevator.y));
    const room = layoutFor('room', 0);
    assert.ok(room.nook && !walkable(room, room.nook.bed.x, room.nook.bed.y));
    assert.ok(walkable(room, room.door.x, room.door.y));
    // nada de móvel em cima da cama nem móvel que só existe na praça
    const base = defaultStyle('room');
    assert.equal(validateStyle(base, 'room', 0).ok, true);
    assert.equal(validateStyle({ ...base, items: [{ k: 'plant', x: room.nook.bed.x, y: room.nook.bed.y, r: 0, c: 0 }] }, 'room', 0).ok, false);
    assert.equal(validateStyle({ ...base, items: [{ k: 'tree', x: 4, y: 4, r: 0, c: 0 }] }, 'room', 0).ok, false);
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
    // chega na praça (o lobby), não dentro do estabelecimento
    const layout = buildLobby();
    const self = (r.walkers as { userId: string; scene: string; x: number; y: number }[]).find((w) => w.userId === ana.id)!;
    assert.equal(self.scene, 'lobby');
    // chega no portal ou numa casa livre em volta dele
    assert.ok(Math.abs(self.x - layout.spawn.x) <= 2 && Math.abs(self.y - layout.spawn.y) <= 2);
    assert.equal(walkable(layout, self.x, self.y), true);
    assert.equal((await ana.get(`/servers/${serverId}`)).body.plaza.count, 1);
  });

  it('passo para casa bloqueada é ignorado; passo válido chega aos outros', async () => {
    const { ana, serverId, a, b } = await setup();
    await emitAck(a, 'plaza:enter', { serverId });
    await emitAck(b, 'plaza:enter', { serverId });
    const lobby = buildLobby();
    const moves: { userId: string; x: number; y: number }[] = [];
    b.on('plaza:move', (m) => moves.push(m));
    const cafe = lobby.items.find((i) => i.k === 'cafe')!;
    a.emit('plaza:move', { serverId, x: cafe.x, y: cafe.y });
    a.emit('plaza:move', { serverId, x: 999, y: 0 });
    a.emit('plaza:move', { serverId, x: cafe.x, y: cafe.y + 1 });
    await sleep(300);
    assert.deepEqual(moves, [{ serverId, userId: ana.id, scene: 'lobby', floor: 0, roomOf: null, x: cafe.x, y: cafe.y + 1 }]);
  });

  it('só entra no estabelecimento quem está na porta; lá dentro valem as mesas', async () => {
    const { ana, serverId, a, b } = await setup();
    const r = await emitAck(a, 'plaza:enter', { serverId });
    await emitAck(b, 'plaza:enter', { serverId });
    const lobby = buildLobby();
    const inside = buildLayout((r.tables as unknown[]).length);
    const scenes: { userId: string; scene: string; x: number; y: number }[] = [];
    b.on('plaza:scene', (m) => scenes.push(m));
    a.emit('plaza:door', { serverId }); // longe da porta: nada acontece
    await sleep(150);
    a.emit('plaza:move', { serverId, x: lobby.door.x, y: lobby.door.y });
    await sleep(100);
    a.emit('plaza:door', { serverId });
    await sleep(250);
    assert.equal(scenes.length, 1);
    assert.equal(scenes[0].scene, 'inside');
    assert.equal(scenes[0].userId, ana.id);
    assert.ok(Math.abs(scenes[0].x - inside.spawn.x) <= 2 && Math.abs(scenes[0].y - inside.spawn.y) <= 2);
    const moves: unknown[] = [];
    b.on('plaza:move', (m) => moves.push(m));
    const t = inside.tables[0];
    a.emit('plaza:move', { serverId, x: t.front.x, y: t.front.y });
    await sleep(250);
    assert.equal(moves.length, 1);
  });

  it('balão só chega a quem está no mesmo lugar', async () => {
    const { serverId, a, b } = await setup();
    await emitAck(a, 'plaza:enter', { serverId });
    await emitAck(b, 'plaza:enter', { serverId });
    const lobby = buildLobby();
    a.emit('plaza:move', { serverId, x: lobby.door.x, y: lobby.door.y });
    await sleep(100);
    a.emit('plaza:door', { serverId });
    await sleep(200);
    const got: unknown[] = [];
    b.on('plaza:say', (m) => got.push(m));
    assert.equal((await emitAck(a, 'plaza:say', { serverId, text: 'tem alguém aí fora?' })).ok, true);
    await sleep(250);
    assert.equal(got.length, 0);
  });

  it('no lobby, o balão só chega a quem está perto', async () => {
    const { serverId, a, b, c } = await setup();
    for (const s of [a, b, c]) await emitAck(s, 'plaza:enter', { serverId });
    const lobby = buildLobby();
    // b vai para o canto de cima (longe do portal); c fica perto de a, no portal
    b.emit('plaza:move', { serverId, x: 2, y: 2 });
    await sleep(200);
    const gotB: unknown[] = [];
    const gotC: unknown[] = [];
    b.on('plaza:say', (m) => gotB.push(m));
    c.on('plaza:say', (m) => gotC.push(m));
    assert.ok(lobby.spawn.y - 2 > 8);
    assert.equal((await emitAck(a, 'plaza:say', { serverId, text: 'oi, vizinho' })).ok, true);
    await sleep(250);
    assert.equal(gotC.length, 1);
    assert.equal(gotB.length, 0);
  });

  it('a voz da Praça vale no lobby e dentro do prédio, e só para quem está nela', async () => {
    const { ana, serverId, a } = await setup();
    assert.equal((await ana.post(`/servers/${serverId}/plaza/voice-token`)).status, 409);
    await emitAck(a, 'plaza:enter', { serverId });
    const ok = await ana.post(`/servers/${serverId}/plaza/voice-token`);
    assert.equal(ok.status, 200);
    assert.equal(typeof ok.body.token, 'string');
    const lobby = buildLobby();
    a.emit('plaza:move', { serverId, x: lobby.door.x, y: lobby.door.y });
    await sleep(100);
    a.emit('plaza:door', { serverId });
    await sleep(200);
    assert.equal((await ana.post(`/servers/${serverId}/plaza/voice-token`)).status, 200);
    a.emit('plaza:leave', { serverId });
    await sleep(150);
    assert.equal((await ana.post(`/servers/${serverId}/plaza/voice-token`)).status, 409);
  });

  it('quem está numa call já chega lá dentro, na mesa dela', async () => {
    const { ana, serverId, a } = await setup();
    const detail = (await ana.get(`/servers/${serverId}`)).body as { channels: { id: string; type: string; name: string }[] };
    const voice = detail.channels.filter((c) => c.type === 'voice');
    const target = voice.find((c) => c.name === 'mesa-1')!;
    assert.equal(((await emitAck(a, 'voice:join', { channelId: target.id })) as { ok: boolean }).ok, true);
    const r = await emitAck(a, 'plaza:enter', { serverId });
    const me = (r.walkers as { userId: string; scene: string; x: number; y: number }[]).find((w) => w.userId === ana.id)!;
    assert.equal(me.scene, 'inside');
    const inside = buildLayout((r.tables as unknown[]).length);
    const idx = (r.tables as (string | null)[]).indexOf(target.id);
    const front = inside.tables[idx].front;
    assert.ok(Math.abs(me.x - front.x) <= 2 && Math.abs(me.y - front.y) <= 2);
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

  it('só quem gerencia monta a praça; todo mundo recebe, e quem estava no lugar do móvel sai de cima', async () => {
    const { ana, bia, serverId, a, b } = await setup();
    await emitAck(a, 'plaza:enter', { serverId });
    await emitAck(b, 'plaza:enter', { serverId });
    const lobby = buildLobby();
    // bia fica numa casa livre; o móvel novo vai bem ali
    const spot = { x: 6, y: 15 };
    b.emit('plaza:move', { serverId, x: spot.x, y: spot.y });
    await sleep(200);
    const style = { ...defaultStyle('lobby'), floor: 1, items: [...defaultStyle('lobby').items, { k: 'fountain', x: spot.x, y: spot.y, r: 0, c: 0 }] };
    assert.equal((await bia.put(`/servers/${serverId}/plaza/place`, { scene: 'lobby', style })).status, 403);
    const places: { scene: string; style: { floor: number } | null }[] = [];
    const moves: { userId: string; x: number; y: number }[] = [];
    a.on('plaza:place', (m) => places.push(m));
    a.on('plaza:move', (m) => moves.push(m));
    assert.equal((await ana.put(`/servers/${serverId}/plaza/place`, { scene: 'lobby', style })).status, 200);
    await sleep(250);
    assert.equal(places.length, 1);
    assert.equal(places[0].style?.floor, 1);
    const moved = moves.find((m) => m.userId === bia.id)!;
    assert.ok(moved && !(moved.x === spot.x && moved.y === spot.y));
    // fechar a porta não vale; null volta ao padrão
    const d = lobby.door;
    const blocked = { ...style, items: [...style.items, { k: 'plant', x: d.x, y: d.y + 1, r: 0, c: 0 }] };
    assert.equal((await ana.put(`/servers/${serverId}/plaza/place`, { scene: 'lobby', style: blocked })).status, 400);
    assert.equal((await ana.put(`/servers/${serverId}/plaza/place`, { scene: 'lobby', style: null })).status, 200);
    const again = await emitAck(b, 'plaza:enter', { serverId });
    assert.equal((again.places as { lobby: unknown }).lobby, null);
  });

  it('espiar: só de dentro, quem está na call recebe o aviso, tem intervalo e a mesa pode fechar', async () => {
    const { ana, bia, serverId, a, b, c } = await setup();
    const detail = (await ana.get(`/servers/${serverId}`)).body as { channels: { id: string; type: string; name: string }[] };
    const mesa = detail.channels.find((ch) => ch.name === 'mesa-1')!;
    assert.equal(((await emitAck(b, 'voice:join', { channelId: mesa.id })) as { ok: boolean }).ok, true);
    await emitAck(a, 'plaza:enter', { serverId });
    await emitAck(c, 'plaza:enter', { serverId });
    // lá fora não dá
    assert.equal((await emitAck(a, 'plaza:peek', { serverId, channelId: mesa.id })).ok, false);
    const lobby = buildLobby();
    for (const s of [a, c]) {
      s.emit('plaza:move', { serverId, x: lobby.door.x, y: lobby.door.y });
      await sleep(80);
      s.emit('plaza:door', { serverId });
    }
    await sleep(200);
    const notices: { peeks: { userId: string; channelId: string }[] }[] = [];
    b.on('voice:peeks', (m) => notices.push(m));
    const r = await emitAck(a, 'plaza:peek', { serverId, channelId: mesa.id });
    assert.equal(r.ok, true);
    assert.equal(typeof r.token, 'string');
    await sleep(200);
    assert.ok(notices.some((n) => n.peeks.some((p) => p.userId === ana.id && p.channelId === mesa.id)));
    // de novo antes do intervalo: não
    const again = await emitAck(a, 'plaza:peek', { serverId, channelId: mesa.id });
    assert.equal(again.ok, false);
    // quem está na mesa fecha: ninguém mais espia
    b.emit('plaza:close-table', { channelId: mesa.id, closed: true });
    await sleep(150);
    const closed = await emitAck(c, 'plaza:peek', { serverId, channelId: mesa.id });
    assert.equal(closed.ok, false);
    assert.match(String(closed.error), /fechou/);
    void bia;
  });

  it('ouvir de perto: só perto da mesa, sem microfone, com aviso, e renova enquanto continua perto', async () => {
    const { ana, serverId, a, b } = await setup();
    const detail = (await ana.get(`/servers/${serverId}`)).body as { channels: { id: string; type: string; name: string }[] };
    const mesa = detail.channels.find((ch) => ch.name === 'mesa-1')!;
    assert.equal(((await emitAck(b, 'voice:join', { channelId: mesa.id })) as { ok: boolean }).ok, true);
    const r = await emitAck(a, 'plaza:enter', { serverId });
    const lobby = buildLobby();
    a.emit('plaza:move', { serverId, x: lobby.door.x, y: lobby.door.y });
    await sleep(80);
    a.emit('plaza:door', { serverId });
    await sleep(200);
    // longe da mesa (na porta de saída): não
    assert.equal((await emitAck(a, 'plaza:peek', { serverId, channelId: mesa.id, near: true })).ok, false);
    const inside = buildLayout((r.tables as unknown[]).length);
    const t = inside.tables[(r.tables as (string | null)[]).indexOf(mesa.id)];
    a.emit('plaza:move', { serverId, x: t.front.x, y: t.front.y });
    await sleep(150);
    const notices: { peeks: { userId: string; near: boolean }[] }[] = [];
    b.on('voice:peeks', (m) => notices.push(m));
    const ok = await emitAck(a, 'plaza:peek', { serverId, channelId: mesa.id, near: true });
    assert.equal(ok.ok, true);
    await sleep(150);
    assert.ok(notices.some((n) => n.peeks.some((p) => p.userId === ana.id && p.near)));
    assert.equal((await emitAck(a, 'plaza:peek-renew', { serverId, channelId: mesa.id })).ok, true);
    // saiu de perto: a renovação recusa e a escuta acaba
    a.emit('plaza:move', { serverId, x: inside.spawn.x, y: inside.spawn.y });
    await sleep(150);
    assert.equal((await emitAck(a, 'plaza:peek-renew', { serverId, channelId: mesa.id })).ok, false);
  });

  it('bebida: só no balcão, lá dentro, e todo mundo vê', async () => {
    const { ana, serverId, a, b } = await setup();
    const r = await emitAck(a, 'plaza:enter', { serverId });
    await emitAck(b, 'plaza:enter', { serverId });
    assert.equal((await emitAck(a, 'plaza:drink', { serverId, drink: 'chopp' })).ok, false);
    const lobby = buildLobby();
    a.emit('plaza:move', { serverId, x: lobby.door.x, y: lobby.door.y });
    await sleep(80);
    a.emit('plaza:door', { serverId });
    await sleep(150);
    const inside = buildLayout((r.tables as unknown[]).length);
    a.emit('plaza:move', { serverId, x: inside.building.x0 + 1, y: 3 });
    await sleep(150);
    const seen: { userId: string; drink: string | null }[] = [];
    b.on('plaza:drink', (m) => seen.push(m));
    assert.equal((await emitAck(a, 'plaza:drink', { serverId, drink: 'whisky' })).ok, false);
    assert.equal((await emitAck(a, 'plaza:drink', { serverId, drink: 'refri' })).ok, true);
    await sleep(150);
    assert.deepEqual(seen.map((x) => [x.userId, x.drink]), [[ana.id, 'refri']]);
  });

  it('andares: elevador leva ao andar de cima; o admin escolhe o andar de cada sala, respeitando a lotação', async () => {
    const { ana, bia, serverId, a } = await setup();
    for (let i = 0; i < 6; i++) await ana.post(`/servers/${serverId}/channels`, { name: `sala-${i}`, type: 'voice' });
    const r = await emitAck(a, 'plaza:enter', { serverId });
    const floors = r.floors as (string | null)[][];
    assert.ok(floors.length >= 2);
    assert.equal(floors[0].length, 6);
    const lobby = buildLobby();
    a.emit('plaza:move', { serverId, x: lobby.door.x, y: lobby.door.y });
    await sleep(80);
    a.emit('plaza:door', { serverId });
    await sleep(150);
    const ground = layoutFor('inside', 6, null, 0);
    const scenes: { floor: number }[] = [];
    a.on('plaza:scene', (m) => scenes.push(m));
    a.emit('plaza:floor', { serverId, floor: 1 }); // longe do elevador: nada
    await sleep(120);
    a.emit('plaza:move', { serverId, x: ground.elevator!.x, y: ground.elevator!.y });
    await sleep(120);
    a.emit('plaza:floor', { serverId, floor: 1 });
    await sleep(200);
    assert.equal(scenes.length, 1);
    assert.equal(scenes[0].floor, 1);
    // escolha do admin
    const detail = (await ana.get(`/servers/${serverId}`)).body as { channels: { id: string; type: string }[] };
    const voice = detail.channels.filter((c) => c.type === 'voice').map((c) => c.id);
    assert.equal((await bia.put(`/servers/${serverId}/plaza/floors`, { assign: { [voice[0]]: 2 } })).status, 403);
    assert.equal((await ana.put(`/servers/${serverId}/plaza/floors`, { assign: { [voice[0]]: 2, [voice[1]]: 2, [voice[2]]: 2 } })).status, 400);
    const got = new Promise<{ floors: (string | null)[][] }>((res) => a.once('plaza:floors', res));
    assert.equal((await ana.put(`/servers/${serverId}/plaza/floors`, { assign: { [voice[0]]: 1 } })).status, 200);
    const next = await got;
    assert.ok(next.floors[1].includes(voice[0]));
  });

  it('quartos: elevador leva ao corredor, a porta leva ao quarto de quem é do servidor; só o dono monta o quarto', async () => {
    const { ana, bia, serverId, a, b } = await setup();
    await emitAck(a, 'plaza:enter', { serverId });
    await emitAck(b, 'plaza:enter', { serverId });
    const lobby = buildLobby();
    a.emit('plaza:move', { serverId, x: lobby.door.x, y: lobby.door.y });
    await sleep(80);
    a.emit('plaza:door', { serverId });
    await sleep(150);
    const ground = layoutFor('inside', 1, null, 0);
    const scenes: { userId: string; scene: string; roomOf: string | null; x: number; y: number; roomStyle?: unknown }[] = [];
    b.on('plaza:scene', (m) => scenes.push(m));
    a.emit('plaza:hall', { serverId }); // longe do elevador: nada
    await sleep(120);
    a.emit('plaza:move', { serverId, x: ground.elevator!.x, y: ground.elevator!.y });
    await sleep(120);
    a.emit('plaza:hall', { serverId });
    await sleep(200);
    assert.deepEqual(scenes.map((m) => m.scene), ['hall']);
    // longe da parede das portas: nada; na frente de uma porta: entra no quarto da Bia
    a.emit('plaza:room', { serverId, owner: bia.id });
    await sleep(120);
    assert.equal(scenes.length, 1);
    const door = layoutFor('hall', 2).doors[1];
    a.emit('plaza:move', { serverId, x: door.x, y: door.y });
    await sleep(120);
    a.emit('plaza:room', { serverId, owner: 'alguem-de-fora' });
    await sleep(120);
    assert.equal(scenes.length, 1);
    a.emit('plaza:room', { serverId, owner: bia.id });
    await sleep(200);
    assert.equal(scenes[1].scene, 'room');
    assert.equal(scenes[1].roomOf, bia.id);
    // o balão no quarto não chega a quem está na praça
    const said: unknown[] = [];
    b.on('plaza:say', (m) => said.push(m));
    await emitAck(a, 'plaza:say', { serverId, text: 'oi' });
    await sleep(150);
    assert.equal(said.length, 0);
    // só a própria pessoa monta o quarto (a rota é sempre do quarto de quem chama); móvel na cama não vale
    const room = layoutFor('room', 0);
    const bad = { ...defaultStyle('room'), items: [{ k: 'plant', x: room.nook!.bed.x, y: room.nook!.bed.y, r: 0, c: 0 }] };
    assert.equal((await bia.put('/me/plaza-room', { style: bad })).status, 400);
    const styled = new Promise<{ owner: string; style: { floor: number } }>((res) => a.once('plaza:room-style', res));
    assert.equal((await bia.put('/me/plaza-room', { style: { ...defaultStyle('room'), floor: 3 } })).status, 200);
    const got = await styled;
    assert.equal(got.owner, bia.id);
    assert.equal(got.style.floor, 3);
    // sai pela porta do quarto, de volta ao corredor, na frente da porta
    a.emit('plaza:move', { serverId, x: room.door.x, y: room.door.y });
    await sleep(120);
    a.emit('plaza:door', { serverId, x: door.x });
    await sleep(200);
    const back = scenes[scenes.length - 1];
    assert.equal(back.scene, 'hall');
    assert.equal(back.roomOf, null);
    void ana;
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
