import type { NextFunction, Request, Response } from 'express';
import { createHash, randomBytes } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { config } from './config.ts';
import { get, run } from './db.ts';
import { stagingAllows } from './staging.ts';

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export const fail = (status: number, message: string): never => {
  throw new HttpError(status, message);
};

const tokenVersion = (userId: string) => get<{ token_version: number }>('SELECT token_version FROM users WHERE id = ?', userId)?.token_version;

export const SESSION_DAYS = 30;

/**
 * Abre uma sessão (um aparelho conectado) e devolve o token dela. O token leva a "versão" da senha (trocar a
 * senha sobe a versão e derruba todos) e o id da sessão (encerrar a sessão derruba só aquele aparelho).
 */
export function signToken(userId: string): string {
  const version = tokenVersion(userId) ?? 0;
  const sid = randomBytes(16).toString('base64url');
  const at = Date.now();
  run('INSERT INTO sessions (id, user_id, version, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?)', sid, userId, version, at, at);
  return sessionToken(userId, sid, version);
}

/** Token de uma sessão que já existe (ex.: a versão subiu e este aparelho continua). */
export const sessionToken = (userId: string, sid: string, version: number) =>
  jwt.sign({ sub: userId, v: version, sid }, config.jwtSecret, { expiresIn: `${SESSION_DAYS}d` });

export interface Session {
  userId: string;
  /** null = token de antes dos "aparelhos conectados" (vale até a senha mudar ou "sair de todos os outros") */
  sid: string | null;
  lastSeenAt: number | null;
  userAgent: string | null;
}

export function verifySession(token: string | undefined): Session | null {
  if (!token) return null;
  try {
    const payload = jwt.verify(token, config.jwtSecret);
    if (typeof payload !== 'object' || typeof payload.sub !== 'string') return null;
    // tokens de antes dessa checagem não têm "v": valem como versão 0
    const v = typeof payload.v === 'number' ? payload.v : 0;
    const sid = typeof payload.sid === 'string' ? payload.sid : null;
    // conta suspensa pela equipe: nenhum token dela vale (nem na API, nem no socket)
    // e no Concord de testes, quem saiu da lista também perde as sessões abertas
    const row = get<{ token_version: number; banned_at: number | null; username: string; s_id: string | null; last_seen_at: number | null; user_agent: string | null }>(
      `SELECT u.token_version, u.banned_at, u.username, s.id AS s_id, s.last_seen_at, s.user_agent
       FROM users u LEFT JOIN sessions s ON s.id = ? AND s.user_id = u.id WHERE u.id = ?`,
      sid,
      payload.sub,
    );
    if (!row || row.banned_at || row.token_version !== v || !stagingAllows(row.username)) return null;
    // sessão encerrada (pelo próprio aparelho ou em "Aparelhos conectados"): o token deixa de valer na hora
    if (sid && !row.s_id) return null;
    return { userId: payload.sub, sid, lastSeenAt: row.last_seen_at, userAgent: row.user_agent };
  } catch {
    return null;
  }
}

export const verifyToken = (token: string | undefined): string | null => verifySession(token)?.userId ?? null;

/** Anota o aparelho (navegador/sistema) e quando a sessão foi usada, no máximo a cada 5 min. */
export function touchSession(s: Session, userAgent: string | undefined) {
  if (!s.sid) return;
  const ua = (userAgent ?? '').slice(0, 300) || null;
  if (s.lastSeenAt && Date.now() - s.lastSeenAt < 5 * 60_000 && (!ua || ua === s.userAgent)) return;
  run('UPDATE sessions SET last_seen_at = ?, user_agent = COALESCE(?, user_agent) WHERE id = ?', Date.now(), ua, s.sid);
}

export const hashBotToken = (token: string) => createHash('sha256').update(token).digest('hex');

/** Bots se autenticam com "Bot <token>" (na API) ou com o token puro (no socket). */
export function botUserId(token: unknown): string | null {
  if (typeof token !== 'string') return null;
  const raw = token.startsWith('Bot ') ? token.slice(4) : token;
  if (!raw.startsWith('cb_')) return null;
  return get<{ id: string }>('SELECT id FROM users WHERE is_bot = 1 AND bot_token_hash = ? AND banned_at IS NULL', hashBotToken(raw))?.id ?? null;
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  let userId: string | null = null;
  if (header?.startsWith('Bearer ')) {
    const session = verifySession(header.slice(7));
    if (session) {
      userId = session.userId;
      res.locals.sessionId = session.sid;
      touchSession(session, req.headers['user-agent']);
    }
  } else if (header?.startsWith('Bot ')) {
    userId = botUserId(header);
    res.locals.isBot = !!userId;
  }
  if (!userId) return res.status(401).json({ error: 'Não autenticado' });
  res.locals.userId = userId;
  next();
}

/** Rotas que só fazem sentido para pessoas (conta, bots, voz). */
export function humansOnly<P>(_req: Request<P>, res: Response, next: NextFunction) {
  if (res.locals.isBot) return res.status(403).json({ error: 'Bots não podem usar esta rota' });
  next();
}

export const uid = (res: Response): string => res.locals.userId as string;

export function str(value: unknown, field: string, min = 1, max = 100): string {
  if (typeof value !== 'string') fail(400, `Campo "${field}" inválido`);
  const v = (value as string).trim();
  if (v.length < min || v.length > max) fail(400, `"${field}" deve ter entre ${min} e ${max} caracteres`);
  return v;
}

export function optStr(value: unknown, field: string, min = 0, max = 100): string | undefined {
  return value === undefined ? undefined : str(value, field, min, max);
}

export function color(value: unknown): string | null {
  if (value === null || value === '') return null;
  if (typeof value !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(value)) fail(400, 'Cor inválida');
  return value as string;
}

export function int(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) fail(400, `Campo "${field}" inválido`);
  return value as number;
}
