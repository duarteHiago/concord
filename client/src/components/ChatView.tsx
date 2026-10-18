import { Hash, Pencil, Trash2, Users } from 'lucide-react';
import { Fragment, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { P, has } from '../../../shared/permissions.ts';
import { api } from '../lib/api';
import { getSocket } from '../lib/socket';
import { memberName, type Channel, type Message, type ServerDetail } from '../lib/types';
import { memberColor, useActiveDetail, useApp } from '../store/app';
import { usePopover } from '../store/popover';
import { toast } from '../store/toast';
import { Avatar, IconButton, Spinner, cx } from './ui';
import { mentionsMe } from '../lib/mentions';
import { availableCommands, runCommand } from '../lib/commands';
import { GameCard, GameMenuButton } from './Games';

const EMPTY: Message[] = [];

export function ChatView({ channel }: { channel: Channel }) {
  const toggleMemberList = useApp((s) => s.toggleMemberList);
  const memberListOpen = useApp((s) => s.memberListOpen);

  return (
    <>
      <header className="flex shrink-0 items-center gap-3 px-6 pt-5 pb-3">
        <Hash size={24} className="text-fg-subtle" />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-2xl font-bold">{channel.name}</h1>
          {channel.topic && <p className="truncate text-sm text-fg-muted">{channel.topic}</p>}
        </div>
        <IconButton label="Lista de membros" active={memberListOpen} className="h-10 w-10" onClick={toggleMemberList}>
          <Users size={20} />
        </IconButton>
      </header>
      <MessageFeed channel={channel} />
      <Composer channel={channel} />
    </>
  );
}

/** Lista de mensagens em balões, com rolagem infinita para cima. */
export function MessageFeed({ channel, compact = false }: { channel: Channel; compact?: boolean }) {
  const detail = useActiveDetail()!;
  const messages = useApp((s) => s.messages[channel.id]) ?? EMPTY;
  const loaded = useApp((s) => channel.id in s.messages);
  const hasMore = useApp((s) => s.hasMore[channel.id]);
  const loadMessages = useApp((s) => s.loadMessages);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  const prevHeight = useRef(0);
  const loadingOlder = useRef(false);

  useEffect(() => {
    stickToBottom.current = true;
    if (!(channel.id in useApp.getState().messages)) void loadMessages(channel.id);
  }, [channel.id, loadMessages]);

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
    <div ref={scrollRef} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto">
      {!loaded ? (
        <div className="flex h-full items-center justify-center">
          <Spinner />
        </div>
      ) : (
        <div className={cx('flex min-h-full flex-col justify-end pb-3', compact ? 'px-4' : 'px-6')}>
          {!hasMore &&
            (compact ? (
              messages.length === 0 && <p className="pb-4 text-center text-sm text-fg-muted">Ninguém falou nada ainda. Puxa assunto!</p>
            ) : (
              <div className="pt-6 pb-4">
                <div className="mb-3 flex h-16 w-16 items-center justify-center rounded-[22px] bg-surface-3">
                  <Hash size={34} />
                </div>
                <h2 className="text-3xl font-bold">Bem-vindo a #{channel.name}!</h2>
                <p className="mt-1 text-fg-muted">Este é o começo da conversa.</p>
              </div>
            ))}
          {messages.map((m, i) => {
            const prev = messages[i - 1];
            const newDay = !prev || new Date(prev.createdAt).toDateString() !== new Date(m.createdAt).toDateString();
            const grouped = !newDay && !!prev && prev.author.id === m.author.id && m.createdAt - prev.createdAt < 5 * 60_000;
            return (
              <Fragment key={m.id}>
                {newDay && (
                  <div className="my-4 flex justify-center">
                    <span className="rounded-full bg-surface-3 px-3 py-1 text-xs font-semibold text-fg-muted">
                      {new Date(m.createdAt).toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' })}
                    </span>
                  </div>
                )}
                <Bubble detail={detail} channel={channel} message={m} grouped={grouped} compact={compact} />
              </Fragment>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Bubble({
  detail,
  channel,
  message,
  grouped,
  compact,
}: {
  detail: ServerDetail;
  channel: Channel;
  message: Message;
  grouped: boolean;
  compact: boolean;
}) {
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
  const time = new Date(message.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const size = compact ? 32 : 36;
  const isAction = message.content.startsWith('/me ');

  async function saveEdit() {
    setEditing(false);
    if (draft.trim() && draft !== message.content) {
      await api.patch(`/messages/${message.id}`, { content: draft }).catch(toast.error);
    }
  }

  const actions = !editing && (mine || canDelete) && (
    <div className="flex shrink-0 items-center gap-0.5 self-center opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
      {mine && (
        <IconButton label="Editar" className="h-8 w-8" onClick={() => { setDraft(message.content); setEditing(true); }}>
          <Pencil size={14} />
        </IconButton>
      )}
      {canDelete && (
        <IconButton label="Apagar" danger className="h-8 w-8" onClick={() => void api.del(`/messages/${message.id}`).catch(toast.error)}>
          <Trash2 size={14} />
        </IconButton>
      )}
    </div>
  );

  return (
    <div className={cx('group flex items-end gap-2.5', mine && 'flex-row-reverse', grouped ? 'mt-1' : 'mt-4')}>
      <div className="shrink-0" style={{ width: size }}>
        {!grouped && (
          <button
            aria-label={`Perfil de ${name}`}
            onClick={(e) => openPopover(message.author.id, detail.server.id, e.currentTarget.getBoundingClientRect())}
          >
            <Avatar name={name} color={avatarColor} src={avatarUrl} size={size} />
          </button>
        )}
      </div>
      <div className={cx('flex min-w-0 flex-col', mine ? 'items-end' : 'items-start', compact ? 'max-w-[82%]' : 'max-w-[70%]')}>
        {!grouped && (
          <div className={cx('mb-1 flex items-baseline gap-2 px-1', mine && 'flex-row-reverse')}>
            {!mine && (
              <span className="text-[13px] font-bold" style={{ color: memberColor(detail, message.author.id) }}>
                {name}
              </span>
            )}
            <span className="text-[11px] text-fg-subtle">{time}</span>
          </div>
        )}
        {editing ? (
          <div className="w-[min(520px,70vw)]">
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
              className="w-full resize-none rounded-2xl bg-surface-3 p-3 text-[15px] outline-none ring-2 ring-accent"
              rows={Math.min(8, draft.split('\n').length)}
            />
            <p className="px-1 text-xs text-fg-subtle">Esc cancela · Enter salva</p>
          </div>
        ) : message.kind === 'game' && message.data ? (
          <GameCard data={message.data} fresh={Date.now() - message.createdAt < 8000} author={mine ? 'Você' : name} />
        ) : (
          <div
            className={cx(
              'px-4 py-2.5 text-[15px] leading-relaxed break-words whitespace-pre-wrap',
              mine ? 'rounded-[18px] rounded-br-md bg-accent text-on-accent' : 'rounded-[18px] rounded-bl-md bg-surface-3 text-fg',
              !mine && mentionsMe(message.content, me.username) && 'ring-2 ring-accent',
              isAction && 'italic',
            )}
          >
            {isAction ? (
              <>
                <b className="not-italic">{name}</b> <RichText text={message.content.slice(4)} mine={mine} />
              </>
            ) : (
              <RichText text={message.content} mine={mine} />
            )}
            {message.editedAt && <span className="ml-1.5 text-[10px] opacity-60">(editada)</span>}
          </div>
        )}
      </div>
      {actions}
    </div>
  );
}

const URL_RE = /(https?:\/\/[^\s<]+[^\s<.,:;"')\]!?])/g;
const IMG_RE = /\.(png|jpe?g|gif|webp|avif)(\?.*)?$/i;
const MENTION_RE = /(@[a-zA-Z0-9_.]{3,32})/g;

export function RichText({ text, mine }: { text: string; mine: boolean }) {
  const parts = text.split(URL_RE);
  const images = parts.filter((p, i) => i % 2 === 1 && IMG_RE.test(p));
  return (
    <>
      {parts.map((p, i) =>
        i % 2 === 1 ? (
          <a key={i} href={p} target="_blank" rel="noreferrer noopener" className={cx('underline underline-offset-2', mine ? 'text-on-accent' : 'text-accent')}>
            {p}
          </a>
        ) : (
          <Fragment key={i}>
            {p.split(MENTION_RE).map((piece, j) =>
              j % 2 === 1 ? (
                <span key={j} className={cx('rounded-md px-1 font-semibold', mine ? 'bg-on-accent/15' : 'bg-accent/20 text-accent')}>
                  {piece}
                </span>
              ) : (
                <Fragment key={j}>{piece}</Fragment>
              ),
            )}
          </Fragment>
        ),
      )}
      {images.map((src) => (
        <a key={src} href={src} target="_blank" rel="noreferrer noopener" className="mt-2 block">
          <img src={src} alt="" loading="lazy" className="max-h-80 max-w-full rounded-xl" />
        </a>
      ))}
    </>
  );
}

interface Suggestion {
  key: string;
  label: string;
  hint: string;
  insert: string;
  avatar?: { name: string; color: string; src: string | null };
}

/** Campo de mensagem em pílula, com comandos (/), menções (@) e aviso de quem está digitando. */
export function Composer({ channel, compact = false }: { channel: Channel; compact?: boolean }) {
  const [text, setText] = useState('');
  const [selected, setSelected] = useState(0);
  const [dismissed, setDismissed] = useState(false);
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

  // ---- sugestões: "/comando" no começo, ou "@pessoa" na última palavra ----
  let suggestions: Suggestion[] = [];
  const commandMatch = /^\/(\w*)$/.exec(text);
  const mentionMatch = /(^|\s)@([\w.]*)$/.exec(text);
  if (commandMatch) {
    const q = commandMatch[1].toLowerCase();
    suggestions = availableCommands(channel)
      .filter((c) => c.name.startsWith(q))
      .map((c) => ({ key: c.name, label: c.usage, hint: c.description, insert: `/${c.name} ` }));
  } else if (mentionMatch) {
    const q = mentionMatch[2].toLowerCase();
    const people: Suggestion[] = detail.members
      .filter((m) => `${m.username} ${memberName(m)}`.toLowerCase().includes(q))
      .slice(0, 8)
      .map((m) => ({
        key: m.id,
        label: memberName(m),
        hint: `@${m.username}`,
        insert: `@${m.username} `,
        avatar: { name: memberName(m), color: m.avatarColor, src: m.avatarUrl },
      }));
    if (has(channel.permissions, P.MENTION_EVERYONE) && 'todos'.startsWith(q)) {
      people.unshift({ key: '@todos', label: '@todos', hint: 'notifica todo mundo do canal', insert: '@todos ' });
    }
    suggestions = people;
  }
  const open = !dismissed && suggestions.length > 0;
  const active = Math.min(selected, suggestions.length - 1);

  function accept(s: Suggestion) {
    if (s.insert.startsWith('/')) setText(s.insert);
    else setText(text.replace(/@[\w.]*$/, s.insert));
    setSelected(0);
  }

  async function send() {
    const content = text.trim();
    if (!content) return;
    const post = async (c: string) => {
      await api.post(`/channels/${channel.id}/messages`, { content: c });
    };
    setText('');
    try {
      if (content.startsWith('/')) {
        const handled = await runCommand(content, { detail, channel, send: post });
        if (!handled) {
          setText(content);
          toast.info('Comando desconhecido. Digite / para ver a lista.');
        }
        return;
      }
      await post(content);
    } catch (err) {
      setText(content);
      toast.error(err);
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (open) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const d = e.key === 'ArrowDown' ? 1 : -1;
        setSelected((active + d + suggestions.length) % suggestions.length);
        return;
      }
      // Tab sempre completa; Enter completa enquanto ainda está escolhendo o comando/pessoa
      if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey && suggestions[active] && text.trim() !== suggestions[active].insert.trim())) {
        e.preventDefault();
        accept(suggestions[active]);
        return;
      }
      if (e.key === 'Escape') {
        setDismissed(true);
        return;
      }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  }

  function onChange(v: string) {
    setText(v);
    setDismissed(false);
    setSelected(0);
    if (Date.now() - lastTyping.current > 3000 && v && !v.startsWith('/')) {
      lastTyping.current = Date.now();
      getSocket()?.emit('typing', { channelId: channel.id });
    }
  }

  const placeholder = !canSend
    ? 'Você não pode enviar mensagens aqui'
    : channel.type === 'voice'
      ? 'Fala com a galera…'
      : `Mensagem em #${channel.name} (/ para comandos)`;

  return (
    <div className={cx('relative shrink-0', compact ? 'px-3 pb-3' : 'px-6 pb-5')}>
      {open && (
        <div
          role="listbox"
          aria-label={commandMatch ? 'Comandos' : 'Pessoas'}
          className={cx('absolute bottom-full z-20 mb-2 max-h-72 animate-pop-in overflow-y-auto rounded-3xl bg-surface-3 p-2 shadow-2xl ring-1 ring-line', compact ? 'inset-x-3' : 'inset-x-6')}
        >
          <div className="px-3 pt-1 pb-1.5 text-xs font-bold text-fg-subtle">{commandMatch ? 'Comandos' : 'Mencionar'}</div>
          {suggestions.map((s, i) => (
            <button
              key={s.key}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setSelected(i)}
              onClick={() => accept(s)}
              className={cx('flex w-full items-center gap-3 rounded-2xl px-3 py-2 text-left', i === active ? 'bg-surface-4' : '')}
            >
              {s.avatar && <Avatar name={s.avatar.name} color={s.avatar.color} src={s.avatar.src} size={26} />}
              <span className="shrink-0 text-sm font-bold">{s.label}</span>
              <span className="truncate text-xs text-fg-muted">{s.hint}</span>
            </button>
          ))}
        </div>
      )}
      <div className="flex items-end gap-2">
        {canSend && <GameMenuButton target={{ kind: 'channel', id: channel.id }} />}
        <label className="sr-only" htmlFor={`composer-${channel.id}`}>
          Mensagem
        </label>
        <textarea
          id={`composer-${channel.id}`}
          value={text}
          disabled={!canSend}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          rows={Math.min(6, text.split('\n').length)}
          placeholder={placeholder}
          aria-autocomplete="list"
          aria-expanded={open}
          className={cx(
            'block max-h-48 min-w-0 flex-1 resize-none bg-surface-3 px-5 py-3.5 text-[15px] outline-none placeholder:text-fg-subtle focus:ring-2 focus:ring-accent/60 disabled:cursor-not-allowed',
            text.includes('\n') ? 'rounded-3xl' : 'rounded-full',
          )}
        />
      </div>
      <div className="h-5 px-4 pt-1 text-xs text-fg-muted">
        {typers.length > 0 && (
          <span className="animate-fade-in">
            <b>{typers.slice(0, 3).join(', ')}</b> {typers.length === 1 ? 'está digitando…' : 'estão digitando…'}
          </span>
        )}
      </div>
    </div>
  );
}
