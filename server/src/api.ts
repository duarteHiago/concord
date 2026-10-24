import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import bcrypt from 'bcryptjs';
import express, { Router } from 'express';
import { ALL_PERMISSIONS, DEFAULT_EVERYONE, DEFAULT_MODERATOR, P, has } from '../../shared/permissions.ts';
import {
  channelOverwrites,
  channelPermissions,
  everyoneRole,
  getChannel,
  getRole,
  getServer,
  highestPosition,
  isInstanceAuthority,
  isMember,
  memberRoles,
  outranks,
  requireChannelPerm,
  requireMember,
  requireServerPerm,
  serverPermissions,
} from './access.ts';
import { config } from './config.ts';
import {
  all,
  get,
  run,
  tx,
  type ChannelRow,
  type CustomStickerRow,
  type AttachmentRow,
  type DmChannelRow,
  type EmailTokenRow,
  type PlacedStickerRow,
  type PatchDropRow,
  type ServerPatchRow,
  type InviteRow,
  type MessageRow,
  type RoleRow,
  type ServerRow,
  type SoundRow,
  type UserRow,
} from './db.ts';
import { color, fail, hashBotToken, humansOnly, int, optStr, requireAuth, signToken, str, uid, verifyToken } from './http.ts';
import { TrackSource, createVoiceToken, muteTracks, removeFromRoom } from './livekit.ts';
import { cleanFileName, removeUpload, saveAttachment, saveImage, saveSound } from './uploads.ts';
import { allowAttempt, limiter, loginWaitMinutes, normalize as normalizeCode, recordLoginFailure, rotateRecoveryCode } from './recovery.ts';
import { isEmail, mailEnabled, sendEmailChanged, sendPasswordChanged, sendResetEmail, sendVerifyEmail } from './mail.ts';
import { playGame } from './games.ts';
import { isAdmin, registerAdminRoutes } from './admin.ts';
import { integrationsStatus, registerIntegrationRoutes, registerPublicIntegrationRoutes } from './integrations.ts';
import { mecenasBadge, mecenasOfMe, mecenasOver } from './mecenas.ts';
import { registerDiagnosticRoutes } from './diagnostics.ts';
import { registerForumRoutes } from './forum.ts';
import { STICKER_MESSAGE_TEXT, registerStickerPackRoutes, stickerMessageData } from './stickerPacks.ts';
import { registerSupportRoutes, registerSupportWebhook, setSupportHooks, supportPublicConfig, supporterJson } from './support.ts';
import * as google from './google.ts';
import * as twoFactor from './twoFactor.ts';
import {
  ART_OFFSET,
  ART_SCALE,
  FRAMES,
  MAX_CUSTOM_STICKERS,
  MAX_PATCHES,
  MAX_PLACED_STICKERS,
  PATCH_SHAPES,
  PRESET_STICKERS,
  STICKER_FINISHES,
  type FrameId,
  type Patch,
} from '../../shared/cosmetics.ts';
import {
  dropVoice,
  emitToChannel,
  emitToServer,
  emitToUser,
  getVoiceState,
  isServerMuted,
  joinServerRoom,
  leaveServerRoom,
  onlineUserIds,
  revokeSockets,
  serverChanged,
  setServerMute,
  voiceStatesFor,
  getJam,
  jamsFor,
  setJam,
  broadcastStatus,
  isOnline,
} from './realtime.ts';

export const api = Router();

/** Nome fixo do instalador publicado pelo CI em <dados>/downloads. */
const DESKTOP_INSTALLER = 'Concord-Setup.exe';

const PALETTE = ['#5865f2', '#3ba55c', '#faa61a', '#ed4245', '#eb459e', '#9b59b6', '#1abc9c', '#e67e22', '#00b0f4'];
const pickColor = () => PALETTE[Math.floor(Math.random() * PALETTE.length)];
const now = () => Date.now();

type PublicUser = Pick<
  UserRow,
  | 'id'
  | 'username'
  | 'display_name'
  | 'avatar_color'
  | 'avatar_url'
  | 'banner_color'
  | 'bio'
  | 'banner_url'
  | 'is_bot'
  | 'profile_style'
  | 'verified'
>;

interface ProfileStyle {
  frame?: FrameId | null;
  cardBg?: string | null;
  patches?: Patch[];
  /** página do perfil (aberta ao clicar em alguém): fundo, escurecimento, cor, colunas e vitrines */
  page?: ProfilePage;
}

const SHOWCASES = ['playing', 'steam', 'patches', 'servers'] as const;
type Showcase = (typeof SHOWCASES)[number];
interface ProfilePage {
  bg?: string | null;
  /** quanto o fundo escurece para ler o texto, 0 a 80 (%) */
  dim?: number;
  accent?: string | null;
  /** seções ligadas (as que não estão aqui ficam escondidas) */
  showcases?: Showcase[];
  /** jogos em destaque, pelo appid da Steam, na ordem: o primeiro é o favorito (até 5) */
  featured?: number[];
  /** sem fundo próprio, usa a arte larga do jogo favorito como capa da página */
  favoriteAsBg?: boolean;
}
const MAX_FEATURED = 5;

const pageJson = (p: ProfilePage | undefined) => ({
  bgUrl: p?.bg ?? null,
  dim: typeof p?.dim === 'number' ? p.dim : 25,
  accent: p?.accent ?? null,
  showcases: Array.isArray(p?.showcases) ? p.showcases.filter((s) => (SHOWCASES as readonly string[]).includes(s)) : [...SHOWCASES],
  featured: Array.isArray(p?.featured) ? p.featured.slice(0, MAX_FEATURED) : [],
  favoriteAsBg: p?.favoriteAsBg !== false,
});

function parseStyle(raw: string | null | undefined): ProfileStyle {
  try {
    const v = JSON.parse(raw || '{}') as ProfileStyle;
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
}

const styleJson = (st: ProfileStyle) => ({
  frame: st.frame && (FRAMES as readonly string[]).includes(st.frame) ? st.frame : null,
  cardBgUrl: st.cardBg ?? null,
  patches: Array.isArray(st.patches) ? st.patches : [],
});

const userJson = (u: PublicUser) => ({
  ...styleJson(parseStyle(u.profile_style)),
  // patch de apoiador (só o servidor grava; ver support.ts)
  supporter: supporterJson(u.profile_style),
  id: u.id,
  username: u.username,
  displayName: u.display_name,
  avatarColor: u.avatar_color,
  avatarUrl: u.avatar_url,
  bannerColor: u.banner_color,
  bio: u.bio,
  bannerUrl: u.banner_url,
  bot: !!u.is_bot,
  verified: !!u.verified,
  // cargo de Mecenas: quem é, e quem tem um (ver mecenas.ts)
  ...mecenasBadge(u.username),
});

/** Autor de mensagem: sem os patches (só aparecem no cartão do perfil). */
const authorJson = (u: PublicUser) => {
  const { patches: _patches, ...rest } = userJson(u);
  return rest;
};

/** Dados do próprio usuário: inclui as preferências (tema etc.), que só ele vê. */
const meJson = (u: UserRow) => {
  let settings: unknown = {};
  try {
    settings = JSON.parse(u.settings || '{}');
  } catch {
    // ignorado
  }
  return {
    ...userJson(u),
    settings,
    hasRecoveryCode: !!u.recovery_hash,
    googleLinked: !!u.google_sub,
    hasPassword: !!u.password_hash,
    twoFactor: !!u.totp_enabled,
    backupCodesLeft: twoFactor.backupCodesLeft(u),
    // e-mail de recuperação: só o confirmado fica na conta; o pendente espera o clique no link
    email: u.email ?? null,
    emailPending:
      get<{ email: string }>("SELECT email FROM email_tokens WHERE user_id = ? AND kind = 'verify' AND expires_at > ?", u.id, now())?.email ?? null,
    // pode conceder o selo de verificado em qualquer servidor/pessoa (ver access.ts#isInstanceAuthority)
    isAuthority: isInstanceAuthority(u.id),
    // entra no portal da equipe (/admin, ver admin.ts)
    isAdmin: isAdmin(u.id),
    // é o Mecenas: o cargo e sobre quem tem os poderes
    mecenasPowers: mecenasOfMe(u.id),
    // página do perfil: contas conectadas e o que esta instalação oferece
    steamLinked: !!u.steam_id,
    integrations: integrationsStatus(),
    // apoio: o total decide quais acabamentos estão liberados; supportTier é o escolhido (null = escondido)
    supportTotal: u.support_total_cents ?? 0,
    supportTier: (() => {
      try {
        return (JSON.parse(u.profile_style || '{}') as { supporter?: { tier?: string | null } }).supporter?.tier ?? null;
      } catch {
        return null;
      }
    })(),
  };
};

const serverJson = (s: ServerRow) => ({
  id: s.id,
  name: s.name,
  ownerId: s.owner_id,
  iconColor: s.icon_color,
  iconUrl: s.icon_url,
  verified: !!s.verified,
});

const roleJson = (r: RoleRow) => ({
  id: r.id,
  name: r.name,
  color: r.color,
  permissions: r.permissions,
  position: r.position,
  isDefault: !!r.is_default,
  hoist: !!r.hoist,
});

type MessageWithAuthor = MessageRow & Omit<PublicUser, 'id'>;
const parseData = (raw: string | null) => {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
};

const messageJson = (m: MessageWithAuthor) => ({
  id: m.id,
  channelId: m.channel_id,
  content: m.content,
  kind: m.kind ?? 'text',
  data: parseData(m.data),
  attachments: (parseData(m.attachments ?? null) as AttachmentJson[] | null) ?? [],
  createdAt: m.created_at,
  editedAt: m.edited_at,
  author: authorJson({ ...m, id: m.author_id }),
});

const MESSAGE_SELECT = `SELECT m.*, u.username, u.display_name, u.avatar_color, u.avatar_url, u.banner_color, u.bio, u.banner_url, u.is_bot, u.profile_style
  FROM messages m JOIN users u ON u.id = m.author_id`;

// ============================================================ Auth

api.get('/config', (_req, res) => {
  const installer = join(config.downloadsDir, DESKTOP_INSTALLER);
  res.json({
    allowRegistration: config.allowRegistration,
    desktopDownload: existsSync(installer) ? `/downloads/${DESKTOP_INSTALLER}` : null,
    communityInvite: config.communityInvite || null,
    googleLogin: google.googleEnabled(),
    emailRecovery: mailEnabled(),
    // seção "apoie" da landing page
    support: supportPublicConfig(),
  });
});

// ---- E-mail de recuperação (links de uso único) ----

const hashToken = (t: string) => createHash('sha256').update(t).digest('hex');
const mailError = (err: unknown) => console.error('[e-mail]', (err as Error).message);

/** Cria o link (guarda só o hash). Só o último link de cada tipo vale. */
function newEmailToken(userId: string, kind: EmailTokenRow['kind'], email: string, ttl: number) {
  run('DELETE FROM email_tokens WHERE expires_at < ? OR (user_id = ? AND kind = ?)', now(), userId, kind);
  const token = randomBytes(32).toString('base64url');
  run('INSERT INTO email_tokens (token_hash, user_id, kind, email, expires_at) VALUES (?, ?, ?, ?, ?)', hashToken(token), userId, kind, email, now() + ttl);
  return token;
}

/** Usa o link: vale uma vez só. */
function takeEmailToken(token: string, kind: EmailTokenRow['kind']): EmailTokenRow | null {
  const row = get<EmailTokenRow>('SELECT * FROM email_tokens WHERE token_hash = ? AND kind = ?', hashToken(token), kind);
  if (!row) return null;
  run('DELETE FROM email_tokens WHERE token_hash = ?', row.token_hash);
  return row.expires_at > now() ? row : null;
}

/** Troca a senha: sobe a versão do token (os outros aparelhos saem da conta) e avisa por e-mail. */
async function setPassword(user: UserRow, password: string, keepSocketId?: string) {
  run('UPDATE users SET password_hash = ?, token_version = token_version + 1 WHERE id = ?', await bcrypt.hash(password, 10), user.id);
  void revokeSockets(user.id, keepSocketId);
  if (user.email && mailEnabled()) sendPasswordChanged(user.email, user.username).catch(mailError);
}

// por conta: 3 links por hora; no total, um teto para ninguém usar o Concord para mandar e-mail em massa
const forgotPerAccount = limiter(3, 60 * 60_000);
const forgotTotal = limiter(200, 60 * 60_000);
const verifyPerUser = limiter(5, 60 * 60_000);

/** Esqueci a senha (por e-mail): manda o link se a conta tiver e-mail confirmado. */
api.post('/auth/forgot', (req, res) => {
  if (!mailEnabled()) fail(404, 'Recuperação por e-mail não está configurada neste servidor');
  const login = str(req.body?.login, 'usuário ou e-mail', 1, 254);
  const user = login.includes('@')
    ? get<UserRow>('SELECT * FROM users WHERE email = ?', login.toLowerCase())
    : get<UserRow>('SELECT * FROM users WHERE username = ?', login);
  // a resposta é sempre a mesma: não dá para descobrir quem tem conta ou e-mail cadastrado
  if (user?.email && !user.is_bot && forgotPerAccount(user.id) && forgotTotal('all')) {
    const token = newEmailToken(user.id, 'reset', user.email, 30 * 60_000);
    sendResetEmail(user.email, user.username, `${config.publicUrl}/#reset-email=${token}`).catch(mailError);
  }
  res.json({ ok: true });
});

/** Link do e-mail: escolhe a senha nova e já entra na conta. */
api.post('/auth/reset-email', async (req, res) => {
  const password = str(req.body?.newPassword, 'nova senha', 6, 128);
  const expired = 'Esse link expirou ou já foi usado. Peça outro em "Esqueci minha senha".';
  const row = takeEmailToken(String(req.body?.token ?? ''), 'reset') ?? fail(400, expired);
  const user = get<UserRow>('SELECT * FROM users WHERE id = ?', row.user_id) ?? fail(400, expired);
  // o link só vale enquanto esse ainda for o e-mail da conta
  if (user.email !== row.email) fail(400, expired);
  await setPassword(user, password);
  sendLogin(res, get<UserRow>('SELECT * FROM users WHERE id = ?', user.id)!);
});

/** Link de confirmação: o e-mail passa a valer para recuperar a senha. Não precisa estar logado. */
api.post('/auth/email/verify', (req, res) => {
  const expired = 'Esse link de confirmação expirou ou já foi usado. Cadastre o e-mail de novo em Configurações > Conta.';
  const row = takeEmailToken(String(req.body?.token ?? ''), 'verify') ?? fail(400, expired);
  const user = get<UserRow>('SELECT * FROM users WHERE id = ?', row.user_id) ?? fail(400, expired);
  if (get('SELECT 1 FROM users WHERE email = ? AND id != ?', row.email, user.id)) fail(409, 'Esse e-mail já está confirmado em outra conta do Concord.');
  run('UPDATE users SET email = ? WHERE id = ?', row.email, user.id);
  if (user.email && user.email !== row.email) sendEmailChanged(user.email, user.username, row.email).catch(mailError);
  emitToUser(user.id, 'me:updated', meJson(get<UserRow>('SELECT * FROM users WHERE id = ?', user.id)!));
  res.json({ email: row.email });
});

api.post('/auth/register', async (req, res) => {
  if (!config.allowRegistration) fail(403, 'Cadastro desativado neste servidor');
  const username = str(req.body?.username, 'usuário', 3, 32);
  if (!/^[a-zA-Z0-9_.]+$/.test(username)) fail(400, 'Usuário deve conter apenas letras, números, "_" e "."');
  const password = str(req.body?.password, 'senha', 6, 128);
  // nome de exibição é opcional no cadastro: vazio vira o próprio usuário
  const displayName = optStr(req.body?.displayName?.trim?.() || undefined, 'nome', 1, 32) || username;
  if (get('SELECT 1 FROM users WHERE username = ?', username)) fail(409, 'Esse nome de usuário já está em uso');

  const user: UserRow = {
    id: randomUUID(),
    username,
    display_name: displayName,
    password_hash: await bcrypt.hash(password, 10),
    avatar_color: pickColor(),
    avatar_url: null,
    banner_url: null,
    is_bot: 0,
    bot_owner_id: null,
    bot_token_hash: null,
    profile_style: '{}',
    banner_color: null,
    bio: '',
    settings: '{}',
    recovery_hash: null,
    verified: 0,
    created_at: now(),
  };
  run(
    'INSERT INTO users (id, username, display_name, password_hash, avatar_color, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    user.id,
    user.username,
    user.display_name,
    user.password_hash,
    user.avatar_color,
    user.created_at,
  );
  const recoveryCode = await rotateRecoveryCode(user.id);
  res.json({ token: signToken(user.id), user: meJson(get<UserRow>('SELECT * FROM users WHERE id = ?', user.id)!), recoveryCode });
});

/** Esqueci a senha: usuário + código de recuperação + nova senha. O código é trocado após o uso. */
api.post('/auth/reset', async (req, res) => {
  const username = str(req.body?.username, 'usuário', 1, 32);
  const code = str(req.body?.code, 'código de recuperação', 8, 40);
  const password = str(req.body?.newPassword, 'nova senha', 6, 128);
  if (!allowAttempt(username)) fail(429, 'Muitas tentativas. Espere 15 minutos e tente de novo.');
  const user = get<UserRow>('SELECT * FROM users WHERE username = ?', username);
  const ok = !!user?.recovery_hash && (await bcrypt.compare(normalizeCode(code), user.recovery_hash));
  if (!ok) fail(400, 'Usuário ou código de recuperação incorretos');
  await setPassword(user!, password);
  const updated = get<UserRow>('SELECT * FROM users WHERE id = ?', user!.id)!;
  // com 2FA, o código de recuperação novo só sai depois da segunda etapa (POST /auth/2fa)
  if (updated.totp_enabled) return sendLogin(res, updated, { recovery: true });
  const recoveryCode = await rotateRecoveryCode(updated.id);
  res.json({ token: signToken(updated.id), user: meJson(get<UserRow>('SELECT * FROM users WHERE id = ?', updated.id)!), recoveryCode });
});

/** Confere usuário e senha (com limite de tentativas). Usado no login e ao conectar o Google a uma conta. */
async function checkPassword(username: string, password: string): Promise<UserRow> {
  const wait = loginWaitMinutes(username);
  if (wait) fail(429, `Muitas senhas erradas para esse usuário. Espere ${wait} min e tente de novo, ou use "Esqueci minha senha".`);
  const user = get<UserRow>('SELECT * FROM users WHERE username = ?', username);
  // conta criada pelo Google não tem senha (password_hash vazio): não é chute, então não conta tentativa
  if (user && !user.password_hash) {
    fail(401, 'Essa conta foi criada pelo Google e não tem senha. Use "Entrar com Google" (dá para criar uma senha depois, em Configurações > Conta).');
  }
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    const left = recordLoginFailure(username);
    fail(
      401,
      left === 0
        ? 'Usuário ou senha incorretos. Por segurança, esse usuário ficou bloqueado por 15 min: use "Esqueci minha senha" se precisar.'
        : left <= 2
          ? `Usuário ou senha incorretos. Mais ${left} tentativa(s) erradas e o login fica bloqueado por 15 min.`
          : 'Usuário ou senha incorretos.',
    );
  }
  return user!;
}

api.post('/auth/login', async (req, res) => {
  const username = str(req.body?.username, 'usuário', 1, 32);
  const password = str(req.body?.password, 'senha', 1, 128);
  const user = await checkPassword(username, password);
  sendLogin(res, user);
});

/** Responde um login: o token de sessão, ou, com o 2FA ligado, o ticket para pedir o código. */
function sendLogin(res: express.Response, user: UserRow, opts: { recovery?: boolean } = {}) {
  const result = twoFactor.loginResult(user, opts);
  res.json('mfa' in result ? result : { token: result.token, user: meJson(user) });
}

/** Segunda etapa do login: o ticket da senha (ou do Google) + o código do app ou de backup. */
api.post('/auth/2fa', async (req, res) => {
  const { user, kind, recovery } = twoFactor.finishLogin(req.body?.ticket, req.body?.code);
  const recoveryCode = recovery ? await rotateRecoveryCode(user.id) : undefined;
  const fresh = get<UserRow>('SELECT * FROM users WHERE id = ?', user.id)!;
  res.json({ token: signToken(user.id), user: meJson(fresh), recoveryCode, usedBackup: kind === 'backup' });
});

// Prévia do convite é pública: aparece na tela de login de quem recebeu o link.
api.get('/invites/:code', (req, res) => {
  const invite = get<InviteRow>('SELECT * FROM invites WHERE code = ?', req.params.code);
  if (!invite || !inviteValid(invite)) fail(404, 'Convite inválido ou expirado');
  const server = getServer(invite!.server_id);
  const count = get<{ n: number }>('SELECT COUNT(*) AS n FROM members WHERE server_id = ?', server.id)!.n;
  const header = req.headers.authorization;
  const viewer = verifyToken(header?.startsWith('Bearer ') ? header.slice(7) : undefined);
  res.json({ code: invite!.code, server: serverJson(server), memberCount: count, alreadyMember: !!viewer && isMember(server.id, viewer) });
});

// ---- Login com Google ----

const escapeHtml = (t: string) => t.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** Página que o navegador mostra quando o login foi pedido pelo app desktop (o resultado vai para o app). */
function handoffPage(ok: boolean, message: string) {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Concord</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#140f19;color:#f3ecf7;font-family:system-ui,sans-serif;text-align:center}
.c{max-width:420px;padding:32px}img{width:84px;height:84px}h1{font-size:24px;margin:16px 0 8px}p{color:#b3a6c2;line-height:1.5}</style></head>
<body><div class="c"><img src="/brand/concord-simbolo.svg" alt=""><h1>${ok ? 'Pronto!' : 'Não deu certo'}</h1><p>${escapeHtml(message)}</p></div></body></html>`;
}

api.get('/auth/google/start', (req, res) => {
  if (!google.googleEnabled()) fail(404, 'Login com Google não está configurado neste servidor');
  const handoff = google.isHandoffId(req.query.handoff) ? req.query.handoff : undefined;
  let userId: string | undefined;
  if (typeof req.query.link === 'string') {
    userId = google.takeLinkTicket(req.query.link) ?? fail(400, 'O pedido para conectar a conta expirou. Tente de novo.');
  }
  res.redirect(google.startUrl({ mode: userId ? 'link' : 'login', userId, handoff }));
});

api.get('/auth/google/callback', async (req, res) => {
  const deliver = (result: google.HandoffResult, handoff?: string) => {
    if (handoff && !('signup' in result)) {
      google.putHandoff(handoff, result);
      const msg =
        'error' in result
          ? result.error
          : 'linked' in result
            ? 'Conta Google conectada. Pode voltar para o app do Concord.'
            : 'mfa' in result
              ? 'Falta o código de verificação: volte para o app do Concord e digite o código do seu app autenticador.'
              : 'Você entrou. Pode voltar para o app do Concord.';
      res.type('html').send(handoffPage(!('error' in result), msg));
      return;
    }
    const hash =
      'token' in result
        ? `google-token=${result.token}`
        : 'mfa' in result
          ? `google-mfa=${result.mfa}`
          : 'signup' in result
            ? `google-signup=${result.signup}`
            : 'linked' in result
              ? 'google-linked=1'
              : `google-error=${encodeURIComponent(result.error)}`;
    // o token vai no fragmento (#): não é enviado a servidor nenhum nem aparece em logs
    res.redirect(`/#${hash}`);
  };
  if (typeof req.query.error === 'string') return deliver({ error: 'Login com Google cancelado.' });
  let sub: string;
  let pending: Awaited<ReturnType<typeof google.finish>>['pending'];
  try {
    ({ sub, pending } = await google.finish(String(req.query.state ?? ''), String(req.query.code ?? '')));
  } catch (err) {
    return deliver({ error: (err as Error).message });
  }
  const owner = get<UserRow>('SELECT * FROM users WHERE google_sub = ?', sub);
  if (pending.mode === 'link') {
    if (owner && owner.id !== pending.userId) {
      return deliver(
        { error: `Essa conta Google já está ligada a outra conta do Concord (@${owner.username}). Cada conta Google só entra em uma conta do Concord.` },
        pending.handoff,
      );
    }
    run('UPDATE users SET google_sub = ? WHERE id = ?', sub, pending.userId!);
    return deliver({ linked: true }, pending.handoff);
  }
  if (owner) return deliver(twoFactor.loginResult(owner), pending.handoff);
  if (!config.allowRegistration) return deliver({ error: 'Cadastro desativado neste servidor.' }, pending.handoff);
  deliver({ signup: google.newSignup(sub, pending.handoff) });
});

/** Conta Google nova: confere se o ticket ainda vale (a tela de escolher o nome usa). */
api.get('/auth/google/signup/:ticket', (req, res) => {
  const t = google.peekSignup(req.params.ticket) ?? fail(404, 'Esse cadastro expirou. Entre com o Google de novo.');
  res.json({ ok: true, desktop: !!t.handoff });
});

api.post('/auth/google/signup', async (req, res) => {
  if (!config.allowRegistration) fail(403, 'Cadastro desativado neste servidor');
  const username = str(req.body?.username, 'usuário', 3, 32);
  if (!/^[a-zA-Z0-9_.]+$/.test(username)) fail(400, 'Usuário deve conter apenas letras, números, "_" e "."');
  const displayName = optStr(req.body?.displayName?.trim?.() || undefined, 'nome', 1, 32) || username;
  if (get('SELECT 1 FROM users WHERE username = ?', username)) {
    fail(409, 'Esse nome de usuário já está em uso. Se essa conta é sua, use "Já tenho conta" para conectar o Google a ela.');
  }
  const ticket = google.takeSignup(String(req.body?.ticket ?? '')) ?? fail(400, 'Esse cadastro expirou. Entre com o Google de novo.');
  const existing = get<UserRow>('SELECT * FROM users WHERE google_sub = ?', ticket.sub);
  const id = existing?.id ?? randomUUID();
  if (!existing) {
    run(
      "INSERT INTO users (id, username, display_name, password_hash, avatar_color, google_sub, created_at) VALUES (?, ?, ?, '', ?, ?, ?)",
      id,
      username,
      displayName,
      pickColor(),
      ticket.sub,
      now(),
    );
  }
  const recoveryCode = existing ? undefined : await rotateRecoveryCode(id);
  const user = get<UserRow>('SELECT * FROM users WHERE id = ?', id)!;
  const result = twoFactor.loginResult(user);
  if (ticket.handoff) {
    google.putHandoff(ticket.handoff, result);
    return res.json({ handoff: true });
  }
  res.json('mfa' in result ? result : { token: result.token, user: meJson(user), recoveryCode });
});

/**
 * Conta Google ainda sem dono, mas a pessoa já tem conta no Concord: entra com usuário e senha e o
 * Google fica conectado a essa conta (em vez de criar uma segunda conta vazia).
 */
api.post('/auth/google/signup/link', async (req, res) => {
  const username = str(req.body?.username, 'usuário', 1, 32);
  const password = str(req.body?.password, 'senha', 1, 128);
  const ticketId = String(req.body?.ticket ?? '');
  // só olha o ticket aqui: senha errada não deve obrigar a refazer o login no Google
  if (!google.peekSignup(ticketId)) fail(400, 'Esse cadastro expirou. Entre com o Google de novo.');
  const user = await checkPassword(username, password);
  if (user.is_bot) fail(400, 'Bots não entram com o Google.');
  const ticket = google.takeSignup(ticketId) ?? fail(400, 'Esse cadastro expirou. Entre com o Google de novo.');
  const owner = get<UserRow>('SELECT * FROM users WHERE google_sub = ?', ticket.sub);
  if (owner && owner.id !== user.id) fail(409, `Essa conta Google já está ligada a outra conta do Concord (@${owner.username}).`);
  if (user.google_sub && user.google_sub !== ticket.sub) {
    fail(409, 'Essa conta do Concord já está conectada a outra conta Google. Entre com aquela conta Google, ou entre com a senha e troque em Configurações > Conta.');
  }
  run('UPDATE users SET google_sub = ? WHERE id = ?', ticket.sub, user.id);
  const linked = get<UserRow>('SELECT * FROM users WHERE id = ?', user.id)!;
  if (ticket.handoff) {
    google.putHandoff(ticket.handoff, twoFactor.loginResult(linked));
    return res.json({ handoff: true });
  }
  sendLogin(res, linked);
});

/** App desktop: busca o resultado do login feito no navegador (uma vez só). */
api.get('/auth/handoff/:id', (req, res) => {
  if (!google.isHandoffId(req.params.id)) fail(400, 'Pedido inválido');
  const result = google.takeHandoff(req.params.id);
  if (!result) return res.status(204).end();
  res.json(result);
});

// ---- Patches de presente (link de resgate) ----

const dropValid = (d: PatchDropRow) => (!d.expires_at || d.expires_at > now()) && (!d.max_uses || d.uses < d.max_uses);
const findDrop = (code: string) => get<PatchDropRow>('SELECT * FROM patch_drops WHERE code = ?', code);
/** O patch como fica no perfil de quem resgatou (marcado com o resgate). */
const claimedPatch = (d: PatchDropRow): Patch => ({ ...(JSON.parse(d.patch) as Patch), id: `d${d.id.slice(0, 12)}`, drop: d.id });

/** Prévia pública: aparece na página de resgate, antes do login. */
api.get('/drops/:code', (req, res) => {
  const drop = findDrop(req.params.code) ?? fail(404, 'Este link de presente não existe');
  const creator = get<UserRow>('SELECT * FROM users WHERE id = ?', drop.creator_id)!;
  const header = req.headers.authorization;
  const viewer = verifyToken(header?.startsWith('Bearer ') ? header.slice(7) : undefined);
  res.json({
    code: drop.code,
    patch: claimedPatch(drop),
    creator: { displayName: creator.display_name, avatarUrl: creator.avatar_url, avatarColor: creator.avatar_color, frame: styleJson(parseStyle(creator.profile_style)).frame },
    server: (() => {
      const sv = drop.server_id ? get<ServerRow>('SELECT * FROM servers WHERE id = ?', drop.server_id) : undefined;
      return sv ? { name: sv.name, iconUrl: sv.icon_url, iconColor: sv.icon_color } : null;
    })(),
    remaining: drop.max_uses ? Math.max(0, drop.max_uses - drop.uses) : null,
    expiresAt: drop.expires_at,
    available: dropValid(drop),
    claimed: !!viewer && !!get('SELECT 1 FROM patch_claims WHERE drop_id = ? AND user_id = ?', drop.id, viewer),
  });
});

// Pix do apoio: quem chama o webhook é o Mercado Pago, sem login
registerSupportWebhook(api);

// a volta do login da Steam chega pelo navegador, sem o token (ver integrations.ts)
registerPublicIntegrationRoutes(api, {
  meUpdated: (userId) => {
    const user = get<UserRow>('SELECT * FROM users WHERE id = ?', userId);
    if (user) emitToUser(userId, 'me:updated', meJson(user));
  },
});

api.use(requireAuth);

api.get('/me', (_req, res) => {
  const user = get<UserRow>('SELECT * FROM users WHERE id = ?', uid(res)) ?? fail(401, 'Sessão inválida');
  res.json(meJson(user));
});

/** Avisa os servidores do usuário que o perfil dele mudou (nome, foto...). */
function profileChanged(userId: string) {
  for (const { server_id } of all<{ server_id: string }>('SELECT server_id FROM members WHERE user_id = ?', userId)) {
    serverChanged(server_id);
  }
}

api.patch('/me', async (req, res) => {
  const me = uid(res);
  let publicChange = false;
  const displayName = optStr(req.body?.displayName, 'nome', 1, 32);
  if (displayName) {
    run('UPDATE users SET display_name = ? WHERE id = ?', displayName, me);
    publicChange = true;
  }
  if (req.body?.avatarColor !== undefined) {
    run('UPDATE users SET avatar_color = ? WHERE id = ?', color(req.body.avatarColor) ?? pickColor(), me);
    publicChange = true;
  }
  if (req.body?.bannerColor !== undefined) {
    run('UPDATE users SET banner_color = ? WHERE id = ?', color(req.body.bannerColor), me);
    publicChange = true;
  }
  const bio = optStr(req.body?.bio, 'sobre mim', 0, 190);
  if (bio !== undefined) {
    run('UPDATE users SET bio = ? WHERE id = ?', bio, me);
    publicChange = true;
  }
  if (req.body?.settings !== undefined) {
    const json = JSON.stringify(req.body.settings ?? {});
    if (json.length > 20_000) fail(400, 'Configurações muito grandes');
    run('UPDATE users SET settings = ? WHERE id = ?', json, me);
    broadcastStatus(me);
  }
  // senha trocada: os outros aparelhos saem da conta e este recebe um token novo
  let token: string | undefined;
  if (req.body?.newPassword !== undefined) {
    const user = get<UserRow>('SELECT * FROM users WHERE id = ?', me)!;
    const newPassword = str(req.body.newPassword, 'nova senha', 6, 128);
    // quem entrou pelo Google e ainda não tem senha pode criar uma sem informar a atual
    if (user.password_hash && !(await bcrypt.compare(String(req.body.currentPassword ?? ''), user.password_hash))) fail(400, 'Senha atual incorreta');
    twoFactor.requireCode(user, req.body.twoFactorCode);
    await setPassword(user, newPassword, typeof req.body.socketId === 'string' ? req.body.socketId : undefined);
    token = signToken(me);
  }
  if (publicChange) profileChanged(me);
  const updated = meJson(get<UserRow>('SELECT * FROM users WHERE id = ?', me)!);
  // os outros aparelhos da pessoa (app desktop + navegador + celular) ficam iguais
  if (req.body?.settings !== undefined || publicChange) emitToUser(me, 'me:updated', updated);
  res.json(token ? { ...updated, token } : updated);
});

/** Gera um novo código de recuperação (o antigo deixa de valer). Pede a senha atual. */
api.post('/me/recovery-code', humansOnly, async (req, res) => {
  const me = uid(res);
  const user = get<UserRow>('SELECT * FROM users WHERE id = ?', me)!;
  if (user.password_hash && !(await bcrypt.compare(String(req.body?.password ?? ''), user.password_hash))) fail(400, 'Senha incorreta');
  twoFactor.requireCode(user, req.body?.twoFactorCode);
  res.json({ code: await rotateRecoveryCode(me) });
});

// ---- Verificação em duas etapas (ver twoFactor.ts) ----

/** Começa: pede a senha (quem pegou a sessão de alguém não liga o 2FA e tranca o dono do lado de fora). */
api.post('/me/2fa/setup', humansOnly, async (req, res) => {
  const user = get<UserRow>('SELECT * FROM users WHERE id = ?', uid(res))!;
  if (user.password_hash && !(await bcrypt.compare(String(req.body?.password ?? ''), user.password_hash))) fail(400, 'Senha incorreta');
  res.json(twoFactor.startSetup(user));
});

/** Confirma com o primeiro código do app: liga o 2FA e mostra os códigos de backup (uma vez). */
api.post('/me/2fa/enable', humansOnly, (req, res) => {
  const me = uid(res);
  const { backupCodes, clockOffsetSec } = twoFactor.enable(get<UserRow>('SELECT * FROM users WHERE id = ?', me)!, req.body?.code);
  const updated = meJson(get<UserRow>('SELECT * FROM users WHERE id = ?', me)!);
  emitToUser(me, 'me:updated', updated);
  res.json({ backupCodes, me: updated, clockOffsetSec });
});

api.post('/me/2fa/disable', humansOnly, (req, res) => {
  const me = uid(res);
  const user = get<UserRow>('SELECT * FROM users WHERE id = ?', me)!;
  if (!user.totp_enabled) fail(400, 'A verificação em duas etapas já está desligada.');
  twoFactor.requireCode(user, req.body?.code);
  twoFactor.disable(me);
  const updated = meJson(get<UserRow>('SELECT * FROM users WHERE id = ?', me)!);
  emitToUser(me, 'me:updated', updated);
  res.json(updated);
});

/** Códigos de backup novos (os antigos deixam de valer). */
api.post('/me/2fa/backup-codes', humansOnly, (req, res) => {
  const me = uid(res);
  const user = get<UserRow>('SELECT * FROM users WHERE id = ?', me)!;
  if (!user.totp_enabled) fail(400, 'Ligue a verificação em duas etapas primeiro.');
  twoFactor.requireCode(user, req.body?.code);
  const backupCodes = twoFactor.rotateBackupCodes(me);
  const updated = meJson(get<UserRow>('SELECT * FROM users WHERE id = ?', me)!);
  emitToUser(me, 'me:updated', updated);
  res.json({ backupCodes, me: updated });
});

const imageBody = express.raw({ type: () => true, limit: '9mb' });

api.post('/me/avatar', imageBody, (req, res) => {
  const me = uid(res);
  const old = get<UserRow>('SELECT * FROM users WHERE id = ?', me)!.avatar_url;
  const url = saveImage('avatars', me, req.body);
  run('UPDATE users SET avatar_url = ? WHERE id = ?', url, me);
  removeUpload(old);
  profileChanged(me);
  res.json(meJson(get<UserRow>('SELECT * FROM users WHERE id = ?', me)!));
});

api.delete('/me/avatar', (_req, res) => {
  const me = uid(res);
  removeUpload(get<UserRow>('SELECT * FROM users WHERE id = ?', me)!.avatar_url);
  run('UPDATE users SET avatar_url = NULL WHERE id = ?', me);
  profileChanged(me);
  res.json(meJson(get<UserRow>('SELECT * FROM users WHERE id = ?', me)!));
});

/** Capa do perfil (aceita GIF animado). */
api.post('/me/banner', imageBody, (req, res) => {
  const me = uid(res);
  const old = get<UserRow>('SELECT * FROM users WHERE id = ?', me)!.banner_url;
  const url = saveImage('banners', me, req.body);
  run('UPDATE users SET banner_url = ? WHERE id = ?', url, me);
  removeUpload(old);
  profileChanged(me);
  res.json(meJson(get<UserRow>('SELECT * FROM users WHERE id = ?', me)!));
});

api.delete('/me/banner', (_req, res) => {
  const me = uid(res);
  removeUpload(get<UserRow>('SELECT * FROM users WHERE id = ?', me)!.banner_url);
  run('UPDATE users SET banner_url = NULL WHERE id = ?', me);
  profileChanged(me);
  res.json(meJson(get<UserRow>('SELECT * FROM users WHERE id = ?', me)!));
});

// ---- Cosméticos: moldura animada, fundo do cartão e patches ----

function saveStyle(userId: string, style: ProfileStyle) {
  run('UPDATE users SET profile_style = ? WHERE id = ?', JSON.stringify(style), userId);
  profileChanged(userId);
}

const HEX = /^#[0-9a-fA-F]{6}$/;

/** Imagem enviada por quem criou o patch, ou de um patch compartilhado num servidor da pessoa. */
function patchImageAllowed(url: unknown, me: string): url is string {
  if (typeof url !== 'string' || !/^\/uploads\/patches\/[\w-]+\.(png|jpg|gif|webp)$/.test(url)) return false;
  if (url.startsWith(`/uploads/patches/${me}-`)) return true;
  // patch ganho por link de presente
  if (get('SELECT 1 FROM patch_claims c JOIN patch_drops d ON d.id = c.drop_id WHERE c.user_id = ? AND d.patch LIKE ? LIMIT 1', me, `%${url}%`)) return true;
  return !!get(
    `SELECT 1 FROM server_patches p JOIN members m ON m.server_id = p.server_id AND m.user_id = ? WHERE p.data LIKE ? LIMIT 1`,
    me,
    `%${url}%`,
  );
}

/** Apaga a imagem de um patch quando ninguém mais usa. */
function dropPatchImage(url: string | undefined) {
  if (!url) return;
  const like = `%${url}%`;
  if (get('SELECT 1 FROM server_patches WHERE data LIKE ? LIMIT 1', like)) return;
  if (get('SELECT 1 FROM users WHERE profile_style LIKE ? LIMIT 1', like)) return;
  if (get('SELECT 1 FROM patch_drops WHERE patch LIKE ? LIMIT 1', like)) return;
  removeUpload(url);
}

/** Tamanho e posição do desenho dentro do patch (só guarda o que foi mexido). */
function artFields(p: Record<string, unknown>) {
  const num = (v: unknown, min: number, max: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : undefined);
  const out: Pick<Patch, 'artScale' | 'artX' | 'artY'> = {};
  const scale = num(p?.artScale, ART_SCALE.min, ART_SCALE.max);
  const x = num(p?.artX, -ART_OFFSET, ART_OFFSET);
  const y = num(p?.artY, -ART_OFFSET, ART_OFFSET);
  if (scale !== undefined && Math.abs(scale - 1) > 0.001) out.artScale = Math.round(scale * 100) / 100;
  if (x) out.artX = Math.round(x * 10) / 10;
  if (y) out.artY = Math.round(y * 10) / 10;
  return out;
}

function cleanPatch(p: Record<string, unknown>, me: string): Patch {
  const pick = (v: unknown, fallback: string) => (typeof v === 'string' && HEX.test(v) ? v : fallback);
  return {
    id: typeof p?.id === 'string' && /^[\w-]{1,40}$/.test(p.id) ? p.id : randomUUID(),
    shape: (PATCH_SHAPES as readonly string[]).includes(p?.shape as string) ? (p.shape as Patch['shape']) : 'circle',
    bg: pick(p?.bg, '#2b2234'),
    border: pick(p?.border, '#ff8a6b'),
    fg: pick(p?.fg, '#ffffff'),
    icon: typeof p?.icon === 'string' ? [...p.icon].slice(0, 4).join('') : '',
    text: typeof p?.text === 'string' ? p.text.trim().slice(0, 14) : '',
    ...(patchImageAllowed(p?.image, me) ? { image: p.image as string } : {}),
    ...artFields(p),
    ...(typeof p?.drop === 'string' && get('SELECT 1 FROM patch_claims WHERE drop_id = ? AND user_id = ?', p.drop, me) ? { drop: p.drop } : {}),
  };
}

function cleanPatches(raw: unknown, me: string): Patch[] {
  if (!Array.isArray(raw)) fail(400, 'Patches inválidos');
  const list = raw as Record<string, unknown>[];
  if (list.length > MAX_PATCHES) fail(400, `No máximo ${MAX_PATCHES} patches`);
  return list.map((p) => cleanPatch(p, me));
}

api.patch('/me/style', (req, res) => {
  const me = uid(res);
  const style = parseStyle(get<UserRow>('SELECT * FROM users WHERE id = ?', me)!.profile_style);
  let dropped: Patch[] = [];
  if (req.body?.frame !== undefined) {
    const frame = req.body.frame;
    if (frame !== null && !(FRAMES as readonly string[]).includes(frame)) fail(400, 'Moldura inválida');
    style.frame = frame;
  }
  if (req.body?.patches !== undefined) {
    const next = cleanPatches(req.body.patches, me);
    dropped = (style.patches ?? []).filter((old) => old.image && !next.some((p) => p.image === old.image));
    style.patches = next;
  }
  saveStyle(me, style);
  dropped.forEach((p) => dropPatchImage(p.image));
  res.json(meJson(get<UserRow>('SELECT * FROM users WHERE id = ?', me)!));
});

/** Fundo do mini perfil (imagem ou GIF). */
api.post('/me/card-bg', imageBody, (req, res) => {
  const me = uid(res);
  const style = parseStyle(get<UserRow>('SELECT * FROM users WHERE id = ?', me)!.profile_style);
  const old = style.cardBg;
  style.cardBg = saveImage('cards', me, req.body);
  saveStyle(me, style);
  removeUpload(old);
  res.json(meJson(get<UserRow>('SELECT * FROM users WHERE id = ?', me)!));
});

api.delete('/me/card-bg', (_req, res) => {
  const me = uid(res);
  const style = parseStyle(get<UserRow>('SELECT * FROM users WHERE id = ?', me)!.profile_style);
  removeUpload(style.cardBg);
  style.cardBg = null;
  saveStyle(me, style);
  res.json(meJson(get<UserRow>('SELECT * FROM users WHERE id = ?', me)!));
});

/** Imagem de um patch (logo do time etc.). Só passa a valer quando o patch é salvo. */
api.post('/me/patch-image', imageBody, (req, res) => {
  res.json({ url: saveImage('patches', uid(res), req.body) });
});

/** Fundo do tema: guardado no servidor para aparecer igual no navegador e no app desktop. */
api.post('/me/background', imageBody, (req, res) => {
  const me = uid(res);
  const user = get<UserRow>('SELECT * FROM users WHERE id = ?', me)!;
  let previous: string | undefined;
  try {
    previous = JSON.parse(user.settings || '{}')?.theme?.background?.url;
  } catch {
    // ignorado
  }
  const url = saveImage('backgrounds', me, req.body);
  if (previous?.startsWith('/uploads/backgrounds/')) removeUpload(previous);
  res.json({ url });
});

// ============================================================ Servidores

api.get('/servers', (_req, res) => {
  const rows = all<ServerRow>(
    'SELECT s.* FROM servers s JOIN members m ON m.server_id = s.id WHERE m.user_id = ? ORDER BY m.joined_at',
    uid(res),
  );
  res.json(rows.map(serverJson));
});

api.post('/servers', humansOnly, (req, res) => {
  const me = uid(res);
  const name = str(req.body?.name, 'nome', 2, 50);
  const server: ServerRow = { id: randomUUID(), name, owner_id: me, icon_color: pickColor(), icon_url: null, verified: 0, created_at: now() };

  tx(() => {
    run('INSERT INTO servers (id, name, owner_id, icon_color, created_at) VALUES (?, ?, ?, ?, ?)', server.id, name, me, server.icon_color, server.created_at);
    const everyone = randomUUID();
    const mod = randomUUID();
    const admin = randomUUID();
    const insRole = 'INSERT INTO roles (id, server_id, name, color, permissions, position, is_default, hoist) VALUES (?, ?, ?, ?, ?, ?, ?, ?)';
    run(insRole, everyone, server.id, '@everyone', null, DEFAULT_EVERYONE, 0, 1, 0);
    run(insRole, mod, server.id, 'Moderador', '#3ba55c', DEFAULT_MODERATOR, 1, 0, 1);
    run(insRole, admin, server.id, 'Admin', '#ed4245', P.ADMINISTRATOR, 2, 0, 1);
    run('INSERT INTO members (server_id, user_id, joined_at) VALUES (?, ?, ?)', server.id, me, now());
    run('INSERT INTO member_roles (server_id, user_id, role_id) VALUES (?, ?, ?)', server.id, me, admin);
    const insChan = 'INSERT INTO channels (id, server_id, name, type, topic, position) VALUES (?, ?, ?, ?, ?, ?)';
    if (req.body?.template === 'community') {
      const ch = (name: string, type: string, topic: string, pos: number) => {
        const id = randomUUID();
        run(insChan, id, server.id, name, type, topic, pos);
        return id;
      };
      // anúncios e boas-vindas: só quem modera escreve
      const readOnly = [
        ch('anúncios', 'text', 'Novidades, versões novas e avisos', 0),
        ch('boas-vindas', 'text', 'Comece por aqui: como a comunidade funciona', 1),
      ];
      for (const id of readOnly) run('INSERT INTO channel_overwrites (channel_id, role_id, allow, deny) VALUES (?, ?, 0, ?)', id, everyone, P.SEND_MESSAGES);
      ch('geral', 'text', 'Bate-papo geral', 2);
      ch('off-topic', 'text', 'Qualquer assunto', 3);
      ch('ideias', 'forum', 'Sugira recursos e vote nas ideias da galera', 0);
      ch('bugs', 'forum', 'Achou um problema? Conte o que aconteceu e como repetir', 1);
      ch('feedback', 'forum', 'O que está bom, o que pode melhorar', 2);
      ch('ajuda', 'forum', 'Dúvidas sobre usar ou hospedar o Concord', 3);
      ch('Bate-papo', 'voice', '', 0);
      ch('Jogando junto', 'voice', '', 1);
      const welcome = readOnly[1];
      run(
        'INSERT INTO messages (id, channel_id, author_id, content, created_at) VALUES (?, ?, ?, ?, ?)',
        randomUUID(),
        welcome,
        me,
        [
          `Bem-vindo à comunidade do ${name}! 👋`,
          '',
          '💡 #ideias: sugira recursos e vote (+1) nas ideias que você quer ver.',
          '🐞 #bugs: conte o que aconteceu, o que esperava e como repetir.',
          '💬 #feedback: o que está bom e o que pode melhorar.',
          '❓ #ajuda: dúvidas sobre usar ou hospedar.',
          '',
          'Seja gentil, sem spam. A moderação marca o status de cada post (em análise, planejado, feito) pra todo mundo acompanhar.',
        ].join('\n'),
        now(),
      );
    } else {
      run(insChan, randomUUID(), server.id, 'geral', 'text', 'Bate-papo geral', 0);
      run(insChan, randomUUID(), server.id, 'clipes-e-prints', 'text', '', 1);
      run(insChan, randomUUID(), server.id, 'Sala de Transmissão', 'voice', '', 0);
      run(insChan, randomUUID(), server.id, 'Lounge', 'voice', '', 1);
    }
  });

  joinServerRoom(me, server.id);
  res.json(serverJson(server));
});

api.get('/servers/:id', (req, res) => {
  const me = uid(res);
  const server = requireMember(req.params.id, me);
  const perms = serverPermissions(server.id, me);

  const roles = all<RoleRow>('SELECT * FROM roles WHERE server_id = ? ORDER BY position DESC', server.id);
  const channels = all<ChannelRow>('SELECT * FROM channels WHERE server_id = ? ORDER BY position, name', server.id)
    .map((c) => ({ c, perms: channelPermissions(c, me) }))
    .filter(({ perms }) => perms !== 0)
    .map(({ c, perms }) => ({
      id: c.id,
      name: c.name,
      type: c.type,
      topic: c.topic,
      position: c.position,
      userLimit: c.user_limit,
      overwrites: channelOverwrites(c.id),
      permissions: perms,
    }));

  const memberRows = all<UserRow & { joined_at: number; nickname: string | null }>(
    `SELECT u.*, m.joined_at, m.nickname FROM members m JOIN users u ON u.id = m.user_id WHERE m.server_id = ? ORDER BY m.joined_at`,
    server.id,
  );
  const links = all<{ user_id: string; role_id: string }>('SELECT user_id, role_id FROM member_roles WHERE server_id = ?', server.id);
  const members = memberRows.map((u) => ({
    ...userJson(u),
    nickname: u.nickname,
    joinedAt: u.joined_at,
    roleIds: links.filter((l) => l.user_id === u.id).map((l) => l.role_id),
  }));

  res.json({
    server: serverJson(server),
    permissions: perms,
    highestPosition: highestPosition(server.id, me) === Infinity ? 1e9 : highestPosition(server.id, me),
    roles: roles.map(roleJson),
    channels,
    members,
    voiceStates: voiceStatesFor(server.id),
    jams: jamsFor(server.id),
    online: onlineUserIds().filter((id) => members.some((m) => m.id === id)),
  });
});

api.patch('/servers/:id', (req, res) => {
  const server = requireServerPerm(req.params.id, uid(res), P.MANAGE_SERVER);
  const name = optStr(req.body?.name, 'nome', 2, 50);
  if (name) run('UPDATE servers SET name = ? WHERE id = ?', name, server.id);
  if (req.body?.iconColor) run('UPDATE servers SET icon_color = ? WHERE id = ?', color(req.body.iconColor), server.id);
  serverChanged(server.id);
  res.json(serverJson(getServer(server.id)));
});

api.post('/servers/:id/icon', imageBody, (req, res) => {
  const server = requireServerPerm(req.params.id, uid(res), P.MANAGE_SERVER);
  const url = saveImage('icons', server.id, req.body);
  run('UPDATE servers SET icon_url = ? WHERE id = ?', url, server.id);
  removeUpload(server.icon_url);
  serverChanged(server.id);
  res.json(serverJson(getServer(server.id)));
});

api.delete('/servers/:id/icon', (req, res) => {
  const server = requireServerPerm(req.params.id, uid(res), P.MANAGE_SERVER);
  removeUpload(server.icon_url);
  run('UPDATE servers SET icon_url = NULL WHERE id = ?', server.id);
  serverChanged(server.id);
  res.json(serverJson(getServer(server.id)));
});

// ---- selo de verificado (autoridade da instalação, ver access.ts#isInstanceAuthority) ----

api.put('/servers/:id/verified', (req, res) => {
  if (!isInstanceAuthority(uid(res))) fail(403, 'Você não tem permissão para isso');
  const server = getServer(req.params.id);
  run('UPDATE servers SET verified = ? WHERE id = ?', req.body?.verified ? 1 : 0, server.id);
  serverChanged(server.id);
  res.json(serverJson(getServer(server.id)));
});

api.put('/users/:id/verified', (req, res) => {
  if (!isInstanceAuthority(uid(res))) fail(403, 'Você não tem permissão para isso');
  const target = get<UserRow>('SELECT * FROM users WHERE id = ?', req.params.id) ?? fail(404, 'Usuário não encontrado');
  run('UPDATE users SET verified = ? WHERE id = ?', req.body?.verified ? 1 : 0, target.id);
  profileChanged(target.id);
  res.json(userJson(get<UserRow>('SELECT * FROM users WHERE id = ?', target.id)!));
});

/** Apelido por servidor: o próprio (CHANGE_NICKNAME) ou de quem está abaixo (MANAGE_NICKNAMES). */
api.put('/servers/:id/members/:userId/nickname', (req, res) => {
  const me = uid(res);
  const target = req.params.userId === '@me' ? me : req.params.userId;
  const server = requireMember(req.params.id, me);
  if (!isMember(server.id, target)) fail(404, 'Membro não encontrado');
  const perms = serverPermissions(server.id, me);
  if (target === me) {
    if (!has(perms, P.CHANGE_NICKNAME) && !has(perms, P.MANAGE_NICKNAMES)) fail(403, 'Você não pode alterar seu apelido aqui');
  } else if (!mecenasOver(me, target) && (!has(perms, P.MANAGE_NICKNAMES) || !outranks(server.id, me, target))) {
    fail(403, 'Você não pode alterar o apelido deste membro');
  }
  const raw = req.body?.nickname;
  const nickname = raw === null || raw === '' ? null : str(raw, 'apelido', 1, 32);
  run('UPDATE members SET nickname = ? WHERE server_id = ? AND user_id = ?', nickname, server.id, target);
  serverChanged(server.id);
  res.json({ ok: true, nickname });
});

api.delete('/servers/:id', (req, res) => {
  const server = getServer(req.params.id);
  if (server.owner_id !== uid(res)) fail(403, 'Apenas o dono pode apagar o servidor');
  for (const v of voiceStatesFor(server.id)) {
    dropVoice(v.userId, 'O servidor foi apagado.');
    void removeFromRoom(v.channelId, v.userId);
  }
  emitToServer(server.id, 'server:removed', { serverId: server.id, reason: 'O servidor foi apagado.' });
  const memberIds = all<{ user_id: string }>('SELECT user_id FROM members WHERE server_id = ?', server.id);
  run('DELETE FROM servers WHERE id = ?', server.id);
  removeUpload(server.icon_url);
  memberIds.forEach((m) => leaveServerRoom(m.user_id, server.id));
  res.json({ ok: true });
});

api.post('/servers/:id/leave', (req, res) => {
  const me = uid(res);
  const server = requireMember(req.params.id, me);
  if (server.owner_id === me) fail(400, 'O dono não pode sair. Apague o servidor ou transfira a posse.');
  removeMember(server.id, me);
  res.json({ ok: true });
});

function removeMember(serverId: string, userId: string) {
  const v = getVoiceState(userId);
  if (v?.serverId === serverId) void removeFromRoom(v.channelId, userId);
  run('DELETE FROM members WHERE server_id = ? AND user_id = ?', serverId, userId);
  leaveServerRoom(userId, serverId);
  serverChanged(serverId);
}

// ============================================================ Canais

function normalizeChannelName(name: string, type: string) {
  return type !== 'voice' ? name.toLowerCase().replace(/\s+/g, '-').replace(/[^\p{L}\p{N}_-]/gu, '') || 'canal' : name;
}

api.post('/servers/:id/channels', (req, res) => {
  const server = requireServerPerm(req.params.id, uid(res), P.MANAGE_CHANNELS);
  const type = req.body?.type === 'voice' || req.body?.type === 'forum' ? req.body.type : 'text';
  const name = normalizeChannelName(str(req.body?.name, 'nome', 1, 50), type);
  const topic = optStr(req.body?.topic, 'tópico', 0, 300) ?? '';
  const pos = get<{ p: number }>('SELECT COALESCE(MAX(position), -1) + 1 AS p FROM channels WHERE server_id = ? AND type = ?', server.id, type)!.p;
  const id = randomUUID();
  run('INSERT INTO channels (id, server_id, name, type, topic, position) VALUES (?, ?, ?, ?, ?, ?)', id, server.id, name, type, topic, pos);
  if (req.body?.private === true) {
    run('INSERT INTO channel_overwrites (channel_id, role_id, allow, deny) VALUES (?, ?, 0, ?)', id, everyoneRole(server.id).id, P.VIEW_CHANNEL);
  }
  serverChanged(server.id);
  res.json({ id });
});

api.patch('/channels/:id', (req, res) => {
  const channel = requireChannelPerm(req.params.id, uid(res), P.MANAGE_CHANNELS);
  const name = optStr(req.body?.name, 'nome', 1, 50);
  if (name) run('UPDATE channels SET name = ? WHERE id = ?', normalizeChannelName(name, channel.type), channel.id);
  const topic = optStr(req.body?.topic, 'tópico', 0, 300);
  if (topic !== undefined) run('UPDATE channels SET topic = ? WHERE id = ?', topic, channel.id);
  if (req.body?.userLimit !== undefined) {
    run('UPDATE channels SET user_limit = ? WHERE id = ?', Math.max(0, Math.min(99, int(req.body.userLimit, 'limite'))), channel.id);
  }
  if (req.body?.move === 'up' || req.body?.move === 'down') {
    const siblings = all<ChannelRow>('SELECT * FROM channels WHERE server_id = ? AND type = ? ORDER BY position, name', channel.server_id, channel.type);
    const i = siblings.findIndex((c) => c.id === channel.id);
    const j = req.body.move === 'up' ? i - 1 : i + 1;
    if (j >= 0 && j < siblings.length) {
      [siblings[i], siblings[j]] = [siblings[j], siblings[i]];
      tx(() => siblings.forEach((c, idx) => run('UPDATE channels SET position = ? WHERE id = ?', idx, c.id)));
    }
  }
  serverChanged(channel.server_id);
  res.json({ ok: true });
});

api.delete('/channels/:id', (req, res) => {
  const channel = requireChannelPerm(req.params.id, uid(res), P.MANAGE_CHANNELS);
  const count = get<{ n: number }>('SELECT COUNT(*) AS n FROM channels WHERE server_id = ?', channel.server_id)!.n;
  if (count <= 1) fail(400, 'O servidor precisa ter pelo menos um canal');
  for (const v of voiceStatesFor(channel.server_id).filter((v) => v.channelId === channel.id)) {
    dropVoice(v.userId, 'A sala foi apagada.');
  }
  run('DELETE FROM channels WHERE id = ?', channel.id);
  serverChanged(channel.server_id);
  res.json({ ok: true });
});

api.put('/channels/:id/overwrites/:roleId', (req, res) => {
  const me = uid(res);
  const channel = requireChannelPerm(req.params.id, me, P.MANAGE_CHANNELS);
  const role = getRole(req.params.roleId);
  if (role.server_id !== channel.server_id) fail(400, 'Cargo inválido');
  if (!has(serverPermissions(channel.server_id, me), P.MANAGE_ROLES)) fail(403, 'Você precisa de "Gerenciar cargos"');
  const allow = int(req.body?.allow ?? 0, 'allow') & ALL_PERMISSIONS & ~P.ADMINISTRATOR;
  const deny = int(req.body?.deny ?? 0, 'deny') & ALL_PERMISSIONS & ~P.ADMINISTRATOR & ~allow;
  if (!allow && !deny) {
    run('DELETE FROM channel_overwrites WHERE channel_id = ? AND role_id = ?', channel.id, role.id);
  } else {
    run(
      `INSERT INTO channel_overwrites (channel_id, role_id, allow, deny) VALUES (?, ?, ?, ?)
       ON CONFLICT (channel_id, role_id) DO UPDATE SET allow = excluded.allow, deny = excluded.deny`,
      channel.id,
      role.id,
      allow,
      deny,
    );
  }
  serverChanged(channel.server_id);
  res.json({ ok: true });
});

// ============================================================ Cargos

/** Garante que o ator pode editar este cargo (abaixo do seu cargo mais alto). */
function requireManageableRole(roleId: string, me: string) {
  const role = getRole(roleId);
  requireServerPerm(role.server_id, me, P.MANAGE_ROLES);
  if (!role.is_default && role.position >= highestPosition(role.server_id, me)) {
    fail(403, 'Você só pode gerenciar cargos abaixo do seu cargo mais alto');
  }
  return role;
}

api.post('/servers/:id/roles', (req, res) => {
  const me = uid(res);
  const server = requireServerPerm(req.params.id, me, P.MANAGE_ROLES);
  const name = optStr(req.body?.name, 'nome', 1, 32) || 'novo cargo';
  const id = randomUUID();
  tx(() => {
    run('UPDATE roles SET position = position + 1 WHERE server_id = ? AND is_default = 0', server.id);
    run(
      'INSERT INTO roles (id, server_id, name, color, permissions, position, is_default, hoist) VALUES (?, ?, ?, ?, ?, 1, 0, 0)',
      id,
      server.id,
      name,
      color(req.body?.color ?? null),
      everyoneRole(server.id).permissions,
    );
  });
  serverChanged(server.id);
  res.json(roleJson(getRole(id)));
});

api.patch('/roles/:id', (req, res) => {
  const me = uid(res);
  const role = requireManageableRole(req.params.id, me);
  const myPerms = serverPermissions(role.server_id, me);

  if (!role.is_default) {
    const name = optStr(req.body?.name, 'nome', 1, 32);
    if (name) run('UPDATE roles SET name = ? WHERE id = ?', name, role.id);
    if (req.body?.color !== undefined) run('UPDATE roles SET color = ? WHERE id = ?', color(req.body.color), role.id);
    if (typeof req.body?.hoist === 'boolean') run('UPDATE roles SET hoist = ? WHERE id = ?', req.body.hoist ? 1 : 0, role.id);
  }
  if (req.body?.permissions !== undefined) {
    const next = int(req.body.permissions, 'permissões') & ALL_PERMISSIONS;
    const changed = next ^ role.permissions;
    if (changed & ~myPerms) fail(403, 'Você não pode conceder ou remover permissões que não possui');
    run('UPDATE roles SET permissions = ? WHERE id = ?', next, role.id);
  }
  if ((req.body?.move === 'up' || req.body?.move === 'down') && !role.is_default) {
    const ordered = all<RoleRow>('SELECT * FROM roles WHERE server_id = ? AND is_default = 0 ORDER BY position', role.server_id);
    const i = ordered.findIndex((r) => r.id === role.id);
    const j = req.body.move === 'up' ? i + 1 : i - 1;
    if (j >= 0 && j < ordered.length) {
      if (ordered[j].position >= highestPosition(role.server_id, me)) fail(403, 'Não é possível mover acima do seu cargo');
      [ordered[i], ordered[j]] = [ordered[j], ordered[i]];
      tx(() => ordered.forEach((r, idx) => run('UPDATE roles SET position = ? WHERE id = ?', idx + 1, r.id)));
    }
  }
  serverChanged(role.server_id);
  res.json(roleJson(getRole(role.id)));
});

api.delete('/roles/:id', (req, res) => {
  const role = requireManageableRole(req.params.id, uid(res));
  if (role.is_default) fail(400, 'O cargo @everyone não pode ser apagado');
  run('DELETE FROM roles WHERE id = ?', role.id);
  serverChanged(role.server_id);
  res.json({ ok: true });
});

// ============================================================ Membros e moderação

api.put('/servers/:id/members/:userId/roles', (req, res) => {
  const me = uid(res);
  const server = requireServerPerm(req.params.id, me, P.MANAGE_ROLES);
  const target = req.params.userId;
  if (!isMember(server.id, target)) fail(404, 'Membro não encontrado');
  if (target !== me && !outranks(server.id, me, target)) fail(403, 'Você não pode gerenciar este membro');
  if (!Array.isArray(req.body?.roleIds)) fail(400, 'roleIds inválido');

  const mine = highestPosition(server.id, me);
  const wanted = new Set<string>(req.body.roleIds);
  const roles = all<RoleRow>('SELECT * FROM roles WHERE server_id = ? AND is_default = 0', server.id);
  const current = new Set(memberRoles(server.id, target).map((r) => r.id));

  tx(() => {
    for (const r of roles) {
      if (r.position >= mine) continue; // não pode mexer em cargos iguais ou acima do seu
      if (wanted.has(r.id) && !current.has(r.id)) {
        run('INSERT INTO member_roles (server_id, user_id, role_id) VALUES (?, ?, ?)', server.id, target, r.id);
      } else if (!wanted.has(r.id) && current.has(r.id)) {
        run('DELETE FROM member_roles WHERE server_id = ? AND user_id = ? AND role_id = ?', server.id, target, r.id);
      }
    }
  });
  serverChanged(server.id);
  res.json({ ok: true });
});

api.delete('/servers/:id/members/:userId', (req, res) => {
  const me = uid(res);
  const server = requireServerPerm(req.params.id, me, P.KICK_MEMBERS);
  const target = req.params.userId;
  if (!isMember(server.id, target)) fail(404, 'Membro não encontrado');
  if (!outranks(server.id, me, target)) fail(403, 'Você não pode expulsar este membro');
  emitToUser(target, 'server:removed', { serverId: server.id, reason: `Você foi expulso de ${server.name}.` });
  dropVoice(target, 'Você foi expulso do servidor.');
  removeMember(server.id, target);
  res.json({ ok: true });
});

/** Valida uma ação de moderação de voz sobre um membro que está numa sala deste servidor. */
function voiceTarget(serverId: string, me: string, target: string, flag: number) {
  requireMember(serverId, me);
  const v = getVoiceState(target);
  if (!v || v.serverId !== serverId) fail(400, 'Este membro não está em uma sala de voz');
  if (!has(channelPermissions(getChannel(v!.channelId), me), flag)) fail(403, 'Você não tem permissão para isso');
  if (target !== me && !outranks(serverId, me, target)) fail(403, 'Você não pode moderar este membro');
  return v!;
}

/** O Mecenas age sobre o alvo dele sem cargo no servidor: basta os dois estarem nele e o alvo numa sala. */
function mecenasVoiceTarget(serverId: string, me: string, target: string) {
  requireMember(serverId, me);
  const v = getVoiceState(target);
  if (!v || v.serverId !== serverId) fail(400, 'Este membro não está em uma sala de voz');
  return v!;
}

api.post('/servers/:id/members/:userId/voice-mute', async (req, res) => {
  const me = uid(res);
  const serverId = req.params.id;
  const target = req.params.userId;
  const muted = req.body?.muted !== false;
  if (mecenasOver(me, target)) {
    // o Mecenas silencia o alvo dele sem precisar de cargo no servidor
    requireMember(serverId, me);
    const v = getVoiceState(target);
    if (muted && v?.serverId === serverId) await muteTracks(v.channelId, target, [TrackSource.MICROPHONE]);
  } else if (getVoiceState(target)?.serverId === serverId) {
    const v = voiceTarget(serverId, me, target, P.MUTE_MEMBERS);
    if (muted) await muteTracks(v.channelId, target, [TrackSource.MICROPHONE]);
  } else {
    requireServerPerm(serverId, me, P.MUTE_MEMBERS);
    if (!outranks(serverId, me, target)) fail(403, 'Você não pode moderar este membro');
  }
  setServerMute(serverId, target, muted);
  res.json({ ok: true, muted });
});

api.post('/servers/:id/members/:userId/voice-disconnect', async (req, res) => {
  const me = uid(res);
  const mecenas = mecenasOver(me, req.params.userId);
  const v = mecenas ? mecenasVoiceTarget(req.params.id, me, req.params.userId) : voiceTarget(req.params.id, me, req.params.userId, P.MOVE_MEMBERS);
  dropVoice(v.userId, mecenas ? 'Seu Mecenas tirou você da sala.' : 'Você foi desconectado da sala por um moderador.');
  await removeFromRoom(v.channelId, v.userId);
  res.json({ ok: true });
});

// ============================================================ Chamar atenção (estilo MSN)

const NUDGE_COOLDOWN_MS = 15_000;
const lastNudge = new Map<string, number>(); // `${de}:${para}` -> quando

interface NudgePrefs {
  status?: string;
  notifications?: { nudges?: boolean };
  mutedNudges?: string[];
}

api.post('/servers/:id/members/:userId/nudge', (req, res) => {
  const me = uid(res);
  const target = req.params.userId;
  const server = requireMember(req.params.id, me);
  if (target === me) fail(400, 'Você não pode chamar a sua própria atenção');
  const targetUser = get<UserRow>('SELECT * FROM users WHERE id = ?', target);
  if (!targetUser || !isMember(server.id, target)) fail(404, 'Membro não encontrado');
  const name = get<{ nickname: string | null }>('SELECT nickname FROM members WHERE server_id = ? AND user_id = ?', server.id, target)?.nickname || targetUser!.display_name;
  if (!isOnline(target)) fail(409, `${name} está offline`);

  let prefs: NudgePrefs = {};
  try {
    prefs = JSON.parse(targetUser!.settings || '{}');
  } catch {
    // ignorado
  }
  if (prefs.status === 'dnd') fail(409, `${name} está em "Não perturbe"`);
  if (prefs.notifications?.nudges === false) fail(409, `${name} não está recebendo chamadas de atenção`);

  const key = `${me}:${target}`;
  // o Mecenas chama o alvo dele quase sem espera (3 s: o app de quem recebe ignora tremidas a menos de 2,5 s, ver lib/nudge.ts)
  const cooldown = mecenasOver(me, target) ? 3_000 : NUDGE_COOLDOWN_MS;
  const wait = (lastNudge.get(key) ?? 0) + cooldown - now();
  if (wait > 0) fail(429, `Calma! Espere ${Math.ceil(wait / 1000)}s para chamar de novo`);
  lastNudge.set(key, now());

  // mensagem opcional junto da tremida (sem opção de copiar do lado de quem recebe, ver NudgeCard.tsx)
  const message = typeof req.body?.message === 'string' ? req.body.message.trim().slice(0, 140) : '';

  // quem foi silenciado não fica sabendo: a resposta é a mesma, só não entregamos
  if (!prefs.mutedNudges?.includes(me)) {
    const sender = get<UserRow>('SELECT * FROM users WHERE id = ?', me)!;
    const senderNick = get<{ nickname: string | null }>('SELECT nickname FROM members WHERE server_id = ? AND user_id = ?', server.id, me)?.nickname;
    const voice = getVoiceState(me);
    emitToUser(target, 'nudge', {
      from: { ...userJson(sender), nickname: senderNick ?? null },
      serverId: server.id,
      serverName: server.name,
      channelId: voice?.serverId === server.id ? voice.channelId : null,
      at: now(),
      message: message || undefined,
    });
  }
  res.json({ ok: true });
});

api.post('/servers/:id/members/:userId/stop-stream', async (req, res) => {
  const v = voiceTarget(req.params.id, uid(res), req.params.userId, P.MUTE_MEMBERS);
  emitToUser(v.userId, 'voice:stop-stream', { reason: 'Um moderador encerrou sua transmissão.' });
  await muteTracks(v.channelId, v.userId, [TrackSource.SCREEN_SHARE, TrackSource.SCREEN_SHARE_AUDIO]);
  res.json({ ok: true });
});

// ============================================================ Convites

const inviteJson = (i: InviteRow & { creator_name?: string }) => ({
  code: i.code,
  serverId: i.server_id,
  creatorId: i.creator_id,
  creatorName: i.creator_name,
  uses: i.uses,
  maxUses: i.max_uses,
  expiresAt: i.expires_at,
  createdAt: i.created_at,
});

const inviteValid = (i: InviteRow) => (!i.expires_at || i.expires_at > now()) && (!i.max_uses || i.uses < i.max_uses);

api.get('/servers/:id/invites', (req, res) => {
  const me = uid(res);
  const server = requireServerPerm(req.params.id, me, P.CREATE_INVITE);
  const canManage = has(serverPermissions(server.id, me), P.MANAGE_SERVER);
  const rows = all<InviteRow & { creator_name: string }>(
    `SELECT i.*, u.display_name AS creator_name FROM invites i JOIN users u ON u.id = i.creator_id
     WHERE i.server_id = ? ORDER BY i.created_at DESC`,
    server.id,
  );
  res.json(rows.filter((i) => inviteValid(i) && (canManage || i.creator_id === me)).map(inviteJson));
});

api.post('/servers/:id/invites', (req, res) => {
  const me = uid(res);
  const server = requireServerPerm(req.params.id, me, P.CREATE_INVITE);
  const maxUses = Math.max(0, Math.min(1000, Number(req.body?.maxUses ?? 0) | 0));
  const expiresIn = Number(req.body?.expiresIn ?? 7 * 24 * 3600) | 0; // segundos; 0 = nunca
  const invite: InviteRow = {
    code: randomBytes(6).toString('base64url'),
    server_id: server.id,
    creator_id: me,
    uses: 0,
    max_uses: maxUses,
    expires_at: expiresIn > 0 ? now() + expiresIn * 1000 : null,
    created_at: now(),
  };
  run(
    'INSERT INTO invites (code, server_id, creator_id, uses, max_uses, expires_at, created_at) VALUES (?, ?, ?, 0, ?, ?, ?)',
    invite.code,
    invite.server_id,
    me,
    invite.max_uses,
    invite.expires_at,
    invite.created_at,
  );
  res.json(inviteJson(invite));
});

api.delete('/invites/:code', (req, res) => {
  const me = uid(res);
  const invite = get<InviteRow>('SELECT * FROM invites WHERE code = ?', req.params.code) ?? fail(404, 'Convite não encontrado');
  if (invite.creator_id !== me) requireServerPerm(invite.server_id, me, P.MANAGE_SERVER);
  run('DELETE FROM invites WHERE code = ?', invite.code);
  res.json({ ok: true });
});

api.post('/invites/:code', humansOnly, (req, res) => {
  const me = uid(res);
  const invite = get<InviteRow>('SELECT * FROM invites WHERE code = ?', req.params.code);
  if (!invite || !inviteValid(invite)) fail(404, 'Convite inválido ou expirado');
  const server = getServer(invite!.server_id);
  if (!isMember(server.id, me)) {
    tx(() => {
      run('INSERT INTO members (server_id, user_id, joined_at) VALUES (?, ?, ?)', server.id, me, now());
      run('UPDATE invites SET uses = uses + 1 WHERE code = ?', invite!.code);
    });
    joinServerRoom(me, server.id);
    serverChanged(server.id);
  }
  res.json(serverJson(server));
});

// ============================================================ Mensagens

api.get('/channels/:id/messages', (req, res) => {
  const channel = requireChannelPerm(req.params.id, uid(res), P.VIEW_CHANNEL);
  const before = Number(req.query.before) || Number.MAX_SAFE_INTEGER;
  const limit = Math.min(100, Number(req.query.limit) || 50);
  const rows = all<MessageWithAuthor>(
    `${MESSAGE_SELECT} WHERE m.channel_id = ? AND m.created_at < ? ORDER BY m.created_at DESC LIMIT ?`,
    channel.id,
    before,
    limit,
  );
  res.json(rows.reverse().map(messageJson));
});

// ---- Anexos ----

interface AttachmentJson {
  id: string;
  name: string;
  size: number;
  url: string;
  image: boolean;
}
const attachmentJson = (a: AttachmentRow): AttachmentJson => ({ id: a.id, name: a.name, size: a.size, url: a.url, image: !!a.image });

const MAX_ATTACHMENTS = 10;
const attachmentBody = express.raw({ type: () => true, limit: '21mb' });
const uploadsPerUser = limiter(60, 60 * 60_000);

/** Envia um arquivo; ele só aparece para alguém quando vai junto de uma mensagem. */
api.post('/attachments', humansOnly, attachmentBody, (req, res) => {
  const me = uid(res);
  if (!uploadsPerUser(me)) fail(429, 'Muitos arquivos em pouco tempo. Espere um pouco.');
  const name = cleanFileName(req.query.name);
  const { url, image } = saveAttachment(me, req.body, name);
  const row: AttachmentRow = { id: randomUUID(), uploader_id: me, url, name, size: (req.body as Buffer).length, image: image ? 1 : 0, message_id: null, created_at: now() };
  run(
    'INSERT INTO attachments (id, uploader_id, url, name, size, image, message_id, created_at) VALUES (?, ?, ?, ?, ?, ?, NULL, ?)',
    row.id,
    row.uploader_id,
    row.url,
    row.name,
    row.size,
    row.image,
    row.created_at,
  );
  res.json(attachmentJson(row));
});

/** Confere os anexos de uma mensagem nova: enviados por quem manda e ainda sem mensagem. */
function pendingAttachments(raw: unknown, me: string): AttachmentRow[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw) || raw.length > MAX_ATTACHMENTS || raw.some((x) => typeof x !== 'string')) fail(400, `Até ${MAX_ATTACHMENTS} anexos por mensagem`);
  const ids = [...new Set(raw as string[])];
  const rows = ids.map((id) => get<AttachmentRow>('SELECT * FROM attachments WHERE id = ? AND uploader_id = ? AND message_id IS NULL', id, me));
  if (rows.some((r) => !r)) fail(400, 'Um dos anexos expirou. Envie o arquivo de novo.');
  return rows as AttachmentRow[];
}

const attachmentsField = (rows: AttachmentRow[]) => (rows.length ? JSON.stringify(rows.map(attachmentJson)) : null);
function claimAttachments(rows: AttachmentRow[], messageId: string) {
  for (const r of rows) run('UPDATE attachments SET message_id = ? WHERE id = ?', messageId, r.id);
}

/** Mensagem apagada: os arquivos dela também saem do disco. */
function deleteAttachments(messageId: string) {
  for (const a of all<AttachmentRow>('SELECT * FROM attachments WHERE message_id = ?', messageId)) removeUpload(a.url);
  run('DELETE FROM attachments WHERE message_id = ?', messageId);
}

/** Texto da mensagem: pode ficar vazio quando vai só com anexos. */
function messageContent(raw: unknown, hasAttachments: boolean) {
  if (hasAttachments && (raw === undefined || raw === null || (typeof raw === 'string' && !raw.trim()))) return '';
  return str(raw, 'mensagem', 1, 2000);
}

// faxina de hora em hora: arquivos enviados e nunca mandados (1 dia), e os de mensagens que sumiram
// (canal, servidor ou conta apagados levam as mensagens junto, mas não os arquivos)
setInterval(() => {
  const orphans = all<AttachmentRow>(
    `SELECT * FROM attachments WHERE (message_id IS NULL AND created_at < ?)
       OR (message_id IS NOT NULL AND message_id NOT IN (SELECT id FROM messages) AND message_id NOT IN (SELECT id FROM dm_messages))`,
    now() - 24 * 60 * 60_000,
  );
  for (const a of orphans) {
    removeUpload(a.url);
    run('DELETE FROM attachments WHERE id = ?', a.id);
  }
}, 60 * 60_000).unref();

api.post('/channels/:id/messages', async (req, res) => {
  const me = uid(res);
  const channel = requireChannelPerm(req.params.id, me, P.SEND_MESSAGES);
  if (channel.type === 'forum') fail(400, 'Num fórum, crie um post');
  const files = pendingAttachments(req.body?.attachments, me);
  const content = messageContent(req.body?.content, files.length > 0);
  const id = randomUUID();
  run(
    'INSERT INTO messages (id, channel_id, author_id, content, attachments, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    id,
    channel.id,
    me,
    content,
    attachmentsField(files),
    now(),
  );
  claimAttachments(files, id);
  const msg = messageJson(get<MessageWithAuthor>(`${MESSAGE_SELECT} WHERE m.id = ?`, id)!);
  await emitToChannel(channel, 'message:new', msg);
  notifyMentions(channel, me, content, msg);
  jamFromChat(channel, me, content);
  res.json(msg);
});

// ============================================================ Jam do Spotify na sala de voz (ver realtime.ts)

// links de convite de Jam aceitos no botão: o do app no computador (open.spotify.com/socialsession/...) e os curtos do celular
const JAM_LINK = /https:\/\/(?:open\.spotify\.com\/socialsession\/[A-Za-z0-9]+|spotify\.link\/[A-Za-z0-9]+|spotify\.app\.link\/[A-Za-z0-9]+)(?:\?[^\s<>"]*)?/;
const JAM_SESSION = /https:\/\/open\.spotify\.com\/socialsession\/[A-Za-z0-9]+/;
const SHORT_LINK = /https:\/\/(?:spotify\.link|spotify\.app\.link)\/[A-Za-z0-9]+/;

/**
 * O link da Jam, no formato completo (open.spotify.com/socialsession/...). O link curto do celular
 * (spotify.link) serve para música, playlist e Jam: ele abre uma página do Spotify que tem o endereço de
 * destino, então lemos essa página para saber se é Jam. Devolve null se não for Jam (ou não deu para ler).
 * Só busca nos dois domínios de link curto do Spotify.
 */
async function resolveJamLink(text: string): Promise<string | null> {
  const full = JAM_SESSION.exec(text)?.[0];
  if (full) return full;
  const short = SHORT_LINK.exec(text)?.[0];
  if (!short) return null;
  // já conferido: a resposta fica guardada (link curto não muda de destino)
  const known = get<{ jam_url: string | null; checked_at: number }>('SELECT jam_url, checked_at FROM jam_links WHERE short_url = ?', short);
  if (known && (known.jam_url || now() - known.checked_at < 86_400_000)) return known.jam_url;
  let jamUrl: string | null = null;
  try {
    const res = await fetch(short, { redirect: 'follow', signal: AbortSignal.timeout(5000), headers: { 'User-Agent': 'Mozilla/5.0 Concord' } });
    jamUrl = JAM_SESSION.exec(res.url)?.[0] ?? JAM_SESSION.exec((await res.text()).slice(0, 300_000))?.[0] ?? null;
  } catch {
    return null; // sem resposta do Spotify: não guarda, tenta de novo na próxima
  }
  run(
    'INSERT INTO jam_links (short_url, jam_url, checked_at) VALUES (?, ?, ?) ON CONFLICT (short_url) DO UPDATE SET jam_url = excluded.jam_url, checked_at = excluded.checked_at',
    short,
    jamUrl,
    now(),
  );
  return jamUrl;
}

// o chat pergunta, uma vez por link, se um spotify.link é de Jam (para mostrar o cartão)
const jamLinkLookups = limiter(120, 60_000);

/** Um link curto do Spotify leva a uma Jam? Devolve o endereço dela, ou null. */
api.get('/spotify/jam-link', async (req, res) => {
  if (!jamLinkLookups(uid(res))) fail(429, 'Muitas consultas de link. Tente daqui a pouco.');
  const short = SHORT_LINK.exec(String(req.query.url ?? ''))?.[0] ?? fail(400, 'Link inválido');
  res.json({ url: await resolveJamLink(short!) });
});

/** Quem está na sala e cola um link de Jam no chat dela fixa (ou troca) a própria Jam. */
function jamFromChat(channel: ChannelRow, me: string, content: string) {
  const inRoom = () => channel.type === 'voice' && getVoiceState(me)?.channelId === channel.id;
  const sourceUrl = JAM_SESSION.exec(content)?.[0] ?? SHORT_LINK.exec(content)?.[0];
  if (!inRoom() || !sourceUrl) return;
  void resolveJamLink(content).then((url) => {
    // ler o link curto leva um instante: confere de novo se a pessoa continua na sala
    if (url && inRoom()) setJam(channel.server_id, channel.id, me, { url, sourceUrl });
  });
}

/** Fixa (ou troca) a própria Jam: só quem está na sala. Cada pessoa tem a sua. */
api.put('/channels/:id/jam', humansOnly, async (req, res) => {
  const me = uid(res);
  const channel = requireChannelPerm(req.params.id, me, P.VIEW_CHANNEL);
  if (channel.type !== 'voice') fail(400, 'A Jam fica numa sala de voz');
  if (getVoiceState(me)?.channelId !== channel.id) fail(400, 'Entre na sala para fixar a Jam');
  const raw = JAM_LINK.exec(String(req.body?.url ?? '').trim())?.[0] ?? fail(400, 'Isso não parece um link de Jam do Spotify. No Spotify, toque em Convidar e depois em Copiar link.');
  // link curto: guarda o endereço da Jam que ele aponta (e recusa link curto de música ou playlist)
  const url =
    (await resolveJamLink(raw!)) ?? fail(400, 'Esse link do Spotify não é de uma Jam (ou o Spotify não respondeu). Na Jam, toque em Convidar e depois em Copiar link.');
  setJam(channel.server_id, channel.id, me, { url, sourceUrl: raw! });
  res.json({ ok: true });
});

/** Tira a própria Jam: só quem fixou (ninguém tira a Jam dos outros). */
api.delete('/channels/:id/jam', humansOnly, (req, res) => {
  const me = uid(res);
  const channel = requireChannelPerm(req.params.id, me, P.VIEW_CHANNEL);
  if (getJam(channel.id, me)) setJam(channel.server_id, channel.id, me, null);
  res.json({ ok: true });
});

/** @usuario avisa a pessoa; @todos avisa todo mundo que vê o canal (precisa de "Mencionar todos"). */
function notifyMentions(channel: ChannelRow, authorId: string, content: string, msg: ReturnType<typeof messageJson>) {
  const everyone = /(^|\s)@(todos|everyone|all)\b/i.test(content) && has(channelPermissions(channel, authorId), P.MENTION_EVERYONE);
  const names = [...content.matchAll(/(^|\s)@([a-zA-Z0-9_.]{3,32})/g)].map((m) => m[2].toLowerCase());
  if (!everyone && names.length === 0) return;

  const members = all<{ id: string; username: string }>(
    'SELECT u.id, u.username FROM members m JOIN users u ON u.id = m.user_id WHERE m.server_id = ?',
    channel.server_id,
  );
  const targets = members.filter(
    (m) => m.id !== authorId && (everyone || names.includes(m.username.toLowerCase())) && has(channelPermissions(channel, m.id), P.VIEW_CHANNEL),
  );
  const server = getServer(channel.server_id);
  for (const t of targets) {
    emitToUser(t.id, 'mention', { message: msg, serverId: server.id, serverName: server.name, channelName: channel.name, everyone });
  }
}

api.patch('/messages/:id', async (req, res) => {
  const me = uid(res);
  const msg = get<MessageRow>('SELECT * FROM messages WHERE id = ?', req.params.id) ?? fail(404, 'Mensagem não encontrada');
  if (msg.author_id !== me) fail(403, 'Você só pode editar suas mensagens');
  if (msg.kind !== 'text') fail(400, 'Mensagens de jogo não podem ser editadas');
  const channel = requireChannelPerm(msg.channel_id, me, P.SEND_MESSAGES);
  run('UPDATE messages SET content = ?, edited_at = ? WHERE id = ?', messageContent(req.body?.content, !!msg.attachments), now(), msg.id);
  const updated = messageJson(get<MessageWithAuthor>(`${MESSAGE_SELECT} WHERE m.id = ?`, msg.id)!);
  await emitToChannel(channel, 'message:update', updated);
  res.json(updated);
});

api.delete('/messages/:id', async (req, res) => {
  const me = uid(res);
  const msg = get<MessageRow>('SELECT * FROM messages WHERE id = ?', req.params.id) ?? fail(404, 'Mensagem não encontrada');
  const channel = msg.author_id === me
    ? requireChannelPerm(msg.channel_id, me, P.VIEW_CHANNEL)
    : requireChannelPerm(msg.channel_id, me, P.MANAGE_MESSAGES);
  run('DELETE FROM messages WHERE id = ?', msg.id);
  deleteAttachments(msg.id);
  await emitToChannel(channel, 'message:delete', { id: msg.id, channelId: channel.id });
  res.json({ ok: true });
});

// ============================================================ Voz (LiveKit)

api.post('/channels/:id/voice-token', humansOnly, async (req, res) => {
  const me = uid(res);
  const channel = requireChannelPerm(req.params.id, me, P.CONNECT);
  if (channel.type !== 'voice') fail(400, 'Este canal não é uma sala de voz');
  if (channel.user_limit > 0) {
    const inRoom = voiceStatesFor(channel.server_id).filter((v) => v.channelId === channel.id && v.userId !== me).length;
    if (inRoom >= channel.user_limit && !has(channelPermissions(channel, me), P.MOVE_MEMBERS)) fail(403, 'A sala está cheia');
  }
  const user = get<UserRow>('SELECT * FROM users WHERE id = ?', me)!;
  const perms = channelPermissions(channel, me);
  const token = await createVoiceToken({
    roomName: channel.id,
    identity: me,
    name: user.display_name,
    metadata: JSON.stringify({ avatarColor: user.avatar_color, username: user.username }),
    perms,
    serverMuted: isServerMuted(channel.server_id, me),
  });
  res.json({ token, url: config.livekit.publicUrl || null, permissions: perms });
});

// ============================================================ Mesa de sons

const soundJson = (s: SoundRow) => ({
  id: s.id,
  serverId: s.server_id,
  name: s.name,
  url: s.url,
  uploaderId: s.uploader_id,
  createdAt: s.created_at,
});

const MAX_SOUNDS = 50;
const lastSoundPlay = new Map<string, number>();

api.get('/servers/:id/sounds', (req, res) => {
  const server = requireMember(req.params.id, uid(res));
  res.json(all<SoundRow>('SELECT * FROM sounds WHERE server_id = ? ORDER BY name COLLATE NOCASE', server.id).map(soundJson));
});

api.post('/servers/:id/sounds', humansOnly, express.raw({ type: () => true, limit: '1200kb' }), (req, res) => {
  const me = uid(res);
  const server = requireServerPerm(req.params.id, me, P.USE_SOUNDBOARD);
  const name = str(req.query.name, 'nome do som', 1, 32);
  const count = get<{ n: number }>('SELECT COUNT(*) AS n FROM sounds WHERE server_id = ?', server.id)!.n;
  if (count >= MAX_SOUNDS) fail(400, `A mesa de sons já tem ${MAX_SOUNDS} sons. Apague algum antes.`);
  const sound: SoundRow = { id: randomUUID(), server_id: server.id, name, url: saveSound(server.id, req.body), uploader_id: me, created_at: now() };
  run(
    'INSERT INTO sounds (id, server_id, name, url, uploader_id, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    sound.id,
    sound.server_id,
    name,
    sound.url,
    me,
    sound.created_at,
  );
  emitToServer(server.id, 'sounds:changed', { serverId: server.id });
  res.json(soundJson(sound));
});

api.delete('/sounds/:id', (req, res) => {
  const me = uid(res);
  const sound = get<SoundRow>('SELECT * FROM sounds WHERE id = ?', req.params.id) ?? fail(404, 'Som não encontrado');
  if (sound.uploader_id !== me) requireServerPerm(sound.server_id, me, P.MANAGE_SERVER);
  run('DELETE FROM sounds WHERE id = ?', sound.id);
  removeUpload(sound.url);
  emitToServer(sound.server_id, 'sounds:changed', { serverId: sound.server_id });
  res.json({ ok: true });
});

/** Toca um som para todos que estão na mesma sala de voz de quem tocou. */
api.post('/sounds/:id/play', (req, res) => {
  const me = uid(res);
  const sound = get<SoundRow>('SELECT * FROM sounds WHERE id = ?', req.params.id) ?? fail(404, 'Som não encontrado');
  const v = getVoiceState(me);
  if (!v || v.serverId !== sound.server_id) fail(400, 'Entre numa sala deste servidor para tocar sons');
  if (!has(channelPermissions(getChannel(v!.channelId), me), P.USE_SOUNDBOARD)) fail(403, 'Você não pode usar a mesa de sons nesta sala');
  const wait = (lastSoundPlay.get(me) ?? 0) + 1500 - now();
  if (wait > 0) fail(429, 'Calma, um som de cada vez');
  lastSoundPlay.set(me, now());
  for (const s of voiceStatesFor(sound.server_id).filter((x) => x.channelId === v!.channelId)) {
    emitToUser(s.userId, 'sound:play', { soundId: sound.id, url: sound.url, name: sound.name, userId: me, channelId: v!.channelId });
  }
  res.json({ ok: true });
});

// ============================================================ Patches do servidor

const MAX_SERVER_PATCHES = 120;

const serverPatchJson = (r: ServerPatchRow) => {
  let patch: Patch;
  try {
    patch = JSON.parse(r.data) as Patch;
  } catch {
    patch = { id: r.id, shape: 'circle', bg: '#2b2234', border: '#ff8a6b', fg: '#ffffff', icon: '?', text: '' };
  }
  return { id: r.id, serverId: r.server_id, creatorId: r.creator_id, createdAt: r.created_at, patch: { ...patch, id: r.id } };
};

api.get('/servers/:id/patches', (req, res) => {
  const server = requireMember(req.params.id, uid(res));
  res.json(all<ServerPatchRow>('SELECT * FROM server_patches WHERE server_id = ? ORDER BY created_at DESC', server.id).map(serverPatchJson));
});

/** Qualquer membro pode criar um patch para o servidor; todo mundo de lá pode usar. */
api.post('/servers/:id/patches', humansOnly, (req, res) => {
  const me = uid(res);
  const server = requireMember(req.params.id, me);
  const count = get<{ n: number }>('SELECT COUNT(*) AS n FROM server_patches WHERE server_id = ?', server.id)!.n;
  if (count >= MAX_SERVER_PATCHES) fail(400, `O servidor já tem ${MAX_SERVER_PATCHES} patches. Apague algum antes.`);
  const id = randomUUID();
  const patch = { ...cleanPatch((req.body?.patch ?? {}) as Record<string, unknown>, me), id };
  if (!patch.text && !patch.icon && !patch.image) fail(400, 'O patch precisa de texto, emoji ou imagem');
  const row: ServerPatchRow = { id, server_id: server.id, creator_id: me, data: JSON.stringify(patch), created_at: now() };
  run('INSERT INTO server_patches (id, server_id, creator_id, data, created_at) VALUES (?, ?, ?, ?, ?)', id, server.id, me, row.data, row.created_at);
  emitToServer(server.id, 'server-patches:changed', { serverId: server.id });
  res.json(serverPatchJson(row));
});

api.delete('/server-patches/:id', (req, res) => {
  const me = uid(res);
  const row = get<ServerPatchRow>('SELECT * FROM server_patches WHERE id = ?', req.params.id) ?? fail(404, 'Patch não encontrado');
  if (row.creator_id !== me) requireServerPerm(row.server_id, me, P.MANAGE_SERVER);
  run('DELETE FROM server_patches WHERE id = ?', row.id);
  dropPatchImage(serverPatchJson(row).patch.image);
  emitToServer(row.server_id, 'server-patches:changed', { serverId: row.server_id });
  res.json({ ok: true });
});

// ============================================================ Stickers

const customStickerJson = (s: CustomStickerRow) => ({ id: s.id, serverId: s.server_id, name: s.name, url: s.url, uploaderId: s.uploader_id });
const placedJson = (s: PlacedStickerRow) => ({
  id: s.id,
  sticker: s.sticker,
  finish: s.finish,
  x: s.x,
  y: s.y,
  rot: s.rot,
  scale: s.scale,
  authorId: s.author_id,
});

const placedIn = (channelId: string) =>
  all<PlacedStickerRow>('SELECT * FROM placed_stickers WHERE channel_id = ? ORDER BY created_at', channelId).map(placedJson);

function stickersChanged(channel: ChannelRow) {
  void emitToChannel(channel, 'stickers:changed', { channelId: channel.id, stickers: placedIn(channel.id) });
}

const unit = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : fallback);
const rotation = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(-180, Math.min(180, v)) : fallback);
const scaleOf = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0.4, Math.min(3, v)) : fallback);
const finishOf = (v: unknown, fallback: string) => ((STICKER_FINISHES as readonly unknown[]).includes(v) ? (v as string) : fallback);

api.get('/servers/:id/stickers', (req, res) => {
  const server = requireMember(req.params.id, uid(res));
  res.json(all<CustomStickerRow>('SELECT * FROM custom_stickers WHERE server_id = ? ORDER BY created_at', server.id).map(customStickerJson));
});

api.post('/servers/:id/stickers', humansOnly, imageBody, (req, res) => {
  const me = uid(res);
  const server = requireMember(req.params.id, me);
  const name = str(req.query.name, 'nome do sticker', 1, 32);
  const count = get<{ n: number }>('SELECT COUNT(*) AS n FROM custom_stickers WHERE server_id = ?', server.id)!.n;
  if (count >= MAX_CUSTOM_STICKERS) fail(400, `O servidor já tem ${MAX_CUSTOM_STICKERS} stickers. Apague algum antes.`);
  const row: CustomStickerRow = { id: randomUUID(), server_id: server.id, name, url: saveImage('stickers', server.id, req.body), uploader_id: me, created_at: now() };
  run(
    'INSERT INTO custom_stickers (id, server_id, name, url, uploader_id, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    row.id,
    row.server_id,
    name,
    row.url,
    me,
    row.created_at,
  );
  emitToServer(server.id, 'custom-stickers:changed', { serverId: server.id });
  res.json(customStickerJson(row));
});

api.delete('/stickers/:id', (req, res) => {
  const me = uid(res);
  const row = get<CustomStickerRow>('SELECT * FROM custom_stickers WHERE id = ?', req.params.id) ?? fail(404, 'Sticker não encontrado');
  if (row.uploader_id !== me) requireServerPerm(row.server_id, me, P.MANAGE_SERVER);
  const channels = all<ChannelRow>(
    'SELECT DISTINCT c.* FROM channels c JOIN placed_stickers p ON p.channel_id = c.id WHERE p.sticker = ?',
    `custom:${row.id}`,
  );
  run('DELETE FROM placed_stickers WHERE sticker = ?', `custom:${row.id}`);
  run('DELETE FROM custom_stickers WHERE id = ?', row.id);
  removeUpload(row.url);
  emitToServer(row.server_id, 'custom-stickers:changed', { serverId: row.server_id });
  channels.forEach(stickersChanged);
  res.json({ ok: true });
});

/** Stickers colados no palco de uma sala de voz (todo mundo vê). */
api.get('/channels/:id/stickers', (req, res) => {
  const channel = requireChannelPerm(req.params.id, uid(res), P.VIEW_CHANNEL);
  res.json(placedIn(channel.id));
});

api.post('/channels/:id/stickers', humansOnly, (req, res) => {
  const me = uid(res);
  const channel = requireChannelPerm(req.params.id, me, P.CONNECT);
  if (channel.type !== 'voice') fail(400, 'Stickers só podem ser colados em salas de voz');
  const sticker = String(req.body?.sticker ?? '');
  if (sticker.startsWith('custom:')) {
    if (!get('SELECT 1 FROM custom_stickers WHERE id = ? AND server_id = ?', sticker.slice(7), channel.server_id)) fail(404, 'Sticker não encontrado');
  } else if (!sticker.startsWith('preset:') || !(PRESET_STICKERS as readonly string[]).includes(sticker.slice(7))) {
    fail(400, 'Sticker inválido');
  }
  const count = get<{ n: number }>('SELECT COUNT(*) AS n FROM placed_stickers WHERE channel_id = ?', channel.id)!.n;
  if (count >= MAX_PLACED_STICKERS) fail(400, `A sala já tem ${MAX_PLACED_STICKERS} stickers. Tire algum antes.`);
  const row: PlacedStickerRow = {
    id: randomUUID(),
    channel_id: channel.id,
    sticker,
    finish: finishOf(req.body?.finish, 'gloss'),
    x: unit(req.body?.x, 0.5),
    y: unit(req.body?.y, 0.5),
    rot: rotation(req.body?.rot, 0),
    scale: scaleOf(req.body?.scale, 1),
    author_id: me,
    created_at: now(),
  };
  run(
    'INSERT INTO placed_stickers (id, channel_id, sticker, finish, x, y, rot, scale, author_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    row.id,
    row.channel_id,
    row.sticker,
    row.finish,
    row.x,
    row.y,
    row.rot,
    row.scale,
    me,
    row.created_at,
  );
  stickersChanged(channel);
  res.json(placedJson(row));
});

/** Quem colou (ou quem modera mensagens) pode mover, girar, redimensionar e tirar. */
function ownSticker(channelId: string, stickerId: string, me: string) {
  const channel = requireChannelPerm(channelId, me, P.VIEW_CHANNEL);
  const row =
    get<PlacedStickerRow>('SELECT * FROM placed_stickers WHERE id = ? AND channel_id = ?', stickerId, channel.id) ?? fail(404, 'Sticker não encontrado');
  if (row.author_id !== me && !has(channelPermissions(channel, me), P.MANAGE_MESSAGES)) fail(403, 'Só quem colou pode mexer nesse sticker');
  return { channel, row };
}

api.patch('/channels/:id/stickers/:sid', (req, res) => {
  const { channel, row } = ownSticker(req.params.id, req.params.sid, uid(res));
  const next = {
    x: unit(req.body?.x, row.x),
    y: unit(req.body?.y, row.y),
    rot: rotation(req.body?.rot, row.rot),
    scale: scaleOf(req.body?.scale, row.scale),
    finish: finishOf(req.body?.finish, row.finish),
  };
  run('UPDATE placed_stickers SET x = ?, y = ?, rot = ?, scale = ?, finish = ? WHERE id = ?', next.x, next.y, next.rot, next.scale, next.finish, row.id);
  stickersChanged(channel);
  res.json(placedJson({ ...row, ...next }));
});

api.delete('/channels/:id/stickers/:sid', (req, res) => {
  const { channel, row } = ownSticker(req.params.id, req.params.sid, uid(res));
  run('DELETE FROM placed_stickers WHERE id = ?', row.id);
  stickersChanged(channel);
  res.json({ ok: true });
});

api.delete('/channels/:id/stickers', (req, res) => {
  const channel = requireChannelPerm(req.params.id, uid(res), P.MANAGE_MESSAGES);
  run('DELETE FROM placed_stickers WHERE channel_id = ?', channel.id);
  stickersChanged(channel);
  res.json({ ok: true });
});

// ============================================================ Bots

const newBotToken = () => `cb_${randomBytes(32).toString('base64url')}`;

function botJson(u: UserRow) {
  const servers = all<{ id: string; name: string }>(
    'SELECT s.id, s.name FROM members m JOIN servers s ON s.id = m.server_id WHERE m.user_id = ? ORDER BY s.name',
    u.id,
  );
  return { ...userJson(u), ownerId: u.bot_owner_id, createdAt: u.created_at, servers };
}

function requireOwnBot(botId: string, me: string): UserRow {
  const bot = get<UserRow>('SELECT * FROM users WHERE id = ? AND is_bot = 1', botId);
  if (!bot || bot.bot_owner_id !== me) fail(404, 'Bot não encontrado');
  return bot!;
}

const botById = (id: string) => botJson(get<UserRow>('SELECT * FROM users WHERE id = ?', id)!);

api.get('/bots', humansOnly, (_req, res) => {
  res.json(all<UserRow>('SELECT * FROM users WHERE is_bot = 1 AND bot_owner_id = ? ORDER BY created_at', uid(res)).map(botJson));
});

api.post('/bots', humansOnly, async (req, res) => {
  const me = uid(res);
  const name = str(req.body?.name, 'nome do bot', 2, 32);
  const owned = get<{ n: number }>('SELECT COUNT(*) AS n FROM users WHERE is_bot = 1 AND bot_owner_id = ?', me)!.n;
  if (owned >= 10) fail(400, 'Limite de 10 bots por conta');
  const base = name.normalize('NFD').replace(/[^a-zA-Z0-9_]/g, '').toLowerCase().slice(0, 20) || 'bot';
  let username = `${base}_bot`;
  while (get('SELECT 1 FROM users WHERE username = ?', username)) username = `${base}_${randomBytes(2).toString('hex')}_bot`;
  const token = newBotToken();
  const id = randomUUID();
  run(
    `INSERT INTO users (id, username, display_name, password_hash, avatar_color, created_at, is_bot, bot_owner_id, bot_token_hash)
     VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`,
    id,
    username,
    name,
    await bcrypt.hash(randomBytes(32).toString('hex'), 10), // bots não entram com senha
    pickColor(),
    now(),
    me,
    hashBotToken(token),
  );
  res.json({ bot: botById(id), token });
});

api.patch('/bots/:id', humansOnly, (req, res) => {
  const bot = requireOwnBot(req.params.id, uid(res));
  const name = optStr(req.body?.name, 'nome', 2, 32);
  if (name) run('UPDATE users SET display_name = ? WHERE id = ?', name, bot.id);
  const bio = optStr(req.body?.bio, 'descrição', 0, 190);
  if (bio !== undefined) run('UPDATE users SET bio = ? WHERE id = ?', bio, bot.id);
  profileChanged(bot.id);
  res.json(botById(bot.id));
});

api.post('/bots/:id/avatar', humansOnly, imageBody, (req, res) => {
  const bot = requireOwnBot(req.params.id, uid(res));
  const url = saveImage('avatars', bot.id, req.body);
  run('UPDATE users SET avatar_url = ? WHERE id = ?', url, bot.id);
  removeUpload(bot.avatar_url);
  profileChanged(bot.id);
  res.json(botById(bot.id));
});

api.post('/bots/:id/token', humansOnly, (req, res) => {
  const bot = requireOwnBot(req.params.id, uid(res));
  const token = newBotToken();
  run('UPDATE users SET bot_token_hash = ? WHERE id = ?', hashBotToken(token), bot.id);
  res.json({ token });
});

api.delete('/bots/:id', humansOnly, (req, res) => {
  const bot = requireOwnBot(req.params.id, uid(res));
  const servers = all<{ server_id: string }>('SELECT server_id FROM members WHERE user_id = ?', bot.id);
  removeUpload(bot.avatar_url);
  run('DELETE FROM users WHERE id = ?', bot.id);
  servers.forEach((s) => serverChanged(s.server_id));
  res.json({ ok: true });
});

/** Adiciona o bot a um servidor onde você pode gerenciar o servidor. */
api.post('/bots/:id/servers/:serverId', humansOnly, (req, res) => {
  const me = uid(res);
  const bot = requireOwnBot(req.params.id, me);
  const server = requireServerPerm(req.params.serverId, me, P.MANAGE_SERVER);
  if (!isMember(server.id, bot.id)) {
    run('INSERT INTO members (server_id, user_id, joined_at) VALUES (?, ?, ?)', server.id, bot.id, now());
    joinServerRoom(bot.id, server.id);
    serverChanged(server.id);
  }
  res.json(botById(bot.id));
});

api.delete('/bots/:id/servers/:serverId', humansOnly, (req, res) => {
  const bot = requireOwnBot(req.params.id, uid(res));
  run('DELETE FROM members WHERE server_id = ? AND user_id = ?', req.params.serverId, bot.id);
  leaveServerRoom(bot.id, req.params.serverId);
  serverChanged(req.params.serverId);
  res.json(botById(bot.id));
});

// ============================================================ Minigames (roleta, dado, cara ou coroa)

api.post('/channels/:id/games', async (req, res) => {
  const me = uid(res);
  const channel = requireChannelPerm(req.params.id, me, P.SEND_MESSAGES);
  if (channel.type === 'forum') fail(400, 'Num fórum, crie um post');
  const { content, data } = playGame(req.body);
  const id = randomUUID();
  run(
    "INSERT INTO messages (id, channel_id, author_id, content, kind, data, created_at) VALUES (?, ?, ?, ?, 'game', ?, ?)",
    id,
    channel.id,
    me,
    content,
    JSON.stringify(data),
    now(),
  );
  const msg = messageJson(get<MessageWithAuthor>(`${MESSAGE_SELECT} WHERE m.id = ?`, id)!);
  await emitToChannel(channel, 'message:new', msg);
  res.json(msg);
});

// ============================================================ Figurinhas no chat (os packs ficam em stickerPacks.ts)

api.post('/channels/:id/sticker-messages', async (req, res) => {
  const me = uid(res);
  const channel = requireChannelPerm(req.params.id, me, P.SEND_MESSAGES);
  if (channel.type === 'forum') fail(400, 'Num fórum, crie um post');
  const data = stickerMessageData(req.body?.stickerId, me);
  const id = randomUUID();
  run(
    "INSERT INTO messages (id, channel_id, author_id, content, kind, data, created_at) VALUES (?, ?, ?, ?, 'sticker', ?, ?)",
    id,
    channel.id,
    me,
    STICKER_MESSAGE_TEXT,
    JSON.stringify(data),
    now(),
  );
  const msg = messageJson(get<MessageWithAuthor>(`${MESSAGE_SELECT} WHERE m.id = ?`, id)!);
  await emitToChannel(channel, 'message:new', msg);
  res.json(msg);
});

// ============================================================ Código compartilhado
// "Clipboard da sala": manda um texto (código de sala do jogo etc.) que aparece por cima da tela de
// quem está na mesma sala de voz, para copiar sem sair do jogo. Também fica no papo da sala.

const lastClip = new Map<string, number>();

api.post('/voice/clip', humansOnly, async (req, res) => {
  const me = uid(res);
  const v = getVoiceState(me) ?? fail(400, 'Entre numa sala de voz para compartilhar um código');
  const channel = requireChannelPerm(v.channelId, me, P.SEND_MESSAGES);
  const text = str(req.body?.text, 'código', 1, 200).trim();
  if (!text) fail(400, 'Digite o código');
  const wait = (lastClip.get(me) ?? 0) + 2500 - now();
  if (wait > 0) fail(429, 'Calma, um código de cada vez');
  lastClip.set(me, now());

  const id = randomUUID();
  run(
    "INSERT INTO messages (id, channel_id, author_id, content, kind, data, created_at) VALUES (?, ?, ?, ?, 'clip', ?, ?)",
    id,
    channel.id,
    me,
    text,
    JSON.stringify({ text }),
    now(),
  );
  const msg = messageJson(get<MessageWithAuthor>(`${MESSAGE_SELECT} WHERE m.id = ?`, id)!);
  await emitToChannel(channel, 'message:new', msg);
  const detailNick = get<{ nickname: string | null }>('SELECT nickname FROM members WHERE server_id = ? AND user_id = ?', channel.server_id, me)?.nickname;
  const payload = { messageId: id, text, channelId: channel.id, serverId: channel.server_id, from: { ...msg.author, nickname: detailNick ?? null } };
  let delivered = 0;
  for (const other of voiceStatesFor(channel.server_id)) {
    if (other.channelId !== channel.id || other.userId === me) continue;
    emitToUser(other.userId, 'clip', payload);
    delivered++;
  }
  res.json({ message: msg, delivered });
});

// ============================================================ Conversas privadas (DMs)

const DM_SELECT = `SELECT m.id, m.dm_id AS channel_id, m.author_id, m.content, m.kind, m.data, m.attachments, m.created_at, m.edited_at,
  u.username, u.display_name, u.avatar_color, u.avatar_url, u.banner_color, u.bio, u.banner_url, u.is_bot, u.profile_style
  FROM dm_messages m JOIN users u ON u.id = m.author_id`;

const otherOf = (dm: DmChannelRow, me: string) => (dm.user_a === me ? dm.user_b : dm.user_a);

function dmJson(dm: DmChannelRow, me: string) {
  const other = get<UserRow>('SELECT * FROM users WHERE id = ?', otherOf(dm, me))!;
  const last = get<MessageWithAuthor>(`${DM_SELECT} WHERE m.dm_id = ? ORDER BY m.created_at DESC LIMIT 1`, dm.id);
  const readAt = get<{ last_read_at: number }>('SELECT last_read_at FROM dm_reads WHERE dm_id = ? AND user_id = ?', dm.id, me)?.last_read_at ?? 0;
  const unread = get<{ n: number }>(
    'SELECT COUNT(*) AS n FROM dm_messages WHERE dm_id = ? AND author_id != ? AND created_at > ?',
    dm.id,
    me,
    readAt,
  )!.n;
  return { id: dm.id, user: userJson(other), lastMessage: last ? messageJson(last) : null, lastMessageAt: dm.last_message_at, unread };
}

function requireDm(dmId: string, me: string): DmChannelRow {
  const dm = get<DmChannelRow>('SELECT * FROM dm_channels WHERE id = ?', dmId);
  if (!dm || (dm.user_a !== me && dm.user_b !== me)) fail(404, 'Conversa não encontrada');
  return dm!;
}

const sharesServer = (a: string, b: string) =>
  !!get('SELECT 1 FROM members x JOIN members y ON x.server_id = y.server_id WHERE x.user_id = ? AND y.user_id = ? LIMIT 1', a, b);

/** Envia a mensagem para os dois lados, cada um com o resumo da conversa do seu ponto de vista. */
function deliverDm(dm: DmChannelRow, event: string, message: unknown) {
  for (const userId of [dm.user_a, dm.user_b]) emitToUser(userId, event, { dm: dmJson(dm, userId), message });
}

api.get('/dms', (_req, res) => {
  const me = uid(res);
  const dms = all<DmChannelRow>('SELECT * FROM dm_channels WHERE user_a = ? OR user_b = ? ORDER BY last_message_at DESC', me, me);
  res.json(dms.map((dm) => dmJson(dm, me)));
});

/** Abre (ou reabre) a conversa com alguém de um servidor em comum. */
api.post('/dms', (req, res) => {
  const me = uid(res);
  const other = str(req.body?.userId, 'usuário', 1, 64);
  if (other === me) fail(400, 'Você não pode conversar consigo mesmo');
  if (!get('SELECT 1 FROM users WHERE id = ?', other)) fail(404, 'Usuário não encontrado');
  const [a, b] = me < other ? [me, other] : [other, me];
  let dm = get<DmChannelRow>('SELECT * FROM dm_channels WHERE user_a = ? AND user_b = ?', a, b);
  if (!dm) {
    if (!sharesServer(me, other)) fail(403, 'Vocês precisam estar em algum servidor em comum');
    dm = { id: randomUUID(), user_a: a, user_b: b, created_at: now(), last_message_at: now() };
    run('INSERT INTO dm_channels (id, user_a, user_b, created_at, last_message_at) VALUES (?, ?, ?, ?, ?)', dm.id, a, b, dm.created_at, dm.last_message_at);
  }
  res.json(dmJson(dm, me));
});

api.get('/dms/:id/messages', (req, res) => {
  const dm = requireDm(req.params.id, uid(res));
  const before = Number(req.query.before) || Number.MAX_SAFE_INTEGER;
  const limit = Math.min(100, Number(req.query.limit) || 50);
  const rows = all<MessageWithAuthor>(`${DM_SELECT} WHERE m.dm_id = ? AND m.created_at < ? ORDER BY m.created_at DESC LIMIT ?`, dm.id, before, limit);
  res.json(rows.reverse().map(messageJson));
});

function insertDmMessage(dm: DmChannelRow, me: string, content: string, kind = 'text', data: unknown = null, files: AttachmentRow[] = []) {
  const id = randomUUID();
  const at = now();
  run(
    'INSERT INTO dm_messages (id, dm_id, author_id, content, kind, data, attachments, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    id,
    dm.id,
    me,
    content,
    kind,
    data ? JSON.stringify(data) : null,
    attachmentsField(files),
    at,
  );
  claimAttachments(files, id);
  run('UPDATE dm_channels SET last_message_at = ? WHERE id = ?', at, dm.id);
  // quem envia já leu a própria mensagem
  run(
    'INSERT INTO dm_reads (dm_id, user_id, last_read_at) VALUES (?, ?, ?) ON CONFLICT (dm_id, user_id) DO UPDATE SET last_read_at = excluded.last_read_at',
    dm.id,
    me,
    at,
  );
  const fresh = get<DmChannelRow>('SELECT * FROM dm_channels WHERE id = ?', dm.id)!;
  const msg = messageJson(get<MessageWithAuthor>(`${DM_SELECT} WHERE m.id = ?`, id)!);
  deliverDm(fresh, 'dm:message', msg);
  return msg;
}

api.post('/dms/:id/messages', (req, res) => {
  const me = uid(res);
  const dm = requireDm(req.params.id, me);
  const files = pendingAttachments(req.body?.attachments, me);
  res.json(insertDmMessage(dm, me, messageContent(req.body?.content, files.length > 0), 'text', null, files));
});

api.post('/dms/:id/games', (req, res) => {
  const me = uid(res);
  const dm = requireDm(req.params.id, me);
  const { content, data } = playGame(req.body);
  res.json(insertDmMessage(dm, me, content, 'game', data));
});

api.post('/dms/:id/sticker-messages', (req, res) => {
  const me = uid(res);
  const dm = requireDm(req.params.id, me);
  res.json(insertDmMessage(dm, me, STICKER_MESSAGE_TEXT, 'sticker', stickerMessageData(req.body?.stickerId, me)));
});

api.post('/dms/:id/read', (req, res) => {
  const me = uid(res);
  const dm = requireDm(req.params.id, me);
  run(
    'INSERT INTO dm_reads (dm_id, user_id, last_read_at) VALUES (?, ?, ?) ON CONFLICT (dm_id, user_id) DO UPDATE SET last_read_at = excluded.last_read_at',
    dm.id,
    me,
    now(),
  );
  res.json(dmJson(dm, me));
});

api.patch('/dm-messages/:id', (req, res) => {
  const me = uid(res);
  const row = get<{ dm_id: string; author_id: string; kind: string; attachments: string | null }>(
    'SELECT dm_id, author_id, kind, attachments FROM dm_messages WHERE id = ?',
    req.params.id,
  );
  if (!row || row.author_id !== me || row.kind !== 'text') fail(404, 'Mensagem não encontrada');
  const dm = requireDm(row!.dm_id, me);
  run('UPDATE dm_messages SET content = ?, edited_at = ? WHERE id = ?', messageContent(req.body?.content, !!row!.attachments), now(), req.params.id);
  const msg = messageJson(get<MessageWithAuthor>(`${DM_SELECT} WHERE m.id = ?`, req.params.id)!);
  deliverDm(dm, 'dm:update', msg);
  res.json(msg);
});

api.delete('/dm-messages/:id', (req, res) => {
  const me = uid(res);
  const row = get<{ dm_id: string; author_id: string }>('SELECT dm_id, author_id FROM dm_messages WHERE id = ?', req.params.id);
  if (!row || row.author_id !== me) fail(404, 'Mensagem não encontrada');
  const dm = requireDm(row!.dm_id, me);
  run('DELETE FROM dm_messages WHERE id = ?', req.params.id);
  deleteAttachments(req.params.id);
  deliverDm(dm, 'dm:delete', { id: req.params.id, channelId: dm.id });
  res.json({ ok: true });
});

// ============================================================ E-mail de recuperação

/** Cadastrar ou trocar o e-mail: só passa a valer depois do clique no link de confirmação. */
api.put('/me/email', humansOnly, async (req, res) => {
  if (!mailEnabled()) fail(404, 'Recuperação por e-mail não está configurada neste servidor');
  const me = uid(res);
  const user = get<UserRow>('SELECT * FROM users WHERE id = ?', me)!;
  const email = str(req.body?.email, 'e-mail', 3, 254).toLowerCase();
  if (!isEmail(email)) fail(400, 'E-mail inválido');
  if (email === user.email) fail(400, 'Esse já é o e-mail confirmado da sua conta');
  if (!verifyPerUser(me)) fail(429, 'Muitas tentativas. Espere um pouco e tente de novo.');
  // pede a senha: quem pegou a sessão de alguém não consegue trocar o e-mail e depois a senha
  if (user.password_hash && !(await bcrypt.compare(String(req.body?.password ?? ''), user.password_hash))) fail(400, 'Senha incorreta');
  twoFactor.requireCode(user, req.body?.twoFactorCode);
  const token = newEmailToken(me, 'verify', email, 24 * 60 * 60_000);
  try {
    await sendVerifyEmail(email, user.username, `${config.publicUrl}/#verify-email=${token}`);
  } catch (err) {
    mailError(err);
    run('DELETE FROM email_tokens WHERE token_hash = ?', hashToken(token));
    fail(500, 'Não foi possível enviar o e-mail agora. Tente de novo em instantes.');
  }
  res.json(meJson(get<UserRow>('SELECT * FROM users WHERE id = ?', me)!));
});

api.delete('/me/email', humansOnly, (_req, res) => {
  const me = uid(res);
  const user = get<UserRow>('SELECT * FROM users WHERE id = ?', me)!;
  run('DELETE FROM email_tokens WHERE user_id = ?', me);
  run('UPDATE users SET email = NULL WHERE id = ?', me);
  if (user.email && mailEnabled()) sendEmailChanged(user.email, user.username, null).catch(mailError);
  res.json(meJson(get<UserRow>('SELECT * FROM users WHERE id = ?', me)!));
});

// ============================================================ Conta Google

/** Conectar o Google à conta logada: o navegador vai para /auth/google/start?link=<ticket>. */
api.post('/me/google/link-ticket', humansOnly, (_req, res) => {
  if (!google.googleEnabled()) fail(404, 'Login com Google não está configurado neste servidor');
  res.json({ ticket: google.newLinkTicket(uid(res)) });
});

api.delete('/me/google', humansOnly, (_req, res) => {
  const me = uid(res);
  const user = get<UserRow>('SELECT * FROM users WHERE id = ?', me)!;
  if (!user.password_hash) fail(400, 'Crie uma senha antes de desconectar o Google, senão você fica sem como entrar.');
  run('UPDATE users SET google_sub = NULL WHERE id = ?', me);
  res.json(meJson(get<UserRow>('SELECT * FROM users WHERE id = ?', me)!));
});

// ============================================================ Patches de presente

const dropJson = (d: PatchDropRow) => ({
  code: d.code,
  serverId: d.server_id,
  patch: JSON.parse(d.patch) as Patch,
  uses: d.uses,
  maxUses: d.max_uses,
  expiresAt: d.expires_at,
  createdAt: d.created_at,
});

/** Cria um link de resgate para um patch do próprio perfil (só patch criado pela pessoa). */
api.post('/me/drops', humansOnly, (req, res) => {
  const me = uid(res);
  // só admin de servidor cria link de presente, e o link sai em nome desse servidor
  const server = requireServerPerm(str(req.body?.serverId, 'servidor', 1, 64), me, P.ADMINISTRATOR);
  const style = parseStyle(get<UserRow>('SELECT * FROM users WHERE id = ?', me)!.profile_style);
  const patch = (style.patches ?? []).find((p) => p.id === req.body?.patchId) ?? fail(404, 'Patch não encontrado no seu perfil');
  if (patch.drop) fail(403, 'Patches ganhos de presente não podem ser repassados');
  if (patch.image && !patch.image.startsWith(`/uploads/patches/${me}-`)) fail(403, 'Só dá para presentear patches criados por você');
  if ((get<{ n: number }>('SELECT COUNT(*) AS n FROM patch_drops WHERE creator_id = ?', me)?.n ?? 0) >= 50) fail(400, 'Você já tem 50 links de presente. Apague algum antes.');
  const maxUses = Math.max(0, Math.min(1000, Number(req.body?.maxUses ?? 0) | 0));
  const expiresIn = Math.max(0, Number(req.body?.expiresIn ?? 0) | 0); // segundos; 0 = nunca
  const { id: _id, drop: _drop, ...art } = patch;
  const row: PatchDropRow = {
    id: randomUUID(),
    code: randomBytes(6).toString('base64url'),
    creator_id: me,
    server_id: server.id,
    patch: JSON.stringify(art),
    max_uses: maxUses,
    uses: 0,
    expires_at: expiresIn > 0 ? now() + expiresIn * 1000 : null,
    created_at: now(),
  };
  run(
    'INSERT INTO patch_drops (id, code, creator_id, server_id, patch, max_uses, uses, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)',
    row.id,
    row.code,
    me,
    server.id,
    row.patch,
    row.max_uses,
    row.expires_at,
    row.created_at,
  );
  res.json(dropJson(row));
});

/** Servidores em que a pessoa é admin (onde pode criar links de presente). */
api.get('/me/admin-servers', (_req, res) => {
  const me = uid(res);
  const rows = all<ServerRow>('SELECT s.* FROM servers s JOIN members m ON m.server_id = s.id AND m.user_id = ? ORDER BY s.name', me);
  res.json(rows.filter((s) => has(serverPermissions(s.id, me), P.ADMINISTRATOR)).map(serverJson));
});

api.get('/me/drops', (_req, res) => {
  res.json(all<PatchDropRow>('SELECT * FROM patch_drops WHERE creator_id = ? ORDER BY created_at DESC', uid(res)).map(dropJson));
});

/** Apagar o link não tira o patch de quem já resgatou. */
api.delete('/me/drops/:code', (req, res) => {
  const me = uid(res);
  const drop = findDrop(req.params.code);
  if (!drop || drop.creator_id !== me) fail(404, 'Link não encontrado');
  if (get('SELECT 1 FROM patch_claims WHERE drop_id = ? LIMIT 1', drop!.id)) {
    // mantém o registro (o patch de quem resgatou continua valendo); só para de aceitar resgates
    run('UPDATE patch_drops SET expires_at = ? WHERE id = ?', now() - 1, drop!.id);
  } else {
    run('DELETE FROM patch_drops WHERE id = ?', drop!.id);
  }
  res.json({ ok: true });
});

/** Resgata o patch (uma vez por pessoa). Não costura sozinho: o app pergunta se quer equipar. */
api.post('/drops/:code/claim', humansOnly, (req, res) => {
  const me = uid(res);
  const drop = findDrop(req.params.code) ?? fail(404, 'Este link de presente não existe');
  if (!get('SELECT 1 FROM patch_claims WHERE drop_id = ? AND user_id = ?', drop.id, me)) {
    if (!dropValid(drop)) fail(410, drop.max_uses && drop.uses >= drop.max_uses ? 'Os resgates deste patch acabaram' : 'Este link de presente expirou');
    tx(() => {
      run('INSERT INTO patch_claims (drop_id, user_id, claimed_at) VALUES (?, ?, ?)', drop.id, me, now());
      run('UPDATE patch_drops SET uses = uses + 1 WHERE id = ?', drop.id);
    });
  }
  res.json({ patch: claimedPatch(drop) });
});

/** Patches que a pessoa ganhou de presente (para equipar depois). */
api.get('/me/claimed-patches', (_req, res) => {
  const rows = all<PatchDropRow>(
    'SELECT d.* FROM patch_claims c JOIN patch_drops d ON d.id = c.drop_id WHERE c.user_id = ? ORDER BY c.claimed_at DESC',
    uid(res),
  );
  res.json(rows.map(claimedPatch));
});

// ============================================================ Fórum

registerForumRoutes(api, authorJson);
registerStickerPackRoutes(api);
registerSupportRoutes(api);
registerDiagnosticRoutes(api);
registerAdminRoutes(api);
registerIntegrationRoutes(api, {
  meUpdated: (userId) => {
    const user = get<UserRow>('SELECT * FROM users WHERE id = ?', userId);
    if (user) emitToUser(userId, 'me:updated', meJson(user));
  },
  canSee: canSeeProfile,
});

// ============================================================ Página do perfil

/** Dá para ver o perfil completo de alguém: o próprio, quem divide servidor ou tem conversa privada com a pessoa. */
function canSeeProfile(me: string, userId: string): boolean {
  if (me === userId) return true;
  if (get('SELECT 1 FROM members a JOIN members b ON a.server_id = b.server_id WHERE a.user_id = ? AND b.user_id = ? LIMIT 1', me, userId)) return true;
  return !!get('SELECT 1 FROM dm_channels WHERE (user_a = ? AND user_b = ?) OR (user_a = ? AND user_b = ?)', me, userId, userId, me);
}

api.get('/users/:id/profile', (req, res) => {
  const me = uid(res);
  if (!canSeeProfile(me, req.params.id)) fail(404, 'Perfil não encontrado');
  const u = get<UserRow>('SELECT * FROM users WHERE id = ?', req.params.id) ?? fail(404, 'Perfil não encontrado');
  const mutual = all<ServerRow>(
    'SELECT s.* FROM servers s JOIN members a ON a.server_id = s.id JOIN members b ON b.server_id = s.id WHERE a.user_id = ? AND b.user_id = ? ORDER BY s.name',
    me,
    u!.id,
  );
  res.json({
    user: { ...userJson(u!), createdAt: u!.created_at },
    page: pageJson(parseStyle(u!.profile_style).page),
    steamLinked: !!u!.steam_id && integrationsStatus().steam,
    mutualServers: me === u!.id ? [] : mutual.map(serverJson),
  });
});

/** Ajustes da própria página (fundo vai por /me/profile-bg). */
api.put('/me/profile-page', (req, res) => {
  const me = uid(res);
  const style = parseStyle(get<UserRow>('SELECT * FROM users WHERE id = ?', me)!.profile_style);
  const page: ProfilePage = { ...style.page };
  const b = (req.body ?? {}) as Record<string, unknown>;
  if (b.dim !== undefined) page.dim = Math.max(0, Math.min(80, Math.round(Number(b.dim) || 0)));
  if (b.accent !== undefined) page.accent = b.accent === null ? null : color(b.accent);
  if (b.featured !== undefined) {
    if (!Array.isArray(b.featured)) fail(400, 'Jogos inválidos');
    const ids = (b.featured as unknown[]).filter((n): n is number => Number.isInteger(n) && (n as number) > 0 && (n as number) < 1e9);
    page.featured = [...new Set(ids)].slice(0, MAX_FEATURED);
  }
  if (b.favoriteAsBg !== undefined) page.favoriteAsBg = b.favoriteAsBg !== false;
  if (b.showcases !== undefined) {
    if (!Array.isArray(b.showcases)) fail(400, 'Vitrines inválidas');
    page.showcases = [...new Set((b.showcases as unknown[]).filter((s): s is Showcase => (SHOWCASES as readonly unknown[]).includes(s)))];
  }
  style.page = page;
  saveStyle(me, style);
  res.json(pageJson(page));
});

/** Fundo da página do perfil (imagem ou GIF). */
api.post('/me/profile-bg', imageBody, (req, res) => {
  const me = uid(res);
  const style = parseStyle(get<UserRow>('SELECT * FROM users WHERE id = ?', me)!.profile_style);
  const old = style.page?.bg;
  style.page = { ...style.page, bg: saveImage('cards', me, req.body) };
  saveStyle(me, style);
  removeUpload(old);
  res.json(pageJson(style.page));
});

api.delete('/me/profile-bg', (_req, res) => {
  const me = uid(res);
  const style = parseStyle(get<UserRow>('SELECT * FROM users WHERE id = ?', me)!.profile_style);
  removeUpload(style.page?.bg);
  style.page = { ...style.page, bg: null };
  saveStyle(me, style);
  res.json(pageJson(style.page));
});
setSupportHooks({
  meUpdated: (userId) => {
    const user = get<UserRow>('SELECT * FROM users WHERE id = ?', userId);
    if (user) emitToUser(userId, 'me:updated', meJson(user));
  },
  profileChanged: (userId) => profileChanged(userId),
});
