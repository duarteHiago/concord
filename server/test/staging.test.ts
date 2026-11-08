// Concord de testes (homologação): só entra quem está na lista, e o site fica fora dos buscadores.
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { Client, startServer, type TestServer } from './helpers.ts';

let server: TestServer;
before(async () => {
  server = await startServer({ STAGING: 'true', STAGING_USERS: 'testador, @Outra_Pessoa' });
});
after(() => server.stop());

const register = (username: string) => new Client(server.url).post('/auth/register', { username, password: 'senha-forte-123' });

describe('Concord de testes', () => {
  it('quem está na lista cria conta, entra e usa a API', async () => {
    const created = await register('testador');
    assert.equal(created.status, 200);
    const c = new Client(server.url);
    const login = await c.post('/auth/login', { username: 'testador', password: 'senha-forte-123' });
    assert.equal(login.status, 200);
    c.token = login.body.token;
    assert.equal((await c.get('/me')).status, 200);
  });

  it('a lista não liga para maiúsculas nem para o @', async () => {
    assert.equal((await register('outra_pessoa')).status, 200);
  });

  it('quem não está na lista não cria conta', async () => {
    const res = await register('estranho');
    assert.equal(res.status, 403);
    assert.match(res.body.error, /Concord de testes/);
  });

  it('fica fora dos buscadores', async () => {
    const health = await fetch(`${server.url}/health`);
    assert.equal(health.headers.get('x-robots-tag'), 'noindex, nofollow');
    const robots = await fetch(`${server.url}/robots.txt`);
    assert.equal(robots.status, 200);
    assert.match(await robots.text(), /Disallow: \//);
  });
});
