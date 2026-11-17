// Webhooks de entrada: outro app (Grafana, Uptime Kuma, um script) manda mensagem num canal por um endereço
// secreto, sem login: POST /api/webhooks/:id/:token.
//
// O corpo segue o formato de webhook do Discord (content, username, embeds e arquivos em multipart), para as
// ferramentas que já falam com o Discord funcionarem sem adaptação. Em /slack, o formato do Slack (text e
// attachments). Imagem por link externo (embeds[].image, avatar_url) é ignorada de propósito: o app de quem lê
// buscaria o endereço e entregaria o IP da pessoa a um site qualquer. Imagem entra como arquivo.
//
// Cada webhook tem uma conta escondida (users.is_webhook = 1) que assina as mensagens: não é membro de nada,
// não tem senha que alguém saiba nem token de bot. Só o hash do token fica no banco.
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import bcrypt from 'bcryptjs';
import express, { type NextFunction, type Request, type Response, type Router } from 'express';
import { P } from '../../shared/permissions.ts';
import { getChannel, requireChannelPerm } from './access.ts';
import { config } from './config.ts';
import { all, get, run, tx, type ChannelRow, type UserRow } from './db.ts';
import { fail, humansOnly, optStr, str, uid } from './http.ts';
import { clientIp, limiter } from './recovery.ts';
import { removeUpload, saveImage } from './uploads.ts';

export interface WebhookFile {
  name: string;
  buf: Buffer;
}

/** Cartão de uma mensagem de webhook (o "embed" do Discord, ou o "attachment" do Slack). */
export interface WebhookEmbed {
  title?: string;
  url?: string;
  description?: string;
  /** cor da faixa lateral, 0xRRGGBB */
  color?: number;
  author?: string;
  fields?: { name: string; value: string; inline: boolean }[];
  footer?: string;
  /** em ms */
  timestamp?: number;
}

/** O que vai em messages.data numa mensagem de webhook. */
export interface WebhookMessageData {
  webhook: { name?: string };
  embeds?: WebhookEmbed[];
}

interface WebhookRow {
  id: string;
  channel_id: string;
  user_id: string;
  creator_id: string | null;
  token_hash: string;
  created_at: number;
  last_used_at: number | null;
}

interface Deliver {
  deliver: (channel: ChannelRow, authorId: string, content: string, files: WebhookFile[], data: WebhookMessageData | null) => Promise<{ id: string }>;
}

const MAX_CONTENT = 2000;
const MAX_EMBEDS = 10;
const MAX_FIELDS = 25;
const MAX_FILES = 10;
/** soma do texto de todos os cartões de uma mensagem (o mesmo teto do Discord) */
const MAX_EMBED_TOTAL = 6000;
const MAX_PER_CHANNEL = 10;

const hashToken = (token: string) => createHash('sha256').update(token).digest();
const newToken = () => `wh_${randomBytes(32).toString('base64url')}`;

// ------------------------------------------------------------------ o que chega

const clip = (v: unknown, max: number): string | undefined => {
  if (typeof v !== 'string' && typeof v !== 'number') return undefined;
  const s = String(v).trim();
  return s ? s.slice(0, max) : undefined;
};

/** Só http(s): nada de javascript:, data: e afins virando link clicável. */
const safeUrl = (v: unknown): string | undefined => {
  const s = clip(v, 2000);
  if (!s) return undefined;
  try {
    const u = new URL(s);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : undefined;
  } catch {
    return undefined;
  }
};

const SLACK_COLORS: Record<string, number> = { good: 0x2eb67d, warning: 0xecb22e, danger: 0xe01e5a };

function parseColor(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 0xffffff) return v;
  if (typeof v !== 'string') return undefined;
  if (SLACK_COLORS[v]) return SLACK_COLORS[v];
  const hex = /^#?([0-9a-f]{6})$/i.exec(v.trim());
  return hex ? parseInt(hex[1], 16) : undefined;
}

function parseTimestamp(v: unknown): number | undefined {
  // ISO (Discord) ou segundos desde 1970 (Slack, "ts")
  const ms = typeof v === 'number' || (typeof v === 'string' && /^\d+(\.\d+)?$/.test(v)) ? Number(v) * 1000 : typeof v === 'string' ? Date.parse(v) : NaN;
  return Number.isFinite(ms) && ms > 0 ? Math.round(ms) : undefined;
}

/** Recorta os cartões dentro dos limites; o que não couber no total fica de fora. */
function finishEmbeds(list: WebhookEmbed[]): WebhookEmbed[] {
  let budget = MAX_EMBED_TOTAL;
  const take = (s: string | undefined) => {
    if (!s || budget <= 0) return undefined;
    const out = s.slice(0, budget);
    budget -= out.length;
    return out;
  };
  const out: WebhookEmbed[] = [];
  for (const e of list.slice(0, MAX_EMBEDS)) {
    const embed: WebhookEmbed = {
      title: take(e.title),
      url: e.url,
      description: take(e.description),
      color: e.color,
      author: take(e.author),
      fields: e.fields
        ?.slice(0, MAX_FIELDS)
        .map((f) => ({ name: take(f.name) ?? '', value: take(f.value) ?? '', inline: f.inline }))
        .filter((f) => f.name || f.value),
      footer: take(e.footer),
      timestamp: e.timestamp,
    };
    if (!embed.fields?.length) delete embed.fields;
    for (const k of Object.keys(embed) as (keyof WebhookEmbed)[]) if (embed[k] === undefined) delete embed[k];
    if (embed.title || embed.description || embed.fields || embed.author || embed.footer) out.push(embed);
  }
  return out;
}

const asArray = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

/** Formato do Discord. */
function fromDiscord(body: Record<string, unknown>) {
  const embeds = asArray(body.embeds).map((raw): WebhookEmbed => {
    const e = obj(raw);
    return {
      title: clip(e.title, 256),
      url: safeUrl(e.url),
      description: clip(e.description, 4096),
      color: parseColor(e.color),
      author: clip(obj(e.author).name, 256),
      fields: asArray(e.fields).map((f) => ({ name: clip(obj(f).name, 256) ?? '', value: clip(obj(f).value, 1024) ?? '', inline: obj(f).inline === true })),
      footer: clip(obj(e.footer).text, 2048),
      timestamp: parseTimestamp(e.timestamp),
    };
  });
  return { content: clip(body.content, MAX_CONTENT) ?? '', name: clip(body.username, 80), embeds: finishEmbeds(embeds) };
}

/** O "mrkdwn" do Slack: <url|texto> vira "texto (url)"; <!here>/<!channel> não avisam ninguém aqui. */
function slackText(v: unknown, max: number): string | undefined {
  const s = clip(v, max * 2);
  if (!s) return undefined;
  return s
    .replace(/<((?:https?|mailto):[^|>]+)\|([^>]+)>/g, '$2 ($1)')
    .replace(/<((?:https?|mailto):[^>]+)>/g, '$1')
    .replace(/<!(here|channel|everyone)>/g, '@$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .slice(0, max);
}

/** Formato do Slack (incoming webhook): text e attachments. Os "blocks" ficam de fora (o text é o resumo). */
function fromSlack(body: Record<string, unknown>) {
  const embeds = asArray(body.attachments).map((raw): WebhookEmbed => {
    const a = obj(raw);
    const description = [slackText(a.pretext, 1000), slackText(a.text ?? a.fallback, 4096)].filter(Boolean).join('\n');
    return {
      title: slackText(a.title, 256),
      url: safeUrl(a.title_link),
      description: description || undefined,
      color: parseColor(a.color),
      author: slackText(a.author_name, 256),
      fields: asArray(a.fields).map((f) => ({ name: slackText(obj(f).title, 256) ?? '', value: slackText(obj(f).value, 1024) ?? '', inline: obj(f).short === true })),
      footer: slackText(a.footer, 2048),
      timestamp: parseTimestamp(a.ts),
    };
  });
  return { content: slackText(body.text, MAX_CONTENT) ?? '', name: clip(body.username, 80), embeds: finishEmbeds(embeds) };
}

/** Corpo do pedido: JSON, ou multipart (payload_json + arquivos, como no Discord). */
async function readBody(req: Request): Promise<{ body: Record<string, unknown>; files: WebhookFile[] }> {
  if (!req.is('multipart/form-data')) return { body: obj(req.body), files: [] };
  if (!Buffer.isBuffer(req.body)) fail(400, 'Corpo inválido');
  let form: FormData;
  try {
    form = await new globalThis.Request('http://webhook.local/', {
      method: 'POST',
      headers: { 'content-type': String(req.headers['content-type']) },
      body: new Uint8Array(req.body as Buffer),
    }).formData();
  } catch {
    return fail(400, 'Formulário inválido');
  }
  let body: Record<string, unknown> = {};
  const files: WebhookFile[] = [];
  for (const [key, value] of form.entries()) {
    if (typeof value === 'string') {
      if (key === 'payload_json') {
        try {
          body = { ...obj(JSON.parse(value)), ...body };
        } catch {
          fail(400, 'payload_json inválido');
        }
      } else if (key === 'content' || key === 'username') {
        body[key] = value;
      }
    } else {
      if (files.length >= MAX_FILES) fail(400, `Até ${MAX_FILES} arquivos por mensagem`);
      files.push({ name: value.name || 'arquivo', buf: Buffer.from(await value.arrayBuffer()) });
    }
  }
  return { body, files };
}

// ------------------------------------------------------------------ rotas sem login

// token errado: depois de muitas tentativas do mesmo endereço, ele espera (ninguém adivinha 256 bits, mas não
// deixamos tentar à vontade)
const badTokens = limiter(30, 10 * 60_000);
const blockedIps = new Map<string, number>();
// por webhook: 30 mensagens por minuto (o mesmo do Discord), para um alerta em loop não afogar o canal
const perWebhook = limiter(30, 60_000);

function findWebhook(req: Request<{ id: string; token: string }>): WebhookRow {
  const ip = clientIp(req);
  const until = blockedIps.get(ip);
  if (until && until > Date.now()) fail(429, 'Muitas tentativas com token inválido. Espere alguns minutos.');
  const hook = get<WebhookRow>('SELECT * FROM webhooks WHERE id = ?', String(req.params.id).slice(0, 64));
  const given = hashToken(String(req.params.token));
  if (!hook || !timingSafeEqual(Buffer.from(hook.token_hash, 'hex'), given)) {
    if (!badTokens(ip)) blockedIps.set(ip, Date.now() + 10 * 60_000);
    fail(404, 'Webhook não encontrado');
  }
  return hook!;
}

const multipartBody = express.raw({ type: 'multipart/form-data', limit: '25mb' });

export function registerPublicWebhookRoutes(api: Router, deps: Deliver) {
  // ferramentas costumam testar o endereço com um GET antes de salvar
  api.get('/webhooks/:id/:token', (req, res) => {
    const hook = findWebhook(req);
    const user = get<UserRow>('SELECT * FROM users WHERE id = ?', hook.user_id)!;
    const channel = getChannel(hook.channel_id);
    res.json({ id: hook.id, name: user.display_name, channel_id: channel.id, server_id: channel.server_id });
  });

  // token e limite conferidos antes de ler o arquivo: endereço inventado não faz o servidor receber 25 MB
  const gate = (req: Request<{ id: string; token: string }>, res: Response, next: NextFunction) => {
    const hook = findWebhook(req);
    if (!perWebhook(hook.id)) {
      res.setHeader('Retry-After', '60');
      fail(429, 'Muitas mensagens deste webhook. Espere um minuto.');
    }
    res.locals.webhook = hook;
    next();
  };

  async function post(req: Request<{ id: string; token: string }>, res: Response, format: 'discord' | 'slack') {
    const hook = res.locals.webhook as WebhookRow;
    const { body, files } = await readBody(req);
    const { content, name, embeds } = format === 'slack' ? fromSlack(body) : fromDiscord(body);
    if (!content && embeds.length === 0 && files.length === 0) fail(400, 'Mensagem vazia: mande content, embeds ou um arquivo');
    const channel = getChannel(hook.channel_id);
    const data: WebhookMessageData = { webhook: name ? { name } : {} };
    if (embeds.length) data.embeds = embeds;
    const msg = await deps.deliver(channel, hook.user_id, content, files, data);
    run('UPDATE webhooks SET last_used_at = ? WHERE id = ?', Date.now(), hook.id);
    if (format === 'slack') return void res.type('text/plain').send('ok');
    // como no Discord: sem ?wait=true, responde 204 sem corpo
    if (req.query.wait === 'true') return void res.json({ id: msg.id, channel_id: channel.id, content });
    res.status(204).end();
  }

  api.post('/webhooks/:id/:token', gate, multipartBody, (req, res) => post(req, res, 'discord'));
  api.post('/webhooks/:id/:token/slack', gate, (req, res) => post(req, res, 'slack'));
}

// ------------------------------------------------------------------ gestão (quem gerencia o canal)

function webhookJson(hook: WebhookRow) {
  const user = get<UserRow>('SELECT * FROM users WHERE id = ?', hook.user_id)!;
  const creator = hook.creator_id ? get<UserRow>('SELECT * FROM users WHERE id = ?', hook.creator_id) : undefined;
  return {
    id: hook.id,
    channelId: hook.channel_id,
    name: user.display_name,
    avatarUrl: user.avatar_url,
    avatarColor: user.avatar_color,
    createdAt: hook.created_at,
    lastUsedAt: hook.last_used_at,
    creator: creator ? { id: creator.id, displayName: creator.display_name } : null,
  };
}

/** Endereço completo do webhook (o token só existe aqui, na hora de criar ou trocar). */
function webhookUrl(req: Request, id: string, token: string) {
  const base = config.publicUrl || `${req.protocol}://${req.get('host')}`;
  return `${base}/api/webhooks/${id}/${token}`;
}

function requireWebhook(channelId: string, webhookId: string, me: string) {
  const channel = requireChannelPerm(channelId, me, P.MANAGE_CHANNELS);
  const hook = get<WebhookRow>('SELECT * FROM webhooks WHERE id = ? AND channel_id = ?', webhookId, channel.id) ?? fail(404, 'Webhook não encontrado');
  return { channel, hook };
}

const AVATAR_COLORS = ['#5865f2', '#3ba55c', '#faa61a', '#ed4245', '#eb459e', '#00a8fc'];

// foto do webhook: o mesmo limite da foto de perfil e dos bots
const avatarBody = express.raw({ type: () => true, limit: '9mb' });

export function registerWebhookRoutes(api: Router) {
  api.get('/channels/:id/webhooks', humansOnly, (req, res) => {
    const channel = requireChannelPerm(req.params.id, uid(res), P.MANAGE_CHANNELS);
    res.json(all<WebhookRow>('SELECT * FROM webhooks WHERE channel_id = ? ORDER BY created_at', channel.id).map(webhookJson));
  });

  api.post('/channels/:id/webhooks', humansOnly, async (req, res) => {
    const me = uid(res);
    const channel = requireChannelPerm(req.params.id, me, P.MANAGE_CHANNELS);
    if (channel.type === 'forum') fail(400, 'Fóruns não recebem webhooks');
    const name = str(req.body?.name, 'nome', 1, 32);
    const count = get<{ n: number }>('SELECT COUNT(*) AS n FROM webhooks WHERE channel_id = ?', channel.id)!.n;
    if (count >= MAX_PER_CHANNEL) fail(400, `Até ${MAX_PER_CHANNEL} webhooks por canal`);
    const id = randomUUID();
    const userId = randomUUID();
    const token = newToken();
    // ninguém entra com essa conta: a senha é aleatória e descartada, e ela não tem token de bot
    const passwordHash = await bcrypt.hash(randomBytes(32).toString('hex'), 10);
    tx(() => {
      run(
        `INSERT INTO users (id, username, display_name, password_hash, avatar_color, created_at, is_bot, is_webhook)
         VALUES (?, ?, ?, ?, ?, ?, 1, 1)`,
        userId,
        `webhook_${randomBytes(6).toString('hex')}`,
        name,
        passwordHash,
        AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)],
        Date.now(),
      );
      run(
        'INSERT INTO webhooks (id, channel_id, user_id, creator_id, token_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        id,
        channel.id,
        userId,
        me,
        hashToken(token).toString('hex'),
        Date.now(),
      );
    });
    res.json({ webhook: webhookJson(get<WebhookRow>('SELECT * FROM webhooks WHERE id = ?', id)!), url: webhookUrl(req, id, token) });
  });

  api.patch('/channels/:id/webhooks/:wid', humansOnly, (req, res) => {
    const { hook } = requireWebhook(req.params.id, req.params.wid, uid(res));
    const name = optStr(req.body?.name, 'nome', 1, 32);
    if (name) run('UPDATE users SET display_name = ? WHERE id = ?', name, hook.user_id);
    res.json(webhookJson(hook));
  });

  api.post('/channels/:id/webhooks/:wid/avatar', humansOnly, avatarBody, (req, res) => {
    const { hook } = requireWebhook(String(req.params.id), String(req.params.wid), uid(res));
    const user = get<UserRow>('SELECT * FROM users WHERE id = ?', hook.user_id)!;
    const url = saveImage('avatars', user.id, req.body);
    run('UPDATE users SET avatar_url = ? WHERE id = ?', url, user.id);
    removeUpload(user.avatar_url);
    res.json(webhookJson(hook));
  });

  // token vazou: troca, e o endereço antigo para de funcionar na hora
  api.post('/channels/:id/webhooks/:wid/token', humansOnly, (req, res) => {
    const { hook } = requireWebhook(req.params.id, req.params.wid, uid(res));
    const token = newToken();
    run('UPDATE webhooks SET token_hash = ? WHERE id = ?', hashToken(token).toString('hex'), hook.id);
    res.json({ webhook: webhookJson(hook), url: webhookUrl(req, hook.id, token) });
  });

  // as mensagens que ele já mandou ficam (a conta que as assina continua existindo)
  api.delete('/channels/:id/webhooks/:wid', humansOnly, (req, res) => {
    const { hook } = requireWebhook(req.params.id, req.params.wid, uid(res));
    run('DELETE FROM webhooks WHERE id = ?', hook.id);
    res.json({ ok: true });
  });
}
