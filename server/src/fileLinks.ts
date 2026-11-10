// Links dos anexos (uploads/files) assinados e com validade: o nome do arquivo é aleatório, mas um link que
// vaza (print, encaminhado) abria o arquivo para qualquer um, para sempre. Agora quem vê a mensagem recebe um
// link novo a cada carregamento, e um link antigo para de valer em até 8 dias.
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { config } from './config.ts';

const PREFIX = '/uploads/files/';
const DAY = 86_400;
const VALID_DAYS = 7;
const key = createHash('sha256').update(`${config.jwtSecret}:files`).digest();

const signature = (path: string, exp: number) => createHmac('sha256', key).update(`${path}|${exp}`).digest('base64url').slice(0, 32);

/** Assina o link de um anexo (outros uploads, como avatar e ícone, continuam públicos). */
export function signFileUrl(url: string): string {
  if (!url.startsWith(PREFIX)) return url;
  // a validade anda em degraus de um dia: o link fica igual o dia todo e o navegador aproveita o cache
  const exp = (Math.floor(Date.now() / 1000 / DAY) + 1 + VALID_DAYS) * DAY;
  return `${url}?e=${exp}&s=${signature(url, exp)}`;
}

/** Montado em /uploads/files, antes dos arquivos: sem assinatura válida, o arquivo não sai. */
export function requireFileSignature(req: Request, res: Response, next: NextFunction) {
  const path = `${PREFIX}${req.path.replace(/^\/+/, '')}`;
  const exp = Number(req.query.e);
  const given = typeof req.query.s === 'string' ? req.query.s : '';
  const expected = signature(path, exp);
  const valid =
    Number.isInteger(exp) && exp * 1000 > Date.now() && given.length === expected.length && timingSafeEqual(Buffer.from(given), Buffer.from(expected));
  if (!valid) return res.status(403).type('text/plain').send('Esse link expirou. Abra o arquivo de novo pela conversa do Concord.');
  // "private": o Cloudflare não guarda cópia (senão serviria o arquivo mesmo depois do link vencer)
  res.setHeader('Cache-Control', `private, max-age=${Math.min(DAY, exp - Math.floor(Date.now() / 1000))}`);
  next();
}
