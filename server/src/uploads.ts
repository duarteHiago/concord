import { randomBytes } from 'node:crypto';
import { mkdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { config } from './config.ts';
import { fail } from './http.ts';

export type UploadKind = 'avatars' | 'icons' | 'backgrounds';

const LIMITS: Record<UploadKind, number> = {
  avatars: 2 * 1024 * 1024,
  icons: 2 * 1024 * 1024,
  backgrounds: 6 * 1024 * 1024,
};

/** Identifica o formato pelos primeiros bytes (não confia no Content-Type). */
function detectImage(buf: Buffer): string | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0x89 && buf.toString('ascii', 1, 4) === 'PNG') return 'png';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.toString('ascii', 0, 4) === 'GIF8') return 'gif';
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  return null;
}

export function saveImage(kind: UploadKind, owner: string, body: unknown): string {
  if (!Buffer.isBuffer(body) || body.length === 0) fail(400, 'Envie uma imagem');
  const buf = body as Buffer;
  if (buf.length > LIMITS[kind]) fail(413, `Imagem muito grande (máx. ${LIMITS[kind] / 1024 / 1024} MB)`);
  const ext = detectImage(buf) ?? fail(400, 'Formato não suportado (use PNG, JPG, GIF ou WEBP)');
  const dir = join(config.uploadsDir, kind);
  mkdirSync(dir, { recursive: true });
  const name = `${owner}-${randomBytes(6).toString('hex')}.${ext}`;
  writeFileSync(join(dir, name), buf);
  return `/uploads/${kind}/${name}`;
}

export function removeUpload(url: string | null | undefined) {
  const m = url?.match(/^\/uploads\/(avatars|icons|backgrounds)\/([\w.-]+)$/);
  if (!m) return;
  try {
    unlinkSync(join(config.uploadsDir, m[1], basename(m[2])));
  } catch {
    // já removido
  }
}
