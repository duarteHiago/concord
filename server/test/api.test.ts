// A API de ponta a ponta: login, servidores, canais, mensagens e, principalmente, quem NÃO pode fazer cada coisa.
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { P } from '../../shared/permissions.ts';
import { Client, signUp, startServer, type TestServer } from './helpers.ts';

let server: TestServer;
before(async () => {
  server = await startServer();
});
after(() => server.stop());

interface ServerDetail {
  server: { id: string };
  roles: { id: string; name: string; isDefault: boolean }[];
  channels: { id: string; name: string; type: string }[];
}

/** Dono com um servidor novo, e o id do canal #geral. */
async function ownerWithServer() {
  const owner = await signUp(server, 'dono');
  const created = await owner.post('/servers', { name: 'Servidor de teste' });
  assert.equal(created.status, 200);
  const detail = (await owner.get<ServerDetail>(`/servers/${created.body.id}`)).body;
  const geral = detail.channels.find((c) => c.name === 'geral')!;
  return { owner, serverId: created.body.id as string, geral: geral.id, detail };
}

/** Uma pessoa nova que entra no servidor por convite. */
async function join(owner: Client, serverId: string, name = 'membro') {
  const invite = await owner.post(`/servers/${serverId}/invites`, {});
  assert.equal(invite.status, 200);
  const member = await signUp(server, name);
  assert.equal((await member.post(`/invites/${invite.body.code}`)).status, 200);
  return member;
}

describe('contas e login', () => {
  it('sem token, a API responde 401', async () => {
    assert.equal((await new Client(server.url).get('/me')).status, 401);
  });

  it('token inventado não vale', async () => {
    const c = new Client(server.url);
    c.token = 'nao.e.um.token';
    assert.equal((await c.get('/me')).status, 401);
  });

  it('nome de usuário repetido é recusado', async () => {
    const a = await signUp(server, 'repetido');
    const res = await new Client(server.url).post('/auth/register', { username: a.username, password: 'outra-senha-123' });
    assert.equal(res.status, 409);
  });

  it('entra com a senha certa e não entra com a errada', async () => {
    const a = await signUp(server, 'login');
    const c = new Client(server.url);
    assert.equal((await c.post('/auth/login', { username: a.username, password: 'senha-forte-123' })).status, 200);
    assert.equal((await c.post('/auth/login', { username: a.username, password: 'errada' })).status, 401);
  });

  it('depois de 5 senhas erradas, o login fica bloqueado (até com a senha certa)', async () => {
    const a = await signUp(server, 'bloqueio');
    const c = new Client(server.url);
    for (let i = 0; i < 5; i++) assert.equal((await c.post('/auth/login', { username: a.username, password: 'errada' })).status, 401);
    assert.equal((await c.post('/auth/login', { username: a.username, password: 'senha-forte-123' })).status, 429);
  });

  it('trocar a senha derruba os tokens antigos', async () => {
    const a = await signUp(server, 'troca');
    const old = a.token;
    const res = await a.patch('/me', { currentPassword: 'senha-forte-123', newPassword: 'senha-nova-456' });
    assert.equal(res.status, 200);
    const stale = new Client(server.url);
    stale.token = old;
    assert.equal((await stale.get('/me')).status, 401);
  });

  it('trocar a senha exige a senha atual', async () => {
    const a = await signUp(server, 'trocasem');
    assert.equal((await a.patch('/me', { currentPassword: 'chute', newPassword: 'senha-nova-456' })).status, 400);
  });
});

describe('servidores', () => {
  // o que a pessoa não pode ver responde 404, e não 403: não revela nem que existe
  it('quem não é membro não vê o servidor nem as mensagens', async () => {
    const { serverId, geral } = await ownerWithServer();
    const outsider = await signUp(server, 'fora');
    assert.equal((await outsider.get(`/servers/${serverId}`)).status, 404);
    assert.equal((await outsider.get(`/channels/${geral}/messages`)).status, 404);
    assert.equal((await outsider.post(`/channels/${geral}/messages`, { content: 'oi' })).status, 404);
  });

  it('convite inválido não entra', async () => {
    const a = await signUp(server, 'convite');
    assert.equal((await a.post('/invites/naoexiste')).status, 404);
  });

  it('convite esgotado não entra mais', async () => {
    const { owner, serverId } = await ownerWithServer();
    const invite = await owner.post(`/servers/${serverId}/invites`, { maxUses: 1 });
    assert.equal((await (await signUp(server, 'primeiro')).post(`/invites/${invite.body.code}`)).status, 200);
    assert.equal((await (await signUp(server, 'segundo')).post(`/invites/${invite.body.code}`)).status, 404);
  });

  it('membro comum conversa, mas não cria canal, não convida sem permissão nem expulsa', async () => {
    const { owner, serverId, geral } = await ownerWithServer();
    const member = await join(owner, serverId);
    assert.equal((await member.post(`/channels/${geral}/messages`, { content: 'olá' })).status, 200);
    assert.equal((await member.get(`/channels/${geral}/messages`)).status, 200);
    assert.equal((await member.post(`/servers/${serverId}/channels`, { name: 'meu-canal' })).status, 403);
    assert.equal((await member.patch(`/servers/${serverId}`, { name: 'Tomado' })).status, 403);
    assert.equal((await member.del(`/servers/${serverId}/members/${owner.id}`)).status, 403);
    assert.equal((await member.del(`/servers/${serverId}`)).status, 403);
  });

  it('o dono cria canais', async () => {
    const { owner, serverId } = await ownerWithServer();
    assert.equal((await owner.post(`/servers/${serverId}/channels`, { name: 'novo' })).status, 200);
  });

  it('canal privado some para quem não tem acesso', async () => {
    const { owner, serverId } = await ownerWithServer();
    const member = await join(owner, serverId);
    const priv = await owner.post(`/servers/${serverId}/channels`, { name: 'segredo', private: true });
    const seen = (await member.get<ServerDetail>(`/servers/${serverId}`)).body.channels.map((c) => c.id);
    assert.ok(!seen.includes(priv.body.id));
    assert.equal((await member.get(`/channels/${priv.body.id}/messages`)).status, 404);
    assert.equal((await member.post(`/channels/${priv.body.id}/messages`, { content: 'oi' })).status, 404);
  });

  it('canal só leitura: o @everyone não escreve, o dono escreve', async () => {
    const { owner, serverId, geral, detail } = await ownerWithServer();
    const member = await join(owner, serverId);
    const everyone = detail.roles.find((r) => r.isDefault)!;
    assert.equal((await owner.put(`/channels/${geral}/overwrites/${everyone.id}`, { allow: 0, deny: P.SEND_MESSAGES })).status, 200);
    assert.equal((await member.post(`/channels/${geral}/messages`, { content: 'oi' })).status, 403);
    assert.equal((await owner.post(`/channels/${geral}/messages`, { content: 'aviso' })).status, 200);
  });

  it('membro não edita nem apaga a mensagem de outra pessoa; o dono (Admin) apaga', async () => {
    const { owner, serverId, geral } = await ownerWithServer();
    const a = await join(owner, serverId, 'autora');
    const b = await join(owner, serverId, 'outra');
    const msg = await a.post(`/channels/${geral}/messages`, { content: 'minha mensagem' });
    assert.equal(msg.status, 200);
    assert.equal((await b.patch(`/messages/${msg.body.id}`, { content: 'mexi' })).status, 403);
    assert.equal((await b.del(`/messages/${msg.body.id}`)).status, 403);
    assert.equal((await owner.del(`/messages/${msg.body.id}`)).status, 200);
  });

  it('a autora edita e apaga a própria mensagem', async () => {
    const { owner, serverId, geral } = await ownerWithServer();
    const a = await join(owner, serverId);
    const msg = await a.post(`/channels/${geral}/messages`, { content: 'primeira versão' });
    assert.equal((await a.patch(`/messages/${msg.body.id}`, { content: 'segunda versão' })).body.content, 'segunda versão');
    assert.equal((await a.del(`/messages/${msg.body.id}`)).status, 200);
  });
});

describe('cargos e moderação', () => {
  async function withModerator() {
    const ctx = await ownerWithServer();
    const mod = await join(ctx.owner, ctx.serverId, 'mod');
    const member = await join(ctx.owner, ctx.serverId, 'comum');
    const modRole = ctx.detail.roles.find((r) => r.name === 'Moderador')!;
    assert.equal((await ctx.owner.put(`/servers/${ctx.serverId}/members/${mod.id}/roles`, { roleIds: [modRole.id] })).status, 200);
    return { ...ctx, mod, member, modRole };
  }

  it('moderador expulsa um membro comum, e o expulso perde o acesso', async () => {
    const { serverId, geral, mod, member } = await withModerator();
    assert.equal((await mod.del(`/servers/${serverId}/members/${member.id}`)).status, 200);
    assert.equal((await member.get(`/servers/${serverId}`)).status, 404);
    assert.equal((await member.get(`/channels/${geral}/messages`)).status, 404);
  });

  it('ninguém expulsa o dono', async () => {
    const { owner, serverId, mod } = await withModerator();
    assert.equal((await mod.del(`/servers/${serverId}/members/${owner.id}`)).status, 403);
  });

  it('moderador não expulsa outro moderador (mesmo cargo)', async () => {
    const { owner, serverId, mod, modRole } = await withModerator();
    const mod2 = await join(owner, serverId, 'mod2');
    await owner.put(`/servers/${serverId}/members/${mod2.id}/roles`, { roleIds: [modRole.id] });
    assert.equal((await mod.del(`/servers/${serverId}/members/${mod2.id}`)).status, 403);
  });

  it('membro comum não se dá cargo nenhum', async () => {
    const { serverId, member, modRole, detail } = await withModerator();
    const admin = detail.roles.find((r) => r.name === 'Admin')!;
    assert.equal((await member.put(`/servers/${serverId}/members/${member.id}/roles`, { roleIds: [modRole.id, admin.id] })).status, 403);
  });

  it('quem gerencia cargos não dá um cargo igual ou acima do seu', async () => {
    const { owner, serverId, mod, member, modRole, detail } = await withModerator();
    // um cargo novo (entra embaixo de todos) com Gerenciar cargos: o mod ganha a permissão, mas o cargo
    // mais alto dele continua sendo o Moderador, abaixo do Admin
    const manager = await owner.post(`/servers/${serverId}/roles`, { name: 'Gerente' });
    assert.equal(manager.status, 200);
    await owner.patch(`/roles/${manager.body.id}`, { permissions: P.MANAGE_ROLES | P.VIEW_CHANNEL });
    await owner.put(`/servers/${serverId}/members/${mod.id}/roles`, { roleIds: [modRole.id, manager.body.id] });
    const admin = detail.roles.find((r) => r.name === 'Admin')!;
    await mod.put(`/servers/${serverId}/members/${member.id}/roles`, { roleIds: [admin.id] });
    const roles = (await owner.get<{ members: { id: string; roleIds: string[] }[] }>(`/servers/${serverId}`)).body.members.find((m) => m.id === member.id)!.roleIds;
    assert.ok(!roles.includes(admin.id), 'o cargo Admin não pode ter sido dado');
  });
});
