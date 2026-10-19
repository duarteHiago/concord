// Canais de fórum: posts com etiqueta, votos (+1), respostas e status controlado pela moderação.
import { randomUUID } from 'node:crypto';
import type { Router } from 'express';
import { FORUM_CONTENT_MAX, FORUM_REPLY_MAX, FORUM_STATUSES, FORUM_TAGS, FORUM_TITLE_MAX } from '../../shared/forum.ts';
import { P, has } from '../../shared/permissions.ts';
import { channelPermissions, getChannel, requireChannelPerm } from './access.ts';
import { all, get, run, tx, type ChannelRow, type ForumPostRow, type ForumReplyRow, type UserRow } from './db.ts';
import { fail, str, uid } from './http.ts';
import { emitToChannel, emitToUser } from './realtime.ts';

type AuthorFields = Pick<UserRow, 'username' | 'display_name' | 'avatar_color' | 'avatar_url' | 'banner_color' | 'bio' | 'banner_url' | 'is_bot' | 'profile_style'>;
type PostWithAuthor = ForumPostRow & AuthorFields;
type ReplyWithAuthor = ForumReplyRow & AuthorFields;
type AuthorJson = (u: AuthorFields & { id: string }) => unknown;

const AUTHOR_COLS = 'u.username, u.display_name, u.avatar_color, u.avatar_url, u.banner_color, u.bio, u.banner_url, u.is_bot, u.profile_style';
const POST_SELECT = `SELECT p.*, ${AUTHOR_COLS} FROM forum_posts p JOIN users u ON u.id = p.author_id`;
const REPLY_SELECT = `SELECT r.*, ${AUTHOR_COLS} FROM forum_replies r JOIN users u ON u.id = r.author_id`;

const TAG_IDS: readonly string[] = FORUM_TAGS.map((t) => t.id);
const STATUS_IDS: readonly string[] = FORUM_STATUSES.map((s) => s.id);
const now = () => Date.now();

function requireForum(channelId: string, userId: string, flag: number): ChannelRow {
  const channel = requireChannelPerm(channelId, userId, flag);
  if (channel.type !== 'forum') fail(400, 'Este canal não é um fórum');
  return channel;
}

function getPost(postId: string): ForumPostRow {
  return get<ForumPostRow>('SELECT * FROM forum_posts WHERE id = ?', postId) ?? fail(404, 'Post não encontrado');
}

/** "Em alta": votos e respostas recentes pesam mais que antigos. */
const hotScore = (p: ForumPostRow, t: number) => (p.vote_count * 2 + p.reply_count + 1) / Math.pow((t - p.created_at) / 3_600_000 + 2, 1.4);

export function registerForumRoutes(api: Router, authorJson: AuthorJson) {
  const postJson = (p: PostWithAuthor, me: string, full = false) => ({
    id: p.id,
    channelId: p.channel_id,
    title: p.title,
    ...(full ? { content: p.content } : { excerpt: p.content.replace(/\s+/g, ' ').slice(0, 220) }),
    tag: p.tag,
    status: p.status,
    pinned: !!p.pinned,
    locked: !!p.locked,
    voteCount: p.vote_count,
    replyCount: p.reply_count,
    voted: !!get('SELECT 1 FROM forum_votes WHERE post_id = ? AND user_id = ?', p.id, me),
    createdAt: p.created_at,
    editedAt: p.edited_at,
    lastActivityAt: p.last_activity_at,
    author: authorJson({ ...p, id: p.author_id }),
  });

  const replyJson = (r: ReplyWithAuthor) => ({
    id: r.id,
    postId: r.post_id,
    content: r.content,
    createdAt: r.created_at,
    editedAt: r.edited_at,
    author: authorJson({ ...r, id: r.author_id }),
  });

  /** Avisa quem está vendo o canal para recarregar a lista (e o post aberto). */
  const changed = (channel: ChannelRow, postId?: string) => void emitToChannel(channel, 'forum:changed', { channelId: channel.id, postId });

  api.get('/channels/:id/posts', (req, res) => {
    const me = uid(res);
    const channel = requireForum(req.params.id, me, P.VIEW_CHANNEL);
    const tag = TAG_IDS.includes(String(req.query.tag)) ? String(req.query.tag) : null;
    const status = STATUS_IDS.includes(String(req.query.status)) ? String(req.query.status) : null;
    const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 80) : '';
    let rows = all<PostWithAuthor>(
      `${POST_SELECT} WHERE p.channel_id = ? AND (? IS NULL OR p.tag = ?) AND (? IS NULL OR p.status = ?)
         AND (? = '' OR p.title LIKE ? OR p.content LIKE ?) ORDER BY p.last_activity_at DESC LIMIT 500`,
      channel.id,
      tag,
      tag,
      status,
      status,
      q,
      `%${q}%`,
      `%${q}%`,
    );
    const t = now();
    const sort = String(req.query.sort ?? 'hot');
    const by: Record<string, (a: ForumPostRow, b: ForumPostRow) => number> = {
      hot: (a, b) => hotScore(b, t) - hotScore(a, t),
      top: (a, b) => b.vote_count - a.vote_count || b.created_at - a.created_at,
      new: (a, b) => b.created_at - a.created_at,
      active: (a, b) => b.last_activity_at - a.last_activity_at,
    };
    rows = rows.sort((a, b) => b.pinned - a.pinned || (by[sort] ?? by.hot)(a, b)).slice(0, 200);
    res.json(rows.map((p) => postJson(p, me)));
  });

  api.post('/channels/:id/posts', (req, res) => {
    const me = uid(res);
    const channel = requireForum(req.params.id, me, P.SEND_MESSAGES);
    const title = str(req.body?.title, 'título', 3, FORUM_TITLE_MAX);
    const content = str(req.body?.content, 'texto', 1, FORUM_CONTENT_MAX);
    const tag = TAG_IDS.includes(req.body?.tag) ? (req.body.tag as string) : 'outro';
    const id = randomUUID();
    const t = now();
    run(
      `INSERT INTO forum_posts (id, channel_id, author_id, title, content, tag, created_at, last_activity_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      channel.id,
      me,
      title,
      content,
      tag,
      t,
      t,
    );
    // quem posta já vota na própria ideia
    run('INSERT INTO forum_votes (post_id, user_id) VALUES (?, ?)', id, me);
    run('UPDATE forum_posts SET vote_count = 1 WHERE id = ?', id);
    changed(channel, id);
    res.json(postJson(get<PostWithAuthor>(`${POST_SELECT} WHERE p.id = ?`, id)!, me, true));
  });

  api.get('/posts/:id', (req, res) => {
    const me = uid(res);
    const post = getPost(req.params.id);
    requireForum(post.channel_id, me, P.VIEW_CHANNEL);
    const replies = all<ReplyWithAuthor>(`${REPLY_SELECT} WHERE r.post_id = ? ORDER BY r.created_at`, post.id);
    res.json({ ...postJson(get<PostWithAuthor>(`${POST_SELECT} WHERE p.id = ?`, post.id)!, me, true), replies: replies.map(replyJson) });
  });

  api.patch('/posts/:id', (req, res) => {
    const me = uid(res);
    const post = getPost(req.params.id);
    const channel = requireForum(post.channel_id, me, P.VIEW_CHANNEL);
    const mod = has(channelPermissions(channel, me), P.MANAGE_MESSAGES);
    const mine = post.author_id === me;
    const b = req.body ?? {};
    const editsText = b.title !== undefined || b.content !== undefined;
    if (editsText && !mine) fail(403, 'Só quem escreveu pode editar o post');
    if ((b.status !== undefined || b.pinned !== undefined || b.locked !== undefined) && !mod) fail(403, 'Só a moderação muda status, fixa ou tranca posts');
    if (b.tag !== undefined && !mine && !mod) fail(403, 'Sem permissão');

    if (b.title !== undefined) run('UPDATE forum_posts SET title = ?, edited_at = ? WHERE id = ?', str(b.title, 'título', 3, FORUM_TITLE_MAX), now(), post.id);
    if (b.content !== undefined) run('UPDATE forum_posts SET content = ?, edited_at = ? WHERE id = ?', str(b.content, 'texto', 1, FORUM_CONTENT_MAX), now(), post.id);
    if (b.tag !== undefined && TAG_IDS.includes(b.tag)) run('UPDATE forum_posts SET tag = ? WHERE id = ?', b.tag, post.id);
    if (b.pinned !== undefined) run('UPDATE forum_posts SET pinned = ? WHERE id = ?', b.pinned ? 1 : 0, post.id);
    if (b.locked !== undefined) run('UPDATE forum_posts SET locked = ? WHERE id = ?', b.locked ? 1 : 0, post.id);
    if (b.status !== undefined) {
      if (!STATUS_IDS.includes(b.status)) fail(400, 'Status inválido');
      if (b.status !== post.status) {
        run('UPDATE forum_posts SET status = ?, last_activity_at = ? WHERE id = ?', b.status, now(), post.id);
        // quem postou fica sabendo que a ideia andou
        if (!mine) emitToUser(post.author_id, 'forum:status', { postId: post.id, channelId: channel.id, serverId: channel.server_id, title: post.title, status: b.status });
      }
    }
    changed(channel, post.id);
    res.json(postJson(get<PostWithAuthor>(`${POST_SELECT} WHERE p.id = ?`, post.id)!, me, true));
  });

  api.delete('/posts/:id', (req, res) => {
    const me = uid(res);
    const post = getPost(req.params.id);
    const channel =
      post.author_id === me ? requireForum(post.channel_id, me, P.VIEW_CHANNEL) : requireForum(post.channel_id, me, P.MANAGE_MESSAGES);
    run('DELETE FROM forum_posts WHERE id = ?', post.id);
    changed(channel, post.id);
    res.json({ ok: true });
  });

  api.post('/posts/:id/vote', (req, res) => {
    const me = uid(res);
    const post = getPost(req.params.id);
    const channel = requireForum(post.channel_id, me, P.VIEW_CHANNEL);
    const on = req.body?.on !== false;
    tx(() => {
      if (on) run('INSERT OR IGNORE INTO forum_votes (post_id, user_id) VALUES (?, ?)', post.id, me);
      else run('DELETE FROM forum_votes WHERE post_id = ? AND user_id = ?', post.id, me);
      run('UPDATE forum_posts SET vote_count = (SELECT COUNT(*) FROM forum_votes WHERE post_id = ?) WHERE id = ?', post.id, post.id);
    });
    changed(channel, post.id);
    const count = get<{ vote_count: number }>('SELECT vote_count FROM forum_posts WHERE id = ?', post.id)!.vote_count;
    res.json({ voted: on, voteCount: count });
  });

  api.post('/posts/:id/replies', (req, res) => {
    const me = uid(res);
    const post = getPost(req.params.id);
    const channel = requireForum(post.channel_id, me, P.SEND_MESSAGES);
    if (post.locked && !has(channelPermissions(channel, me), P.MANAGE_MESSAGES)) fail(403, 'Este post foi trancado pela moderação');
    const content = str(req.body?.content, 'resposta', 1, FORUM_REPLY_MAX);
    const id = randomUUID();
    const t = now();
    tx(() => {
      run('INSERT INTO forum_replies (id, post_id, author_id, content, created_at) VALUES (?, ?, ?, ?, ?)', id, post.id, me, content, t);
      run('UPDATE forum_posts SET reply_count = reply_count + 1, last_activity_at = ? WHERE id = ?', t, post.id);
    });
    const reply = replyJson(get<ReplyWithAuthor>(`${REPLY_SELECT} WHERE r.id = ?`, id)!);
    if (post.author_id !== me) {
      emitToUser(post.author_id, 'forum:reply', { postId: post.id, channelId: channel.id, serverId: channel.server_id, title: post.title, reply });
    }
    changed(channel, post.id);
    res.json(reply);
  });

  const getReply = (id: string) => get<ForumReplyRow>('SELECT * FROM forum_replies WHERE id = ?', id) ?? fail(404, 'Resposta não encontrada');

  api.patch('/forum-replies/:id', (req, res) => {
    const me = uid(res);
    const reply = getReply(req.params.id);
    if (reply.author_id !== me) fail(403, 'Você só pode editar suas respostas');
    const post = getPost(reply.post_id);
    const channel = requireForum(post.channel_id, me, P.SEND_MESSAGES);
    run('UPDATE forum_replies SET content = ?, edited_at = ? WHERE id = ?', str(req.body?.content, 'resposta', 1, FORUM_REPLY_MAX), now(), reply.id);
    changed(channel, post.id);
    res.json(replyJson(get<ReplyWithAuthor>(`${REPLY_SELECT} WHERE r.id = ?`, reply.id)!));
  });

  api.delete('/forum-replies/:id', (req, res) => {
    const me = uid(res);
    const reply = getReply(req.params.id);
    const post = getPost(reply.post_id);
    const channel = getChannel(post.channel_id);
    if (reply.author_id === me) requireForum(channel.id, me, P.VIEW_CHANNEL);
    else requireForum(channel.id, me, P.MANAGE_MESSAGES);
    tx(() => {
      run('DELETE FROM forum_replies WHERE id = ?', reply.id);
      run('UPDATE forum_posts SET reply_count = MAX(0, reply_count - 1) WHERE id = ?', post.id);
    });
    changed(channel, post.id);
    res.json({ ok: true });
  });
}
