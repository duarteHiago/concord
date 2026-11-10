// Aparelhos conectados: cada login é uma sessão; dá para ver, tirar um aparelho e sair de todos os outros.
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { Client, signUp, startServer, type TestServer } from './helpers.ts';

let server: TestServer;
before(async () => {
  server = await startServer();
});
after(() => server.stop());

interface SessionsBody {
  sessions: { id: string; current: boolean; userAgent: string | null }[];
  currentListed: boolean;
}

/** Outro aparelho entrando na mesma conta, com o navegador dele. */
async function loginAgain(c: Client, userAgent: string) {
  const res = await fetch(`${server.url}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'user-agent': userAgent },
    body: JSON.stringify({ username: c.username, password: 'senha-forte-123' }),
  });
  const other = new Client(server.url);
  other.token = ((await res.json()) as { token: string }).token;
  // a primeira chamada com o token anota o aparelho
  await fetch(`${server.url}/api/me`, { headers: { authorization: `Bearer ${other.token}`, 'user-agent': userAgent } });
  return other;
}

describe('aparelhos conectados', () => {
  it('lista os aparelhos, marca o atual e anota o navegador', async () => {
    const ana = await signUp(server, 'ana');
    await loginAgain(ana, 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Safari/604.1');
    const res = await ana.get<SessionsBody>('/me/sessions');
    assert.equal(res.status, 200);
    assert.equal(res.body.sessions.length, 2);
    assert.equal(res.body.sessions.filter((s) => s.current).length, 1);
    assert.ok(res.body.sessions.some((s) => s.userAgent?.includes('iPhone')));
  });

  it('tirar um aparelho derruba só o token dele', async () => {
    const ana = await signUp(server, 'ana');
    const phone = await loginAgain(ana, 'celular');
    const other = (await ana.get<SessionsBody>('/me/sessions')).body.sessions.find((s) => !s.current)!;
    assert.equal((await ana.del(`/me/sessions/${other.id}`)).status, 200);
    assert.equal((await phone.get('/me')).status, 401);
    assert.equal((await ana.get('/me')).status, 200);
    assert.equal((await ana.del(`/me/sessions/${other.id}`)).status, 404);
  });

  it('não dá para tirar o aparelho de outra pessoa', async () => {
    const [ana, bia] = [await signUp(server, 'ana'), await signUp(server, 'bia')];
    const anaSession = (await ana.get<SessionsBody>('/me/sessions')).body.sessions[0];
    assert.equal((await bia.del(`/me/sessions/${anaSession.id}`)).status, 404);
    assert.equal((await ana.get('/me')).status, 200);
  });

  it('sair de todos os outros: os outros caem, este continua com um token novo', async () => {
    const ana = await signUp(server, 'ana');
    const [pc, phone] = [await loginAgain(ana, 'pc'), await loginAgain(ana, 'celular')];
    const res = await ana.post('/me/sessions/logout-others');
    assert.equal(res.status, 200);
    assert.equal((await pc.get('/me')).status, 401);
    assert.equal((await phone.get('/me')).status, 401);
    ana.token = res.body.token;
    assert.equal((await ana.get('/me')).status, 200);
    const list = (await ana.get<SessionsBody>('/me/sessions')).body;
    assert.equal(list.sessions.length, 1);
    assert.ok(list.sessions[0].current);
  });

  it('sair da conta encerra a sessão no servidor (o token copiado não serve mais)', async () => {
    const ana = await signUp(server, 'ana');
    const copied = ana.token;
    assert.equal((await ana.post('/auth/logout')).status, 200);
    const thief = new Client(server.url);
    thief.token = copied;
    assert.equal((await thief.get('/me')).status, 401);
  });

  it('trocar a senha derruba as outras sessões e some com elas da lista', async () => {
    const ana = await signUp(server, 'ana');
    const phone = await loginAgain(ana, 'celular');
    const changed = await ana.patch('/me', { currentPassword: 'senha-forte-123', newPassword: 'outra-senha-456' });
    assert.equal(changed.status, 200);
    ana.token = changed.body.token;
    assert.equal((await phone.get('/me')).status, 401);
    const list = (await ana.get<SessionsBody>('/me/sessions')).body;
    assert.equal(list.sessions.length, 1);
  });
});
