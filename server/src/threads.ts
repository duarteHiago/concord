// Threads: respostas penduradas numa mensagem do canal (como no Slack). Servem, por exemplo, para tratar um incidente
// dentro da mensagem do alerta, sem encher o canal.
//
// A resposta é uma mensagem comum (messages.thread_id = a mensagem que abriu a thread), então anexos, menções,
// edição, apagar e permissões funcionam como no canal. Aqui ficam o resumo da thread (quantas respostas, a última,
// aberta/resolvida) e quem a segue: quem abriu, quem respondeu e quem foi mencionado nela seguem sozinhos e recebem
// aviso das respostas; dá para deixar de seguir.
import type { Router } from 'express';
import { P, has } from '../../shared/permissions.ts';
import { channelPermissions, getChannel, getServer, requireChannelPerm } from './access.ts';
import { all, get, run, type ChannelRow, type MessageRow, type ThreadRow } from './db.ts';
import { fail, uid } from './http.ts';
import { emitToChannel, emitToUser } from './realtime.ts';
import { absoluteUrl, pushPreview, pushTo } from './push.ts';
import { effectiveLevel } from './unreads.ts';

export type ThreadStatus = 'open' | 'resolved';

/** O resumo que vai junto da mensagem que abriu a thread (e nos eventos). */
export function threadJson(t: Pick<ThreadRow, 'id' | 'reply_count' | 'last_reply_at' | 'status' | 'resolved_by' | 'resolved_at'>) {
  return {
    id: t.id,
    replyCount: t.reply_count,
    lastReplyAt: t.last_reply_at,
    status: t.status,
    resolvedBy: t.resolved_by,
    resolvedAt: t.resolved_at,
    participants: t.reply_count > 0 ? participantsOf(t.id) : [],
  };
}

/** As fotos do resumo: até 3 pessoas que responderam, de quem respondeu por último para trás. */
function participantsOf(threadId: string) {
  return all<{ id: string; display_name: string; avatar_url: string | null; avatar_color: string }>(
    `SELECT u.id, u.display_name, u.avatar_url, u.avatar_color
       FROM (SELECT author_id, MAX(created_at) AS last FROM messages WHERE thread_id = ? GROUP BY author_id ORDER BY last DESC LIMIT 3) p
       JOIN users u ON u.id = p.author_id
      ORDER BY p.last DESC`,
    threadId,
  ).map((u) => ({ id: u.id, displayName: u.display_name, avatarUrl: u.avatar_url, avatarColor: u.avatar_color }));
}

const getThread = (id: string) => get<ThreadRow>('SELECT * FROM threads WHERE id = ?', id);

/** Cria o resumo da thread na primeira resposta (ou ao resolver uma mensagem sem respostas). */
function ensureThread(root: MessageRow): ThreadRow {
  run('INSERT OR IGNORE INTO threads (id, channel_id, created_at) VALUES (?, ?, ?)', root.id, root.channel_id, Date.now());
  return getThread(root.id)!;
}

/** A mensagem pode abrir uma thread? Do canal (não DM), que não seja ela mesma uma resposta de thread. */
export function threadRoot(rootId: unknown, channelId: string): MessageRow {
  if (typeof rootId !== 'string' || !rootId) fail(400, 'Thread inválida');
  const root = get<MessageRow>('SELECT * FROM messages WHERE id = ?', rootId as string) ?? fail(404, 'A mensagem da thread não existe mais');
  if (root.channel_id !== channelId) fail(400, 'Essa thread é de outro canal');
  if (root.thread_id) fail(400, 'Não dá para abrir uma thread dentro de outra');
  return root;
}

/** Segue a thread (sem desfazer quem deixou de seguir de propósito, a não ser que `force`). */
export function follow(threadId: string, userId: string, force = false) {
  run(
    `INSERT INTO thread_followers (thread_id, user_id, following, last_read_at) VALUES (?, ?, 1, 0)
     ON CONFLICT (thread_id, user_id) DO UPDATE SET following = CASE WHEN ? THEN 1 ELSE following END`,
    threadId,
    userId,
    force ? 1 : 0,
  );
}

function markThreadRead(threadId: string, userId: string, at: number) {
  run('UPDATE thread_followers SET last_read_at = MAX(last_read_at, ?) WHERE thread_id = ? AND user_id = ?', at, threadId, userId);
}

/** Recalcula quantas respostas e a última (depois de apagar uma resposta). */
export function recount(threadId: string) {
  const r = get<{ n: number; last: number | null }>('SELECT COUNT(*) AS n, MAX(created_at) AS last FROM messages WHERE thread_id = ?', threadId)!;
  run('UPDATE threads SET reply_count = ?, last_reply_at = ? WHERE id = ?', r.n, r.last, threadId);
  return getThread(threadId);
}

/**
 * Resposta nova: atualiza o resumo, faz quem respondeu (e quem abriu a thread, e quem foi mencionado) seguir,
 * avisa a sala (o contador na mensagem e o painel aberto) e quem segue (a aba Threads e o aviso).
 */
export async function onReply(
  channel: ChannelRow,
  root: MessageRow,
  authorId: string,
  msg: { id: string; createdAt: number; content: string; author: { displayName: string; avatarUrl: string | null }; data?: unknown; attachments?: unknown[] },
  mentioned: string[],
) {
  ensureThread(root);
  run('UPDATE threads SET reply_count = reply_count + 1, last_reply_at = ? WHERE id = ?', msg.createdAt, root.id);
  follow(root.id, authorId);
  follow(root.id, root.author_id);
  for (const id of mentioned) follow(root.id, id);
  markThreadRead(root.id, authorId, msg.createdAt);
  // quem respondeu passou a seguir (se não tinha saído de propósito): o sininho do painel dele acompanha
  const mine = get<{ following: number }>('SELECT following FROM thread_followers WHERE thread_id = ? AND user_id = ?', root.id, authorId);
  emitToUser(authorId, 'thread:follow', { rootId: root.id, following: !!mine?.following });
  const thread = threadJson(getThread(root.id)!);
  await emitToChannel(channel, 'thread:reply', { channelId: channel.id, rootId: root.id, message: msg, thread });
  const server = getServer(channel.server_id);
  const followers = all<{ user_id: string }>('SELECT user_id FROM thread_followers WHERE thread_id = ? AND following = 1 AND user_id != ?', root.id, authorId);
  for (const f of followers) {
    // quem perdeu acesso ao canal não recebe nada dele
    if (!has(channelPermissions(channel, f.user_id), P.VIEW_CHANNEL)) continue;
    // push no celular de quem segue (menos quem foi mencionado: esse já recebeu o push da menção)
    if (!mentioned.includes(f.user_id)) {
      const { level, muted } = effectiveLevel(f.user_id, channel.server_id, channel.id);
      if (!muted && level !== 'none') {
        const name = (msg.data as { webhook?: { name?: string } } | null)?.webhook?.name || msg.author.displayName;
        pushTo(f.user_id, {
          title: `${name} · thread em #${channel.name}`,
          body: pushPreview(msg.content, msg.attachments?.length ?? 0),
          tag: `th:${root.id}`,
          icon: absoluteUrl(msg.author.avatarUrl),
          target: { serverId: channel.server_id, channelId: channel.id, threadId: root.id },
        });
      }
    }
    emitToUser(f.user_id, 'thread:activity', {
      serverId: server.id,
      serverName: server.name,
      channelId: channel.id,
      channelName: channel.name,
      rootId: root.id,
      rootPreview: root.content.slice(0, 120),
      message: msg,
      thread,
    });
  }
}

/** Resolver/reabrir. Também usado pelo webhook (um alerta pode marcar o próprio incidente como resolvido). */
export async function setStatus(root: MessageRow, status: ThreadStatus, by: string | null) {
  ensureThread(root);
  run(
    'UPDATE threads SET status = ?, resolved_by = ?, resolved_at = ? WHERE id = ?',
    status,
    status === 'resolved' ? by : null,
    status === 'resolved' ? Date.now() : null,
    root.id,
  );
  const channel = getChannel(root.channel_id);
  const thread = threadJson(getThread(root.id)!);
  await emitToChannel(channel, 'thread:update', { channelId: channel.id, rootId: root.id, thread });
  return thread;
}

export function registerThreadRoutes(api: Router) {
  /** Resolver ou reabrir: quem pode escrever no canal (o incidente é de todo mundo que está tratando). */
  api.patch('/threads/:id', async (req, res) => {
    const me = uid(res);
    const root = get<MessageRow>('SELECT * FROM messages WHERE id = ?', req.params.id) ?? fail(404, 'Thread não encontrada');
    requireChannelPerm(root.channel_id, me, P.SEND_MESSAGES);
    if (root.thread_id) fail(400, 'Thread inválida');
    const status = req.body?.status;
    if (status !== 'open' && status !== 'resolved') fail(400, 'Status inválido');
    res.json(await setStatus(root, status, me));
  });

  api.put('/threads/:id/follow', (req, res) => {
    const me = uid(res);
    const root = get<MessageRow>('SELECT * FROM messages WHERE id = ?', req.params.id) ?? fail(404, 'Thread não encontrada');
    requireChannelPerm(root.channel_id, me, P.VIEW_CHANNEL);
    if (root.thread_id) fail(400, 'Thread inválida');
    ensureThread(root);
    const following = req.body?.following !== false;
    if (following) follow(root.id, me, true);
    else {
      run(
        `INSERT INTO thread_followers (thread_id, user_id, following, last_read_at) VALUES (?, ?, 0, 0)
         ON CONFLICT (thread_id, user_id) DO UPDATE SET following = 0`,
        root.id,
        me,
      );
    }
    emitToUser(me, 'thread:follow', { rootId: root.id, following });
    res.json({ following });
  });

  api.post('/threads/:id/read', (req, res) => {
    const me = uid(res);
    const thread = getThread(req.params.id) ?? fail(404, 'Thread não encontrada');
    requireChannelPerm(thread.channel_id, me, P.VIEW_CHANNEL);
    markThreadRead(thread.id, me, Date.now());
    emitToUser(me, 'thread:read', { rootId: thread.id });
    res.json({ ok: true });
  });

  /** A aba Threads: as threads que sigo, nos canais que ainda vejo, da resposta mais recente para a mais antiga. */
  api.get('/me/threads', (_req, res) => {
    const me = uid(res);
    const rows = all<
      ThreadRow & {
        following: number;
        last_read_at: number;
        root_content: string;
        root_kind: string;
        root_author: string;
        author_name: string;
        author_avatar: string | null;
        author_color: string;
        server_id: string;
      }
    >(
      `SELECT t.*, f.following, f.last_read_at, m.content AS root_content, m.kind AS root_kind, m.author_id AS root_author,
              u.display_name AS author_name, u.avatar_url AS author_avatar, u.avatar_color AS author_color, c.server_id
         FROM thread_followers f
         JOIN threads t ON t.id = f.thread_id
         JOIN messages m ON m.id = t.id
         JOIN users u ON u.id = m.author_id
         JOIN channels c ON c.id = t.channel_id
         JOIN members mb ON mb.server_id = c.server_id AND mb.user_id = f.user_id
        WHERE f.user_id = ? AND f.following = 1 AND t.reply_count > 0
        ORDER BY t.last_reply_at DESC
        LIMIT 60`,
      me,
    );
    const channels = new Map<string, ChannelRow | null>();
    const out = [];
    for (const r of rows) {
      if (!channels.has(r.channel_id)) {
        const c = get<ChannelRow>('SELECT * FROM channels WHERE id = ?', r.channel_id) ?? null;
        channels.set(r.channel_id, c && has(channelPermissions(c, me), P.VIEW_CHANNEL) ? c : null);
      }
      const channel = channels.get(r.channel_id);
      if (!channel) continue;
      out.push({
        ...threadJson(r),
        serverId: r.server_id,
        serverName: getServer(r.server_id).name,
        channelId: channel.id,
        channelName: channel.name,
        root: { content: r.root_content.slice(0, 200), authorName: r.author_name, avatarUrl: r.author_avatar, avatarColor: r.author_color },
        unread: (r.last_reply_at ?? 0) > r.last_read_at,
      });
    }
    res.json(out);
  });
}
