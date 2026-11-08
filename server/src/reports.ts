// Denúncias: qualquer pessoa denuncia uma mensagem (de servidor ou DM), uma conta ou uma transmissão. Só a equipe
// do Concord vê, no portal /admin, e decide: arquivar, apagar o conteúdo, encerrar a transmissão ou suspender a
// conta (pela página da conta). A prova é guardada na hora: o texto da mensagem, cópia das imagens anexadas e,
// na transmissão, até 3 imagens da tela que o app de quem denunciou capturou. Ela some 90 dias depois de a
// denúncia ser resolvida, menos nas de abuso infantil, que podem virar prova para as autoridades.
import { randomUUID } from 'node:crypto';
import { copyFileSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import type { Router } from 'express';
import { P } from '../../shared/permissions.ts';
import { REPORT_CATEGORIES, type ReportCategory } from '../../shared/reports.ts';
import { requireChannelPerm } from './access.ts';
import { config } from './config.ts';
import { all, get, run } from './db.ts';
import { fail, humansOnly, optStr, uid } from './http.ts';
import { getVoiceState } from './realtime.ts';
import { limiter } from './recovery.ts';

type Category = ReportCategory;
const KINDS = ['message', 'dm_message', 'user', 'stream'] as const;
type Kind = (typeof KINDS)[number];

export const REPORT_RETENTION_DAYS = 90;
const MAX_FRAMES = 3;
const MAX_FRAME_BYTES = 450 * 1024;
const MAX_FILES = 4;
const MAX_FILE_BYTES = 8 * 1024 * 1024;
const IMAGE = /\.(png|jpe?g|gif|webp)$/i;

interface ReportRow {
  id: string;
  reporter_id: string | null;
  kind: Kind;
  category: Category;
  details: string | null;
  target_user_id: string;
  target_username: string;
  message_id: string | null;
  server_id: string | null;
  channel_id: string | null;
  evidence: string | null;
  status: 'open' | 'resolved';
  outcome: 'dismissed' | 'actioned' | null;
  note: string | null;
  resolved_by: string | null;
  resolved_at: number | null;
  created_at: number;
}

interface Evidence {
  /** a mensagem como estava na hora da denúncia */
  message?: { content: string; kind: string; createdAt: number; attachments: { name: string; url: string }[]; place: string };
  frames?: string[];
  files?: string[];
  expired?: boolean;
}

/** O que só o api.ts sabe fazer (apagar avisando quem está no canal, parar a transmissão no LiveKit). */
export interface ReportHooks {
  deleteMessage(id: string): Promise<boolean>;
  deleteDmMessage(id: string): Promise<boolean>;
  stopStream(userId: string): Promise<boolean>;
}

const dirOf = (id: string) => join(config.reportsDir, basename(id));
const perReporter = limiter(10, 60 * 60_000);
const now = () => Date.now();

/** Imagem da tela mandada pelo app (JPEG em data URL): conferida e gravada como arquivo. */
function frameBuffer(raw: unknown): Buffer {
  const m = typeof raw === 'string' ? /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(raw) : null;
  const buf = m ? Buffer.from(m[1], 'base64') : null;
  if (!buf || buf.length < 100 || buf.length > MAX_FRAME_BYTES || buf[0] !== 0xff || buf[1] !== 0xd8 || buf[2] !== 0xff) {
    fail(400, 'Imagem da transmissão inválida');
  }
  return buf!;
}

/** Cópia das imagens anexadas: se a mensagem (ou a conta) for apagada, a prova fica. */
function copyAttachments(dir: string, attachments: { name: string; url: string }[]): string[] {
  const out: string[] = [];
  for (const a of attachments) {
    if (out.length >= MAX_FILES) break;
    const m = /^\/uploads\/files\/([\w.-]+)$/.exec(a.url);
    if (!m || !IMAGE.test(m[1])) continue;
    const src = join(config.uploadsDir, 'files', basename(m[1]));
    try {
      if (statSync(src).size > MAX_FILE_BYTES) continue;
      const name = `anexo-${out.length + 1}${m[1].slice(m[1].lastIndexOf('.'))}`;
      copyFileSync(src, join(dir, name));
      out.push(name);
    } catch {
      // o arquivo já não existe: fica só o registro
    }
  }
  return out;
}

const parseAttachments = (raw: string | null): { name: string; url: string }[] => {
  try {
    const list = raw ? (JSON.parse(raw) as { name?: string; url?: string }[]) : [];
    return list.filter((a) => typeof a.url === 'string').map((a) => ({ name: String(a.name ?? ''), url: a.url! }));
  } catch {
    return [];
  }
};

const MIME: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp' };
function dataUrl(dir: string, name: string): string | null {
  try {
    const ext = name.slice(name.lastIndexOf('.') + 1).toLowerCase();
    return `data:${MIME[ext] ?? 'application/octet-stream'};base64,${readFileSync(join(dir, basename(name))).toString('base64')}`;
  } catch {
    return null;
  }
}

/** Prova vencida: some o texto e as imagens; o registro (quem, quando, o que foi decidido) fica. */
function expireEvidence() {
  const limit = now() - REPORT_RETENTION_DAYS * 86_400_000;
  const rows = all<{ id: string }>(
    "SELECT id FROM reports WHERE status = 'resolved' AND resolved_at < ? AND category != 'csam' AND (evidence IS NULL OR evidence NOT LIKE '%\"expired\":true%')",
    limit,
  );
  for (const r of rows) {
    rmSync(dirOf(r.id), { recursive: true, force: true });
    run("UPDATE reports SET evidence = '{\"expired\":true}', details = NULL WHERE id = ?", r.id);
  }
}

export function registerReportRoutes(api: Router, hooks: ReportHooks) {
  mkdirSync(config.reportsDir, { recursive: true });
  expireEvidence();
  setInterval(expireEvidence, 60 * 60_000).unref();

  api.post('/reports', humansOnly, (req, res) => {
    const me = uid(res);
    const body = req.body ?? {};
    const kind = KINDS.includes(body.kind) ? (body.kind as Kind) : fail(400, 'Tipo de denúncia inválido');
    const category = REPORT_CATEGORIES.includes(body.category) ? (body.category as Category) : fail(400, 'Escolha o motivo da denúncia');
    const details = optStr(typeof body.details === 'string' ? body.details.trim() || undefined : undefined, 'detalhes', 1, 1000) ?? null;

    let targetId: string;
    let messageId: string | null = null;
    let serverId: string | null = null;
    let channelId: string | null = null;
    let message: Evidence['message'];

    if (kind === 'message') {
      const m = get<{ id: string; channel_id: string; author_id: string; content: string; kind: string; attachments: string | null; created_at: number }>(
        'SELECT id, channel_id, author_id, content, kind, attachments, created_at FROM messages WHERE id = ?',
        String(body.id ?? ''),
      ) ?? fail(404, 'Mensagem não encontrada');
      // só denuncia o que consegue ver
      const channel = requireChannelPerm(m!.channel_id, me, P.VIEW_CHANNEL);
      const server = get<{ name: string }>('SELECT name FROM servers WHERE id = ?', channel.server_id);
      targetId = m!.author_id;
      messageId = m!.id;
      serverId = channel.server_id;
      channelId = channel.id;
      message = { content: m!.content, kind: m!.kind, createdAt: m!.created_at, attachments: parseAttachments(m!.attachments), place: `#${channel.name} em ${server?.name ?? 'servidor'}` };
    } else if (kind === 'dm_message') {
      const m = get<{ id: string; dm_id: string; author_id: string; content: string; kind: string; attachments: string | null; created_at: number; user_a: string; user_b: string }>(
        `SELECT m.id, m.dm_id, m.author_id, m.content, m.kind, m.attachments, m.created_at, d.user_a, d.user_b
         FROM dm_messages m JOIN dm_channels d ON d.id = m.dm_id WHERE m.id = ?`,
        String(body.id ?? ''),
      );
      if (!m || (m.user_a !== me && m.user_b !== me)) fail(404, 'Mensagem não encontrada');
      targetId = m!.author_id;
      messageId = m!.id;
      message = { content: m!.content, kind: m!.kind, createdAt: m!.created_at, attachments: parseAttachments(m!.attachments), place: 'Mensagem direta' };
    } else {
      targetId = String(body.userId ?? '');
      if (kind === 'stream') {
        // só quem está na mesma sala vê a transmissão (e só ela pode ser denunciada como transmissão)
        const target = getVoiceState(targetId);
        const mine = getVoiceState(me);
        if (!target || !mine || target.channelId !== mine.channelId) fail(400, 'Essa pessoa não está transmitindo na sua sala');
        if (!target!.streaming && !target!.camera) fail(400, 'Essa pessoa não está transmitindo');
        serverId = target!.serverId;
        channelId = target!.channelId;
      }
    }

    if (targetId === me) fail(400, 'Você não pode denunciar a si mesmo');
    const target = get<{ id: string; username: string; is_bot: number }>('SELECT id, username, is_bot FROM users WHERE id = ?', targetId) ?? fail(404, 'Conta não encontrada');
    const dup = get(
      "SELECT 1 FROM reports WHERE reporter_id = ? AND status = 'open' AND kind = ? AND target_user_id = ? AND IFNULL(message_id, '') = ?",
      me,
      kind,
      target!.id,
      messageId ?? '',
    );
    if (dup) fail(409, 'Você já denunciou isso. A equipe do Concord vai analisar.');
    if (!perReporter(me)) fail(429, 'Muitas denúncias em pouco tempo. Espere um pouco e tente de novo.');

    const frames = kind === 'stream' && Array.isArray(body.frames) ? body.frames.slice(0, MAX_FRAMES).map(frameBuffer) : [];
    const id = randomUUID();
    const dir = dirOf(id);
    mkdirSync(dir, { recursive: true });
    const evidence: Evidence = {};
    if (message) evidence.message = message;
    if (frames.length) {
      evidence.frames = frames.map((buf: Buffer, i: number) => {
        const name = `tela-${i + 1}.jpg`;
        writeFileSync(join(dir, name), buf);
        return name;
      });
    }
    if (message?.attachments.length) {
      const files = copyAttachments(dir, message.attachments);
      if (files.length) evidence.files = files;
    }
    if (!readdirSync(dir).length) rmSync(dir, { recursive: true, force: true });

    run(
      `INSERT INTO reports (id, reporter_id, kind, category, details, target_user_id, target_username, message_id, server_id, channel_id, evidence, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      me,
      kind,
      category,
      details,
      target!.id,
      target!.username,
      messageId,
      serverId,
      channelId,
      JSON.stringify(evidence),
      now(),
    );
    console.log(`[denúncia] ${category} (${kind}) contra @${target!.username}`);
    res.json({ ok: true });
  });

  // ---- Portal da equipe (o /admin já passa pelo requireAdmin, ver admin.ts) ----

  const SEVERITY = "CASE category WHEN 'csam' THEN 0 WHEN 'violence' THEN 1 WHEN 'nudity' THEN 2 WHEN 'harassment' THEN 3 ELSE 4 END";
  const SELECT = `SELECT r.*, ru.username AS reporter_username, tu.username AS target_now, tu.banned_at AS target_banned
    FROM reports r LEFT JOIN users ru ON ru.id = r.reporter_id LEFT JOIN users tu ON tu.id = r.target_user_id`;
  type Joined = ReportRow & { reporter_username: string | null; target_now: string | null; target_banned: number | null };

  const summary = (r: Joined) => ({
    id: r.id,
    kind: r.kind,
    category: r.category,
    reporter: r.reporter_username,
    target: { id: r.target_user_id, username: r.target_now ?? r.target_username, deleted: !r.target_now, suspended: !!r.target_banned },
    status: r.status,
    outcome: r.outcome,
    createdAt: r.created_at,
    resolvedAt: r.resolved_at,
  });

  api.get('/admin/reports', (req, res) => {
    const status = req.query.status === 'resolved' ? 'resolved' : 'open';
    const page = Math.max(0, Math.floor(Number(req.query.page) || 0));
    const order = status === 'open' ? `${SEVERITY}, r.created_at` : 'r.resolved_at DESC';
    const items = all<Joined>(`${SELECT} WHERE r.status = ? ORDER BY ${order} LIMIT 50 OFFSET ?`, status, page * 50);
    const total = get<{ n: number }>('SELECT COUNT(*) AS n FROM reports WHERE status = ?', status)!.n;
    const open = get<{ n: number }>("SELECT COUNT(*) AS n FROM reports WHERE status = 'open'")!.n;
    res.json({ items: items.map(summary), total, open, pageSize: 50 });
  });

  const byId = (id: string) => get<Joined>(`${SELECT} WHERE r.id = ?`, id) ?? fail(404, 'Denúncia não encontrada');

  api.get('/admin/reports/:id', (req, res) => {
    const r = byId(req.params.id);
    const ev = (r.evidence ? JSON.parse(r.evidence) : {}) as Evidence;
    const dir = dirOf(r.id);
    const resolver = r.resolved_by ? get<{ username: string }>('SELECT username FROM users WHERE id = ?', r.resolved_by)?.username : null;
    const others = get<{ n: number }>('SELECT COUNT(*) AS n FROM reports WHERE target_user_id = ? AND id != ?', r.target_user_id, r.id)!.n;
    const messageExists =
      r.message_id && (r.kind === 'message' ? !!get('SELECT 1 FROM messages WHERE id = ?', r.message_id) : !!get('SELECT 1 FROM dm_messages WHERE id = ?', r.message_id));
    const voice = r.kind === 'stream' ? getVoiceState(r.target_user_id) : null;
    res.json({
      ...summary(r),
      details: r.details,
      note: r.note,
      resolvedBy: resolver ?? null,
      place: ev.message?.place ?? null,
      message: ev.message ? { content: ev.message.content, kind: ev.message.kind, createdAt: ev.message.createdAt, attachments: ev.message.attachments.length, stillThere: !!messageExists } : null,
      frames: (ev.frames ?? []).map((f) => dataUrl(dir, f)).filter(Boolean),
      files: (ev.files ?? []).map((f) => dataUrl(dir, f)).filter(Boolean),
      expired: !!ev.expired,
      streamingNow: !!voice && voice.channelId === r.channel_id && (voice.streaming || voice.camera),
      otherReports: others,
      retentionDays: REPORT_RETENTION_DAYS,
    });
  });

  const noteOf = (body: unknown) => {
    const n = (body as { note?: unknown } | undefined)?.note;
    return typeof n === 'string' && n.trim() ? n.trim().slice(0, 500) : null;
  };

  function resolve(r: ReportRow, me: string, outcome: 'dismissed' | 'actioned', note: string | null) {
    run("UPDATE reports SET status = 'resolved', outcome = ?, note = ?, resolved_by = ?, resolved_at = ? WHERE id = ?", outcome, note, me, now(), r.id);
  }

  /** Arquivar (nada a fazer) ou dar por resolvida (a equipe já agiu, por exemplo suspendendo a conta). */
  api.post('/admin/reports/:id/resolve', (req, res) => {
    const r = byId(req.params.id);
    const outcome = req.body?.outcome === 'actioned' ? 'actioned' : 'dismissed';
    resolve(r, uid(res), outcome, noteOf(req.body));
    res.json({ ok: true });
  });

  api.post('/admin/reports/:id/reopen', (req, res) => {
    const r = byId(req.params.id);
    if (r.status !== 'resolved') fail(400, 'Essa denúncia já está aberta');
    if (r.evidence?.includes('"expired":true')) fail(400, 'A prova dessa denúncia já foi apagada');
    run("UPDATE reports SET status = 'open', outcome = NULL, resolved_by = NULL, resolved_at = NULL WHERE id = ?", r.id);
    res.json({ ok: true });
  });

  /** Apaga a mensagem denunciada (a cópia guardada na denúncia fica) e resolve. */
  api.post('/admin/reports/:id/delete-message', async (req, res) => {
    const r = byId(req.params.id);
    if (!r.message_id || (r.kind !== 'message' && r.kind !== 'dm_message')) fail(400, 'Essa denúncia não é de uma mensagem');
    const deleted = r.kind === 'message' ? await hooks.deleteMessage(r.message_id!) : await hooks.deleteDmMessage(r.message_id!);
    if (!deleted) fail(404, 'A mensagem já foi apagada');
    resolve(r, uid(res), 'actioned', noteOf(req.body) ?? 'Mensagem apagada pela equipe');
    res.json({ ok: true });
  });

  /** Encerra a transmissão de quem foi denunciado (se ainda estiver no ar) e resolve. */
  api.post('/admin/reports/:id/stop-stream', async (req, res) => {
    const r = byId(req.params.id);
    if (r.kind !== 'stream') fail(400, 'Essa denúncia não é de uma transmissão');
    if (!(await hooks.stopStream(r.target_user_id))) fail(400, 'Essa pessoa não está transmitindo agora');
    resolve(r, uid(res), 'actioned', noteOf(req.body) ?? 'Transmissão encerrada pela equipe');
    res.json({ ok: true });
  });
}
