// Cadastro com e-mail obrigatório (código de 6 dígitos), um e-mail por caixa de entrada, conta antiga sem e-mail
// travada até confirmar, suspensão e exclusão pelo portal da equipe, anti-flood de mensagens e limite de tamanho
// nas rotas de conta. O envio de e-mail vai para um "Brevo" de mentira aqui mesmo, que guarda o que chegou.
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { emailDomainAllowed, emailKey } from '../../shared/email.ts';
import { networkOf } from '../src/net.ts';
import { Client, signUp, startServer, type TestServer } from './helpers.ts';

describe('regras de e-mail e de rede (contas)', () => {
  it('só os provedores grandes', () => {
    assert.ok(emailDomainAllowed('fulano@gmail.com'));
    assert.ok(emailDomainAllowed('Fulano@Hotmail.com.br'));
    assert.ok(emailDomainAllowed('fulano@icloud.com'));
    assert.ok(!emailDomainAllowed('fulano@example.com'));
    assert.ok(!emailDomainAllowed('fulano@gmail.com.evil.io'));
  });

  it('apelidos da mesma caixa contam como o mesmo e-mail', () => {
    assert.equal(emailKey('F.u.La.No+concord@gmail.com'), 'fulano@gmail.com');
    assert.equal(emailKey('fulano@googlemail.com'), 'fulano@gmail.com');
    assert.equal(emailKey('fulano+1@outlook.com'), 'fulano@outlook.com');
    // fora do Gmail, o ponto faz parte do nome
    assert.equal(emailKey('fu.lano@outlook.com'), 'fu.lano@outlook.com');
  });

  it('IPv6 conta por bloco: trocar o final do endereço não muda a rede', () => {
    assert.equal(networkOf('2804:14d:4082:9aac:d8e:a5::1'), networkOf('2804:14d:4082:9aac:ffff::2'));
    assert.notEqual(networkOf('2804:14d:4082:9aac::1'), networkOf('2804:14d:4082:9aad::1'));
    assert.equal(networkOf('2804:14d:4082:9aac::1', 48), '2804:14d:4082::/48');
    assert.equal(networkOf('::ffff:179.105.131.7'), '179.105.131.7');
    assert.equal(networkOf('34.85.213.44'), '34.85.213.44');
  });
});

// ------------------------------------------------------------------ "Brevo" de mentira

interface Mail {
  to: string;
  subject: string;
  text: string;
}
const mails: Mail[] = [];
let brevo: Server;
let brevoUrl = '';

before(async () => {
  brevo = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      const m = JSON.parse(body) as { to: { email: string }[]; subject: string; textContent: string };
      mails.push({ to: m.to[0].email, subject: m.subject, text: m.textContent });
      res.writeHead(201, { 'content-type': 'application/json' }).end('{}');
    });
  });
  await new Promise<void>((r) => brevo.listen(0, '127.0.0.1', r));
  brevoUrl = `http://127.0.0.1:${(brevo.address() as AddressInfo).port}`;
});
after(() => brevo.close());

const mailEnv = () => ({ BREVO_API_KEY: 'xkeysib-teste', MAIL_FROM: 'nao-responda@concord.test', PUBLIC_URL: 'http://concord.test', BREVO_API_URL: brevoUrl });
const lastMailTo = (to: string) => [...mails].reverse().find((m) => m.to === to) ?? assert.fail(`nenhum e-mail para ${to}`);
const codeFor = (to: string) => lastMailTo(to).subject.match(/^(\d{6}) /)![1];

let seq = 0;
const uniq = (name: string) => `${name}${process.pid % 10000}${++seq}`;

/** Cadastro completo com e-mail: pede o código, lê no "e-mail" e confirma. */
async function signUpWithEmail(server: TestServer, name: string, email = `${uniq(name)}@gmail.com`) {
  const c = new Client(server.url);
  const username = uniq(name);
  const start = await c.post('/auth/register/start', { username, password: 'senha-forte-123', email });
  assert.equal(start.status, 200, JSON.stringify(start.body));
  const done = await c.post('/auth/register/confirm', { signupId: start.body.signupId, code: codeFor(email) });
  assert.equal(done.status, 200, JSON.stringify(done.body));
  c.token = done.body.token;
  c.id = done.body.user.id;
  c.username = username;
  return c;
}

describe('cadastro com e-mail obrigatório', () => {
  let server: TestServer;
  before(async () => {
    server = await startServer(mailEnv());
  });
  after(() => server.stop());

  it('o app fica sabendo, e o cadastro direto (sem e-mail) é recusado', async () => {
    const c = new Client(server.url);
    assert.equal((await c.get('/config')).body.emailRequired, true);
    assert.equal((await c.post('/auth/register', { username: uniq('direto'), password: 'senha-forte-123' })).status, 400);
  });

  it('e-mail de provedor fora da lista é recusado', async () => {
    const res = await new Client(server.url).post('/auth/register/start', { username: uniq('fora'), password: 'senha-forte-123', email: 'fulano@example.com' });
    assert.equal(res.status, 400);
  });

  it('a conta só nasce com o código certo, já com o e-mail confirmado', async () => {
    const c = new Client(server.url);
    const email = `${uniq('codigo')}@hotmail.com`;
    const username = uniq('codigo');
    const start = await c.post('/auth/register/start', { username, password: 'senha-forte-123', email });
    assert.equal(start.status, 200, JSON.stringify(start.body));
    // ainda não existe conta: o login falha
    assert.equal((await c.post('/auth/login', { username, password: 'senha-forte-123' })).status, 401);
    const wrong = codeFor(email) === '000000' ? '111111' : '000000';
    const bad = await c.post('/auth/register/confirm', { signupId: start.body.signupId, code: wrong });
    assert.equal(bad.status, 400);
    assert.match(bad.body.error, /Mais 4/);
    const ok = await c.post('/auth/register/confirm', { signupId: start.body.signupId, code: codeFor(email) });
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    assert.equal(ok.body.user.email, email);
    assert.ok(ok.body.recoveryCode);
    // o código vale uma vez só
    assert.equal((await c.post('/auth/register/confirm', { signupId: start.body.signupId, code: codeFor(email) })).status, 400);
  });

  it('código errado 5 vezes cancela o cadastro', async () => {
    const c = new Client(server.url);
    const email = `${uniq('chute')}@gmail.com`;
    const start = await c.post('/auth/register/start', { username: uniq('chute'), password: 'senha-forte-123', email });
    const right = codeFor(email);
    const wrong = right === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i++) assert.equal((await c.post('/auth/register/confirm', { signupId: start.body.signupId, code: wrong })).status, 400);
    assert.equal((await c.post('/auth/register/confirm', { signupId: start.body.signupId, code: right })).status, 400);
  });

  it('um e-mail por conta, contando pontos e "+algo" do Gmail', async () => {
    const base = uniq('dono');
    await signUpWithEmail(server, 'dono', `${base}@gmail.com`);
    const alias = `${base.slice(0, 3)}.${base.slice(3)}+outra@gmail.com`;
    const res = await new Client(server.url).post('/auth/register/start', { username: uniq('copia'), password: 'senha-forte-123', email: alias });
    assert.equal(res.status, 409);
  });

  it('mensagens rápidas demais são barradas (anti-flood)', async () => {
    const a = await signUpWithEmail(server, 'flood');
    const created = await a.post('/servers', { name: 'Flood' });
    const detail = await a.get(`/servers/${created.body.id}`);
    const geral = (detail.body.channels as { id: string; name: string }[]).find((ch) => ch.name === 'geral')!.id;
    for (let i = 0; i < 10; i++) assert.equal((await a.post(`/channels/${geral}/messages`, { content: `oi ${i}` })).status, 200);
    assert.equal((await a.post(`/channels/${geral}/messages`, { content: 'mais uma' })).status, 429);
  });

  it('pedido grande demais nas rotas de conta é recusado na porta', async () => {
    const res = await new Client(server.url).post('/auth/login', { username: 'x'.repeat(20_000), password: 'y' });
    assert.equal(res.status, 413);
  });
});

describe('conta antiga sem e-mail, suspensão e exclusão', () => {
  const dir = mkdtempSync(join(tmpdir(), 'concord-signup-'));
  const dbPath = join(dir, 'concord.db');
  let server: TestServer;
  let old: Client;
  let chefe: Client;
  let bot: string;

  before(async () => {
    // antes da regra: contas criadas sem e-mail (e o nome da equipe ainda livre)
    const legacy = await startServer({ DB_PATH: dbPath });
    old = await signUp(legacy, 'antigo');
    chefe = await signUp(legacy, 'chefe');
    const created = await old.post('/bots', { name: 'Robozinho' });
    assert.equal(created.status, 200, JSON.stringify(created.body));
    bot = created.body.bot.id;
    await legacy.stop();
    // depois: e-mail obrigatório, e o chefe na equipe
    server = await startServer({ ...mailEnv(), DB_PATH: dbPath, ADMIN_USERS: chefe.username });
    old.base = server.url;
    chefe.base = server.url;
    // a equipe também é conta com senha: confirma um e-mail antes de usar o portal
    await confirmEmail(chefe, `${uniq('chefe')}@outlook.com`);
  });

  /** Cadastra o e-mail nas configurações e clica no link que chegou. */
  async function confirmEmail(c: Client, email: string) {
    assert.equal((await c.put('/me/email', { email, password: 'senha-forte-123' })).status, 200);
    const token = lastMailTo(email).text.match(/verify-email=([\w-]+)/)![1];
    assert.equal((await new Client(server.url).post('/auth/email/verify', { token })).status, 200);
  }
  after(async () => {
    await server.stop();
    rmSync(dir, { recursive: true, force: true });
  });

  it('sem e-mail, a conta só consegue cadastrar um e-mail', async () => {
    const me = await old.get('/me');
    assert.equal(me.status, 200);
    assert.equal(me.body.emailRequired, true);
    const blocked = await old.get('/servers');
    assert.equal(blocked.status, 403);
    assert.equal(blocked.body.code, 'email_required');
    await confirmEmail(old, `${uniq('antigo')}@yahoo.com.br`);
    assert.equal((await old.get('/servers')).status, 200);
    // não dá para remover o e-mail obrigatório
    assert.equal((await old.del('/me/email')).status, 400);
  });

  it('a equipe suspende (com motivo), a conta cai e não entra; reativar devolve', async () => {
    assert.equal((await chefe.post(`/admin/users/${old.id}/ban`, {})).status, 400);
    const ban = await chefe.post(`/admin/users/${old.id}/ban`, { reason: 'conta de teste em massa' });
    assert.equal(ban.status, 200, JSON.stringify(ban.body));
    assert.equal(ban.body.bots, 1);
    assert.equal((await old.get('/me')).status, 401);
    const login = await new Client(server.url).post('/auth/login', { username: old.username, password: 'senha-forte-123' });
    assert.equal(login.status, 403);
    const detail = await chefe.get(`/admin/users/${old.id}`);
    assert.equal(detail.body.ban.reason, 'conta de teste em massa');
    assert.equal(detail.body.actions[0].action, 'ban');
    assert.equal((await chefe.post(`/admin/users/${old.id}/unban`, {})).status, 200);
    assert.equal((await new Client(server.url).post('/auth/login', { username: old.username, password: 'senha-forte-123' })).status, 200);
    // a equipe não mexe na própria conta, e quem não é da equipe nem vê a rota
    assert.equal((await chefe.post(`/admin/users/${chefe.id}/ban`, { reason: 'x' })).status, 400);
    const outsider = await signUpWithEmail(server, 'fora');
    assert.equal((await outsider.post(`/admin/users/${chefe.id}/ban`, { reason: 'x' })).status, 404);
  });

  it('a equipe apaga uma conta vazia (e os bots dela), confirmando o nome', async () => {
    const lixo = await signUpWithEmail(server, 'lixo');
    assert.equal((await chefe.del(`/admin/users/${lixo.id}?confirm=errado`)).status, 400);
    assert.equal((await chefe.del(`/admin/users/${lixo.id}?confirm=${lixo.username}`)).status, 200);
    assert.equal((await lixo.get('/me')).status, 401);
    // dono de servidor não é apagado (o servidor iria junto): só suspenso
    const dono = await signUpWithEmail(server, 'dono2');
    await dono.post('/servers', { name: 'Meu' });
    assert.equal((await chefe.del(`/admin/users/${dono.id}?confirm=${dono.username}`)).status, 409);
    // o bot da conta suspensa antes também tinha sido suspenso, e voltou junto
    assert.equal((await chefe.get(`/admin/users/${bot}`)).body.banned, false);
  });
});
