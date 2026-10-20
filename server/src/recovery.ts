// Recuperação de senha sem e-mail: cada conta tem um código de recuperação (mostrado uma vez).
import { randomBytes, randomInt } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { run } from './db.ts';

// sem 0/O, 1/I/L para não confundir ao copiar à mão
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

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

// limite de tentativas por usuário: 5 a cada 15 minutos
const attempts = new Map<string, number[]>();
export function allowAttempt(username: string): boolean {
  const key = username.toLowerCase();
  const now = Date.now();
  const recent = (attempts.get(key) ?? []).filter((t) => now - t < 15 * 60_000);
  if (recent.length >= 5) {
    attempts.set(key, recent);
    return false;
  }
  recent.push(now);
  attempts.set(key, recent);
  return true;
}

// mesma ideia pro login, mas só conta senha ERRADA: login certo não deve contar contra o limite
// (senão alguém entrando em várias janelas/dispositivos em pouco tempo cairia no bloqueio)
const LOGIN_MAX = 5;
const LOGIN_WINDOW = 15 * 60_000;
const loginFailures = new Map<string, number[]>();
function recentFailures(username: string) {
  const key = username.toLowerCase();
  const now = Date.now();
  const recent = (loginFailures.get(key) ?? []).filter((t) => now - t < LOGIN_WINDOW);
  loginFailures.set(key, recent);
  return recent;
}
/** 0 = pode tentar; senão, quantos minutos faltam para liberar. */
export function loginWaitMinutes(username: string): number {
  const recent = recentFailures(username);
  if (recent.length < LOGIN_MAX) return 0;
  return Math.max(1, Math.ceil((recent[0] + LOGIN_WINDOW - Date.now()) / 60_000));
}
/** Registra uma senha errada e devolve quantas tentativas ainda restam. */
export function recordLoginFailure(username: string): number {
  const recent = recentFailures(username);
  recent.push(Date.now());
  return Math.max(0, LOGIN_MAX - recent.length);
}
