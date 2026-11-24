// Threads: respostas penduradas numa mensagem do canal, quem segue, aberta/resolvida e o webhook respondendo/resolvendo.
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { P } from '../../shared/permissions.ts';
import { signUp, startServer, type Client, type TestServer } from './helpers.ts';

let server: TestServer;
before(async () => {
  server = await startServer();
});
after(() => server.stop());

async function setup() {
  const owner = await signUp(server, 'dono');
  const created = await owner.post('/servers', { name: 'Ops' });
  const invite = await owner.post(`/servers/${created.body.id}/invites`, {});
  const member = await signUp(server, 'membro');
  assert.equal((await member.post(`/invites/${invite.body.code}`)).status, 200);
  const detail = (await owner.get(`/servers/${created.body.id}`)).body;
  const texts = detail.channels.filter((c: { type: string }) => c.type === 'text').map((c: { id: string }) => c.id as string);
  return { owner, member, serverId: created.body.id as string, channel: texts[0] as string, other: texts[1] as string, roles: detail.roles };
}

const send = (c: Client, channel: string, body: Record<string, unknown>) => c.post(`/channels/${channel}/messages`, body);
const list = async (c: Client, channel: string) => (await c.get(`/channels/${channel}/messages`)).body as { id: string; content: string; thread: null | { replyCount: number; status: string } }[];
const myThreads = async (c: Client) => (await c.get('/me/threads')).body as { id: string; unread: boolean; replyCount: number; status: string }[];

describe('threads', () => {
  it('a resposta fica dentro da thread e o resumo aparece na mensagem que abriu', async () => {
    const { owner, member, channel } = await setup();
    const root = (await send(owner, channel, { content: 'ALERTA: API com erro' })).body;
    const reply = await send(member, channel, { content: 'olhando', threadId: root.id });
    assert.equal(reply.status, 200, JSON.stringify(reply.body));
    assert.equal(reply.body.threadId, root.id);

    const msgs = await list(owner, channel);
    assert.equal(msgs.some((m) => m.content === 'olhando'), false, 'a resposta não aparece no canal');
    assert.equal(msgs.find((m) => m.id === root.id)!.thread!.replyCount, 1);

    const t = (await owner.get(`/messages/${root.id}/thread`)).body;
    assert.equal(t.root.id, root.id);
    assert.deepEqual(t.replies.map((r: { content: string }) => r.content), ['olhando']);
    assert.equal(t.following, true, 'quem abriu segue');
  });

  it('"também enviar para o canal" mostra a resposta no canal', async () => {
    const { owner, member, channel } = await setup();
    const root = (await send(owner, channel, { content: 'incidente' })).body;
    await send(member, channel, { content: 'resolvido: era o cache', threadId: root.id, alsoChannel: true });
    assert.ok((await list(owner, channel)).some((m) => m.content === 'resolvido: era o cache'));
  });

  it('não abre thread dentro de thread nem com mensagem de outro canal', async () => {
    const { owner, channel, other } = await setup();
    const root = (await send(owner, channel, { content: 'raiz' })).body;
    const reply = (await send(owner, channel, { content: 'r1', threadId: root.id })).body;
    assert.equal((await send(owner, channel, { content: 'r2', threadId: reply.id })).status, 400);
    assert.equal((await send(owner, other, { content: 'r3', threadId: root.id })).status, 400);
  });

  it('a aba Threads mostra o que eu sigo, com o que é novo; ler limpa; dá para deixar de seguir', async () => {
    const { owner, member, channel } = await setup();
    const root = (await send(owner, channel, { content: 'pergunta' })).body;
    await send(member, channel, { content: 'resposta', threadId: root.id });
    let mine = await myThreads(owner);
    assert.equal(mine.length, 1);
    assert.equal(mine[0].unread, true);
    assert.equal((await myThreads(member))[0].unread, false, 'quem respondeu já leu');

    await owner.post(`/threads/${root.id}/read`, {});
    assert.equal((await myThreads(owner))[0].unread, false);

    assert.equal((await owner.put(`/threads/${root.id}/follow`, { following: false })).status, 200);
    mine = await myThreads(owner);
    assert.equal(mine.length, 0);
    // responder de novo não faz seguir de volta quem saiu de propósito
    await send(member, channel, { content: 'mais uma', threadId: root.id });
    assert.equal((await myThreads(owner)).length, 0);
  });

  it('quem é mencionado na thread passa a seguir', async () => {
    const { owner, member, channel } = await setup();
    const root = (await send(owner, channel, { content: 'deploy' })).body;
    await send(owner, channel, { content: `@${member.username} dá uma olhada`, threadId: root.id });
    assert.equal((await myThreads(member)).length, 1);
  });

  it('resolver e reabrir: quem pode escrever no canal', async () => {
    const { owner, member, channel, roles } = await setup();
    const root = (await send(owner, channel, { content: 'incidente' })).body;
    assert.equal((await member.patch(`/threads/${root.id}`, { status: 'resolved' })).body.status, 'resolved');
    assert.equal((await list(owner, channel)).find((m) => m.id === root.id)!.thread!.status, 'resolved');
    assert.equal((await member.patch(`/threads/${root.id}`, { status: 'aberta' })).status, 400);
    // canal só leitura para @everyone: não resolve
    const everyone = roles.find((r: { isDefault: boolean }) => r.isDefault).id;
    await owner.put(`/channels/${channel}/overwrites/${everyone}`, { allow: 0, deny: P.SEND_MESSAGES });
    assert.equal((await member.patch(`/threads/${root.id}`, { status: 'open' })).status, 403);
  });

  it('apagar uma resposta atualiza o contador; apagar a mensagem que abriu leva as respostas', async () => {
    const { owner, member, channel } = await setup();
    const root = (await send(owner, channel, { content: 'raiz' })).body;
    const r1 = (await send(member, channel, { content: 'r1', threadId: root.id })).body;
    await send(member, channel, { content: 'r2', threadId: root.id });
    await member.del(`/messages/${r1.id}`);
    assert.equal((await list(owner, channel)).find((m) => m.id === root.id)!.thread!.replyCount, 1);
    await owner.del(`/messages/${root.id}`);
    assert.equal((await owner.get(`/messages/${root.id}/thread`)).status, 404);
    assert.equal((await myThreads(member)).length, 0);
  });

  it('resposta de thread não deixa o canal "por ler"', async () => {
    const { owner, member, channel } = await setup();
    const root = (await send(owner, channel, { content: 'raiz' })).body;
    await member.post(`/channels/${channel}/read`, {});
    await new Promise((r) => setTimeout(r, 5));
    await send(owner, channel, { content: 'só na thread', threadId: root.id });
    const u = (await member.get('/me/unreads')).body.channels[channel];
    assert.ok(u.lastMessageAt <= u.lastReadAt);
  });

  it('o webhook responde numa thread e marca como resolvida', async () => {
    const { owner, member, channel } = await setup();
    const hook = (await owner.post(`/channels/${channel}/webhooks`, { name: 'Grafana' })).body;
    const path = hook.url.slice(hook.url.indexOf('/api') + 4);
    const post = (q: string, body: unknown) =>
      fetch(`${server.url}/api${path}${q}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const alert = await (await post('?wait=true', { content: 'API com 40% de erro' })).json();
    assert.equal((await post(`?thread_id=${alert.id}`, { content: 'continua alto' })).status, 204);
    assert.equal((await post('', { thread_id: alert.id, thread_status: 'resolved' })).status, 204);
    const t = (await member.get(`/messages/${alert.id}/thread`)).body;
    assert.deepEqual(t.replies.map((r: { content: string }) => r.content), ['continua alto']);
    assert.equal(t.root.thread.status, 'resolved');
    assert.equal((await post('', { thread_status: 'resolved' })).status, 400, 'status sem thread');
  });

  it('o resumo traz as fotos de até 3 pessoas que responderam, a mais recente primeiro', async () => {
    const { owner, member, channel, serverId } = await setup();
    const third = await signUp(server, 'terceira');
    const inv = await owner.post(`/servers/${serverId}/invites`, {});
    await third.post(`/invites/${inv.body.code}`);
    const root = (await send(owner, channel, { content: 'raiz' })).body;
    await send(member, channel, { content: 'a', threadId: root.id });
    await send(third, channel, { content: 'b', threadId: root.id });
    await send(member, channel, { content: 'c', threadId: root.id });
    const meta = (await list(owner, channel)).find((m) => m.id === root.id)!.thread as unknown as { participants: { id: string }[] };
    // member respondeu por último, depois third; cada pessoa aparece uma vez só
    assert.deepEqual(meta.participants.map((p) => p.id), [member.id, third.id]);
  });

  it('as respostas vêm aos poucos: as mais recentes primeiro, e as anteriores com before', async () => {
    const { owner, member, channel } = await setup();
    const root = (await send(owner, channel, { content: 'raiz' })).body;
    for (let i = 1; i <= 12; i++) {
      await send(i % 2 ? owner : member, channel, { content: `r${i}`, threadId: root.id });
      await new Promise((r) => setTimeout(r, 2));
    }
    const p1 = (await owner.get(`/messages/${root.id}/thread?limit=5`)).body;
    assert.deepEqual(p1.replies.map((r: { content: string }) => r.content), ['r8', 'r9', 'r10', 'r11', 'r12']);
    assert.equal(p1.hasMore, true);
    const p2 = (await owner.get(`/messages/${root.id}/thread?limit=5&before=${p1.replies[0].createdAt}`)).body;
    assert.deepEqual(p2.replies.map((r: { content: string }) => r.content), ['r3', 'r4', 'r5', 'r6', 'r7']);
    const p3 = (await owner.get(`/messages/${root.id}/thread?limit=5&before=${p2.replies[0].createdAt}`)).body;
    assert.deepEqual(p3.replies.map((r: { content: string }) => r.content), ['r1', 'r2']);
    assert.equal(p3.hasMore, false);
  });
});
