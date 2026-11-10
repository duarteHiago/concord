// Recuperação de senha sem e-mail: cada conta tem um código de recuperação (mostrado uma vez).
import { createHash, randomBytes, randomInt } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { config } from './config.ts';
import { all, run } from './db.ts';
import { networkOf } from './net.ts';

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

/**
 * Eventos guardados no banco, para limites que não podem zerar quando o servidor reinicia (a cada deploy):
 * senão, quem tenta adivinhar uma senha ganharia tentativas novas a cada atualização. Cada limite tem o
 * seu `bucket`; a chave vai com hash (com o segredo do servidor, como a rede em networkKey).
 */
function storedHits(bucket: string, windowMs: number) {
  const keyOf = (key: string) => createHash('sha256').update(`${config.jwtSecret}|${bucket}|${key}`).digest('base64url').slice(0, 22);
  setInterval(() => run('DELETE FROM rate_events WHERE bucket = ? AND at < ?', bucket, Date.now() - windowMs), Math.min(windowMs, 10 * 60_000)).unref();
  return {
    /** horários dos eventos ainda dentro da janela, do mais antigo ao mais novo */
    recent: (key: string) =>
      all<{ at: number }>('SELECT at FROM rate_events WHERE bucket = ? AND key = ? AND at > ? ORDER BY at', bucket, keyOf(key), Date.now() - windowMs).map((r) => r.at),
    add: (key: string) => run('INSERT INTO rate_events (bucket, key, at) VALUES (?, ?, ?)', bucket, keyOf(key), Date.now()),
  };
}

/**
 * No máximo `max` usos de cada chave por janela. Sem `stored`, fica em memória (limites de ritmo, como o
 * anti-flood de mensagens); com `stored` (um nome único), vai para o banco e sobrevive a um reinício.
 */
export function limiter(max: number, windowMs: number, stored?: string) {
  if (stored) {
    const hits = storedHits(stored, windowMs);
    return (key: string): boolean => {
      if (hits.recent(key).length >= max) return false;
      hits.add(key);
      return true;
    };
  }
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

/** A rede de um endereço (ver net.ts), embaralhada: o IP em si não fica guardado nem na memória. */
export function networkKey(rawIp: string, bits: 48 | 64 = 64): string {
  return createHash('sha256').update(`${config.jwtSecret}|${networkOf(rawIp, bits)}`).digest('base64url').slice(0, 22);
}

/** Rede de quem chama, para os limites (ver networkKey). Vazia quando não dá para saber (atrás de um proxy sem o IP real). */
export function clientIp(req: { ip?: string }): string {
  const ip = req.ip ?? '';
  return /^(127\.|::1$|::ffff:127\.)/.test(ip) || !ip ? '' : networkKey(ip);
}

/** Janela deslizante de eventos por chave (tentativas erradas etc.). Com `stored`, guardada no banco (ver limiter). */
export function windowCounter(max: number, windowMs: number, stored?: string) {
  if (stored) {
    const hits = storedHits(stored, windowMs);
    return {
      wait(key: string) {
        const list = hits.recent(key);
        return list.length < max ? 0 : Math.max(1, Math.ceil((list[0] + windowMs - Date.now()) / 60_000));
      },
      add(key: string) {
        hits.add(key);
        return Math.max(0, max - hits.recent(key).length);
      },
    };
  }
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
const loginUserIp = windowCounter(5, 15 * MINUTES, 'login-user-ip');
const loginIp = windowCounter(30, 15 * MINUTES, 'login-ip');
const loginUser = windowCounter(100, 60 * MINUTES, 'login-user');
const recoveryUserIp = windowCounter(5, 15 * MINUTES, 'recovery-user-ip');
const recoveryIp = windowCounter(20, 15 * MINUTES, 'recovery-ip');
const recoveryUser = windowCounter(30, 60 * MINUTES, 'recovery-user');

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
