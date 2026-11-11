// O que uma conta comum (ou quem pegou a sessão de alguém) não consegue fazer: ver a presença de quem não tem
// nada a ver com ela, tomar uma conta sem senha, gastar a cota dos outros, encher o servidor sozinha, voltar por
// um convite depois de expulsa, mandar convite de contrato para quem a bloqueou.
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import { after, before, describe, it } from 'node:test';
import jwt from 'jsonwebtoken';
import { io, type Socket } from 'socket.io-client';
import { Client, signUp, startServer, type TestServer } from './helpers.ts';

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let google: Server;
let server: TestServer;

before(async () => {
  // o "Google" de mentira dos testes de login: o código é o próprio sub da conta
  google = createServer((req, res) => {
    let body = '';
    req.on('data', (d) => (body += d));
    req.on('end', () => {
      const sub = new URLSearchParams(body).get('code') ?? '';
      const claims = { sub, aud: 'cliente-teste', iss: 'https://accounts.google.com', exp: Math.floor(Date.now() / 1000) + 600 };
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ id_token: `${b64({ alg: 'none' })}.${b64(claims)}.x` }));
    });
  });
  await new Promise<void>((r) => google.listen(0, '127.0.0.1', r));
  const port = (google.address() as { port: number }).port;
  try {
    server = await startServer({
      PAYMENTS_FAKE: 'true',
      GOOGLE_CLIENT_ID: 'cliente-teste',
      GOOGLE_CLIENT_SECRET: 'segredo-teste',
      PUBLIC_URL: 'http://concord.teste',
      GOOGLE_AUTH_URL: 'http://google.teste/auth',
      GOOGLE_TOKEN_URL: `http://127.0.0.1:${port}/token`,
    });
  } catch (err) {
    // sem isto, o "Google" ficaria escutando e o arquivo de teste nunca terminaria
    google.close();
    throw err;
  }
});
// nada pode ficar aberto no fim (um socket tentando reconectar seguraria o processo do teste para sempre)
const sockets: Socket[] = [];
after(async () => {
  for (const s of sockets) s.close();
  google.close();
  await server?.stop();
});

async function upload(c: Client, path: string) {
  const res = await fetch(`${c.base}/api${path}`, { method: 'POST', headers: { 'content-type': 'image/png', authorization: `Bearer ${c.token}` }, body: PNG });
  return res.status;
}

/** Um servidor de `owner` com os `members` dentro. */
async function serverWith(owner: Client, ...members: Client[]) {
  const id = (await owner.post('/servers', { name: 'Servidor' })).body.id as string;
  const code = (await owner.post(`/servers/${id}/invites`, {})).body.code as string;
  for (const m of members) assert.equal((await m.post(`/invites/${code}`)).status, 200);
  return id;
}

interface Presence {
  userId: string;
  online?: boolean;
  status?: string;
  activities?: { name: string }[];
}

/** O socket de uma pessoa, guardando o que chega de presença. */
async function connect(c: Client) {
  const socket: Socket = io(server.url, { auth: { token: c.token }, transports: ['websocket'], forceNew: true, reconnection: false, timeout: 5000 });
  sockets.push(socket);
  const seen = { lists: [] as Presence[][], events: [] as Presence[] };
  socket.on('presence:list', (l: Presence[]) => seen.lists.push(l));
  socket.on('presence', (p: Presence) => seen.events.push(p));
  await new Promise<void>((resolve, reject) => {
    socket.once('connect', () => resolve());
    socket.once('connect_error', reject);
  });
  for (let i = 0; i < 50 && !seen.lists.length; i++) await sleep(20);
  const lastList = () => seen.lists[seen.lists.length - 1].map((p) => p.userId);
  return { socket, seen, lastList };
}

describe('presença', () => {
  it('só chega a quem divide um servidor, é amigo ou tem conversa com a pessoa', async () => {
    const [ana, colega, amiga, curioso] = [await signUp(server, 'ana'), await signUp(server, 'colega'), await signUp(server, 'amiga'), await signUp(server, 'curioso')];
    const serverId = await serverWith(ana, colega);
    assert.equal((await ana.post('/friends', { userId: amiga.id })).status, 200);
    assert.equal((await amiga.post(`/friends/${ana.id}/accept`)).status, 200);

    const a = await connect(ana);
    const [c, f, x] = [await connect(colega), await connect(amiga), await connect(curioso)];
    try {
      assert.ok(c.lastList().includes(ana.id), 'quem está no mesmo servidor vê');
      assert.ok(f.lastList().includes(ana.id), 'a amiga vê');
      assert.deepEqual(x.lastList(), [curioso.id], 'quem não tem nada em comum só vê a si mesmo');

      a.socket.emit('activity:set', [{ type: 'playing', name: 'Jogo Secreto' }]);
      await sleep(300);
      const playing = (s: typeof c) => s.seen.events.some((p) => p.userId === ana.id && p.activities?.some((act) => act.name === 'Jogo Secreto'));
      assert.ok(playing(c), 'o colega vê o que ela está jogando');
      assert.ok(playing(f), 'a amiga também');
      assert.ok(!x.seen.events.some((p) => p.userId === ana.id), 'o curioso não recebe nada dela');

      // o colega sai do servidor: a lista dele é reenviada, já sem quem ele só conhecia por ali
      assert.equal((await colega.post(`/servers/${serverId}/leave`)).status, 200);
      await sleep(200);
      assert.ok(!c.lastList().includes(ana.id), 'fora do servidor, o colega não vê mais');

      // desconectou: o aviso de "offline" também não vai para o curioso
      a.socket.close();
      await sleep(300);
      assert.ok(f.seen.events.some((p) => p.userId === ana.id && p.online === false), 'a amiga fica sabendo que ela saiu');
      assert.ok(!x.seen.events.some((p) => p.userId === ana.id));
    } finally {
      for (const s of [a, c, f, x]) s.socket.close();
    }
  });

  it('quem entra num servidor passa a ver quem já estava online (e é visto)', async () => {
    const [dona, nova] = [await signUp(server, 'dona'), await signUp(server, 'nova')];
    const d = await connect(dona);
    const n = await connect(nova);
    try {
      assert.ok(!n.lastList().includes(dona.id));
      await serverWith(dona, nova);
      await sleep(200);
      assert.ok(n.lastList().includes(dona.id), 'a lista de quem entrou é reenviada');
      assert.ok(d.seen.events.some((p) => p.userId === nova.id && p.online !== false), 'quem já estava recebe a presença de quem entrou');
    } finally {
      d.socket.close();
      n.socket.close();
    }
  });

  it('uma rajada de trocas de atividade vira poucos avisos', async () => {
    const [ana, colega] = [await signUp(server, 'ana'), await signUp(server, 'colega')];
    await serverWith(ana, colega);
    const a = await connect(ana);
    const c = await connect(colega);
    try {
      const before = c.seen.events.length;
      for (let i = 0; i < 100; i++) a.socket.emit('activity:set', [{ type: 'playing', name: `jogo ${i}` }]);
      await sleep(3500);
      const got = c.seen.events.slice(before).filter((p) => p.userId === ana.id);
      assert.ok(got.length >= 1 && got.length <= 3, `chegaram ${got.length} avisos`);
      assert.equal(got[got.length - 1].activities?.[0].name, 'jogo 99', 'o último estado é o que vale');
    } finally {
      a.socket.close();
      c.socket.close();
    }
  });
});

describe('conta sem senha (criada pelo Google)', () => {
  /** Cria a conta pelo Google e devolve a pessoa logada (sessão que acabou de nascer). */
  async function googleAccount() {
    const sub = `sub-${randomBytes(4).toString('hex')}`;
    const start = await fetch(`${server.url}/api/auth/google/start`, { redirect: 'manual' });
    const state = new URL(start.headers.get('location')!).searchParams.get('state');
    const back = await fetch(`${server.url}/api/auth/google/callback?state=${state}&code=${encodeURIComponent(sub)}`, { redirect: 'manual' });
    const ticket = /google-signup=([^&]+)/.exec(back.headers.get('location') ?? '')![1];
    const c = new Client(server.url);
    const made = await c.post('/auth/google/signup', { username: `g_${randomBytes(4).toString('hex')}`, ticket });
    assert.equal(made.status, 200, JSON.stringify(made.body));
    c.token = made.body.token;
    c.id = made.body.user.id;
    return c;
  }

  /** A mesma conta, numa sessão que não nasceu de um login agora (token de antes dos "aparelhos conectados"). */
  function oldSession(c: Client) {
    const old = new Client(server.url);
    old.id = c.id;
    old.token = jwt.sign({ sub: c.id, v: 0 }, 'segredo-dos-testes', { expiresIn: '1d' });
    return old;
  }

  it('sessão antiga não cria senha, não troca o código de recuperação nem inicia o 2FA', async () => {
    const dona = await googleAccount();
    const old = oldSession(dona);
    const me = await old.get('/me');
    assert.equal(me.status, 200, 'a sessão antiga continua valendo para usar o app');
    // o token antigo ganha uma sessão ao abrir o app; ela também não vale como login recente
    const swapped = new Client(server.url);
    swapped.token = me.body.sessionToken;
    assert.equal((await swapped.patch('/me', { newPassword: 'senha-de-outra-pessoa-1' })).status, 403);
    const pw = await old.patch('/me', { newPassword: 'senha-de-outra-pessoa-1' });
    assert.equal(pw.status, 403);
    assert.match(pw.body.error, /entre de novo com o Google/);
    assert.equal((await old.post('/me/recovery-code', {})).status, 403);
    assert.equal((await old.post('/me/2fa/setup', {})).status, 403);
    assert.equal((await dona.get('/me')).body.hasPassword, false);
  });

  it('"sair de todos os outros" numa sessão antiga não vale como login novo', async () => {
    const dona = await googleAccount();
    const old = oldSession(dona);
    const res = await old.post('/me/sessions/logout-others');
    assert.equal(res.status, 200);
    old.token = res.body.token;
    assert.equal((await old.get('/me')).status, 200);
    assert.equal((await old.patch('/me', { newPassword: 'senha-de-outra-pessoa-1' })).status, 403);
  });

  it('logo depois de entrar pelo Google, a dona faz tudo isso normalmente', async () => {
    const dona = await googleAccount();
    assert.equal((await dona.post('/me/2fa/setup', {})).status, 200);
    assert.equal((await dona.post('/me/recovery-code', {})).status, 200);
    const pw = await dona.patch('/me', { newPassword: 'senha-da-dona-123' });
    assert.equal(pw.status, 200, JSON.stringify(pw.body));
  });

  it('conta com senha continua pedindo a senha (e não o login recente)', async () => {
    const ana = await signUp(server, 'ana');
    assert.equal((await ana.post('/me/recovery-code', {})).status, 400);
    assert.equal((await ana.post('/me/recovery-code', { password: 'senha-forte-123' })).status, 200);
    assert.equal((await ana.patch('/me', { newPassword: 'outra-senha-123' })).status, 400);
    assert.equal((await ana.patch('/me', { newPassword: 'outra-senha-123', currentPassword: 'senha-forte-123' })).status, 200);
  });
});

describe('cotas de imagem', () => {
  it('avatar, fundo do perfil e avatar de bot dividem a mesma cota por hora', async () => {
    const ana = await signUp(server, 'ana');
    const bot = (await ana.post('/bots', { name: 'Robo' })).body.bot;
    for (let i = 0; i < 4; i++) assert.equal(await upload(ana, '/me/avatar'), 200);
    for (let i = 0; i < 3; i++) assert.equal(await upload(ana, '/me/profile-bg'), 200);
    for (let i = 0; i < 3; i++) assert.equal(await upload(ana, `/bots/${bot.id}/avatar`), 200);
    assert.equal(await upload(ana, '/me/profile-bg'), 429);
    assert.equal(await upload(ana, `/bots/${bot.id}/avatar`), 429);
    assert.equal(await upload(ana, '/me/avatar'), 429);
  });

  it('quem não é do servidor não gasta as trocas de ícone dele', async () => {
    const [dona, estranho] = [await signUp(server, 'dona'), await signUp(server, 'estranho')];
    const serverId = await serverWith(dona);
    for (let i = 0; i < 8; i++) assert.equal(await upload(estranho, `/servers/${serverId}/icon`), 404);
    assert.equal(await upload(dona, `/servers/${serverId}/icon`), 200);
  });
});

describe('stickers do servidor', () => {
  it('um membro ocupa só a parte dele; quem gerencia o servidor continua podendo enviar', async () => {
    const [dona, membro] = [await signUp(server, 'dona'), await signUp(server, 'membro')];
    const serverId = await serverWith(dona, membro);
    for (let i = 0; i < 10; i++) assert.equal(await upload(membro, `/servers/${serverId}/stickers?name=s${i}`), 200);
    assert.equal(await upload(membro, `/servers/${serverId}/stickers?name=mais`), 400);
    for (let i = 0; i < 12; i++) assert.equal(await upload(dona, `/servers/${serverId}/stickers?name=d${i}`), 200);
  });
});

describe('convites', () => {
  it('o convite de quem foi expulso (ou saiu) deixa de valer; os dos outros continuam', async () => {
    const [dona, expulso, outra, visita] = [await signUp(server, 'dona'), await signUp(server, 'expulso'), await signUp(server, 'outra'), await signUp(server, 'visita')];
    const serverId = await serverWith(dona, expulso, outra);
    const dele = (await expulso.post(`/servers/${serverId}/invites`, { expiresIn: 0 })).body.code as string;
    const dela = (await outra.post(`/servers/${serverId}/invites`, { expiresIn: 0 })).body.code as string;
    assert.equal((await dona.del(`/servers/${serverId}/members/${expulso.id}`)).status, 200);
    assert.equal((await visita.post(`/invites/${dele}`)).status, 404);
    assert.equal((await visita.post(`/invites/${dela}`)).status, 200);
  });

  it('banir alguém também apaga os convites que a pessoa criou', async () => {
    const [dona, banido, visita] = [await signUp(server, 'dona'), await signUp(server, 'banido'), await signUp(server, 'visita')];
    const serverId = await serverWith(dona, banido);
    const code = (await banido.post(`/servers/${serverId}/invites`, { expiresIn: 0 })).body.code as string;
    assert.equal((await dona.post(`/servers/${serverId}/bans`, { userId: banido.id })).status, 200);
    assert.equal((await visita.post(`/invites/${code}`)).status, 404);
  });
});

describe('contratos e bloqueio', () => {
  it('quem foi bloqueado não consegue mandar convite de contrato (e a vaga da pessoa fica livre)', async () => {
    const [mecenas, alvo, outro] = [await signUp(server, 'mecenas'), await signUp(server, 'alvo'), await signUp(server, 'outro')];
    for (const p of [mecenas, outro]) {
      const pix = await p.post('/support/pix', { amountCents: 500 });
      assert.equal((await p.post(`/support/pix/${pix.body.id}/simulate`)).status, 200);
    }
    // o contrato vale nos servidores de quem propõe: cada um usa o seu
    const terms = async (c: Client) => ({ durationDays: 7, cooldownHours: 1, tieClause: false, acceptTerms: true, serverIds: [await serverWith(c)] });
    assert.equal((await alvo.post(`/friends/${mecenas.id}/block`)).status, 200);
    const res = await mecenas.post('/contracts', { ...(await terms(mecenas)), username: alvo.username });
    assert.equal(res.status, 404, 'a mesma resposta de um @ que não existe');
    const ok = await outro.post('/contracts', { ...(await terms(outro)), username: alvo.username });
    assert.equal(ok.status, 200, `outra pessoa convida normalmente: ${JSON.stringify(ok.body)}`);
  });
});

describe('ritmo de fórum e de packs', () => {
  it('posts seguidos num fórum são barrados depois de um tanto', async () => {
    const [dona, membro] = [await signUp(server, 'dona'), await signUp(server, 'membro')];
    const serverId = await serverWith(dona, membro);
    const forum = (await dona.post(`/servers/${serverId}/channels`, { name: 'ideias', type: 'forum' })).body;
    const post = () => membro.post(`/channels/${forum.id}/posts`, { title: 'uma ideia', content: 'texto da ideia' });
    for (let i = 0; i < 10; i++) assert.equal((await post()).status, 200);
    assert.equal((await post()).status, 429);
    // o limite é por pessoa: a dona posta normalmente
    assert.equal((await dona.post(`/channels/${forum.id}/posts`, { title: 'outra ideia', content: 'texto' })).status, 200);
  });

  it('criar packs de figurinha em série também', async () => {
    const ana = await signUp(server, 'ana');
    for (let i = 0; i < 20; i++) assert.equal((await ana.post('/sticker-packs', { name: `pack ${i}` })).status, 200);
    assert.equal((await ana.post('/sticker-packs', { name: 'mais um' })).status, 429);
  });
});
