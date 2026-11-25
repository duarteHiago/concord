// Push no celular: assinar, quando manda (menção, DM, thread, "todas as mensagens") e quando não manda (Concord à
// vista, Não perturbe, silenciado). Com PUSH_DRY_RUN nada sai para os serviços de push: o servidor só anota.
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { io, type Socket } from 'socket.io-client';
import { signUp, startServer, type Client, type TestServer } from './helpers.ts';

let server: TestServer;
before(async () => {
  server = await startServer({ PUSH_DRY_RUN: '1' });
});
after(() => server.stop());

const sub = (n: number) => ({ endpoint: `https://fcm.googleapis.com/fcm/send/aparelho-${n}-${Math.random()}`, keys: { p256dh: 'BKey' + n, auth: 'auth' + n } });
const sent = async (c: Client) => (await c.get('/push/_sent')).body as { title: string; body: string; tag: string; target: Record<string, string> }[];
const wait = () => new Promise((r) => setTimeout(r, 50));

async function setup() {
  const owner = await signUp(server, 'dono');
  const created = await owner.post('/servers', { name: 'Ops' });
  const invite = await owner.post(`/servers/${created.body.id}/invites`, {});
  const member = await signUp(server, 'membro');
  assert.equal((await member.post(`/invites/${invite.body.code}`)).status, 200);
  const detail = (await owner.get(`/servers/${created.body.id}`)).body;
  const channel = detail.channels.find((c: { name: string }) => c.name === 'geral').id as string;
  assert.equal((await member.post('/push/subscribe', { subscription: sub(1) })).status, 200);
  return { owner, member, serverId: created.body.id as string, channel };
}

describe('push no celular', () => {
  it('dá a chave pública e só aceita endereços dos serviços de push', async () => {
    const c = await signUp(server, 'alguem');
    const key = (await c.get('/push/key')).body.publicKey as string;
    assert.ok(key.length > 40);
    assert.equal((await c.post('/push/subscribe', { subscription: { endpoint: 'https://meu-servidor.com/x', keys: { p256dh: 'a', auth: 'b' } } })).status, 400);
    assert.equal((await c.post('/push/subscribe', { subscription: { endpoint: 'http://fcm.googleapis.com/x', keys: { p256dh: 'a', auth: 'b' } } })).status, 400);
    assert.equal((await c.post('/push/subscribe', { subscription: sub(9) })).status, 200);
    assert.equal((await c.post('/push/subscribe', { subscription: { endpoint: 'https://web.push.apple.com/abc', keys: { p256dh: 'a', auth: 'b' } } })).status, 200);
  });

  it('menção chega como push, com quem mandou, o canal e o texto', async () => {
    const { owner, member, channel, serverId } = await setup();
    await owner.post(`/channels/${channel}/messages`, { content: `@${member.username} consegue olhar o alerta?` });
    await wait();
    const [p] = await sent(member);
    assert.ok(p.title.includes('#geral'));
    assert.equal(p.body, `@${member.username} consegue olhar o alerta?`);
    assert.deepEqual(p.target, { serverId, channelId: channel });
    assert.equal(p.tag, `ch:${channel}`);
  });

  it('mensagem comum não chega (padrão "só menções"); em "todas as mensagens", chega', async () => {
    const { owner, member, channel, serverId } = await setup();
    await owner.post(`/channels/${channel}/messages`, { content: 'bom dia' });
    await wait();
    assert.equal((await sent(member)).length, 0);
    await member.put(`/me/notify-levels/${serverId}`, { level: 'all' });
    await owner.post(`/channels/${channel}/messages`, { content: 'deploy feito' });
    await wait();
    assert.deepEqual((await sent(member)).map((p) => p.body), ['deploy feito']);
  });

  it('silenciado não chega; Não perturbe não chega', async () => {
    const { owner, member, channel, serverId } = await setup();
    await member.put(`/me/notify-levels/${serverId}`, { mutedUntil: Date.now() + 3_600_000 });
    await owner.post(`/channels/${channel}/messages`, { content: `@${member.username} oi` });
    await member.put(`/me/notify-levels/${serverId}`, { mutedUntil: null });
    await member.patch('/me', { settings: { status: 'dnd' } });
    await owner.post(`/channels/${channel}/messages`, { content: `@${member.username} oi de novo` });
    await wait();
    assert.equal((await sent(member)).length, 0);
  });

  it('com o Concord à vista num aparelho, não manda push', async () => {
    const { owner, member, channel } = await setup();
    const s: Socket = io(server.url, { auth: { token: member.token }, transports: ['websocket'], forceNew: true, reconnection: false });
    await new Promise<void>((r) => s.once('connect', () => r()));
    s.emit('app:visible', true);
    await wait();
    await owner.post(`/channels/${channel}/messages`, { content: `@${member.username} tá aí?` });
    await wait();
    assert.equal((await sent(member)).length, 0);
    // foi para segundo plano: agora manda
    s.emit('app:visible', false);
    await wait();
    await owner.post(`/channels/${channel}/messages`, { content: `@${member.username} e agora?` });
    await wait();
    assert.equal((await sent(member)).length, 1);
    s.disconnect();
  });

  it('mensagem direta e resposta numa thread que sigo chegam', async () => {
    const { owner, member, channel } = await setup();
    const dm = (await owner.post('/dms', { userId: member.id })).body;
    await owner.post(`/dms/${dm.id}/messages`, { content: 'oi, tudo bem?' });
    const root = (await member.post(`/channels/${channel}/messages`, { content: 'minha dúvida' })).body;
    await owner.post(`/channels/${channel}/messages`, { content: 'respondendo', threadId: root.id });
    await wait();
    const got = await sent(member);
    assert.deepEqual(got.map((p) => p.tag), [`dm:${dm.id}`, `th:${root.id}`]);
    assert.equal(got[1].target.threadId, root.id);
  });

  it('desligar o push neste aparelho', async () => {
    const { owner, member, channel } = await setup();
    const s = sub(2);
    await member.post('/push/subscribe', { subscription: s });
    // tira as duas assinaturas do membro
    const all = [s.endpoint];
    for (const e of all) await member.post('/push/unsubscribe', { endpoint: e });
    await member.post('/push/unsubscribe', { endpoint: 'x' });
    await owner.post(`/channels/${channel}/messages`, { content: `@${member.username} ping` });
    await wait();
    // ainda tem a assinatura do setup: um push
    assert.equal((await sent(member)).length, 1);
  });
});
