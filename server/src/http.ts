import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { config } from './config.ts';

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

export function signToken(userId: string): string {
  return jwt.sign({ sub: userId }, config.jwtSecret, { expiresIn: '30d' });
}

export function verifyToken(token: string | undefined): string | null {
  if (!token) return null;
  try {
    const payload = jwt.verify(token, config.jwtSecret);
    return typeof payload === 'object' && typeof payload.sub === 'string' ? payload.sub : null;
  } catch {
    return null;
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const userId = verifyToken(header?.startsWith('Bearer ') ? header.slice(7) : undefined);
  if (!userId) return res.status(401).json({ error: 'Não autenticado' });
  res.locals.userId = userId;
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
