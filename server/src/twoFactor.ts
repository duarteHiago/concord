// Verificação em duas etapas (TOTP, RFC 6238): o código de 6 dígitos que muda a cada 30 s nos apps
// autenticadores (Google Authenticator, Microsoft Authenticator, 2FAS...). Sem dependências: é um HMAC.
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { config } from './config.ts';
import { get, run, type UserRow } from './db.ts';
import { fail, signToken } from './http.ts';
import { ALPHABET, normalize } from './recovery.ts';

const STEP_SECONDS = 30;
const DIGITS = 6;
const BACKUP_CODES = 10;

// Chaves derivadas do JWT_SECRET (nada novo para configurar). Trocar o JWT_SECRET desliga o 2FA de
// todo mundo na prática: os segredos guardados deixam de abrir (aí é usar o cli.ts disable-2fa).
const sealKey = createHash('sha256').update(`${config.jwtSecret}:2fa-seal`).digest();
const backupKey = createHash('sha256').update(`${config.jwtSecret}:2fa-backup`).digest();
// segredo próprio para o "ticket" do login: assim ele nunca vale como token de sessão
const ticketSecret = `${config.jwtSecret}:2fa-ticket`;

// ---- Base32 (o formato do segredo nos apps autenticadores) ----

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

// ---- TOTP ----

/** O código de um passo de 30 s (HOTP com o contador = passo). */
export function totpCode(secret: Buffer, step: number): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const mac = createHmac('sha1', secret).update(counter).digest();
  const offset = mac[mac.length - 1] & 0xf;
  const n = mac.readUInt32BE(offset) & 0x7fffffff;
  return String(n % 10 ** DIGITS).padStart(DIGITS, '0');
}

const currentStep = () => Math.floor(Date.now() / 1000 / STEP_SECONDS);

// Celular com o relógio fora é comum (hora manual, bateria que zerou). Na configuração procuramos o código
// em ±10 min e guardamos a diferença da pessoa (totp_drift); no login a folga continua de 1 passo, mas
// centrada no relógio dela, e vai se ajustando sozinha se ele andar.
const SETUP_DRIFT_STEPS = 20;

/** Passo em que o código bate, procurando `spread` passos para cada lado de `center`, do mais perto ao mais longe. */
function matchStep(secret: Buffer, code: string, center = currentStep(), spread = 1): number | null {
  const given = Buffer.from(code);
  for (let d = 0; d <= spread; d++) {
    for (const step of d ? [center - d, center + d] : [center]) {
      const expected = Buffer.from(totpCode(secret, step));
      if (expected.length === given.length && timingSafeEqual(expected, given)) return step;
    }
  }
  return null;
}

// ---- Segredo guardado cifrado (AES-256-GCM) ----

function seal(secret: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', sealKey, iv);
  const data = Buffer.concat([cipher.update(secret), cipher.final()]);
  return ['v1', iv, cipher.getAuthTag(), data].map((p) => (typeof p === 'string' ? p : p.toString('base64url'))).join('.');
}

function unseal(sealed: string): Buffer {
  const [version, iv, tag, data] = sealed.split('.');
  if (version !== 'v1') throw new Error('formato desconhecido');
  const decipher = createDecipheriv('aes-256-gcm', sealKey, Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]);
}

// ---- Códigos de backup (uso único; só o HMAC fica no banco) ----

const hashBackup = (code: string) => createHmac('sha256', backupKey).update(normalize(code)).digest('hex');

function newBackupCodes(): string[] {
  return Array.from({ length: BACKUP_CODES }, () => {
    const chars = Array.from({ length: 8 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');
    return `${chars.slice(0, 4)}-${chars.slice(4)}`;
  });
}

const backupHashes = (u: UserRow): string[] => {
  try {
    return JSON.parse(u.totp_backup || '[]') as string[];
  } catch {
    return [];
  }
};

export const backupCodesLeft = (u: UserRow) => (u.totp_enabled ? backupHashes(u).length : 0);

// ---- Limite de tentativas: 5 códigos errados a cada 15 min, por conta ----

const MAX_FAILURES = 5;
const FAILURE_WINDOW = 15 * 60_000;
const failures = new Map<string, number[]>();

function recentFailures(userId: string) {
  const now = Date.now();
  const recent = (failures.get(userId) ?? []).filter((t) => now - t < FAILURE_WINDOW);
  if (recent.length) failures.set(userId, recent);
  else failures.delete(userId);
  return recent;
}

// ---- Conferir um código ----

export type CodeKind = 'totp' | 'backup';

/** Confere o código do app ou um código de backup (que deixa de valer). Errou demais: 429. */
export function checkCode(user: UserRow, raw: unknown): CodeKind | null {
  const recent = recentFailures(user.id);
  if (recent.length >= MAX_FAILURES) {
    const wait = Math.max(1, Math.ceil((recent[0] + FAILURE_WINDOW - Date.now()) / 60_000));
    fail(429, `Muitos códigos errados. Espere ${wait} min e tente de novo.`);
  }
  const code = typeof raw === 'string' ? raw.replace(/\s+/g, '') : '';
  let kind: CodeKind | null = null;
  if (/^\d{6}$/.test(code) && user.totp_secret) {
    const now = currentStep();
    const step = matchStep(unseal(user.totp_secret), code, now + (user.totp_drift ?? 0));
    // o mesmo código não vale duas vezes (quem viu você digitar não reaproveita)
    if (step !== null && step > (user.totp_last_step ?? 0)) {
      // bateu na beirada da folga: o relógio do celular andou, a folga acompanha
      run('UPDATE users SET totp_last_step = ?, totp_drift = ? WHERE id = ?', step, step - now, user.id);
      kind = 'totp';
    }
  } else if (normalize(code).length === 8) {
    const hashes = backupHashes(user);
    const hash = hashBackup(code);
    if (hashes.includes(hash)) {
      run('UPDATE users SET totp_backup = ? WHERE id = ?', JSON.stringify(hashes.filter((h) => h !== hash)), user.id);
      kind = 'backup';
    }
  }
  if (!kind) {
    recent.push(Date.now());
    failures.set(user.id, recent);
  }
  return kind;
}

/** Ações sensíveis (trocar senha, e-mail...): com o 2FA ligado, pedem o código também. */
export function requireCode(user: UserRow, raw: unknown) {
  if (!user.totp_enabled) return;
  if (!raw) fail(400, 'Digite o código do app autenticador (ou um código de backup).');
  if (!checkCode(user, raw)) fail(400, 'Código de verificação incorreto.');
}

// ---- Ligar / desligar ----

/** O segredo de uma configuração começada e ainda não confirmada (null se não houver ou não abrir). */
function pendingSecret(user: UserRow): Buffer | null {
  if (user.totp_enabled || !user.totp_secret) return null;
  try {
    return unseal(user.totp_secret);
  } catch {
    return null;
  }
}

/**
 * Começa a configuração (ainda não vale até `enable`). Se já tem uma começada, devolve o mesmo segredo:
 * abrir de novo (outra janela, o app e o navegador, cancelar e ligar de novo) mostra o mesmo QR, em vez
 * de trocar a chave por baixo do QR que a pessoa acabou de escanear.
 */
export function startSetup(user: UserRow) {
  if (user.totp_enabled) fail(400, 'A verificação em duas etapas já está ligada.');
  let secret = pendingSecret(user);
  if (!secret) {
    secret = randomBytes(20);
    run('UPDATE users SET totp_secret = ?, totp_last_step = 0, totp_drift = 0 WHERE id = ?', seal(secret), user.id);
  }
  const b32 = base32(secret);
  const label = encodeURIComponent(`Concord:${user.username}`);
  return { secret: b32, uri: `otpauth://totp/${label}?secret=${b32}&issuer=Concord&digits=${DIGITS}&period=${STEP_SECONDS}` };
}

/**
 * Confirma a configuração com o primeiro código do app. Devolve os códigos de backup (mostrados uma vez).
 * Errar aqui não conta para o bloqueio de 15 min: a pessoa já está logada e confirmou a senha, e adivinhar o
 * código não dá nada a ninguém (o segredo é dela). O bloqueio fica para o login e as ações sensíveis.
 */
export function enable(user: UserRow, raw: unknown): { backupCodes: string[]; clockOffsetSec: number } {
  if (user.totp_enabled) fail(400, 'A verificação em duas etapas já está ligada.');
  const secret = pendingSecret(user) ?? fail(400, 'Comece a configuração de novo.');
  const code = typeof raw === 'string' ? raw.replace(/\s+/g, '') : '';
  // aqui só vale o código do app: ainda não existem códigos de backup
  if (!/^\d{6}$/.test(code)) fail(400, 'Digite os 6 números que aparecem no app autenticador.');
  const now = currentStep();
  const step = matchStep(secret, code, now, SETUP_DRIFT_STEPS);
  if (step === null) {
    fail(400, 'Esse código não bate com o QR desta tela. Apague as entradas antigas do Concord no app autenticador e escaneie este QR de novo.');
  }
  const drift = step! - now;
  run('UPDATE users SET totp_last_step = ?, totp_drift = ? WHERE id = ?', step, drift, user.id);
  return { backupCodes: rotateBackupCodes(user.id, true), clockOffsetSec: drift * STEP_SECONDS };
}

export function rotateBackupCodes(userId: string, enableNow = false): string[] {
  const codes = newBackupCodes();
  run(
    `UPDATE users SET totp_backup = ?${enableNow ? ', totp_enabled = 1' : ''} WHERE id = ?`,
    JSON.stringify(codes.map(hashBackup)),
    userId,
  );
  return codes;
}

export function disable(userId: string) {
  run('UPDATE users SET totp_secret = NULL, totp_enabled = 0, totp_last_step = 0, totp_drift = 0, totp_backup = NULL WHERE id = ?', userId);
}

// ---- Login em duas etapas ----

interface TicketPayload {
  sub: string;
  v: number;
  /** entrou pelo código de recuperação: o código novo só é gerado depois do 2FA */
  recovery?: boolean;
}

/** Senha (ou Google) conferida: com 2FA, devolve um ticket de 5 min em vez do token de sessão. */
export function loginResult(user: UserRow, opts: { recovery?: boolean } = {}): { token: string } | { mfa: string } {
  if (!user.totp_enabled) return { token: signToken(user.id) };
  const payload: TicketPayload = { sub: user.id, v: user.token_version ?? 0, ...(opts.recovery ? { recovery: true } : {}) };
  return { mfa: jwt.sign(payload, ticketSecret, { expiresIn: '5m' }) };
}

/** Segunda etapa: confere o ticket e o código. Devolve a conta e o que foi usado. */
export function finishLogin(ticket: unknown, code: unknown): { user: UserRow; kind: CodeKind; recovery: boolean } {
  const expired = 'O tempo para digitar o código acabou. Entre de novo.';
  let payload: TicketPayload;
  try {
    payload = jwt.verify(String(ticket ?? ''), ticketSecret) as TicketPayload;
  } catch {
    fail(401, expired);
  }
  const user = get<UserRow>('SELECT * FROM users WHERE id = ?', payload!.sub);
  // senha trocada ou 2FA desligado no meio do caminho: o ticket não vale mais
  if (!user || !user.totp_enabled || (user.token_version ?? 0) !== payload!.v) fail(401, expired);
  const kind = checkCode(user!, code) ?? fail(400, 'Código de verificação incorreto.');
  return { user: user!, kind, recovery: !!payload!.recovery };
}
