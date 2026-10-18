import { memberName } from '../lib/types';
import { Hash, Pencil, Trash2, Users } from 'lucide-react';
import { Fragment, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { P, has } from '../../../shared/permissions.ts';
import { api } from '../lib/api';
import { getSocket } from '../lib/socket';
import type { Channel, Message, ServerDetail } from '../lib/types';
import { memberColor, useActiveDetail, useApp } from '../store/app';
import { usePopover } from '../store/popover';
import { toast } from '../store/toast';
import { Avatar, IconButton, Spinner, cx } from './ui';

const EMPTY: Message[] = [];

export function ChatView({ channel }: { channel: Channel }) {
  const detail = useActiveDetail()!;
  const messages = useApp((s) => s.messages[channel.id]) ?? EMPTY;
  const loaded = useApp((s) => channel.id in s.messages);
  const hasMore = useApp((s) => s.hasMore[channel.id]);
  const loadMessages = useApp((s) => s.loadMessages);
  const toggleMemberList = useApp((s) => s.toggleMemberList);
  const memberListOpen = useApp((s) => s.memberListOpen);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  const prevHeight = useRef(0);
  const loadingOlder = useRef(false);

  // mantém a rolagem no fim quando chegam mensagens novas, e a posição quando carrega antigas
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (loadingOlder.current) {
      el.scrollTop = el.scrollHeight - prevHeight.current;
      loadingOlder.current = false;
    } else if (stickToBottom.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    stickToBottom.current = true;
  }, [channel.id]);

  function onScroll() {
    const el = scrollRef.current!;
    stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    if (el.scrollTop < 60 && hasMore && !loadingOlder.current) {
      loadingOlder.current = true;
      prevHeight.current = el.scrollHeight;
      void loadMessages(channel.id, true);
    }
  }

  return (
    <>
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-line px-4 shadow-sm">
        <Hash size={22} className="text-fg-subtle" />
        <h1 className="font-bold">{channel.name}</h1>
        {channel.topic && (
          <>
            <div className="mx-2 h-6 w-px bg-line-strong" />
            <p className="truncate text-sm text-fg-muted">{channel.topic}</p>
          </>
        )}
        <div className="flex-1" />
        <IconButton label="Lista de membros" active={memberListOpen} className="h-8 w-8" onClick={toggleMemberList}>
          <Users size={20} />
        </IconButton>
      </header>

      <div ref={scrollRef} onScroll={onScroll} className="flex-1 overflow-y-auto">
        {!loaded ? (
          <div className="flex h-full items-center justify-center">
            <Spinner />
          </div>
        ) : (
          <div className="flex min-h-full flex-col justify-end pb-4">
            {!hasMore && (
              <div className="px-4 pt-8 pb-4">
                <div className="mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-surface-4">
                  <Hash size={36} />
                </div>
                <h2 className="text-3xl font-extrabold">Bem-vindo a #{channel.name}!</h2>
                <p className="mt-1 text-fg-muted">Este é o começo do canal #{channel.name}.</p>
              </div>
            )}
            <MessageList detail={detail} channel={channel} messages={messages} />
          </div>
        )}
      </div>

      <Composer channel={channel} />
    </>
  );
}

function MessageList({ detail, channel, messages }: { detail: ServerDetail; channel: Channel; messages: Message[] }) {
  return (
    <>
      {messages.map((m, i) => {
        const prev = messages[i - 1];
        const newDay = !prev || new Date(prev.createdAt).toDateString() !== new Date(m.createdAt).toDateString();
        const grouped = !newDay && prev && prev.author.id === m.author.id && m.createdAt - prev.createdAt < 5 * 60_000;
        return (
          <Fragment key={m.id}>
            {newDay && (
              <div className="mx-4 my-3 flex items-center gap-2 text-xs font-semibold text-fg-subtle">
                <div className="h-px flex-1 bg-line" />
                {new Date(m.createdAt).toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' })}
                <div className="h-px flex-1 bg-line" />
              </div>
            )}
            <MessageItem detail={detail} channel={channel} message={m} grouped={!!grouped} />
          </Fragment>
        );
      })}
    </>
  );
}

function MessageItem({ detail, channel, message, grouped }: { detail: ServerDetail; channel: Channel; message: Message; grouped: boolean }) {
  const me = useApp((s) => s.me)!;
  const openPopover = usePopover((s) => s.open);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.content);
  const mine = message.author.id === me.id;
  const canDelete = mine || has(channel.permissions, P.MANAGE_MESSAGES);
  const member = detail.members.find((x) => x.id === message.author.id);
  const name = member ? memberName(member) : message.author.displayName;
  const avatarUrl = member?.avatarUrl ?? message.author.avatarUrl;
  const avatarColor = member?.avatarColor ?? message.author.avatarColor;
  const time = new Date(message.createdAt);

  async function saveEdit() {
    setEditing(false);
    if (draft.trim() && draft !== message.content) {
      await api.patch(`/messages/${message.id}`, { content: draft }).catch(toast.error);
    }
  }

  return (
    <div className={cx('group relative flex gap-4 px-4 py-0.5 hover:bg-black/15', !grouped && 'mt-3')}>
      <div className="w-10 shrink-0">
        {grouped ? (
          <span className="hidden pt-1 text-[10px] text-fg-subtle group-hover:block">
            {time.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
          </span>
        ) : (
          <button onClick={(e) => openPopover(message.author.id, detail.server.id, e.currentTarget.getBoundingClientRect())}>
            <Avatar name={name} color={avatarColor} src={avatarUrl} size={40} />
          </button>
        )}
      </div>
      <div className="min-w-0 flex-1">
        {!grouped && (
          <div className="flex items-baseline gap-2">
            <button
              className="font-semibold hover:underline"
              style={{ color: memberColor(detail, message.author.id) }}
              onClick={(e) => openPopover(message.author.id, detail.server.id, e.currentTarget.getBoundingClientRect())}
            >
              {name}
            </button>
            <span className="text-xs text-fg-subtle">
              {time.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
        )}
        {editing ? (
          <div className="mt-1">
            <textarea
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void saveEdit();
                }
                if (e.key === 'Escape') setEditing(false);
              }}
              className="w-full resize-none rounded-lg bg-surface-4 p-2 text-[15px] outline-none"
              rows={Math.min(8, draft.split('\n').length)}
            />
            <p className="text-xs text-fg-subtle">Esc para cancelar · Enter para salvar</p>
          </div>
        ) : (
          <div className="text-[15px] leading-relaxed break-words whitespace-pre-wrap text-fg/95">
            <RichText text={message.content} />
            {message.editedAt && <span className="ml-1 text-[10px] text-fg-subtle">(editada)</span>}
          </div>
        )}
      </div>
      {!editing && (mine || canDelete) && (
        <div className="absolute -top-3 right-4 hidden rounded-lg border border-line bg-surface-3 shadow-lg group-hover:flex">
          {mine && (
            <IconButton label="Editar" className="h-8 w-8" onClick={() => { setDraft(message.content); setEditing(true); }}>
              <Pencil size={15} />
            </IconButton>
          )}
          {canDelete && (
            <IconButton label="Apagar" danger className="h-8 w-8" onClick={() => void api.del(`/messages/${message.id}`).catch(toast.error)}>
              <Trash2 size={15} />
            </IconButton>
          )}
        </div>
      )}
    </div>
  );
}

const URL_RE = /(https?:\/\/[^\s<]+[^\s<.,:;"')\]!?])/g;
const IMG_RE = /\.(png|jpe?g|gif|webp|avif)(\?.*)?$/i;

function RichText({ text }: { text: string }) {
  const parts = text.split(URL_RE);
  const images = parts.filter((p, i) => i % 2 === 1 && IMG_RE.test(p));
  return (
    <>
      {parts.map((p, i) =>
        i % 2 === 1 ? (
          <a key={i} href={p} target="_blank" rel="noreferrer noopener" className="text-accent-2 hover:underline">
            {p}
          </a>
        ) : (
          <Fragment key={i}>{p}</Fragment>
        ),
      )}
      {images.map((src) => (
        <a key={src} href={src} target="_blank" rel="noreferrer noopener" className="mt-2 block">
          <img src={src} alt="" loading="lazy" className="max-h-80 max-w-md rounded-lg border border-line" />
        </a>
      ))}
    </>
  );
}

function Composer({ channel }: { channel: Channel }) {
  const [text, setText] = useState('');
  const lastTyping = useRef(0);
  const detail = useActiveDetail()!;
  const typing = useApp((s) => s.typing[channel.id]);
  const [, force] = useState(0);
  const canSend = has(channel.permissions, P.SEND_MESSAGES);

  useEffect(() => {
    const t = setInterval(() => force((x) => x + 1), 2000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => setText(''), [channel.id]);

  const typers = Object.entries(typing ?? {})
    .filter(([, until]) => until > Date.now())
    .map(([id]) => detail.members.find((m) => m.id === id))
    .map((m) => m && memberName(m))
    .filter(Boolean) as string[];

  async function send() {
    const content = text.trim();
    if (!content) return;
    setText('');
    try {
      await api.post(`/channels/${channel.id}/messages`, { content });
    } catch (err) {
      setText(content);
      toast.error(err);
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  }

  function onChange(v: string) {
    setText(v);
    if (Date.now() - lastTyping.current > 3000 && v) {
      lastTyping.current = Date.now();
      getSocket()?.emit('typing', { channelId: channel.id });
    }
  }

  return (
    <div className="shrink-0 px-4 pb-5">
      <div className="flex items-end rounded-xl border border-line bg-surface-3 px-4 focus-within:border-line-strong">
        <textarea
          value={text}
          disabled={!canSend}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          rows={Math.min(8, text.split('\n').length)}
          placeholder={canSend ? `Conversar em #${channel.name}` : 'Você não tem permissão para enviar mensagens aqui'}
          className="max-h-60 flex-1 resize-none bg-transparent py-3 text-[15px] outline-none placeholder:text-fg-subtle disabled:cursor-not-allowed"
        />
      </div>
      <div className="h-5 pt-1 pl-1 text-xs text-fg-muted">
        {typers.length > 0 && (
          <span className="animate-fade-in">
            <b>{typers.slice(0, 3).join(', ')}</b> {typers.length === 1 ? 'está digitando…' : 'estão digitando…'}
          </span>
        )}
      </div>
    </div>
  );
}
