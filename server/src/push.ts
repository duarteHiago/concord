// Notificação push no celular (Web Push): com o Concord instalado na tela de início (no iPhone, iOS 16.4+) ou
// pelo Chrome no Android, o sistema mostra a notificação mesmo com o app fechado ou a tela bloqueada.
//
// Cada aparelho que liga o push guarda uma "assinatura" (o endereço do serviço de push do Google/Apple/Mozilla e as
// chaves para criptografar). O conteúdo vai criptografado: o serviço de push só entrega, não lê.
//
// Quando manda: menção, mensagem direta, resposta numa thread que a pessoa segue, e mensagem de canal em
// "todas as mensagens". Não manda com o Concord à vista num aparelho da pessoa (lá aparece o aviso de dentro do
// app), no "Não perturbe", com os avisos de menção desligados, ou com o canal/servidor silenciado ou em "nada".
import type { Router } from 'express';
import webpush from 'web-push';
import { config } from './config.ts';
import { all, get, run } from './db.ts';
import { fail, uid } from './http.ts';
import { userVisible } from './realtime.ts';

interface SubscriptionRow {
  endpoint: string;
  user_id: string;
  p256dh: string;
  auth: string;
}

export interface PushPayload {
  title: string;
  body: string;
  /** agrupa: uma notificação por conversa (a nova substitui a anterior da mesma conversa) */
  tag: string;
  /** foto de quem mandou (o Android mostra; o iPhone usa o ícone do app) */
  icon?: string | null;
  /** o que abrir ao tocar (o mesmo formato dos avisos do app) */
  target: { serverId: string; channelId: string; threadId?: string } | { dmId: string };
}

/** Chaves VAPID: do ambiente, ou geradas uma vez e guardadas no banco (assim o deploy não precisa de segredo novo). */
function vapidKeys(): { publicKey: string; privateKey: string } {
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    return { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY };
  }
  const saved = get<{ value: string }>("SELECT value FROM meta WHERE key = 'vapid_keys'");
  if (saved) return JSON.parse(saved.value) as { publicKey: string; privateKey: string };
  const keys = webpush.generateVAPIDKeys();
  run("INSERT INTO meta (key, value) VALUES ('vapid_keys', ?)", JSON.stringify(keys));
  return keys;
}

let keys: { publicKey: string; privateKey: string } | null = null;
function setup() {
  if (keys) return keys;
  keys = vapidKeys();
  // o "assunto" identifica quem manda para o serviço de push (pede um https: ou mailto:)
  webpush.setVapidDetails(config.publicUrl || 'https://concord-community.com', keys.publicKey, keys.privateKey);
  return keys;
}

/** Endereço completo de uma foto (o serviço de push e o celular não sabem resolver "/uploads/..."). */
export function absoluteUrl(url: string | null | undefined) {
  if (!url) return null;
  return url.startsWith('/') && config.publicUrl ? `${config.publicUrl}${url}` : url;
}

/** A pessoa quer e pode receber agora? (Não perturbe, avisos desligados, Concord aberto na tela.) */
function wantsPush(userId: string) {
  if (userVisible(userId)) return false;
  const u = get<{ settings: string }>('SELECT settings FROM users WHERE id = ?', userId);
  if (!u) return false;
  try {
    const s = JSON.parse(u.settings || '{}') as { status?: string; notifications?: { mentions?: boolean } };
    if (s.status === 'dnd') return false;
    if (s.notifications?.mentions === false) return false;
  } catch {
    // preferências ilegíveis: segue o padrão (avisar)
  }
  return true;
}

// testes: com PUSH_DRY_RUN=1 nada sai para os serviços de push; o que seria mandado fica anotado aqui
const DRY_RUN = process.env.PUSH_DRY_RUN === '1';
const drySent: { userId: string; payload: PushPayload }[] = [];

/** Manda para todos os aparelhos da pessoa (sem esperar: quem chama não fica preso no serviço de push). */
export function pushTo(userId: string, payload: PushPayload) {
  if (!wantsPush(userId)) return;
  const subs = all<SubscriptionRow>('SELECT * FROM push_subscriptions WHERE user_id = ?', userId);
  if (!subs.length) return;
  if (DRY_RUN) {
    drySent.push({ userId, payload });
    return;
  }
  setup();
  const body = JSON.stringify({ ...payload, title: payload.title.slice(0, 100), body: payload.body.slice(0, 240) });
  for (const s of subs) {
    webpush
      .sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body, { TTL: 3600, urgency: 'high' })
      .then(() => run('UPDATE push_subscriptions SET last_ok_at = ? WHERE endpoint = ?', Date.now(), s.endpoint))
      .catch((err: { statusCode?: number }) => {
        // o aparelho desinstalou o app ou tirou a permissão: a assinatura não vale mais
        if (err.statusCode === 404 || err.statusCode === 410) run('DELETE FROM push_subscriptions WHERE endpoint = ?', s.endpoint);
      });
  }
}

const PUSH_HOSTS = [/^fcm\.googleapis\.com$/, /^android\.googleapis\.com$/, /(^|\.)push\.apple\.com$/, /^updates\.push\.services\.mozilla\.com$/, /(^|\.)notify\.windows\.com$/];

/** É um endereço https de um serviço de push conhecido? */
export function pushServiceUrl(endpoint: string): boolean {
  if (endpoint.length > 1000) return false;
  try {
    const u = new URL(endpoint);
    return u.protocol === 'https:' && !u.port && PUSH_HOSTS.some((re) => re.test(u.hostname));
  } catch {
    return false;
  }
}

/** Texto curto da notificação: o começo da mensagem, ou o que ela carrega quando não tem texto. */
export function pushPreview(content: string, attachments: number) {
  const text = content.replace(/\s+/g, ' ').trim();
  if (text) return text.length > 180 ? `${text.slice(0, 180)}…` : text;
  if (attachments) return attachments > 1 ? `📎 ${attachments} arquivos` : '📎 Arquivo';
  return 'Mensagem nova';
}

export function registerPushRoutes(api: Router) {
  /** A chave pública que o celular usa para assinar. */
  api.get('/push/key', (_req, res) => {
    res.json({ publicKey: setup().publicKey });
  });

  /** Liga o push neste aparelho. */
  api.post('/push/subscribe', (req, res) => {
    const me = uid(res);
    const sub = req.body?.subscription as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } } | undefined;
    const endpoint = typeof sub?.endpoint === 'string' ? sub.endpoint : '';
    const p256dh = typeof sub?.keys?.p256dh === 'string' ? sub.keys.p256dh : '';
    const auth = typeof sub?.keys?.auth === 'string' ? sub.keys.auth : '';
    // o servidor vai mandar requisições para esse endereço: só os serviços de push dos navegadores (Google, Apple,
    // Mozilla, Microsoft), nunca um endereço qualquer escolhido por quem chama
    if (!pushServiceUrl(endpoint) || !p256dh || p256dh.length > 200 || !auth || auth.length > 100) {
      fail(400, 'Assinatura de push inválida');
    }
    const count = get<{ n: number }>('SELECT COUNT(*) AS n FROM push_subscriptions WHERE user_id = ?', me)!.n;
    if (count >= 10) run('DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = (SELECT endpoint FROM push_subscriptions WHERE user_id = ? ORDER BY created_at LIMIT 1)', me, me);
    run(
      `INSERT INTO push_subscriptions (endpoint, user_id, p256dh, auth, created_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth`,
      endpoint,
      me,
      p256dh,
      auth,
      Date.now(),
    );
    res.json({ ok: true });
  });

  // só nos testes (PUSH_DRY_RUN): o que teria sido mandado para mim
  if (DRY_RUN) {
    api.get('/push/_sent', (_req, res) => {
      const me = uid(res);
      res.json(drySent.filter((s) => s.userId === me).map((s) => s.payload));
    });
  }

  /** Desliga o push neste aparelho. */
  api.post('/push/unsubscribe', (req, res) => {
    const me = uid(res);
    const endpoint = typeof req.body?.endpoint === 'string' ? req.body.endpoint : '';
    run('DELETE FROM push_subscriptions WHERE endpoint = ? AND user_id = ?', endpoint, me);
    res.json({ ok: true });
  });
}
