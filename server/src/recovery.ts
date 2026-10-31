// Recuperação de senha sem e-mail: cada conta tem um código de recuperação (mostrado uma vez).
import { randomBytes, randomInt } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { run } from './db.ts';

// sem 0/O, 1/I/L para não confundir ao copiar à mão
export const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function newRecoveryCode(): string {
  const bytes = randomBytes(16);
  const chars = Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]);
  return [0, 4, 8, 12].map((i) => chars.slice(i, i + 4).join('')).join('-');
}

/** Gera um código novo para o usuário, guarda só o hash e devolve o código em texto. */
export async function rotateRecoveryCode(userId: string): Promise<string> {
  const code = newRecoveryCode();
  run('UPDATE users SET recovery_hash = ? WHERE id = ?', await bcrypt.hash(normalize(code), 10), userId);
  return code;
}

export function normalize(code: string) {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function temporaryPassword(): string {
  return Array.from({ length: 12 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('').toLowerCase();
}

/** Limite simples em memória: no máximo `max` usos de cada chave por janela. */
export function limiter(max: number, windowMs: number) {
  const hits = new Map<string, number[]>();
  setInterval(() => {
    const old = Date.now() - windowMs;
    for (const [k, v] of hits) if (v.every((t) => t < old)) hits.delete(k);
  }, windowMs).unref();
  return (key: string): boolean => {
    const now = Date.now();
    const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
    if (recent.length >= max) {
      hits.set(key, recent);
      return false;
    }
    recent.push(now);
    hits.set(key, recent);
    return true;
  };
}

/** IP de quem chama, para os limites por rede. Vazio quando não dá para saber (atrás de um proxy sem o IP real). */
export function clientIp(req: { ip?: string }): string {
  const ip = req.ip ?? '';
  return /^(127\.|::1$|::ffff:127\.)/.test(ip) ? '' : ip;
}

/** Janela deslizante de eventos por chave (tentativas erradas etc.). */
function windowCounter(max: number, windowMs: number) {
  const hits = new Map<string, number[]>();
  setInterval(() => {
    const old = Date.now() - windowMs;
    for (const [k, v] of hits) if (v.every((t) => t < old)) hits.delete(k);
  }, windowMs).unref();
  const recent = (key: string) => {
    const now = Date.now();
    const list = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
    hits.set(key, list);
    return list;
  };
  return {
    /** minutos até liberar (0 = liberado) */
    wait(key: string) {
      const list = recent(key);
      return list.length < max ? 0 : Math.max(1, Math.ceil((list[0] + windowMs - Date.now()) / 60_000));
    },
    /** registra um evento e devolve quantos ainda cabem */
    add(key: string) {
      const list = recent(key);
      list.push(Date.now());
      return Math.max(0, max - list.length);
    },
  };
}

// Erros de senha (e de código de recuperação). O bloqueio é por usuário NA MESMA REDE: errar de propósito
// a senha de alguém não tranca essa pessoa do lado de fora. Por cima, um teto por rede (quem testa uma senha
// em muitas contas) e um teto alto por usuário (quem tenta de muitas redes ao mesmo tempo).
const MINUTES = 60_000;
const loginUserIp = windowCounter(5, 15 * MINUTES);
const loginIp = windowCounter(30, 15 * MINUTES);
const loginUser = windowCounter(100, 60 * MINUTES);
const recoveryUserIp = windowCounter(5, 15 * MINUTES);
const recoveryIp = windowCounter(20, 15 * MINUTES);
const recoveryUser = windowCounter(30, 60 * MINUTES);

const userKey = (username: string) => username.toLowerCase();

/** Código de recuperação: pode tentar agora? (cada chamada conta como tentativa) */
export function allowAttempt(username: string, ip: string): boolean {
  const u = userKey(username);
  if (recoveryUserIp.wait(`${u}|${ip}`) || recoveryUser.wait(u) || (ip && recoveryIp.wait(ip))) return false;
  recoveryUserIp.add(`${u}|${ip}`);
  recoveryUser.add(u);
  if (ip) recoveryIp.add(ip);
  return true;
}

/** 0 = pode tentar; senão, quantos minutos faltam para liberar. */
export function loginWaitMinutes(username: string, ip: string): number {
  const u = userKey(username);
  return Math.max(loginUserIp.wait(`${u}|${ip}`), loginUser.wait(u), ip ? loginIp.wait(ip) : 0);
}

/** Registra uma senha errada e devolve quantas tentativas ainda restam (para esse usuário nessa rede). */
export function recordLoginFailure(username: string, ip: string): number {
  const u = userKey(username);
  loginUser.add(u);
  if (ip) loginIp.add(ip);
  return loginUserIp.add(`${u}|${ip}`);
}
