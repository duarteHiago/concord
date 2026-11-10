// Anexos só abrem com o link assinado que o app entrega a quem vê a mensagem (ver fileLinks.ts).
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { signUp, startServer, type Client, type TestServer } from './helpers.ts';

let server: TestServer;
before(async () => {
  server = await startServer();
});
after(() => server.stop());

/** Envia um .txt como anexo e devolve o que a API respondeu. */
async function upload(c: Client, text: string) {
  const res = await fetch(`${server.url}/api/attachments?name=nota.txt`, {
    method: 'POST',
    headers: { authorization: `Bearer ${c.token}`, 'content-type': 'application/octet-stream' },
    body: text,
  });
  assert.equal(res.status, 200, await res.clone().text());
  return (await res.json()) as { id: string; url: string };
}

const status = async (path: string) => (await fetch(`${server.url}${path}`)).status;

describe('links assinados dos anexos', () => {
  it('quem vê a mensagem recebe um link que abre; sem assinatura, adulterado ou vencido, não abre', async () => {
    const [ana, bia] = [await signUp(server, 'ana'), await signUp(server, 'bia')];
    assert.equal((await ana.post('/friends', { userId: bia.id })).status, 200);
    assert.equal((await bia.post(`/friends/${ana.id}/accept`)).status, 200);
    const dm = (await ana.post('/dms', { userId: bia.id })).body;

    const up = await upload(ana, 'segredo da conversa');
    assert.match(up.url, /^\/uploads\/files\/[^?]+\?e=\d+&s=[\w-]+$/);
    const sent = await ana.post(`/dms/${dm.id}/messages`, { content: '', attachments: [up.id] });
    assert.equal(sent.status, 200, JSON.stringify(sent.body));

    // a Bia carrega a conversa e abre o arquivo
    const [msg] = (await bia.get(`/dms/${dm.id}/messages`)).body as { attachments: { url: string }[] }[];
    const signed = msg.attachments[0].url;
    const res = await fetch(`${server.url}${signed}`);
    assert.equal(res.status, 200);
    assert.equal(await res.text(), 'segredo da conversa');
    assert.match(res.headers.get('cache-control') ?? '', /^private/);

    const [path, query] = signed.split('?');
    const params = new URLSearchParams(query);
    assert.equal(await status(path), 403, 'sem assinatura');
    assert.equal(await status(`${path}?e=${params.get('e')}&s=${'A'.repeat(params.get('s')!.length)}`), 403, 'assinatura adulterada');
    assert.equal(await status(`${path}?e=${Number(params.get('e')) + 86_400}&s=${params.get('s')}`), 403, 'validade esticada');
    assert.equal(await status(`${path}?e=${Math.floor(Date.now() / 1000) - 60}&s=${params.get('s')}`), 403, 'vencido');

    // a assinatura de um arquivo não abre outro
    const other = await upload(ana, 'outro arquivo');
    assert.equal(await status(`${other.url.split('?')[0]}?${query}`), 403);
  });
});
