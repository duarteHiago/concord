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
const loginFailures = new Map<string, number[]>();
export function allowLoginAttempt(username: string): boolean {
  const key = username.toLowerCase();
  const now = Date.now();
  const recent = (loginFailures.get(key) ?? []).filter((t) => now - t < 15 * 60_000);
  loginFailures.set(key, recent);
  return recent.length < 5;
}
export function recordLoginFailure(username: string) {
  const key = username.toLowerCase();
  const now = Date.now();
  const recent = (loginFailures.get(key) ?? []).filter((t) => now - t < 15 * 60_000);
  recent.push(now);
  loginFailures.set(key, recent);
}
