// Responder a uma mensagem (canais e DMs): a prévia da original, só dentro da mesma conversa, e "apagada"
// quando a original some.
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { signUp, startServer, type Client, type TestServer } from './helpers.ts';

let server: TestServer;
before(async () => {
  server = await startServer();
});
after(() => server.stop());

/** Dono e um membro num servidor novo, com os ids dos canais de texto. */
async function twoInAServer() {
  const owner = await signUp(server, 'dono');
  const created = await owner.post('/servers', { name: 'Respostas' });
  assert.equal(created.status, 200);
  const invite = await owner.post(`/servers/${created.body.id}/invites`, {});
  const member = await signUp(server, 'membro');
  assert.equal((await member.post(`/invites/${invite.body.code}`)).status, 200);
  const detail = (await owner.get(`/servers/${created.body.id}`)).body;
  const texts = detail.channels.filter((c: { type: string }) => c.type === 'text').map((c: { id: string }) => c.id as string);
  return { owner, member, channel: texts[0] as string, other: texts[1] as string | undefined };
}

const send = (c: Client, channel: string, body: Record<string, unknown>) => c.post(`/channels/${channel}/messages`, body);

describe('respostas em canais', () => {
  it('a resposta leva a prévia da original, também na lista', async () => {
    const { owner, member, channel } = await twoInAServer();
    const original = (await send(owner, channel, { content: 'bora jogar hoje?' })).body;
    const reply = await send(member, channel, { content: 'bora sim', replyTo: original.id });
    assert.equal(reply.status, 200, JSON.stringify(reply.body));
    assert.equal(reply.body.replyTo.id, original.id);
    assert.equal(reply.body.replyTo.authorId, owner.id);
    assert.equal(reply.body.replyTo.content, 'bora jogar hoje?');

    const list = (await owner.get(`/channels/${channel}/messages`)).body as { id: string; replyTo: unknown }[];
    assert.equal((list.find((m) => m.id === reply.body.id)!.replyTo as { id: string }).id, original.id);
    assert.equal(list.find((m) => m.id === original.id)!.replyTo, null);
  });

  it('só dá para responder mensagem do mesmo canal', async () => {
    const { owner, member, channel, other } = await twoInAServer();
    assert.equal((await send(member, channel, { content: 'x', replyTo: 'nao-existe' })).status, 400);
    if (other) {
      const elsewhere = (await send(owner, other, { content: 'outro canal' })).body;
      assert.equal((await send(member, channel, { content: 'x', replyTo: elsewhere.id })).status, 400);
    }
  });

  it('original apagada: a resposta continua e mostra "apagada"', async () => {
    const { owner, member, channel } = await twoInAServer();
    const original = (await send(owner, channel, { content: 'vou apagar' })).body;
    const reply = (await send(member, channel, { content: 'respondendo', replyTo: original.id })).body;
    assert.equal((await owner.del(`/messages/${original.id}`)).status, 200);
    const list = (await member.get(`/channels/${channel}/messages`)).body as { id: string; replyTo: { deleted?: boolean } }[];
    assert.equal(list.find((m) => m.id === reply.id)!.replyTo.deleted, true);
  });
});

describe('respostas em DMs', () => {
  it('responde dentro da conversa; mensagem de canal não vale', async () => {
    const { owner, member, channel } = await twoInAServer();
    const dm = (await owner.post('/dms', { userId: member.id })).body;
    const first = (await owner.post(`/dms/${dm.id}/messages`, { content: 'oi' })).body;
    const reply = await member.post(`/dms/${dm.id}/messages`, { content: 'oi!', replyTo: first.id });
    assert.equal(reply.status, 200, JSON.stringify(reply.body));
    assert.equal(reply.body.replyTo.content, 'oi');
    const fromChannel = (await send(owner, channel, { content: 'no canal' })).body;
    assert.equal((await member.post(`/dms/${dm.id}/messages`, { content: 'x', replyTo: fromChannel.id })).status, 400);
  });
});
