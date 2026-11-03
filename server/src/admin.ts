// Portal da equipe (/admin no app): só quem está em ADMIN_USERS entra. Mostra os diagnósticos enviados e uma
// visão geral da instalação (contas, servidores, cargos e membros). A única ação sobre pessoas é suspender ou
// apagar uma conta, sempre com o motivo registrado. Não mostra mensagens, e-mails nem senhas.
import type { NextFunction, Request, Response, Router } from 'express';
import { P, has } from '../../shared/permissions.ts';
import { config } from './config.ts';
import { registerCostRoutes } from './costs.ts';
import { all, get, run, tx, type UserRow } from './db.ts';
import { DIAGNOSTIC_RETENTION_DAYS, deleteDiagnostic, readDiagnostic } from './diagnostics.ts';
import { fail, uid } from './http.ts';
import { removeFromRoom } from './livekit.ts';
import { dropVoice, getVoiceState, liveStats, onlineUserIds, revokeSockets } from './realtime.ts';
import { removeUpload } from './uploads.ts';

export function isAdmin(userId: string): boolean {
  if (!config.adminUsers.size) return false;
  const u = get<{ username: string }>('SELECT username FROM users WHERE id = ? AND is_bot = 0', userId);
  return !!u && config.adminUsers.has(u.username.toLowerCase());
}

// nome da lista sem conta fica reservado (ninguém consegue criar, nem a própria pessoa): crie a conta antes
for (const name of config.adminUsers) {
  if (!get('SELECT 1 FROM users WHERE username = ? AND is_bot = 0', name)) {
    console.warn(`[admin] @${name} está em ADMIN_USERS mas não tem conta: o nome fica reservado. Crie a conta antes de pôr na lista.`);
  }
}

/** Para quem não é da equipe, o portal nem existe. */
function requireAdmin(_req: Request, res: Response, next: NextFunction) {
  if (!isAdmin(uid(res))) return res.status(404).json({ error: 'Rota não encontrada' });
  next();
}

const PAGE = 50;
const page = (req: Request) => Math.max(0, Math.floor(Number(req.query.page) || 0));
const search = (req: Request) => {
  const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 64) : '';
  return `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
};

// dias no horário de Brasília (UTC-3, sem horário de verão desde 2019)
const BRT = 3 * 3_600_000;
const DAY = 86_400_000;
function perDay(table: string, extra = '') {
  const days = 30;
  const today = Math.floor((Date.now() - BRT) / DAY);
  const since = (today - days + 1) * DAY + BRT;
  const rows = all<{ d: number; n: number }>(
    `SELECT (created_at - ${BRT}) / ${DAY} AS d, COUNT(*) AS n FROM ${table} WHERE created_at >= ? ${extra} GROUP BY d`,
    since,
  );
  const byDay = new Map(rows.map((r) => [r.d, r.n]));
  return Array.from({ length: days }, (_, i) => {
    const d = today - days + 1 + i;
    return { day: new Date(d * DAY).toISOString().slice(0, 10), count: byDay.get(d) ?? 0 };
  });
}

const count = (sql: string, ...params: (string | number)[]) => get<{ n: number }>(sql, ...params)?.n ?? 0;

function userSummary(u: UserRow & { servers?: number }, online: Set<string>) {
  return {
    id: u.id,
    username: u.username,
    displayName: u.display_name,
    avatarColor: u.avatar_color,
    avatarUrl: u.avatar_url,
    bot: !!u.is_bot,
    verified: !!u.verified,
    createdAt: u.created_at,
    servers: u.servers ?? 0,
    google: !!u.google_sub,
    twoFactor: !!u.totp_enabled,
    hasEmail: !!u.email,
    supportCents: u.support_total_cents ?? 0,
    online: online.has(u.id),
    admin: config.adminUsers.has(u.username.toLowerCase()),
    banned: !!u.banned_at,
  };
}

// ------------------------------------------------------------------ suspender e apagar contas

interface AdminActionRow {
  id: number;
  admin_id: string;
  target_id: string;
  target_username: string;
  action: string;
  reason: string | null;
  created_at: number;
}

function logAction(adminId: string, target: UserRow, action: 'ban' | 'unban' | 'delete', reason: string | null) {
  run(
    'INSERT INTO admin_actions (admin_id, target_id, target_username, action, reason, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    adminId,
    target.id,
    target.username,
    action,
    reason,
    Date.now(),
  );
}

/** Tira a conta do ar agora: derruba as sessões (sobe a versão do token e fecha os sockets) e tira das salas. */
async function kickEverywhere(userId: string) {
  run('UPDATE users SET token_version = token_version + 1 WHERE id = ?', userId);
  const v = getVoiceState(userId);
  dropVoice(userId, 'Sua conta foi suspensa.');
  if (v) await removeFromRoom(v.channelId, userId);
  await revokeSockets(userId);
}

/** A conta que a equipe quer mexer: não vale a própria, nem a de outra pessoa da equipe. */
function actionTarget(adminId: string, id: string) {
  const u = get<UserRow>('SELECT * FROM users WHERE id = ?', id) ?? fail(404, 'Conta não encontrada');
  if (u!.id === adminId) fail(400, 'Você não pode fazer isso com a sua própria conta');
  if (config.adminUsers.has(u!.username.toLowerCase())) fail(400, 'Contas da equipe ficam de fora (tire de ADMIN_USERS antes)');
  return u!;
}

const reasonOf = (body: unknown) => {
  const r = (body as { reason?: unknown } | undefined)?.reason;
  return typeof r === 'string' && r.trim() ? r.trim().slice(0, 500) : null;
};

interface DiagnosticRow {
  id: string;
  user_id: string | null;
  note: string;
  started_at: number;
  ended_at: number;
  samples: number;
  markers: number;
  mode: string | null;
  client_commit: string | null;
  user_agent: string | null;
  size: number;
  created_at: number;
  username: string | null;
  display_name: string | null;
}

const diagnosticJson = (d: DiagnosticRow) => ({
  id: d.id,
  user: d.user_id && d.username ? { id: d.user_id, username: d.username, displayName: d.display_name } : null,
  note: d.note,
  startedAt: d.started_at,
  endedAt: d.ended_at,
  samples: d.samples,
  markers: d.markers,
  mode: d.mode,
  clientCommit: d.client_commit,
  userAgent: d.user_agent,
  size: d.size,
  createdAt: d.created_at,
});

const DIAG_SELECT = 'SELECT d.*, u.username, u.display_name FROM diagnostics d LEFT JOIN users u ON u.id = d.user_id';

export function registerAdminRoutes(api: Router) {
  api.use('/admin', requireAdmin);
  registerCostRoutes(api);

  /** Suspender: a conta (e os bots dela) não entra mais e cai de onde estiver. Dá para desfazer. */
  api.post('/admin/users/:id/ban', async (req, res) => {
    const me = uid(res);
    const target = actionTarget(me, req.params.id);
    const reason = reasonOf(req.body) ?? fail(400, 'Escreva o motivo (fica registrado)');
    const bots = all<UserRow>('SELECT * FROM users WHERE bot_owner_id = ? AND banned_at IS NULL', target.id);
    for (const u of [target, ...bots]) {
      run('UPDATE users SET banned_at = ?, ban_reason = ?, banned_by = ? WHERE id = ?', Date.now(), reason, me, u.id);
      await kickEverywhere(u.id);
      logAction(me, u, 'ban', u.id === target.id ? reason : `bot de @${target.username}: ${reason}`);
    }
    console.log(`[portal] conta @${target.username} suspensa`);
    res.json({ ok: true, bots: bots.length });
  });

  api.post('/admin/users/:id/unban', (req, res) => {
    const me = uid(res);
    const target = actionTarget(me, req.params.id);
    if (!target.banned_at) fail(400, 'Essa conta não está suspensa');
    const bots = all<UserRow>('SELECT * FROM users WHERE bot_owner_id = ? AND banned_at IS NOT NULL', target.id);
    for (const u of [target, ...bots]) {
      run('UPDATE users SET banned_at = NULL, ban_reason = NULL, banned_by = NULL WHERE id = ?', u.id);
      logAction(me, u, 'unban', reasonOf(req.body));
    }
    res.json({ ok: true });
  });

  /**
   * Apagar de vez (para contas falsas ou vazias): some a conta, as mensagens, as DMs e os bots dela. Quem é
   * dono de servidor não pode ser apagado aqui (o servidor iria junto): suspenda a conta.
   */
  api.delete('/admin/users/:id', async (req, res) => {
    const me = uid(res);
    const target = actionTarget(me, req.params.id);
    if (req.query.confirm !== target.username) fail(400, 'Confirme digitando o nome de usuário da conta');
    if (get('SELECT 1 FROM servers WHERE owner_id = ?', target.id)) fail(409, 'Essa conta é dona de servidor. Suspenda em vez de apagar.');
    const bots = all<UserRow>('SELECT * FROM users WHERE bot_owner_id = ?', target.id);
    if (bots.some((b) => get('SELECT 1 FROM servers WHERE owner_id = ?', b.id))) fail(409, 'Um bot dessa conta é dono de servidor. Suspenda em vez de apagar.');
    const reason = reasonOf(req.body ?? { reason: req.query.reason });
    for (const u of [...bots, target]) {
      await kickEverywhere(u.id);
      logAction(me, u, 'delete', reason);
      tx(() => {
        run('DELETE FROM contract_locks WHERE user_id = ?', u.id);
        run('DELETE FROM users WHERE id = ?', u.id);
      });
      for (const url of [u.avatar_url, u.banner_url]) removeUpload(url);
    }
    console.log(`[portal] conta @${target.username} apagada`);
    res.json({ ok: true, bots: bots.length });
  });

  api.get('/admin/overview', (_req, res) => {
    const live = liveStats();
    res.json({
      users: count('SELECT COUNT(*) AS n FROM users WHERE is_bot = 0'),
      bots: count('SELECT COUNT(*) AS n FROM users WHERE is_bot = 1'),
      servers: count('SELECT COUNT(*) AS n FROM servers'),
      messages: count('SELECT COUNT(*) AS n FROM messages') + count('SELECT COUNT(*) AS n FROM dm_messages'),
      supporters: count('SELECT COUNT(*) AS n FROM users WHERE support_total_cents > 0'),
      diagnostics: count('SELECT COUNT(*) AS n FROM diagnostics'),
      online: live.online,
      voice: live.voice,
      signups: perDay('users', 'AND is_bot = 0'),
      messagesPerDay: perDay('messages'),
      retentionDays: DIAGNOSTIC_RETENTION_DAYS,
    });
  });

  // ---- contas
  api.get('/admin/users', (req, res) => {
    const q = search(req);
    const online = new Set(onlineUserIds());
    const where = "WHERE (username LIKE ? ESCAPE '\\' OR display_name LIKE ? ESCAPE '\\')";
    const rows = all<UserRow & { servers: number }>(
      `SELECT u.*, (SELECT COUNT(*) FROM members m WHERE m.user_id = u.id) AS servers FROM users u ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      q,
      q,
      PAGE,
      page(req) * PAGE,
    );
    res.json({ items: rows.map((u) => userSummary(u, online)), total: count(`SELECT COUNT(*) AS n FROM users ${where}`, q, q), pageSize: PAGE });
  });

  api.get('/admin/users/:id', (req, res) => {
    const u = get<UserRow>('SELECT * FROM users WHERE id = ?', req.params.id) ?? fail(404, 'Conta não encontrada');
    const servers = all<{ id: string; name: string; icon_url: string | null; icon_color: string; owner_id: string; joined_at: number; nickname: string | null }>(
      'SELECT s.id, s.name, s.icon_url, s.icon_color, s.owner_id, m.joined_at, m.nickname FROM members m JOIN servers s ON s.id = m.server_id WHERE m.user_id = ? ORDER BY m.joined_at',
      u.id,
    );
    const roles = all<{ server_id: string; name: string; color: string | null }>(
      'SELECT r.server_id, r.name, r.color FROM member_roles mr JOIN roles r ON r.id = mr.role_id WHERE mr.user_id = ? ORDER BY r.position DESC',
      u.id,
    );
    res.json({
      ...userSummary({ ...u, servers: servers.length }, new Set(onlineUserIds())),
      messages: count('SELECT COUNT(*) AS n FROM messages WHERE author_id = ?', u.id),
      bots: all<{ id: string; username: string }>('SELECT id, username FROM users WHERE bot_owner_id = ?', u.id),
      servers: servers.map((s) => ({
        id: s.id,
        name: s.name,
        iconUrl: s.icon_url,
        iconColor: s.icon_color,
        owner: s.owner_id === u.id,
        joinedAt: s.joined_at,
        nickname: s.nickname,
        roles: roles.filter((r) => r.server_id === s.id).map((r) => ({ name: r.name, color: r.color })),
      })),
      diagnostics: all<DiagnosticRow>(`${DIAG_SELECT} WHERE d.user_id = ? ORDER BY d.created_at DESC`, u.id).map(diagnosticJson),
      ban: u.banned_at
        ? { at: u.banned_at, reason: u.ban_reason, by: get<{ username: string }>('SELECT username FROM users WHERE id = ?', u.banned_by ?? '')?.username ?? null }
        : null,
      actions: all<AdminActionRow & { admin_username: string | null }>(
        'SELECT a.*, u.username AS admin_username FROM admin_actions a LEFT JOIN users u ON u.id = a.admin_id WHERE a.target_id = ? ORDER BY a.id DESC LIMIT 50',
        u.id,
      ).map((a) => ({ id: a.id, action: a.action, reason: a.reason, at: a.created_at, by: a.admin_username })),
    });
  });

  // ---- servidores
  api.get('/admin/servers', (req, res) => {
    const q = search(req);
    const rows = all<{
      id: string;
      name: string;
      icon_url: string | null;
      icon_color: string;
      verified: number;
      created_at: number;
      owner: string | null;
      members: number;
      channels: number;
      roles: number;
    }>(
      `SELECT s.id, s.name, s.icon_url, s.icon_color, s.verified, s.created_at, u.username AS owner,
         (SELECT COUNT(*) FROM members m WHERE m.server_id = s.id) AS members,
         (SELECT COUNT(*) FROM channels c WHERE c.server_id = s.id) AS channels,
         (SELECT COUNT(*) FROM roles r WHERE r.server_id = s.id) AS roles
       FROM servers s LEFT JOIN users u ON u.id = s.owner_id
       WHERE s.name LIKE ? ESCAPE '\\' ORDER BY members DESC, s.created_at DESC LIMIT ? OFFSET ?`,
      q,
      PAGE,
      page(req) * PAGE,
    );
    res.json({
      items: rows.map((s) => ({
        id: s.id,
        name: s.name,
        iconUrl: s.icon_url,
        iconColor: s.icon_color,
        verified: !!s.verified,
        createdAt: s.created_at,
        owner: s.owner,
        members: s.members,
        channels: s.channels,
        roles: s.roles,
      })),
      total: count("SELECT COUNT(*) AS n FROM servers WHERE name LIKE ? ESCAPE '\\'", q),
      pageSize: PAGE,
    });
  });

  api.get('/admin/servers/:id', (req, res) => {
    const s =
      get<{ id: string; name: string; icon_url: string | null; icon_color: string; verified: number; created_at: number; owner_id: string }>(
        'SELECT * FROM servers WHERE id = ?',
        req.params.id,
      ) ?? fail(404, 'Servidor não encontrado');
    const online = new Set(onlineUserIds());
    const roles = all<{ id: string; name: string; color: string | null; permissions: number; position: number; is_default: number; members: number }>(
      'SELECT r.*, (SELECT COUNT(*) FROM member_roles mr WHERE mr.role_id = r.id) AS members FROM roles r WHERE r.server_id = ? ORDER BY r.position DESC',
      s.id,
    );
    const memberRoles = all<{ user_id: string; role_id: string }>('SELECT user_id, role_id FROM member_roles WHERE server_id = ?', s.id);
    const members = all<{ id: string; username: string; display_name: string; avatar_color: string; avatar_url: string | null; is_bot: number; nickname: string | null; joined_at: number }>(
      'SELECT u.id, u.username, u.display_name, u.avatar_color, u.avatar_url, u.is_bot, m.nickname, m.joined_at FROM members m JOIN users u ON u.id = m.user_id WHERE m.server_id = ? ORDER BY m.joined_at',
      s.id,
    );
    res.json({
      id: s.id,
      name: s.name,
      iconUrl: s.icon_url,
      iconColor: s.icon_color,
      verified: !!s.verified,
      createdAt: s.created_at,
      ownerId: s.owner_id,
      messages: count('SELECT COUNT(*) AS n FROM messages m JOIN channels c ON c.id = m.channel_id WHERE c.server_id = ?', s.id),
      roles: roles.map((r) => ({
        id: r.id,
        name: r.name,
        color: r.color,
        position: r.position,
        isDefault: !!r.is_default,
        administrator: has(r.permissions, P.ADMINISTRATOR),
        members: r.is_default ? members.length : r.members,
      })),
      channels: all<{ id: string; name: string; type: string }>('SELECT id, name, type FROM channels WHERE server_id = ? ORDER BY type, position', s.id),
      members: members.map((m) => ({
        id: m.id,
        username: m.username,
        displayName: m.display_name,
        avatarColor: m.avatar_color,
        avatarUrl: m.avatar_url,
        bot: !!m.is_bot,
        nickname: m.nickname,
        joinedAt: m.joined_at,
        online: online.has(m.id),
        roleIds: memberRoles.filter((mr) => mr.user_id === m.id).map((mr) => mr.role_id),
      })),
    });
  });

  // ---- diagnósticos
  api.get('/admin/diagnostics', (req, res) => {
    const rows = all<DiagnosticRow>(`${DIAG_SELECT} ORDER BY d.created_at DESC LIMIT ? OFFSET ?`, PAGE, page(req) * PAGE);
    res.json({ items: rows.map(diagnosticJson), total: count('SELECT COUNT(*) AS n FROM diagnostics'), pageSize: PAGE });
  });

  api.get('/admin/diagnostics/:id', (req, res) => {
    const d = get<DiagnosticRow>(`${DIAG_SELECT} WHERE d.id = ?`, req.params.id) ?? fail(404, 'Diagnóstico não encontrado');
    res.json(diagnosticJson(d));
  });

  /** O arquivo do jeito que a pessoa mandou: o navegador descompacta sozinho. */
  api.get('/admin/diagnostics/:id/file', (req, res) => {
    const file = readDiagnostic(req.params.id) ?? fail(404, 'Diagnóstico não encontrado');
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Encoding', 'gzip');
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(file);
  });

  api.delete('/admin/diagnostics/:id', (req, res) => {
    deleteDiagnostic(req.params.id);
    res.json({ ok: true });
  });
}
