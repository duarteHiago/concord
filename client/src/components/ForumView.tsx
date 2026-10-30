import { ArrowLeft, ChevronUp, Lock, MessageSquare, MessagesSquare, Pencil, Pin, Plus, Search, Trash2, Unlock, Users } from 'lucide-react';
import { useCallback, useEffect, useState, type FormEvent, type KeyboardEvent, type MouseEvent } from 'react';
import { FORUM_CONTENT_MAX, FORUM_REPLY_MAX, FORUM_STATUSES, FORUM_TAGS, FORUM_TITLE_MAX } from '../../../shared/forum.ts';
import { P, has } from '../../../shared/permissions.ts';
import { api } from '../lib/api';
import type { Channel, ForumPost, ForumReply, User } from '../lib/types';
import { useActiveDetail, useApp } from '../store/app';
import { profileTriggers } from '../store/popover';
import { toast } from '../store/toast';
import { RichText } from './ChatView';
import { Avatar, Button, IconButton, Spinner, cx } from './ui';

type Sort = 'hot' | 'top' | 'new' | 'active';
const SORTS: { id: Sort; label: string }[] = [
  { id: 'hot', label: 'Em alta' },
  { id: 'top', label: 'Mais votados' },
  { id: 'new', label: 'Recentes' },
  { id: 'active', label: 'Com atividade' },
];

const STATUS_STYLE: Record<string, string> = {
  aberto: 'bg-surface-4 text-fg-muted',
  analise: 'bg-[#f5c451]/15 text-[#f5c451]',
  planejado: 'bg-accent-2/15 text-accent-2',
  andamento: 'bg-[#60a5fa]/15 text-[#60a5fa]',
  feito: 'bg-ok/15 text-ok',
  recusado: 'bg-danger/15 text-danger',
};

const tagInfo = (id: string) => FORUM_TAGS.find((t) => t.id === id) ?? FORUM_TAGS[FORUM_TAGS.length - 1];
const statusLabel = (id: string) => FORUM_STATUSES.find((s) => s.id === id)?.label ?? id;

function timeAgo(t: number) {
  const s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 60) return 'agora';
  if (s < 3600) return `há ${Math.floor(s / 60)} min`;
  if (s < 86400) return `há ${Math.floor(s / 3600)} h`;
  if (s < 86400 * 30) return `há ${Math.floor(s / 86400)} d`;
  return new Date(t).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Recarrega quando alguém mexe no fórum (post novo, voto, resposta, status). */
function useForumEvents(channelId: string, onChange: (postId?: string) => void) {
  useEffect(() => {
    const fn = (e: Event) => {
      const d = (e as CustomEvent<{ channelId: string; postId?: string }>).detail;
      if (d.channelId === channelId) onChange(d.postId);
    };
    window.addEventListener('concord:forum', fn);
    return () => window.removeEventListener('concord:forum', fn);
  }, [channelId, onChange]);
}

export function ForumView({ channel }: { channel: Channel }) {
  const toggleMemberList = useApp((s) => s.toggleMemberList);
  const memberListOpen = useApp((s) => s.memberListOpen);
  const [openId, setOpenId] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);
  const canPost = has(channel.permissions, P.SEND_MESSAGES);

  // trocar de canal volta para a lista
  useEffect(() => {
    setOpenId(null);
    setComposing(false);
  }, [channel.id]);

  return (
    <>
      <header className="flex shrink-0 items-center gap-3 px-6 pt-5 pb-3">
        <MessagesSquare size={24} className="text-fg-subtle" />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-2xl font-bold">{channel.name}</h1>
          {channel.topic && <p className="truncate text-sm text-fg-muted">{channel.topic}</p>}
        </div>
        {canPost && !composing && (
          <Button
            onClick={() => {
              setOpenId(null);
              setComposing(true);
            }}
          >
            <Plus size={16} /> Novo post
          </Button>
        )}
        <IconButton label="Lista de membros" active={memberListOpen} className="h-10 w-10" onClick={toggleMemberList}>
          <Users size={20} />
        </IconButton>
      </header>
      {composing ? (
        <PostEditor
          channel={channel}
          onCancel={() => setComposing(false)}
          onSaved={(p) => {
            setComposing(false);
            setOpenId(p.id);
          }}
        />
      ) : openId ? (
        <PostDetail channel={channel} postId={openId} onBack={() => setOpenId(null)} />
      ) : (
        <PostList channel={channel} onOpen={setOpenId} onCompose={canPost ? () => setComposing(true) : undefined} />
      )}
    </>
  );
}

// ------------------------------------------------------------------ lista

function PostList({ channel, onOpen, onCompose }: { channel: Channel; onOpen: (id: string) => void; onCompose?: () => void }) {
  const [sort, setSort] = useState<Sort>('hot');
  const [tag, setTag] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [posts, setPosts] = useState<ForumPost[] | null>(null);

  const load = useCallback(() => {
    const params = new URLSearchParams({ sort });
    if (tag) params.set('tag', tag);
    if (status) params.set('status', status);
    if (q.trim()) params.set('q', q.trim());
    api
      .get<ForumPost[]>(`/channels/${channel.id}/posts?${params}`)
      .then(setPosts)
      .catch((e) => {
        toast.error(e);
        setPosts([]);
      });
  }, [channel.id, sort, tag, status, q]);

  useEffect(() => {
    const t = setTimeout(load, q ? 250 : 0);
    return () => clearTimeout(t);
  }, [load, q]);
  useForumEvents(channel.id, load);

  const pill = (on: boolean) =>
    cx('h-8 shrink-0 rounded-full px-3 text-sm font-semibold transition-colors', on ? 'bg-fg text-surface-1' : 'bg-surface-3 text-fg-muted hover:text-fg');

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6">
      <div className="sticky top-0 z-10 -mx-6 space-y-2 bg-surface-2/95 px-6 pt-1 pb-3 backdrop-blur">
        <div className="flex flex-wrap items-center gap-2">
          {SORTS.map((s) => (
            <button key={s.id} className={pill(sort === s.id)} onClick={() => setSort(s.id)} aria-pressed={sort === s.id}>
              {s.label}
            </button>
          ))}
          <label className="ml-auto flex h-8 min-w-[180px] flex-1 items-center gap-2 rounded-full bg-surface-3 px-3 sm:max-w-[260px]">
            <Search size={14} className="shrink-0 text-fg-subtle" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar posts"
              aria-label="Buscar posts"
              className="w-full bg-transparent text-sm outline-none placeholder:text-fg-subtle"
            />
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button className={pill(tag === null)} onClick={() => setTag(null)} aria-pressed={tag === null}>
            Todas
          </button>
          {FORUM_TAGS.map((t) => (
            <button key={t.id} className={pill(tag === t.id)} onClick={() => setTag(tag === t.id ? null : t.id)} aria-pressed={tag === t.id}>
              {t.emoji} {t.label}
            </button>
          ))}
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            aria-label="Filtrar por status"
            className="ml-auto h-8 rounded-full bg-surface-3 px-3 text-sm font-semibold text-fg-muted outline-none"
          >
            <option value="">Qualquer status</option>
            {FORUM_STATUSES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {posts === null ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : posts.length === 0 ? (
        <div className="py-16 text-center">
          <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-[22px] bg-surface-3">
            <MessagesSquare size={30} />
          </div>
          <h2 className="text-xl font-bold">{q || tag || status ? 'Nada encontrado' : 'Nenhum post ainda'}</h2>
          <p className="mt-1 text-sm text-fg-muted">{q || tag || status ? 'Tente outros filtros.' : 'Que tal começar a conversa?'}</p>
          {onCompose && !q && !tag && !status && (
            <Button className="mt-4" onClick={onCompose}>
              <Plus size={16} /> Criar o primeiro post
            </Button>
          )}
        </div>
      ) : (
        <ul className="space-y-2">
          {posts.map((p) => (
            <li key={p.id}>
              <PostCard post={p} onOpen={() => onOpen(p.id)} onVoted={(v) => setPosts((cur) => cur?.map((x) => (x.id === p.id ? { ...x, ...v } : x)) ?? cur)} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function TagPill({ tag }: { tag: string }) {
  const t = tagInfo(tag);
  return (
    <span className="inline-flex h-6 items-center gap-1 rounded-full bg-surface-4 px-2 text-xs font-semibold text-fg-muted">
      {t.emoji} {t.label}
    </span>
  );
}

function StatusPill({ status }: { status: string }) {
  if (status === 'aberto') return null;
  return <span className={cx('inline-flex h-6 items-center rounded-full px-2 text-xs font-bold', STATUS_STYLE[status])}>{statusLabel(status)}</span>;
}

function VoteButton({ post, onVoted, big = false }: { post: ForumPost; onVoted: (v: { voted: boolean; voteCount: number }) => void; big?: boolean }) {
  const [busy, setBusy] = useState(false);
  async function vote(e: MouseEvent) {
    e.stopPropagation();
    if (busy) return;
    setBusy(true);
    const next = !post.voted;
    onVoted({ voted: next, voteCount: post.voteCount + (next ? 1 : -1) }); // otimista
    try {
      onVoted(await api.post<{ voted: boolean; voteCount: number }>(`/posts/${post.id}/vote`, { on: next }));
    } catch (err) {
      onVoted({ voted: post.voted, voteCount: post.voteCount });
      toast.error(err);
    }
    setBusy(false);
  }
  return (
    <button
      onClick={vote}
      aria-pressed={post.voted}
      title={post.voted ? 'Tirar seu voto' : 'Votar (+1)'}
      aria-label={`${post.voted ? 'Tirar seu voto' : 'Votar'}: ${post.voteCount} votos`}
      className={cx(
        'flex shrink-0 flex-col items-center justify-center rounded-2xl font-display font-bold transition-colors',
        big ? 'h-16 w-14 text-lg' : 'h-14 w-12 text-sm',
        post.voted ? 'bg-accent text-on-accent' : 'bg-surface-3 text-fg-muted hover:bg-surface-4 hover:text-fg',
      )}
    >
      <ChevronUp size={big ? 22 : 18} strokeWidth={3} />
      {post.voteCount}
    </button>
  );
}

function PostCard({ post, onOpen, onVoted }: { post: ForumPost; onOpen: () => void; onVoted: (v: { voted: boolean; voteCount: number }) => void }) {
  return (
    // o cartão todo abre o post com o mouse; pelo teclado, o título é o botão (sem botão dentro de botão)
    <div onClick={onOpen} className="flex cursor-pointer gap-3 rounded-[20px] bg-surface-3/50 p-3 transition-colors hover:bg-surface-3">
      <VoteButton post={post} onVoted={onVoted} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          {post.pinned && <Pin size={14} className="text-accent" aria-label="Fixado" />}
          {post.locked && <Lock size={13} className="text-fg-subtle" aria-label="Trancado" />}
          <h3 className="min-w-0 truncate font-display text-base font-bold">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onOpen();
              }}
              className="max-w-full truncate text-left hover:underline"
            >
              {post.title}
            </button>
          </h3>
        </div>
        {post.excerpt && <p className="mt-0.5 line-clamp-2 text-sm text-fg-muted">{post.excerpt}</p>}
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-fg-subtle">
          <TagPill tag={post.tag} />
          <StatusPill status={post.status} />
          <span className="flex items-center gap-1.5">
            <Avatar name={post.author.displayName} color={post.author.avatarColor} src={post.author.avatarUrl} size={18} />
            {post.author.displayName}
          </span>
          <span>· {timeAgo(post.createdAt)}</span>
          <span className="ml-auto flex items-center gap-1">
            <MessageSquare size={13} /> {post.replyCount}
          </span>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ criar / editar

function PostEditor({ channel, post, onCancel, onSaved }: { channel: Channel; post?: ForumPost; onCancel: () => void; onSaved: (p: ForumPost) => void }) {
  const [title, setTitle] = useState(post?.title ?? '');
  const [content, setContent] = useState(post?.content ?? '');
  const [tag, setTag] = useState<string>(post?.tag ?? (channel.name.includes('bug') ? 'bug' : channel.name.includes('ajuda') ? 'pergunta' : channel.name.includes('feedback') ? 'feedback' : 'ideia'));
  const [saving, setSaving] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const saved = post
        ? await api.patch<ForumPost>(`/posts/${post.id}`, { title, content, tag })
        : await api.post<ForumPost>(`/channels/${channel.id}/posts`, { title, content, tag });
      onSaved(saved);
    } catch (err) {
      toast.error(err);
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 pb-6">
      <button type="button" onClick={onCancel} className="flex items-center gap-1.5 text-sm font-semibold text-fg-muted hover:text-fg">
        <ArrowLeft size={16} /> Voltar
      </button>
      <h2 className="text-xl font-bold">{post ? 'Editar post' : 'Novo post'}</h2>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Etiqueta">
        {FORUM_TAGS.map((t) => (
          <button
            type="button"
            key={t.id}
            onClick={() => setTag(t.id)}
            aria-pressed={tag === t.id}
            className={cx('h-9 rounded-full px-4 text-sm font-semibold transition-colors', tag === t.id ? 'bg-accent text-on-accent' : 'bg-surface-3 text-fg-muted hover:text-fg')}
          >
            {t.emoji} {t.label}
          </button>
        ))}
      </div>
      <label className="block">
        <span className="mb-1.5 block text-xs font-bold text-fg-muted">Título</span>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          minLength={3}
          maxLength={FORUM_TITLE_MAX}
          autoFocus
          placeholder={tag === 'bug' ? 'Ex.: o áudio da live corta quando troco de janela' : 'Ex.: deixar escolher a cor de cada sala'}
          className="h-12 w-full rounded-2xl border border-transparent bg-surface-3 px-4 text-base font-semibold outline-none placeholder:font-normal placeholder:text-fg-subtle focus:border-accent"
        />
      </label>
      <label className="block">
        <span className="mb-1.5 block text-xs font-bold text-fg-muted">Detalhes</span>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          required
          maxLength={FORUM_CONTENT_MAX}
          rows={9}
          placeholder={
            tag === 'bug'
              ? 'O que aconteceu? O que você esperava? Como repetir? (app desktop ou navegador, Windows/Mac...)'
              : 'Explique a ideia: qual problema ela resolve e como você imagina que funcione.'
          }
          className="w-full resize-y rounded-2xl border border-transparent bg-surface-3 p-4 text-sm leading-relaxed outline-none placeholder:text-fg-subtle focus:border-accent"
        />
        <span className="mt-1 block text-right text-xs text-fg-subtle">
          {content.length}/{FORUM_CONTENT_MAX}
        </span>
      </label>
      <div className="flex gap-2">
        <Button type="submit" loading={saving}>
          {post ? 'Salvar' : 'Publicar'}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}

// ------------------------------------------------------------------ post aberto

function AuthorLine({ author, at, edited }: { author: User; at: number; edited: number | null }) {
  const detail = useActiveDetail();
  return (
    <button
      className="flex items-center gap-2 text-left text-sm"
      {...profileTriggers(author.id, detail?.server.id, () => useApp.getState().openProfile(author.id, detail?.server.id ?? null))}
    >
      <Avatar name={author.displayName} color={author.avatarColor} src={author.avatarUrl} frame={author.frame} size={30} />
      <span className="font-semibold text-fg hover:underline">{author.displayName}</span>
      <span className="text-xs text-fg-subtle">
        {timeAgo(at)}
        {edited ? ' · editado' : ''}
      </span>
    </button>
  );
}

function PostDetail({ channel, postId, onBack }: { channel: Channel; postId: string; onBack: () => void }) {
  const me = useApp((s) => s.me)!;
  const openModal = useApp((s) => s.openModal);
  const [post, setPost] = useState<ForumPost | null>(null);
  const [editing, setEditing] = useState(false);
  const mod = has(channel.permissions, P.MANAGE_MESSAGES);
  const canReply = has(channel.permissions, P.SEND_MESSAGES);

  const load = useCallback(() => {
    api.get<ForumPost>(`/posts/${postId}`).then(setPost, (e) => {
      toast.error(e);
      onBack();
    });
  }, [postId, onBack]);
  useEffect(load, [load]);
  useForumEvents(
    channel.id,
    useCallback((id?: string) => id === postId && load(), [postId, load]),
  );

  if (!post) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Spinner />
      </div>
    );
  }
  if (editing) {
    return (
      <PostEditor
        channel={channel}
        post={post}
        onCancel={() => setEditing(false)}
        onSaved={(p) => {
          setPost({ ...post, ...p });
          setEditing(false);
        }}
      />
    );
  }

  const mine = post.author.id === me.id;
  const update = (patch: Record<string, unknown>) =>
    api.patch<ForumPost>(`/posts/${post.id}`, patch).then((p) => setPost({ ...post, ...p }), toast.error);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6">
      <button onClick={onBack} className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-fg-muted hover:text-fg">
        <ArrowLeft size={16} /> Todos os posts
      </button>

      <article className="rounded-[24px] bg-surface-3/50 p-5">
        <div className="flex gap-4">
          <VoteButton post={post} big onVoted={(v) => setPost({ ...post, ...v })} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <TagPill tag={post.tag} />
              <StatusPill status={post.status} />
              {post.pinned && (
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-accent">
                  <Pin size={12} /> Fixado
                </span>
              )}
              {post.locked && (
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-fg-subtle">
                  <Lock size={12} /> Trancado
                </span>
              )}
            </div>
            <h2 className="mt-2 font-display text-2xl leading-tight font-bold break-words">{post.title}</h2>
            <div className="mt-2">
              <AuthorLine author={post.author} at={post.createdAt} edited={post.editedAt} />
            </div>
          </div>
          <div className="flex shrink-0 items-start gap-1">
            {mine && (
              <IconButton label="Editar post" className="h-9 w-9" onClick={() => setEditing(true)}>
                <Pencil size={16} />
              </IconButton>
            )}
            {(mine || mod) && (
              <IconButton
                label="Apagar post"
                danger
                className="h-9 w-9"
                onClick={() =>
                  openModal({
                    type: 'confirm',
                    title: 'Apagar post',
                    message: `"${post.title}" e todas as respostas serão apagados.`,
                    confirmLabel: 'Apagar',
                    danger: true,
                    onConfirm: async () => {
                      await api.del(`/posts/${post.id}`);
                      onBack();
                    },
                  })
                }
              >
                <Trash2 size={16} />
              </IconButton>
            )}
          </div>
        </div>
        <div className="mt-4 text-[15px] leading-relaxed wrap-anywhere whitespace-pre-wrap">
          <RichText text={post.content ?? ''} />
        </div>

        {mod && (
          <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-line pt-4">
            <span className="text-xs font-bold text-fg-subtle">Moderação</span>
            <select
              value={post.status}
              onChange={(e) => void update({ status: e.target.value })}
              aria-label="Status do post"
              className="h-8 rounded-full bg-surface-4 px-3 text-sm font-semibold outline-none"
            >
              {FORUM_STATUSES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
            <Button variant="secondary" className="h-8 px-3" onClick={() => void update({ pinned: !post.pinned })}>
              <Pin size={14} /> {post.pinned ? 'Desafixar' : 'Fixar'}
            </Button>
            <Button variant="secondary" className="h-8 px-3" onClick={() => void update({ locked: !post.locked })}>
              {post.locked ? <Unlock size={14} /> : <Lock size={14} />} {post.locked ? 'Destrancar' : 'Trancar'}
            </Button>
          </div>
        )}
      </article>

      <h3 className="mt-6 mb-3 text-sm font-bold text-fg-muted">
        {post.replyCount === 0 ? 'Nenhuma resposta ainda' : `${post.replyCount} ${post.replyCount === 1 ? 'resposta' : 'respostas'}`}
      </h3>
      <ul className="space-y-3">
        {(post.replies ?? []).map((r) => (
          <ReplyItem key={r.id} reply={r} mine={r.author.id === me.id} mod={mod} onChanged={load} />
        ))}
      </ul>

      {post.locked && !mod ? (
        <p className="mt-5 flex items-center gap-2 rounded-2xl bg-surface-3/50 p-4 text-sm text-fg-muted">
          <Lock size={15} /> A moderação trancou este post para novas respostas.
        </p>
      ) : (
        canReply && <ReplyComposer postId={post.id} onSent={load} />
      )}
    </div>
  );
}

function ReplyItem({ reply, mine, mod, onChanged }: { reply: ForumReply; mine: boolean; mod: boolean; onChanged: () => void }) {
  const openModal = useApp((s) => s.openModal);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(reply.content);

  async function save() {
    try {
      await api.patch(`/forum-replies/${reply.id}`, { content: text });
      setEditing(false);
      onChanged();
    } catch (err) {
      toast.error(err);
    }
  }

  return (
    <li className="group rounded-[20px] bg-surface-3/30 p-4">
      <div className="flex items-center justify-between gap-2">
        <AuthorLine author={reply.author} at={reply.createdAt} edited={reply.editedAt} />
        <div className="flex gap-1 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
          {mine && !editing && (
            <IconButton label="Editar resposta" className="h-8 w-8" onClick={() => setEditing(true)}>
              <Pencil size={14} />
            </IconButton>
          )}
          {(mine || mod) && (
            <IconButton
              label="Apagar resposta"
              danger
              className="h-8 w-8"
              onClick={() =>
                openModal({
                  type: 'confirm',
                  title: 'Apagar resposta',
                  message: 'A resposta será apagada para todo mundo.',
                  confirmLabel: 'Apagar',
                  danger: true,
                  onConfirm: async () => {
                    await api.del(`/forum-replies/${reply.id}`);
                    onChanged();
                  },
                })
              }
            >
              <Trash2 size={14} />
            </IconButton>
          )}
        </div>
      </div>
      {editing ? (
        <div className="mt-2 space-y-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={FORUM_REPLY_MAX}
            rows={3}
            aria-label="Editar resposta"
            className="w-full resize-y rounded-2xl border border-accent bg-surface-3 p-3 text-sm outline-none"
          />
          <div className="flex gap-2">
            <Button className="h-8 px-4" onClick={() => void save()} disabled={!text.trim()}>
              Salvar
            </Button>
            <Button variant="ghost" className="h-8 px-4" onClick={() => setEditing(false)}>
              Cancelar
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-2 text-sm leading-relaxed wrap-anywhere whitespace-pre-wrap">
          <RichText text={reply.content} />
        </div>
      )}
    </li>
  );
}

function ReplyComposer({ postId, onSent }: { postId: string; onSent: () => void }) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);

  async function send() {
    if (!text.trim() || sending) return;
    setSending(true);
    try {
      await api.post(`/posts/${postId}/replies`, { content: text.trim() });
      setText('');
      onSent();
    } catch (err) {
      toast.error(err);
    }
    setSending(false);
  }

  function onKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      void send();
    }
  }

  return (
    <div className="mt-5 rounded-[20px] bg-surface-3/50 p-3">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKey}
        maxLength={FORUM_REPLY_MAX}
        rows={3}
        placeholder="Escreva uma resposta..."
        aria-label="Sua resposta"
        className="w-full resize-y rounded-2xl bg-surface-3 p-3 text-sm outline-none placeholder:text-fg-subtle focus:ring-1 focus:ring-accent"
      />
      <div className="mt-2 flex items-center justify-between">
        <span className="text-xs text-fg-subtle">Ctrl + Enter envia</span>
        <Button className="h-9" onClick={() => void send()} loading={sending} disabled={!text.trim()}>
          Responder
        </Button>
      </div>
    </div>
  );
}
