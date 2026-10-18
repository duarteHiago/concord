import { randomBytes } from 'node:crypto';
import { mkdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { config } from './config.ts';
import { fail } from './http.ts';

export type UploadKind = 'avatars' | 'icons' | 'backgrounds' | 'banners' | 'sounds';

const MB = 1024 * 1024;
// GIFs animados não são redimensionados no navegador, por isso os limites de foto são folgados
const LIMITS: Record<UploadKind, number> = {
  avatars: 8 * MB,
  icons: 8 * MB,
  backgrounds: 8 * MB,
  banners: 8 * MB,
  sounds: 1 * MB,
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

function detectAudio(buf: Buffer): string | null {
  if (buf.length < 12) return null;
  if (buf.toString('ascii', 0, 3) === 'ID3' || (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0)) return 'mp3';
  if (buf.toString('ascii', 0, 4) === 'OggS') return 'ogg';
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WAVE') return 'wav';
  if (buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) return 'webm';
  return null;
}

function store(kind: UploadKind, owner: string, buf: Buffer, ext: string) {
  const dir = join(config.uploadsDir, kind);
  mkdirSync(dir, { recursive: true });
  const name = `${owner}-${randomBytes(6).toString('hex')}.${ext}`;
  writeFileSync(join(dir, name), buf);
  return `/uploads/${kind}/${name}`;
}

function checkSize(kind: UploadKind, body: unknown): Buffer {
  if (!Buffer.isBuffer(body) || body.length === 0) fail(400, 'Envie um arquivo');
  const buf = body as Buffer;
  if (buf.length > LIMITS[kind]) fail(413, `Arquivo muito grande (máx. ${LIMITS[kind] / MB} MB)`);
  return buf;
}

export function saveImage(kind: Exclude<UploadKind, 'sounds'>, owner: string, body: unknown): string {
  const buf = checkSize(kind, body);
  const ext = detectImage(buf) ?? fail(400, 'Formato não suportado (use PNG, JPG, GIF ou WEBP)');
  return store(kind, owner, buf, ext);
}

export function saveSound(owner: string, body: unknown): string {
  const buf = checkSize('sounds', body);
  const ext = detectAudio(buf) ?? fail(400, 'Formato não suportado (use MP3, OGG, WAV ou WEBM)');
  return store('sounds', owner, buf, ext);
}

export function removeUpload(url: string | null | undefined) {
  const m = url?.match(/^\/uploads\/(avatars|icons|backgrounds|banners|sounds)\/([\w.-]+)$/);
  if (!m) return;
  try {
    unlinkSync(join(config.uploadsDir, m[1], basename(m[2])));
  } catch {
    // já removido
  }
}
