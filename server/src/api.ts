import { randomBytes, randomUUID } from 'node:crypto';
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
  type InviteRow,
  type MessageRow,
  type RoleRow,
  type ServerRow,
  type UserRow,
} from './db.ts';
import { color, fail, int, optStr, requireAuth, signToken, str, uid, verifyToken } from './http.ts';
import { TrackSource, createVoiceToken, muteTracks, removeFromRoom } from './livekit.ts';
import { removeUpload, saveImage } from './uploads.ts';
import { allowAttempt, normalize as normalizeCode, rotateRecoveryCode } from './recovery.ts';
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
  serverChanged,
  setServerMute,
  voiceStatesFor,
  broadcastStatus,
  isOnline,
} from './realtime.ts';

export const api = Router();

/** Nome fixo do instalador publicado pelo CI em <dados>/downloads. */
const DESKTOP_INSTALLER = 'Concord-Setup.exe';

const PALETTE = ['#5865f2', '#3ba55c', '#faa61a', '#ed4245', '#eb459e', '#9b59b6', '#1abc9c', '#e67e22', '#00b0f4'];
const pickColor = () => PALETTE[Math.floor(Math.random() * PALETTE.length)];
const now = () => Date.now();

type PublicUser = Pick<UserRow, 'id' | 'username' | 'display_name' | 'avatar_color' | 'avatar_url' | 'banner_color' | 'bio'>;

const userJson = (u: PublicUser) => ({
  id: u.id,
  username: u.username,
  displayName: u.display_name,
  avatarColor: u.avatar_color,
  avatarUrl: u.avatar_url,
  bannerColor: u.banner_color,
  bio: u.bio,
});

/** Dados do próprio usuário: inclui as preferências (tema etc.), que só ele vê. */
const meJson = (u: UserRow) => {
  let settings: unknown = {};
  try {
    settings = JSON.parse(u.settings || '{}');
  } catch {
    // ignorado
  }
  return { ...userJson(u), settings, hasRecoveryCode: !!u.recovery_hash };
};

const serverJson = (s: ServerRow) => ({ id: s.id, name: s.name, ownerId: s.owner_id, iconColor: s.icon_color, iconUrl: s.icon_url });

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
const messageJson = (m: MessageWithAuthor) => ({
  id: m.id,
  channelId: m.channel_id,
  content: m.content,
  createdAt: m.created_at,
  editedAt: m.edited_at,
  author: userJson({ ...m, id: m.author_id }),
});

const MESSAGE_SELECT = `SELECT m.*, u.username, u.display_name, u.avatar_color, u.avatar_url, u.banner_color, u.bio
  FROM messages m JOIN users u ON u.id = m.author_id`;

// ============================================================ Auth

api.get('/config', (_req, res) => {
  const installer = join(config.downloadsDir, DESKTOP_INSTALLER);
  res.json({
    allowRegistration: config.allowRegistration,
    desktopDownload: existsSync(installer) ? `/downloads/${DESKTOP_INSTALLER}` : null,
  });
});

api.post('/auth/register', async (req, res) => {
  if (!config.allowRegistration) fail(403, 'Cadastro desativado neste servidor');
  const username = str(req.body?.username, 'usuário', 3, 32);
  if (!/^[a-zA-Z0-9_.]+$/.test(username)) fail(400, 'Usuário deve conter apenas letras, números, "_" e "."');
  const password = str(req.body?.password, 'senha', 6, 128);
  const displayName = optStr(req.body?.displayName, 'nome', 1, 32) || username;
  if (get('SELECT 1 FROM users WHERE username = ?', username)) fail(409, 'Esse nome de usuário já está em uso');

  const user: UserRow = {
    id: randomUUID(),
    username,
    display_name: displayName,
    password_hash: await bcrypt.hash(password, 10),
    avatar_color: pickColor(),
    avatar_url: null,
    banner_color: null,
    bio: '',
    settings: '{}',
    recovery_hash: null,
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
  run('UPDATE users SET password_hash = ? WHERE id = ?', await bcrypt.hash(password, 10), user!.id);
  const recoveryCode = await rotateRecoveryCode(user!.id);
  res.json({ token: signToken(user!.id), user: meJson(get<UserRow>('SELECT * FROM users WHERE id = ?', user!.id)!), recoveryCode });
});

api.post('/auth/login', async (req, res) => {
  const username = str(req.body?.username, 'usuário', 1, 32);
  const password = str(req.body?.password, 'senha', 1, 128);
  const user = get<UserRow>('SELECT * FROM users WHERE username = ?', username);
  if (!user || !(await bcrypt.compare(password, user.password_hash))) fail(401, 'Usuário ou senha incorretos');
  res.json({ token: signToken(user!.id), user: meJson(user!) });
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
  if (req.body?.newPassword !== undefined) {
    const user = get<UserRow>('SELECT * FROM users WHERE id = ?', me)!;
    if (!(await bcrypt.compare(String(req.body.currentPassword ?? ''), user.password_hash))) fail(400, 'Senha atual incorreta');
    run('UPDATE users SET password_hash = ? WHERE id = ?', await bcrypt.hash(str(req.body.newPassword, 'nova senha', 6, 128), 10), me);
  }
  if (publicChange) profileChanged(me);
  res.json(meJson(get<UserRow>('SELECT * FROM users WHERE id = ?', me)!));
});

/** Gera um novo código de recuperação (o antigo deixa de valer). Pede a senha atual. */
api.post('/me/recovery-code', async (req, res) => {
  const me = uid(res);
  const user = get<UserRow>('SELECT * FROM users WHERE id = ?', me)!;
  if (!(await bcrypt.compare(String(req.body?.password ?? ''), user.password_hash))) fail(400, 'Senha incorreta');
  res.json({ code: await rotateRecoveryCode(me) });
});

const imageBody = express.raw({ type: () => true, limit: '7mb' });

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

api.post('/servers', (req, res) => {
  const me = uid(res);
  const name = str(req.body?.name, 'nome', 2, 50);
  const server: ServerRow = { id: randomUUID(), name, owner_id: me, icon_color: pickColor(), icon_url: null, created_at: now() };

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
    run(insChan, randomUUID(), server.id, 'geral', 'text', 'Bate-papo geral', 0);
    run(insChan, randomUUID(), server.id, 'clipes-e-prints', 'text', '', 1);
    run(insChan, randomUUID(), server.id, 'Sala de Transmissão', 'voice', '', 0);
    run(insChan, randomUUID(), server.id, 'Lounge', 'voice', '', 1);
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

/** Apelido por servidor: o próprio (CHANGE_NICKNAME) ou de quem está abaixo (MANAGE_NICKNAMES). */
api.put('/servers/:id/members/:userId/nickname', (req, res) => {
  const me = uid(res);
  const target = req.params.userId === '@me' ? me : req.params.userId;
  const server = requireMember(req.params.id, me);
  if (!isMember(server.id, target)) fail(404, 'Membro não encontrado');
  const perms = serverPermissions(server.id, me);
  if (target === me) {
    if (!has(perms, P.CHANGE_NICKNAME) && !has(perms, P.MANAGE_NICKNAMES)) fail(403, 'Você não pode alterar seu apelido aqui');
  } else if (!has(perms, P.MANAGE_NICKNAMES) || !outranks(server.id, me, target)) {
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
  return type === 'text' ? name.toLowerCase().replace(/\s+/g, '-').replace(/[^\p{L}\p{N}_-]/gu, '') || 'canal' : name;
}

api.post('/servers/:id/channels', (req, res) => {
  const server = requireServerPerm(req.params.id, uid(res), P.MANAGE_CHANNELS);
  const type = req.body?.type === 'voice' ? 'voice' : 'text';
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

api.post('/servers/:id/members/:userId/voice-mute', async (req, res) => {
  const me = uid(res);
  const serverId = req.params.id;
  const target = req.params.userId;
  const muted = req.body?.muted !== false;
  if (getVoiceState(target)?.serverId === serverId) {
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
  const v = voiceTarget(req.params.id, uid(res), req.params.userId, P.MOVE_MEMBERS);
  dropVoice(v.userId, 'Você foi desconectado da sala por um moderador.');
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
  const wait = (lastNudge.get(key) ?? 0) + NUDGE_COOLDOWN_MS - now();
  if (wait > 0) fail(429, `Calma! Espere ${Math.ceil(wait / 1000)}s para chamar de novo`);
  lastNudge.set(key, now());

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

api.post('/invites/:code', (req, res) => {
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

api.post('/channels/:id/messages', async (req, res) => {
  const me = uid(res);
  const channel = requireChannelPerm(req.params.id, me, P.SEND_MESSAGES);
  const content = str(req.body?.content, 'mensagem', 1, 2000);
  const id = randomUUID();
  run('INSERT INTO messages (id, channel_id, author_id, content, created_at) VALUES (?, ?, ?, ?, ?)', id, channel.id, me, content, now());
  const msg = messageJson(get<MessageWithAuthor>(`${MESSAGE_SELECT} WHERE m.id = ?`, id)!);
  await emitToChannel(channel, 'message:new', msg);
  res.json(msg);
});

api.patch('/messages/:id', async (req, res) => {
  const me = uid(res);
  const msg = get<MessageRow>('SELECT * FROM messages WHERE id = ?', req.params.id) ?? fail(404, 'Mensagem não encontrada');
  if (msg.author_id !== me) fail(403, 'Você só pode editar suas mensagens');
  const channel = requireChannelPerm(msg.channel_id, me, P.SEND_MESSAGES);
  run('UPDATE messages SET content = ?, edited_at = ? WHERE id = ?', str(req.body?.content, 'mensagem', 1, 2000), now(), msg.id);
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
  await emitToChannel(channel, 'message:delete', { id: msg.id, channelId: channel.id });
  res.json({ ok: true });
});

// ============================================================ Voz (LiveKit)

api.post('/channels/:id/voice-token', async (req, res) => {
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
