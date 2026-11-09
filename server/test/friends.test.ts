// Amigos: pedido pelo @usuário, aceitar/recusar/desfazer, DM entre amigos sem servidor em comum, amigos em
// comum no perfil e o bloqueio (que não é revelado a quem foi bloqueado).
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { signUp, startServer, type Client, type TestServer } from './helpers.ts';

let server: TestServer;
before(async () => {
  server = await startServer();
});
after(() => server.stop());

/** Como `c` vê cada pessoa: { username: 'friend' | 'outgoing' | ... } */
async function relations(c: Client): Promise<Record<string, string>> {
  const res = await c.get<{ user: { username: string }; type: string }[]>('/friends');
  assert.equal(res.status, 200);
  return Object.fromEntries(res.body.map((r) => [r.user.username, r.type]));
}

async function befriend(a: Client, b: Client) {
  assert.equal((await a.post('/friends', { userId: b.id })).status, 200);
  assert.equal((await b.post(`/friends/${a.id}/accept`)).status, 200);
}

describe('pedidos de amizade', () => {
  it('pelo @usuário (com @ e maiúsculas); cada lado vê o seu', async () => {
    const [ana, bia] = [await signUp(server, 'ana'), await signUp(server, 'bia')];
    const res = await ana.post('/friends', { username: `@${bia.username.toUpperCase()}` });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.type, 'outgoing');
    assert.equal((await relations(ana))[bia.username], 'outgoing');
    assert.equal((await relations(bia))[ana.username], 'incoming');
    assert.equal((await ana.post('/friends', { username: bia.username })).status, 409);
  });

  it('usuário que não existe, a si mesmo e bot: recusados', async () => {
    const ana = await signUp(server, 'ana');
    assert.equal((await ana.post('/friends', { username: `ninguem_${process.pid}` })).status, 404);
    assert.equal((await ana.post('/friends', { username: ana.username })).status, 400);
  });

  it('aceitar vira amizade dos dois lados', async () => {
    const [ana, bia] = [await signUp(server, 'ana'), await signUp(server, 'bia')];
    await befriend(ana, bia);
    assert.equal((await relations(ana))[bia.username], 'friend');
    assert.equal((await relations(bia))[ana.username], 'friend');
  });

  it('só quem recebeu pode aceitar', async () => {
    const [ana, bia] = [await signUp(server, 'ana'), await signUp(server, 'bia')];
    await ana.post('/friends', { userId: bia.id });
    assert.equal((await ana.post(`/friends/${bia.id}/accept`)).status, 404);
  });

  it('se a pessoa já tinha pedido, mandar pedido aceita na hora', async () => {
    const [ana, bia] = [await signUp(server, 'ana'), await signUp(server, 'bia')];
    await ana.post('/friends', { userId: bia.id });
    const res = await bia.post('/friends', { userId: ana.id });
    assert.equal(res.body.type, 'friend');
    assert.equal((await relations(ana))[bia.username], 'friend');
  });

  it('recusar e desfazer apagam dos dois lados', async () => {
    const [ana, bia, caio] = [await signUp(server, 'ana'), await signUp(server, 'bia'), await signUp(server, 'caio')];
    await ana.post('/friends', { userId: bia.id });
    assert.equal((await bia.del(`/friends/${ana.id}`)).status, 200);
    assert.equal((await relations(ana))[bia.username], undefined);
    await befriend(ana, caio);
    assert.equal((await ana.del(`/friends/${caio.id}`)).status, 200);
    assert.equal((await relations(caio))[ana.username], undefined);
  });

  it('limite de pedidos por hora', async () => {
    const spammer = await signUp(server, 'spam');
    let status = 0;
    for (let i = 0; i < 25 && status !== 429; i++) status = (await spammer.post('/friends', { userId: (await signUp(server, 'alvo')).id })).status;
    assert.equal(status, 429);
  });
});

describe('amigos: conversa e perfil', () => {
  it('amigos abrem DM sem servidor em comum; desconhecidos não', async () => {
    const [ana, bia, caio] = [await signUp(server, 'ana'), await signUp(server, 'bia'), await signUp(server, 'caio')];
    await befriend(ana, bia);
    assert.equal((await ana.post('/dms', { userId: bia.id })).status, 200);
    assert.equal((await ana.post('/dms', { userId: caio.id })).status, 403);
  });

  it('o perfil de um amigo abre, com a relação e os amigos em comum', async () => {
    const [ana, bia, caio] = [await signUp(server, 'ana'), await signUp(server, 'bia'), await signUp(server, 'caio')];
    await befriend(ana, bia);
    await befriend(ana, caio);
    await befriend(bia, caio);
    const res = await ana.get(`/users/${bia.id}/profile`);
    assert.equal(res.status, 200);
    assert.equal(res.body.relationship, 'friend');
    assert.deepEqual(
      res.body.mutualFriends.map((u: { id: string }) => u.id),
      [caio.id],
    );
  });
});

describe('bloquear', () => {
  it('desfaz a amizade, impede DM e pedido, e não revela o bloqueio', async () => {
    const [ana, bia] = [await signUp(server, 'ana'), await signUp(server, 'bia')];
    await befriend(ana, bia);
    const dm = (await ana.post('/dms', { userId: bia.id })).body;
    assert.equal((await bia.post(`/friends/${ana.id}/block`)).status, 200);
    assert.equal((await relations(bia))[ana.username], 'blocked');
    // quem foi bloqueado só perde a amizade: não aparece "bloqueado" do lado dele
    assert.equal((await relations(ana))[bia.username], undefined);
    assert.equal((await ana.post(`/dms/${dm.id}/messages`, { content: 'oi?' })).status, 403);
    assert.equal((await bia.post(`/dms/${dm.id}/messages`, { content: 'oi?' })).status, 403);
    // a resposta é igual à de um @usuário que não existe
    const req = await ana.post('/friends', { username: bia.username });
    assert.equal(req.status, 404);
    assert.equal(req.body.error, (await ana.post('/friends', { username: `ninguem_${process.pid}` })).body.error);
    // quem bloqueou precisa desbloquear para pedir
    assert.equal((await bia.post('/friends', { userId: ana.id })).status, 400);
  });

  it('desbloquear devolve a conversa', async () => {
    const [ana, bia] = [await signUp(server, 'ana'), await signUp(server, 'bia')];
    await befriend(ana, bia);
    const dm = (await ana.post('/dms', { userId: bia.id })).body;
    await bia.post(`/friends/${ana.id}/block`);
    assert.equal((await bia.del(`/friends/${ana.id}/block`)).status, 200);
    assert.equal((await relations(bia))[ana.username], undefined);
    assert.equal((await ana.post(`/dms/${dm.id}/messages`, { content: 'voltei' })).status, 200);
  });
});
