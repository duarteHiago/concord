// Webhooks de entrada: outro app manda mensagem num canal pelo endereço secreto, sem login.
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { io, type Socket } from 'socket.io-client';
import { P } from '../../shared/permissions.ts';
import { signUp, startServer, type Client, type TestServer } from './helpers.ts';

async function connect(c: Client) {
  const socket: Socket = io(server.url, { auth: { token: c.token }, transports: ['websocket'], forceNew: true, reconnection: false, timeout: 5000 });
  await new Promise<void>((resolve, reject) => {
    socket.once('connect', () => resolve());
    socket.once('connect_error', reject);
  });
  return socket;
}

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
  const channel = detail.channels.find((c: { name: string }) => c.name === 'geral').id as string;
  const hook = await owner.post(`/channels/${channel}/webhooks`, { name: 'Grafana' });
  assert.equal(hook.status, 200, JSON.stringify(hook.body));
  return { owner, member, serverId: created.body.id as string, channel, hook: hook.body as { webhook: { id: string }; url: string } };
}

/** Caminho do webhook dentro de /api (o url completo leva o host do teste). */
const pathOf = (url: string) => url.slice(url.indexOf('/api') + 4);

async function rawPost(path: string, body: BodyInit, headers: Record<string, string> = {}) {
  const res = await fetch(`${server.url}/api${path}`, { method: 'POST', body, headers });
  const text = await res.text();
  return { status: res.status, text };
}

const postJson = (path: string, body: unknown) => rawPost(path, JSON.stringify(body), { 'content-type': 'application/json' });

const lastMessage = async (c: Client, channel: string) => {
  const list = (await c.get(`/channels/${channel}/messages`)).body as Record<string, any>[];
  return list[list.length - 1];
};

describe('webhooks de entrada', () => {
  it('manda mensagem no formato do Discord, com cartão e nome trocado', async () => {
    const { member, channel, hook } = await setup();
    const res = await postJson(pathOf(hook.url), {
      content: 'Alerta disparado',
      username: 'Grafana (prod)',
      embeds: [
        {
          title: 'API com 40% de erro',
          url: 'https://grafana.exemplo.com/d/1',
          description: 'Desde 14:02',
          color: 0xe01e5a,
          fields: [{ name: 'Serviço', value: 'pagamentos', inline: true }],
          footer: { text: 'Grafana' },
          timestamp: '2026-11-19T14:02:00Z',
          image: { url: 'https://rastreador.exemplo.com/pixel.png' },
        },
      ],
    });
    assert.equal(res.status, 204, res.text);
    const msg = await lastMessage(member, channel);
    assert.equal(msg.content, 'Alerta disparado');
    assert.equal(msg.author.webhook, true);
    assert.equal(msg.author.displayName, 'Grafana');
    assert.equal(msg.data.webhook.name, 'Grafana (prod)');
    const [embed] = msg.data.embeds;
    assert.equal(embed.title, 'API com 40% de erro');
    assert.equal(embed.color, 0xe01e5a);
    assert.deepEqual(embed.fields, [{ name: 'Serviço', value: 'pagamentos', inline: true }]);
    assert.equal(embed.footer, 'Grafana');
    assert.equal(embed.timestamp, Date.parse('2026-11-19T14:02:00Z'));
    // imagem por link externo não passa (entregaria o IP de quem lê)
    assert.equal(JSON.stringify(msg.data).includes('rastreador'), false);
  });

  it('?wait=true devolve a mensagem criada', async () => {
    const { hook } = await setup();
    const res = await postJson(`${pathOf(hook.url)}?wait=true`, { content: 'oi' });
    assert.equal(res.status, 200);
    assert.ok(JSON.parse(res.text).id);
  });

  it('formato do Slack: text com link e attachments', async () => {
    const { member, channel, hook } = await setup();
    const res = await postJson(`${pathOf(hook.url)}/slack`, {
      text: 'Site fora do ar: <https://status.exemplo.com|ver status>',
      attachments: [{ color: 'danger', title: 'exemplo.com', text: 'Timeout', fields: [{ title: 'Região', value: 'sa-east', short: true }] }],
    });
    assert.equal(res.status, 200, res.text);
    assert.equal(res.text, 'ok');
    const msg = await lastMessage(member, channel);
    assert.equal(msg.content, 'Site fora do ar: ver status (https://status.exemplo.com)');
    assert.equal(msg.data.embeds[0].color, 0xe01e5a);
    assert.deepEqual(msg.data.embeds[0].fields, [{ name: 'Região', value: 'sa-east', inline: true }]);
  });

  it('manda imagem como arquivo (multipart, como no Discord)', async () => {
    const { member, channel, hook } = await setup();
    // PNG de 1x1
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
    const form = new FormData();
    form.append('payload_json', JSON.stringify({ content: 'gráfico do incidente' }));
    form.append('files[0]', new Blob([png], { type: 'image/png' }), 'grafico.png');
    const res = await rawPost(pathOf(hook.url), form);
    assert.equal(res.status, 204, res.text);
    const msg = await lastMessage(member, channel);
    assert.equal(msg.content, 'gráfico do incidente');
    assert.equal(msg.attachments.length, 1);
    assert.equal(msg.attachments[0].image, true);
  });

  it('token errado ou webhook apagado: 404, e as mensagens antigas ficam', async () => {
    const { owner, member, channel, hook } = await setup();
    const path = pathOf(hook.url);
    assert.equal((await postJson(path.replace(/\/[^/]+$/, '/wh_errado'), { content: 'x' })).status, 404);
    assert.equal((await postJson(path, { content: 'antes de apagar' })).status, 204);
    assert.equal((await owner.del(`/channels/${channel}/webhooks/${hook.webhook.id}`)).status, 200);
    assert.equal((await postJson(path, { content: 'depois' })).status, 404);
    assert.equal((await lastMessage(member, channel)).content, 'antes de apagar');
  });

  it('trocar o token desativa o endereço antigo', async () => {
    const { owner, channel, hook } = await setup();
    const fresh = await owner.post(`/channels/${channel}/webhooks/${hook.webhook.id}/token`);
    assert.equal(fresh.status, 200);
    assert.equal((await postJson(pathOf(hook.url), { content: 'velho' })).status, 404);
    assert.equal((await postJson(pathOf(fresh.body.url), { content: 'novo' })).status, 204);
  });

  it('mensagem vazia não passa', async () => {
    const { hook } = await setup();
    assert.equal((await postJson(pathOf(hook.url), { content: '   ', embeds: [{}] })).status, 400);
  });

  it('só quem gerencia o canal vê e cria webhooks; o token não aparece na lista', async () => {
    const { owner, member, channel } = await setup();
    assert.equal((await member.get(`/channels/${channel}/webhooks`)).status, 403);
    assert.equal((await member.post(`/channels/${channel}/webhooks`, { name: 'meu' })).status, 403);
    const list = await owner.get(`/channels/${channel}/webhooks`);
    assert.equal(list.status, 200);
    assert.equal(list.body.length, 1);
    assert.equal(JSON.stringify(list.body).includes('wh_'), false);
  });

  it('@usuario avisa a pessoa; @todos não', async () => {
    const { member, hook } = await setup();
    const mentions: unknown[] = [];
    const socket = await connect(member);
    socket.on('mention', (m: unknown) => mentions.push(m));
    await postJson(pathOf(hook.url), { content: '@todos atenção' });
    await postJson(pathOf(hook.url), { content: `@${member.username} você está de plantão` });
    await new Promise((r) => setTimeout(r, 300));
    socket.disconnect();
    assert.equal(mentions.length, 1);
  });

  it('a conta do webhook não recebe DM nem pedido de amizade', async () => {
    const { member, channel, hook } = await setup();
    await postJson(pathOf(hook.url), { content: 'oi' });
    const author = (await lastMessage(member, channel)).author;
    assert.notEqual((await member.post('/dms', { userId: author.id })).status, 200);
    assert.notEqual((await member.post('/friends', { username: author.username })).status, 200);
  });

  it('quem gerencia canais mas não pode escrever no canal não cria webhook para escrever por ele', async () => {
    const { owner, member, serverId, channel } = await setup();
    const role = (await owner.post(`/servers/${serverId}/roles`, { name: 'Organiza' })).body;
    await owner.patch(`/roles/${role.id}`, { permissions: P.MANAGE_CHANNELS | P.VIEW_CHANNEL | P.SEND_MESSAGES });
    await owner.put(`/servers/${serverId}/members/${member.id}/roles`, { roleIds: [role.id] });
    // canal só leitura para o cargo
    assert.equal((await owner.put(`/channels/${channel}/overwrites/${role.id}`, { allow: 0, deny: P.SEND_MESSAGES })).status, 200);
    assert.equal((await member.post(`/channels/${channel}/webhooks`, { name: 'Atalho' })).status, 403);
    assert.equal((await owner.put(`/channels/${channel}/overwrites/${role.id}`, { allow: 0, deny: 0 })).status, 200);
    assert.equal((await member.post(`/channels/${channel}/webhooks`, { name: 'Atalho' })).status, 200);
  });

  it('o nome trocado não leva quebra de linha nem caractere invisível', async () => {
    const { member, channel, hook } = await setup();
    // quebra de linha, espaço de largura zero e inversão de direção do texto
    const sneaky = ['Ana', String.fromCharCode(10), String.fromCharCode(0x200b), 'da', String.fromCharCode(0x202e), 'moderação'].join('');
    await postJson(pathOf(hook.url), { content: 'x', username: sneaky });
    assert.equal((await lastMessage(member, channel)).data.webhook.name, 'Ana damoderação');
  });

  it('quem criou sai do servidor (ou é expulso): os webhooks dele param, as mensagens ficam', async () => {
    const { owner, member, serverId, channel } = await setup();
    const role = (await owner.post(`/servers/${serverId}/roles`, { name: 'Ops' })).body;
    await owner.patch(`/roles/${role.id}`, { permissions: P.MANAGE_CHANNELS | P.VIEW_CHANNEL | P.SEND_MESSAGES });
    await owner.put(`/servers/${serverId}/members/${member.id}/roles`, { roleIds: [role.id] });
    const mine = (await member.post(`/channels/${channel}/webhooks`, { name: 'Do membro' })).body;
    assert.equal((await postJson(pathOf(mine.url), { content: 'antes de sair' })).status, 204);

    assert.equal((await owner.del(`/servers/${serverId}/members/${member.id}`)).status, 200);
    assert.equal((await postJson(pathOf(mine.url), { content: 'depois' })).status, 404);
    const list = (await owner.get(`/channels/${channel}/messages`)).body as { content: string }[];
    assert.ok(list.some((m) => m.content === 'antes de sair'));
    // o webhook do dono (criado no setup) continua
    assert.equal((await owner.get(`/channels/${channel}/webhooks`)).body.length, 1);
  });
});
