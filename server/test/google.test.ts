// Login com Google (server/src/google.ts), com um Google de mentira: conectar a uma conta (com a confirmação na
// página) e o login do app desktop, que só entrega o resultado no endereço local do app e com o segredo dele.
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import { after, before, describe, it } from 'node:test';
import { Client, signUp, startServer, type TestServer } from './helpers.ts';

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');

let google: Server;
let server: TestServer;

before(async () => {
  // o "Google": troca o código (que aqui é o próprio sub da conta) por um id_token
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
  server = await startServer({
    GOOGLE_CLIENT_ID: 'cliente-teste',
    GOOGLE_CLIENT_SECRET: 'segredo-teste',
    PUBLIC_URL: 'http://concord.teste',
    GOOGLE_AUTH_URL: 'http://google.teste/auth',
    GOOGLE_TOKEN_URL: `http://127.0.0.1:${port}/token`,
  });
});
after(async () => {
  await server.stop();
  google.close();
});

/** Vai do /start até a volta do Google (com a conta `sub`) e devolve a resposta da volta. */
async function viaGoogle(query: string, sub: string) {
  const start = await fetch(`${server.url}/api/auth/google/start?${query}`, { redirect: 'manual' });
  assert.equal(start.status, 302);
  const state = new URL(start.headers.get('location')!).searchParams.get('state');
  return fetch(`${server.url}/api/auth/google/callback?state=${state}&code=${encodeURIComponent(sub)}`, { redirect: 'manual' });
}

/** Conecta a conta Google `sub` a uma conta do Concord (confirmando na página). */
async function link(c: Client, sub: string) {
  const { ticket } = (await c.post('/me/google/link-ticket')).body;
  const page = await viaGoogle(`link=${ticket}`, sub);
  const html = await page.text();
  assert.ok(html.includes(`@${c.username}`), 'a página mostra para qual conta vai');
  const nonce = /name="nonce" value="([^"]+)"/.exec(html)![1];
  return fetch(`${server.url}/api/auth/google/link-confirm`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: `nonce=${encodeURIComponent(nonce)}`,
    redirect: 'manual',
  });
}

const desktopQuery = () => {
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  return { verifier, query: `desktop=45678&challenge=${challenge}` };
};

describe('conectar o Google a uma conta', () => {
  it('só liga depois de a pessoa confirmar a conta do Concord na página', async () => {
    const a = await signUp(server, 'goog');
    const sub = `sub-${randomBytes(4).toString('hex')}`;
    const { ticket } = (await a.post('/me/google/link-ticket')).body;
    // voltou do Google, mas ninguém confirmou: ainda não está ligado
    assert.equal((await viaGoogle(`link=${ticket}`, sub)).status, 200);
    assert.equal((await a.get('/me')).body.googleLinked, false);
    const confirmed = await link(a, sub);
    assert.equal(confirmed.headers.get('location'), '/#google-linked=1');
    assert.equal((await a.get('/me')).body.googleLinked, true);
  });

  it('a confirmação vale uma vez só', async () => {
    const res = await fetch(`${server.url}/api/auth/google/link-confirm`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'nonce=inventado',
      redirect: 'manual',
    });
    assert.match(res.headers.get('location') ?? '', /google-error=/);
  });
});

describe('login com Google pelo app desktop', () => {
  it('o resultado vai para o endereço local do app e só sai com o segredo dele, uma vez', async () => {
    const a = await signUp(server, 'desk');
    const sub = `sub-${randomBytes(4).toString('hex')}`;
    await link(a, sub);

    const { verifier, query } = desktopQuery();
    const back = await viaGoogle(query, sub);
    const to = new URL(back.headers.get('location')!);
    assert.equal(to.origin, 'http://127.0.0.1:45678', 'volta para o app, não para o site');
    const code = to.searchParams.get('code');

    const anon = new Client(server.url);
    const ok = await anon.post('/auth/handoff', { code, verifier });
    assert.equal(ok.status, 200);
    const me = new Client(server.url);
    me.token = ok.body.token;
    assert.equal((await me.get('/me')).body.id, a.id);
    assert.equal((await anon.post('/auth/handoff', { code, verifier })).status, 400, 'o código não vale de novo');
  });

  it('quem tem o código mas não o segredo do app não entra', async () => {
    const a = await signUp(server, 'desk2');
    const sub = `sub-${randomBytes(4).toString('hex')}`;
    await link(a, sub);
    const { query } = desktopQuery();
    const code = new URL((await viaGoogle(query, sub)).headers.get('location')!).searchParams.get('code');
    assert.equal((await new Client(server.url).post('/auth/handoff', { code, verifier: 'chute' })).status, 400);
  });

  it('pedido de app com porta ou segredo inválido é recusado', async () => {
    const res = await fetch(`${server.url}/api/auth/google/start?desktop=80&challenge=x`, { redirect: 'manual' });
    assert.equal(res.status, 400);
  });
});
