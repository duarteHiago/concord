// Silenciar alguém na sala de voz "para todos" (moderação) e tirar o silêncio: o app da pessoa fica sabendo nas
// duas vezes, a sala vê o estado certo, e quem entra já silenciado é avisado na entrada.
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { io, type Socket } from 'socket.io-client';
import { signUp, startServer, type Client, type TestServer } from './helpers.ts';

let server: TestServer;
before(async () => {
  server = await startServer();
});
after(() => server.stop());

async function connect(c: Client) {
  const socket: Socket = io(server.url, { auth: { token: c.token }, transports: ['websocket'], forceNew: true, reconnection: false, timeout: 5000 });
  await new Promise<void>((resolve, reject) => {
    socket.once('connect', () => resolve());
    socket.once('connect_error', reject);
  });
  return socket;
}

const join = (s: Socket, channelId: string) =>
  new Promise<{ ok: boolean; serverMuted?: boolean }>((resolve) => s.emit('voice:join', { channelId }, resolve));
const next = <T>(s: Socket, event: string) => new Promise<T>((resolve) => s.once(event, resolve));

type States = { states: { userId: string; muted: boolean; serverMuted: boolean }[] };
/** Espera um estado da sala em que a pessoa esteja como pedido (os anteriores podem chegar atrasados). */
function stateOf(s: Socket, userId: string, want: Partial<{ muted: boolean; serverMuted: boolean }>) {
  return new Promise<void>((resolve) => {
    const on = (d: States) => {
      const v = d.states.find((x) => x.userId === userId);
      if (v && Object.entries(want).every(([k, val]) => v[k as 'muted'] === val)) {
        s.off('voice:states', on);
        resolve();
      }
    };
    s.on('voice:states', on);
  });
}

async function setup() {
  const owner = await signUp(server, 'dono');
  const created = await owner.post('/servers', { name: 'Voz' });
  const invite = await owner.post(`/servers/${created.body.id}/invites`, {});
  const member = await signUp(server, 'membro');
  assert.equal((await member.post(`/invites/${invite.body.code}`)).status, 200);
  const detail = (await owner.get(`/servers/${created.body.id}`)).body;
  const room = detail.channels.find((c: { type: string }) => c.type === 'voice').id as string;
  return { owner, member, serverId: created.body.id as string, room };
}

describe('silenciar na sala de voz', () => {
  it('silenciar e tirar o silêncio avisam o app da pessoa e a sala', async () => {
    const { owner, member, serverId, room } = await setup();
    const ms = await connect(member);
    assert.equal((await join(ms, room)).serverMuted, false);

    const muted = next<{ muted: boolean }>(ms, 'voice:server-mute');
    assert.equal((await owner.post(`/servers/${serverId}/members/${member.id}/voice-mute`, { muted: true })).status, 200);
    assert.deepEqual(await muted, { muted: true });

    const unmuted = next<{ muted: boolean }>(ms, 'voice:server-mute');
    const freed = stateOf(ms, member.id, { serverMuted: false });
    assert.equal((await owner.post(`/servers/${serverId}/members/${member.id}/voice-mute`, { muted: false })).status, 200);
    assert.deepEqual(await unmuted, { muted: false });
    await freed;

    // o app religa o microfone e conta para a sala: ela passa a ver a pessoa sem o ícone de mudo
    const speaking = stateOf(ms, member.id, { muted: false, serverMuted: false });
    ms.emit('voice:update', { muted: false });
    await speaking;
    ms.disconnect();
  });

  it('quem entra numa sala já silenciado fica sabendo na entrada', async () => {
    const { owner, member, serverId, room } = await setup();
    assert.equal((await owner.post(`/servers/${serverId}/members/${member.id}/voice-mute`, { muted: true })).status, 200);
    const ms = await connect(member);
    assert.equal((await join(ms, room)).serverMuted, true);
    // silenciado, o app não consegue se marcar como falando
    const states = next<{ states: { userId: string; muted: boolean }[] }>(ms, 'voice:states');
    ms.emit('voice:update', { muted: false });
    assert.equal((await states).states.find((v) => v.userId === member.id)?.muted, true);
    ms.disconnect();
  });

  it('só quem pode silenciar silencia', async () => {
    const { owner, member, serverId } = await setup();
    assert.equal((await member.post(`/servers/${serverId}/members/${owner.id}/voice-mute`, { muted: true })).status, 403);
  });
});
