// Notificações: o que ficou por ler, o contador de menções e o nível de aviso por servidor/canal.
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { P } from '../../shared/permissions.ts';
import { signUp, startServer, type Client, type TestServer } from './helpers.ts';

let server: TestServer;
before(async () => {
  server = await startServer();
});
after(() => server.stop());

interface Unreads {
  channels: Record<string, { serverId: string; lastMessageAt: number; lastReadAt: number; mentions: number }>;
  levels: Record<string, { level: string | null; mutedUntil: number | null }>;
}

async function setup() {
  const owner = await signUp(server, 'dono');
  const created = await owner.post('/servers', { name: 'Avisos' });
  const invite = await owner.post(`/servers/${created.body.id}/invites`, {});
  const member = await signUp(server, 'membro');
  assert.equal((await member.post(`/invites/${invite.body.code}`)).status, 200);
  const detail = (await owner.get(`/servers/${created.body.id}`)).body;
  const geral = detail.channels.find((c: { name: string }) => c.name === 'geral').id as string;
  return { owner, member, serverId: created.body.id as string, geral, roles: detail.roles as { id: string; isDefault: boolean }[] };
}

const unreads = async (c: Client) => (await c.get('/me/unreads')).body as Unreads;
const isUnread = (u: Unreads, channelId: string) => u.channels[channelId].lastMessageAt > u.channels[channelId].lastReadAt;
const tick = () => new Promise((r) => setTimeout(r, 5));

describe('o que ficou por ler', () => {
  it('mensagem de outra pessoa deixa o canal por ler; ler limpa', async () => {
    const { owner, member, geral, serverId } = await setup();
    assert.equal(isUnread(await unreads(member), geral), false, 'entrar no servidor não deixa o histórico por ler');
    await tick();
    await owner.post(`/channels/${geral}/messages`, { content: 'oi pessoal' });
    const u = await unreads(member);
    assert.equal(u.channels[geral].serverId, serverId);
    assert.equal(isUnread(u, geral), true);
    assert.equal((await member.post(`/channels/${geral}/read`, {})).status, 200);
    assert.equal(isUnread(await unreads(member), geral), false);
  });

  it('a própria mensagem não deixa por ler, e escrever marca como lido', async () => {
    const { owner, member, geral } = await setup();
    await tick();
    await owner.post(`/channels/${geral}/messages`, { content: 'pergunta' });
    await tick();
    await member.post(`/channels/${geral}/messages`, { content: 'resposta' });
    assert.equal(isUnread(await unreads(member), geral), false);
    assert.equal(isUnread(await unreads(owner), geral), true);
  });

  it('a leitura não volta para trás nem aceita hora no futuro', async () => {
    const { member, geral } = await setup();
    const now = Date.now();
    const first = (await member.post(`/channels/${geral}/read`, { at: now + 3_600_000 })).body.lastReadAt;
    assert.ok(first <= Date.now());
    const second = (await member.post(`/channels/${geral}/read`, { at: 1 })).body.lastReadAt;
    assert.equal(second, first);
  });

  it('canal escondido não aparece e não dá para marcar como lido', async () => {
    const { owner, member, serverId, roles } = await setup();
    const secret = (await owner.post(`/servers/${serverId}/channels`, { name: 'diretoria', type: 'text', private: true })).body.id;
    assert.equal((await unreads(member)).channels[secret], undefined);
    assert.equal((await member.post(`/channels/${secret}/read`, {})).status, 404);
    assert.ok(roles.length > 0);
  });
});

describe('menções', () => {
  it('@usuario conta para a pessoa e some quando ela lê o canal', async () => {
    const { owner, member, geral } = await setup();
    await owner.post(`/channels/${geral}/messages`, { content: `@${member.username} olha isso` });
    await owner.post(`/channels/${geral}/messages`, { content: `@${member.username} e isso` });
    assert.equal((await unreads(member)).channels[geral].mentions, 2);
    assert.equal((await unreads(owner)).channels[geral].mentions, 0);
    await member.post(`/channels/${geral}/read`, {});
    assert.equal((await unreads(member)).channels[geral].mentions, 0);
  });

  it('responder alguém conta como menção', async () => {
    const { owner, member, geral } = await setup();
    const mine = (await member.post(`/channels/${geral}/messages`, { content: 'minha dúvida' })).body;
    await owner.post(`/channels/${geral}/messages`, { content: 'respondendo', replyTo: mine.id });
    assert.equal((await unreads(member)).channels[geral].mentions, 1);
  });

  it('mensagem apagada tira a menção', async () => {
    const { owner, member, geral } = await setup();
    const msg = (await owner.post(`/channels/${geral}/messages`, { content: `@${member.username} ops` })).body;
    await owner.del(`/messages/${msg.id}`);
    assert.equal((await unreads(member)).channels[geral].mentions, 0);
  });
});

describe('nível de aviso', () => {
  it('guarda por servidor e por canal, e null volta ao padrão', async () => {
    const { member, serverId, geral } = await setup();
    assert.equal((await member.put(`/me/notify-levels/${serverId}`, { level: 'all' })).status, 200);
    const until = Date.now() + 3_600_000;
    assert.equal((await member.put(`/me/notify-levels/${geral}`, { level: 'none', mutedUntil: until })).status, 200);
    let u = await unreads(member);
    assert.deepEqual(u.levels[serverId], { level: 'all', mutedUntil: null });
    assert.deepEqual(u.levels[geral], { level: 'none', mutedUntil: until });
    await member.put(`/me/notify-levels/${geral}`, { level: null, mutedUntil: null });
    u = await unreads(member);
    assert.equal(u.levels[geral], undefined);
  });

  it('não aceita nível inválido nem servidor/canal que a pessoa não vê', async () => {
    const { owner, member, serverId } = await setup();
    assert.equal((await member.put(`/me/notify-levels/${serverId}`, { level: 'tudo' })).status, 400);
    const other = (await owner.post('/servers', { name: 'Outro' })).body.id;
    assert.equal((await member.put(`/me/notify-levels/${other}`, { level: 'all' })).status, 404);
    const secret = (await owner.post(`/servers/${serverId}/channels`, { name: 'segredo', type: 'text', private: true })).body.id;
    assert.equal((await member.put(`/me/notify-levels/${secret}`, { level: 'all' })).status, 404);
    // mutedUntil no passado = não silenciado
    assert.deepEqual((await member.put(`/me/notify-levels/${serverId}`, { mutedUntil: Date.now() - 1000 })).body, { level: null, mutedUntil: null });
    assert.ok(P.VIEW_CHANNEL);
  });
});
