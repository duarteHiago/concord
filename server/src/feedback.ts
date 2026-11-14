// Feedback das pessoas para a equipe (bug, sugestão, melhoria): o texto, um pouco de contexto técnico (versão do
// app, navegador, página) e até FEEDBACK_MAX_IMAGES prints. Os prints ficam fora de /uploads (que é público): só
// a equipe vê, pelo portal (admin.ts). A pessoa acompanha a situação em "Meus envios" e recebe aviso quando muda.
// Some sozinho FEEDBACK_RETENTION_DAYS depois da última mudança.
import { randomUUID } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import express, { type Router } from 'express';
import {
  FEEDBACK_BODY_MAX,
  FEEDBACK_MAX_IMAGE_BYTES,
  FEEDBACK_MAX_IMAGES,
  FEEDBACK_RETENTION_DAYS,
  FEEDBACK_STATUSES,
  isFeedbackKind,
  isFeedbackStatus,
} from '../../shared/feedback.ts';
import { config } from './config.ts';
import { all, get, run } from './db.ts';
import { fail, humansOnly, uid } from './http.ts';
import { emitToUser } from './realtime.ts';
import { limiter } from './recovery.ts';

const dir = join(dirname(config.dbPath), 'feedback');
mkdirSync(dir, { recursive: true });

export interface FeedbackRow {
  id: string;
  user_id: string | null;
  kind: string;
  body: string;
  context: string;
  images: number;
  status: string;
  team_note: string;
  created_at: number;
  updated_at: number;
}

const EXT: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };

/**
 * Tipo da imagem pelos bytes, conferindo a estrutura inteira (não confia no que o navegador diz). Recusa arquivo
 * "poliglota": imagem com outra coisa grudada no fim (HTML, script, um executável) ou com marcas de código no meio.
 */
function sniff(buf: Buffer): string | null {
  if (looksLikeCode(buf)) return null;
  if (isPng(buf)) return 'image/png';
  if (isJpeg(buf)) return 'image/jpeg';
  if (isWebp(buf)) return 'image/webp';
  return null;
}

/** PNG: assinatura e os pedaços em sequência, terminando exatamente no IEND (nada depois). */
function isPng(buf: Buffer) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (buf.length < 8 + 12 || !buf.subarray(0, 8).equals(sig)) return false;
  let off = 8;
  let first = true;
  while (off + 12 <= buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('latin1', off + 4, off + 8);
    if (!/^[A-Za-z]{4}$/.test(type) || (first && type !== 'IHDR')) return false;
    first = false;
    off += 12 + len;
    if (off > buf.length) return false;
    if (type === 'IEND') return off === buf.length;
  }
  return false;
}

/** JPEG: começa com FFD8FF e termina com FFD9 (o fim da imagem), sem nada grudado depois. */
function isJpeg(buf: Buffer) {
  return buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff && buf[buf.length - 2] === 0xff && buf[buf.length - 1] === 0xd9;
}

/** WebP: o tamanho dito no cabeçalho RIFF bate com o arquivo (nada a mais no fim). */
function isWebp(buf: Buffer) {
  if (buf.length < 16 || buf.toString('latin1', 0, 4) !== 'RIFF' || buf.toString('latin1', 8, 12) !== 'WEBP') return false;
  const size = buf.readUInt32LE(4) + 8;
  return size === buf.length || size + 1 === buf.length; // o RIFF arredonda para número par
}

/** Marcas de código que não aparecem numa imagem de verdade. */
function looksLikeCode(buf: Buffer) {
  const s = buf.toString('latin1').toLowerCase();
  return ['<script', '<html', '<svg', '<?php', '<iframe', 'javascript:', '<!doctype'].some((m) => s.includes(m));
}

/** O arquivo de um print (n começa em 0), se existir. */
export function feedbackImage(id: string, n: number): { type: string; data: Buffer } | null {
  if (!/^[0-9a-f-]{36}$/.test(id) || !Number.isInteger(n) || n < 0 || n >= FEEDBACK_MAX_IMAGES) return null;
  for (const [type, ext] of Object.entries(EXT)) {
    try {
      return { type, data: readFileSync(join(dir, `${id}-${n}.${ext}`)) };
    } catch {
      // tenta a próxima extensão
    }
  }
  return null;
}

export function deleteFeedback(id: string) {
  run('DELETE FROM feedback WHERE id = ?', id);
  for (const f of readdirSync(dir)) if (f.startsWith(`${id}-`)) rmSync(join(dir, f), { force: true });
}

function cleanup() {
  const old = Date.now() - FEEDBACK_RETENTION_DAYS * 86_400_000;
  for (const { id } of all<{ id: string }>('SELECT id FROM feedback WHERE updated_at < ?', old)) deleteFeedback(id);
}
cleanup();
setInterval(cleanup, 6 * 3_600_000).unref();

// sem caracteres de controle nem os invisíveis e de inversão de direção (usados para disfarçar texto e links).
// O app mostra tudo como texto puro, nunca como HTML.
const text = (v: unknown, max: number) =>
  typeof v === 'string'
    ? v
        .replace(/[\u0000-\u0008\u000b-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2060-\u2064\u2066-\u2069\ufeff]/g, '')
        .trim()
        .slice(0, max)
    : '';

/** O contexto técnico que o app manda junto (nada das mensagens nem de quem está por perto). */
function cleanContext(raw: unknown) {
  const c = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return {
    commit: text(c.commit, 40),
    path: text(c.path, 200),
    userAgent: text(c.userAgent, 300),
    desktop: text(c.desktop, 40),
    screen: text(c.screen, 30),
    area: text(c.area, 60),
  };
}

export const statusLabel = (s: string) => FEEDBACK_STATUSES.find((x) => x.id === s)?.label ?? s;

const mineJson = (f: FeedbackRow) => ({
  id: f.id,
  kind: f.kind,
  body: f.body,
  images: f.images,
  status: f.status,
  teamNote: f.team_note,
  createdAt: f.created_at,
  updatedAt: f.updated_at,
});

// mandar feedback é raro; mais que isso por hora é engano ou abuso
const allowSend = limiter(6, 3_600_000);
const allowImages = limiter(20, 3_600_000);

export function registerFeedbackRoutes(api: Router) {
  api.post('/feedback', humansOnly, (req, res) => {
    const me = uid(res);
    if (!isFeedbackKind(req.body?.kind)) fail(400, 'Escolha o tipo: bug, sugestão, melhoria ou outro.');
    const body = text(req.body?.body, FEEDBACK_BODY_MAX);
    if (body.length < 5) fail(400, 'Conta um pouco mais (pelo menos uma frase).');
    if (!allowSend(me)) fail(429, 'Você já mandou vários feedbacks agora há pouco. Tente de novo daqui a pouco.');
    const id = randomUUID();
    const now = Date.now();
    run(
      'INSERT INTO feedback (id, user_id, kind, body, context, images, status, team_note, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?)',
      id,
      me,
      req.body.kind,
      body,
      JSON.stringify(cleanContext(req.body?.context)),
      'novo',
      '',
      now,
      now,
    );
    res.json({ id });
  });

  /** Um print de cada vez (corpo = a imagem), logo depois de criar o feedback. */
  api.post('/feedback/:id/images', humansOnly, express.raw({ type: () => true, limit: FEEDBACK_MAX_IMAGE_BYTES }), (req, res) => {
    const me = uid(res);
    const f = get<FeedbackRow>('SELECT * FROM feedback WHERE id = ? AND user_id = ?', req.params.id, me) ?? fail(404, 'Feedback não encontrado');
    if (Date.now() - f.created_at > 10 * 60_000) fail(400, 'Os prints vão junto com o envio. Mande um feedback novo.');
    if (f.images >= FEEDBACK_MAX_IMAGES) fail(400, `No máximo ${FEEDBACK_MAX_IMAGES} prints.`);
    if (!allowImages(me)) fail(429, 'Muitos prints agora há pouco. Tente de novo daqui a pouco.');
    if (!Buffer.isBuffer(req.body)) fail(400, 'O print precisa ser PNG, JPEG ou WebP.');
    // cópia própria dos bytes: daqui para frente é só um Buffer, venha o que vier no corpo
    const buf = Buffer.from(req.body as Buffer);
    const type = sniff(buf);
    if (!type) fail(400, 'O print precisa ser PNG, JPEG ou WebP.');
    writeFileSync(join(dir, `${f.id}-${f.images}.${EXT[type!]}`), buf);
    run('UPDATE feedback SET images = images + 1 WHERE id = ?', f.id);
    res.json({ ok: true });
  });

  api.get('/feedback/mine', (_req, res) => {
    const rows = all<FeedbackRow>('SELECT * FROM feedback WHERE user_id = ? ORDER BY created_at DESC LIMIT 50', uid(res));
    res.json(rows.map(mineJson));
  });
}

/** Rotas do portal da equipe (registradas depois do requireAdmin, em admin.ts). */
export function registerFeedbackAdminRoutes(api: Router, page: (req: express.Request) => number, PAGE: number) {
  const SELECT = 'SELECT f.*, u.username, u.display_name FROM feedback f LEFT JOIN users u ON u.id = f.user_id';
  type Row = FeedbackRow & { username: string | null; display_name: string | null };
  const json = (f: Row) => ({
    ...mineJson(f),
    context: (() => {
      try {
        return JSON.parse(f.context);
      } catch {
        return {};
      }
    })(),
    user: f.user_id && f.username ? { id: f.user_id, username: f.username, displayName: f.display_name } : null,
  });

  api.get('/admin/feedback', (req, res) => {
    const status = isFeedbackStatus(req.query.status) ? req.query.status : null;
    const kind = isFeedbackKind(req.query.kind) ? req.query.kind : null;
    const where = ['1 = 1'];
    const args: string[] = [];
    if (status) where.push('f.status = ?'), args.push(status);
    else if (req.query.status === 'abertos') where.push("f.status IN ('novo', 'vendo', 'planejado')");
    if (kind) where.push('f.kind = ?'), args.push(kind);
    const sql = `${SELECT} WHERE ${where.join(' AND ')} ORDER BY f.created_at DESC LIMIT ? OFFSET ?`;
    const rows = all<Row>(sql, ...args, PAGE, page(req) * PAGE);
    const total = get<{ n: number }>(`SELECT COUNT(*) AS n FROM feedback f WHERE ${where.join(' AND ')}`, ...args)!.n;
    const counts = Object.fromEntries(all<{ status: string; n: number }>('SELECT status, COUNT(*) AS n FROM feedback GROUP BY status').map((r) => [r.status, r.n]));
    res.json({ items: rows.map(json), total, pageSize: PAGE, counts });
  });

  api.get('/admin/feedback/:id', (req, res) => {
    const f = get<Row>(`${SELECT} WHERE f.id = ?`, req.params.id) ?? fail(404, 'Feedback não encontrado');
    res.json(json(f));
  });

  api.get('/admin/feedback/:id/image/:n', (req, res) => {
    // o id que vira caminho é o do banco (não o que veio na URL)
    const f = get<FeedbackRow>('SELECT * FROM feedback WHERE id = ?', req.params.id) ?? fail(404, 'Print não encontrado');
    const img = feedbackImage(f.id, Math.floor(Number(req.params.n))) ?? fail(404, 'Print não encontrado');
    res.setHeader('Content-Type', img.type);
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    // aberto direto numa aba, nada de script nem de carregar outra coisa: só a imagem
    res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'; sandbox");
    res.setHeader('Content-Disposition', `inline; filename="print-${Number(req.params.n) + 1}.${img.type.split('/')[1]}"`);
    res.send(img.data);
  });

  /** Muda a situação e/ou a anotação; quem mandou recebe um aviso quando a situação muda. */
  api.patch('/admin/feedback/:id', (req, res) => {
    const f = get<FeedbackRow>('SELECT * FROM feedback WHERE id = ?', req.params.id) ?? fail(404, 'Feedback não encontrado');
    const status = isFeedbackStatus(req.body?.status) ? req.body.status : f.status;
    const note = typeof req.body?.teamNote === 'string' ? text(req.body.teamNote, 1000) : f.team_note;
    run('UPDATE feedback SET status = ?, team_note = ?, updated_at = ? WHERE id = ?', status, note, Date.now(), f.id);
    if (status !== f.status && f.user_id) {
      emitToUser(f.user_id, 'feedback:updated', { id: f.id, status, statusLabel: statusLabel(status), teamNote: note, excerpt: f.body.slice(0, 80) });
    }
    res.json({ ok: true });
  });

  api.delete('/admin/feedback/:id', (req, res) => {
    deleteFeedback(req.params.id);
    res.json({ ok: true });
  });
}
