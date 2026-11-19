// Categorias de canais: organizam a barra lateral. Só quem gerencia canais mexe; apagar não leva os canais junto;
// categoria só com canais escondidos não aparece para quem não os vê.
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { signUp, startServer, type Client, type TestServer } from './helpers.ts';

let server: TestServer;
before(async () => {
  server = await startServer();
});
after(() => server.stop());

interface Detail {
  categories: { id: string; name: string; position: number }[];
  channels: { id: string; name: string; type: string; position: number; categoryId: string | null }[];
  roles: { id: string; isDefault: boolean }[];
}

async function twoInAServer() {
  const owner = await signUp(server, 'dono');
  const created = await owner.post('/servers', { name: 'Trabalho' });
  assert.equal(created.status, 200);
  const invite = await owner.post(`/servers/${created.body.id}/invites`, {});
  const member = await signUp(server, 'membro');
  assert.equal((await member.post(`/invites/${invite.body.code}`)).status, 200);
  return { owner, member, serverId: created.body.id as string };
}

const detailOf = async (c: Client, serverId: string) => (await c.get(`/servers/${serverId}`)).body as Detail;

describe('categorias de canais', () => {
  it('cria categoria, cria canal dentro dela e move canal entre categorias', async () => {
    const { owner, serverId } = await twoInAServer();
    const cat = await owner.post(`/servers/${serverId}/categories`, { name: 'Incidentes' });
    assert.equal(cat.status, 200, JSON.stringify(cat.body));

    const ch = await owner.post(`/servers/${serverId}/channels`, { name: 'alertas', type: 'text', categoryId: cat.body.id });
    assert.equal(ch.status, 200, JSON.stringify(ch.body));
    let detail = await detailOf(owner, serverId);
    assert.deepEqual(detail.categories.map((c) => c.name), ['Incidentes']);
    assert.equal(detail.channels.find((c) => c.id === ch.body.id)!.categoryId, cat.body.id);
    // o primeiro canal de texto da categoria começa na posição 0 (a conta é por categoria)
    assert.equal(detail.channels.find((c) => c.id === ch.body.id)!.position, 0);

    const geral = detail.channels.find((c) => c.name === 'geral')!;
    assert.equal(geral.categoryId, null);
    assert.equal((await owner.patch(`/channels/${geral.id}`, { categoryId: cat.body.id })).status, 200);
    detail = await detailOf(owner, serverId);
    assert.equal(detail.channels.find((c) => c.id === geral.id)!.categoryId, cat.body.id);
    assert.equal(detail.channels.find((c) => c.id === geral.id)!.position, 1);

    // de volta para fora
    assert.equal((await owner.patch(`/channels/${geral.id}`, { categoryId: null })).status, 200);
    assert.equal((await detailOf(owner, serverId)).channels.find((c) => c.id === geral.id)!.categoryId, null);
  });

  it('renomeia e reordena categorias', async () => {
    const { owner, serverId } = await twoInAServer();
    const a = (await owner.post(`/servers/${serverId}/categories`, { name: 'A' })).body.id;
    const b = (await owner.post(`/servers/${serverId}/categories`, { name: 'B' })).body.id;
    assert.equal((await owner.patch(`/categories/${b}`, { move: 'up' })).status, 200);
    assert.equal((await owner.patch(`/categories/${a}`, { name: 'Antiga A' })).status, 200);
    assert.deepEqual((await detailOf(owner, serverId)).categories.map((c) => c.name), ['B', 'Antiga A']);
  });

  it('apagar a categoria deixa os canais, fora de categoria', async () => {
    const { owner, serverId } = await twoInAServer();
    const cat = (await owner.post(`/servers/${serverId}/categories`, { name: 'Temporária' })).body.id;
    const ch = (await owner.post(`/servers/${serverId}/channels`, { name: 'fica', type: 'text', categoryId: cat })).body.id;
    assert.equal((await owner.del(`/categories/${cat}`)).status, 200);
    const detail = await detailOf(owner, serverId);
    assert.equal(detail.categories.length, 0);
    assert.equal(detail.channels.find((c) => c.id === ch)!.categoryId, null);
  });

  it('só quem gerencia canais mexe nas categorias', async () => {
    const { owner, member, serverId } = await twoInAServer();
    assert.equal((await member.post(`/servers/${serverId}/categories`, { name: 'Minha' })).status, 403);
    const cat = (await owner.post(`/servers/${serverId}/categories`, { name: 'Do dono' })).body.id;
    assert.equal((await member.patch(`/categories/${cat}`, { name: 'Tomada' })).status, 403);
    assert.equal((await member.del(`/categories/${cat}`)).status, 403);
  });

  it('não aceita categoria de outro servidor', async () => {
    const { owner, serverId } = await twoInAServer();
    const other = (await owner.post('/servers', { name: 'Outro' })).body.id;
    const foreign = (await owner.post(`/servers/${other}/categories`, { name: 'De lá' })).body.id;
    assert.equal((await owner.post(`/servers/${serverId}/channels`, { name: 'x', type: 'text', categoryId: foreign })).status, 400);
    const geral = (await detailOf(owner, serverId)).channels.find((c) => c.name === 'geral')!;
    assert.equal((await owner.patch(`/channels/${geral.id}`, { categoryId: foreign })).status, 400);
  });

  it('categoria vazia ou só com canais escondidos não aparece para quem não gerencia', async () => {
    const { owner, member, serverId } = await twoInAServer();
    const vazia = (await owner.post(`/servers/${serverId}/categories`, { name: 'Vazia' })).body.id;
    const secreta = (await owner.post(`/servers/${serverId}/categories`, { name: 'Diretoria' })).body.id;
    await owner.post(`/servers/${serverId}/channels`, { name: 'salarios', type: 'text', categoryId: secreta, private: true });
    const aberta = (await owner.post(`/servers/${serverId}/categories`, { name: 'Aberta' })).body.id;
    await owner.post(`/servers/${serverId}/channels`, { name: 'papo', type: 'text', categoryId: aberta });

    assert.deepEqual((await detailOf(member, serverId)).categories.map((c) => c.id), [aberta]);
    assert.deepEqual((await detailOf(owner, serverId)).categories.map((c) => c.id), [vazia, secreta, aberta]);
  });

  it('subir e descer ficam dentro da categoria', async () => {
    const { owner, serverId } = await twoInAServer();
    const cat = (await owner.post(`/servers/${serverId}/categories`, { name: 'Ops' })).body.id;
    const a = (await owner.post(`/servers/${serverId}/channels`, { name: 'a', type: 'text', categoryId: cat })).body.id;
    const b = (await owner.post(`/servers/${serverId}/channels`, { name: 'b', type: 'text', categoryId: cat })).body.id;
    // "a" é o primeiro da categoria: subir não o tira de lá nem mexe nos de fora
    assert.equal((await owner.patch(`/channels/${a}`, { move: 'up' })).status, 200);
    assert.equal((await owner.patch(`/channels/${b}`, { move: 'up' })).status, 200);
    const detail = await detailOf(owner, serverId);
    const inCat = detail.channels.filter((c) => c.categoryId === cat).sort((x, y) => x.position - y.position);
    assert.deepEqual(inCat.map((c) => c.name), ['b', 'a']);
    const outside = detail.channels.filter((c) => c.categoryId === null && c.type === 'text').sort((x, y) => x.position - y.position);
    assert.deepEqual(outside.map((c) => c.name), ['geral', 'clipes-e-prints']);
  });
});
