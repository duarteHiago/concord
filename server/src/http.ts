import type { NextFunction, Request, Response } from 'express';
import { createHash } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { config } from './config.ts';
import { get } from './db.ts';

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

/** O token leva a "versão" da senha: trocar a senha sobe a versão e derruba os tokens antigos. */
export function signToken(userId: string): string {
  return jwt.sign({ sub: userId, v: tokenVersion(userId) ?? 0 }, config.jwtSecret, { expiresIn: '30d' });
}

export function verifyToken(token: string | undefined): string | null {
  if (!token) return null;
  try {
    const payload = jwt.verify(token, config.jwtSecret);
    if (typeof payload !== 'object' || typeof payload.sub !== 'string') return null;
    // tokens de antes dessa checagem não têm "v": valem como versão 0
    const v = typeof payload.v === 'number' ? payload.v : 0;
    return tokenVersion(payload.sub) === v ? payload.sub : null;
  } catch {
    return null;
  }
}

export const hashBotToken = (token: string) => createHash('sha256').update(token).digest('hex');

/** Bots se autenticam com "Bot <token>" (na API) ou com o token puro (no socket). */
export function botUserId(token: unknown): string | null {
  if (typeof token !== 'string') return null;
  const raw = token.startsWith('Bot ') ? token.slice(4) : token;
  if (!raw.startsWith('cb_')) return null;
  return get<{ id: string }>('SELECT id FROM users WHERE is_bot = 1 AND bot_token_hash = ?', hashBotToken(raw))?.id ?? null;
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  let userId: string | null = null;
  if (header?.startsWith('Bearer ')) userId = verifyToken(header.slice(7));
  else if (header?.startsWith('Bot ')) {
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
