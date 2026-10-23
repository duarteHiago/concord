import { Gamepad2, Headphones, MessageCircle, Pencil, Search, Trash2, Zap } from 'lucide-react';
import { Fragment, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { api } from '../lib/api';
import { sendNudge } from '../lib/nudge';
import type { DirectChannel, GameData, Message, StickerMessageData } from '../lib/types';
import { useApp } from '../store/app';
import { usePopover } from '../store/popover';
import { toast } from '../store/toast';
import { AttachButton, MessageAttachments, PendingAttachments, useAttachmentDraft } from './Attachments';
import { RichText } from './ChatView';
import { GameCard, GameMenuButton } from './Games';
import { StickerButton, StickerMessage } from './StickerPicker';
import { activityLabel } from './MemberList';
import { Avatar, IconButton, Spinner, cx } from './ui';

const EMPTY: Message[] = [];

function preview(m: Message | null) {
  if (!m) return 'Nenhuma mensagem ainda';
  if (!m.content && m.attachments?.length) return m.attachments.length > 1 ? `📎 ${m.attachments.length} arquivos` : `📎 ${m.attachments[0].name}`;
  return m.content.length > 60 ? `${m.content.slice(0, 60)}…` : m.content;
}

/** Barra lateral da tela "Mensagens": lista de conversas privadas. */
export function DmSidebar() {
  const dms = useApp((s) => s.dms);
  const activeDmId = useApp((s) => s.activeDmId);
  const openDmById = useApp((s) => s.openDmById);
  const online = useApp((s) => s.online);
  const me = useApp((s) => s.me)!;
  const [query, setQuery] = useState('');
  const list = (dms ?? []).filter((d) => `${d.user.displayName} ${d.user.username}`.toLowerCase().includes(query.trim().toLowerCase()));

  return (
    <>
      <div className="px-5 pt-5 pb-3">
        <div className="font-display text-[22px] leading-tight font-bold">Mensagens</div>
        <div className="text-[13px] text-fg-muted">Conversas privadas</div>
      </div>
      <div className="relative px-3 pb-2">
        <Search size={15} className="pointer-events-none absolute top-1/2 left-6 -mt-1 -translate-y-1/2 text-fg-subtle" />
        <label className="sr-only" htmlFor="dm-search">
          Buscar conversas
        </label>
        <input
          id="dm-search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar conversa"
          className="h-10 w-full rounded-full bg-surface-3 pr-3 pl-9 text-sm outline-none placeholder:text-fg-subtle focus:ring-2 focus:ring-accent/60"
        />
      </div>
      <div className="flex-1 space-y-0.5 overflow-y-auto px-3 pb-3">
        {!dms && (
          <div className="flex justify-center py-6">
            <Spinner />
          </div>
        )}
        {dms?.length === 0 && (
          <p className="px-2 py-4 text-sm text-fg-muted">
            Para começar uma conversa, abra o perfil de alguém de um servidor e toque em <b>Mensagem</b>.
          </p>
        )}
        {list.map((d) => {
          const active = d.id === activeDmId;
          const last = d.lastMessage;
          return (
            <button
              key={d.id}
              onClick={() => openDmById(d.id)}
              className={cx('flex w-full items-center gap-3 rounded-2xl px-2.5 py-2 text-left transition-colors', active ? 'bg-surface-3' : 'hover:bg-surface-3/60')}
            >
              <Avatar name={d.user.displayName} color={d.user.avatarColor} src={d.user.avatarUrl} frame={d.user.frame} size={40} status={online[d.user.id]?.status ?? 'offline'} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className={cx('truncate text-sm', d.unread ? 'font-bold text-fg' : 'font-semibold')}>{d.user.displayName}</span>
                  {d.user.bot && <span className="rounded bg-accent-2/20 px-1 text-[9px] leading-4 font-bold text-accent-2">BOT</span>}
                </div>
                <div className={cx('truncate text-xs', d.unread ? 'text-fg' : 'text-fg-muted')}>
                  {last?.author.id === me.id ? 'Você: ' : ''}
                  {preview(last)}
                </div>
              </div>
              {d.unread > 0 && (
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1.5 text-[11px] font-bold text-on-accent">{d.unread}</span>
              )}
            </button>
          );
        })}
      </div>
    </>
  );
}

/** Painel principal da conversa privada aberta. */
export function DmView() {
  const dmId = useApp((s) => s.activeDmId);
  const dm = useApp((s) => s.dms?.find((d) => d.id === s.activeDmId));
  const markDmRead = useApp((s) => s.markDmRead);

  // marcou como lido ao voltar para a janela
  useEffect(() => {
    if (!dmId) return;
    const onFocus = () => markDmRead(dmId);
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [dmId, markDmRead]);

  if (!dm) {
    return (
      <main className="panel flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-[26px] bg-surface-3">
          <MessageCircle size={36} className="text-accent" />
        </div>
        <h1 className="text-2xl font-bold">Suas conversas</h1>
        <p className="max-w-sm text-fg-muted">Escolha uma conversa ao lado, ou abra o perfil de alguém de um servidor e toque em “Mensagem”.</p>
      </main>
    );
  }

  return (
    <main className="panel flex min-w-0 flex-1 flex-col overflow-hidden">
      <DmHeader dm={dm} />
      <DmFeed dm={dm} />
      <DmComposer dm={dm} />
    </main>
  );
}

function DmHeader({ dm }: { dm: DirectChannel }) {
  const presence = useApp((s) => s.online[dm.user.id]);
  // "Chamar atenção" precisa de um servidor em comum já carregado
  const sharedServer = useApp((s) => Object.values(s.details).find((d) => d.members.some((m) => m.id === dm.user.id)));
  const activity = presence?.activity;
  const subtitle = !presence
    ? 'Offline'
    : activity
      ? activityLabel(activity)
      : presence.customStatus || (presence.status === 'dnd' ? 'Não perturbe' : 'Online');

  return (
    <header className="flex shrink-0 items-center gap-3 px-6 pt-5 pb-3">
      <Avatar name={dm.user.displayName} color={dm.user.avatarColor} src={dm.user.avatarUrl} frame={dm.user.frame} size={42} status={presence?.status ?? 'offline'} />
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-xl font-bold">{dm.user.displayName}</h1>
        <p className="flex items-center gap-1 truncate text-sm text-fg-muted">
          {activity && (activity.type === 'playing' ? <Gamepad2 size={13} /> : <Headphones size={13} />)}
          {subtitle}
        </p>
      </div>
      {sharedServer && presence && presence.status !== 'dnd' && (
        <IconButton
          label="Chamar atenção"
          className="h-10 w-10"
          onClick={() => void sendNudge(sharedServer.server.id, dm.user.id, dm.user.displayName)}
        >
          <Zap size={18} />
        </IconButton>
      )}
    </header>
  );
}

function DmFeed({ dm }: { dm: DirectChannel }) {
  const messages = useApp((s) => s.messages[dm.id]) ?? EMPTY;
  const loaded = useApp((s) => dm.id in s.messages);
  const hasMore = useApp((s) => s.hasMore[dm.id]);
  const loadDmMessages = useApp((s) => s.loadDmMessages);
  const ref = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const prevHeight = useRef(0);
  const older = useRef(false);

  useEffect(() => {
    stick.current = true;
    if (!(dm.id in useApp.getState().messages)) void loadDmMessages(dm.id);
  }, [dm.id, loadDmMessages]);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (older.current) {
      el.scrollTop = el.scrollHeight - prevHeight.current;
      older.current = false;
    } else if (stick.current) el.scrollTop = el.scrollHeight;
  }, [messages]);

  return (
    <div
      ref={ref}
      onScroll={() => {
        const el = ref.current!;
        stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        if (el.scrollTop < 60 && hasMore && !older.current) {
          older.current = true;
          prevHeight.current = el.scrollHeight;
          void loadDmMessages(dm.id, true);
        }
      }}
      className="min-h-0 flex-1 overflow-y-auto"
    >
      {!loaded ? (
        <div className="flex h-full items-center justify-center">
          <Spinner />
        </div>
      ) : (
        <div className="flex min-h-full flex-col justify-end px-6 pb-3">
          {!hasMore && (
            <div className="pt-6 pb-4">
              <Avatar name={dm.user.displayName} color={dm.user.avatarColor} src={dm.user.avatarUrl} frame={dm.user.frame} size={72} />
              <h2 className="mt-3 text-2xl font-bold">{dm.user.displayName}</h2>
              <p className="text-fg-muted">Este é o começo da sua conversa privada com @{dm.user.username}.</p>
            </div>
          )}
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
                <DmBubble message={m} grouped={grouped} />
              </Fragment>
            );
          })}
        </div>
      )}
    </div>
  );
}

function DmBubble({ message, grouped }: { message: Message; grouped: boolean }) {
  const me = useApp((s) => s.me)!;
  const openPopover = usePopover((s) => s.open);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.content);
  const mine = message.author.id === me.id;
  const time = new Date(message.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  async function save() {
    setEditing(false);
    if ((draft.trim() || message.attachments?.length) && draft !== message.content) {
      await api.patch(`/dm-messages/${message.id}`, { content: draft }).catch(toast.error);
    }
  }

  return (
    <div className={cx('group flex items-end gap-2.5', mine && 'flex-row-reverse', grouped ? 'mt-1' : 'mt-4')}>
      <div className="w-9 shrink-0">
        {!grouped && (
          <button
            aria-label={`Perfil de ${message.author.displayName}`}
            onClick={(e) => {
              // o perfil completo depende de um servidor em comum
              const shared = Object.values(useApp.getState().details).find((d) => d.members.some((m) => m.id === message.author.id));
              if (shared) openPopover(message.author.id, shared.server.id, e.currentTarget.getBoundingClientRect());
            }}
          >
            <Avatar name={message.author.displayName} color={message.author.avatarColor} src={message.author.avatarUrl} frame={message.author.frame} size={36} />
          </button>
        )}
      </div>
      <div className={cx('flex max-w-[70%] min-w-0 flex-col', mine ? 'items-end' : 'items-start')}>
        {!grouped && <span className="mb-1 px-1 text-[11px] text-fg-subtle">{time}</span>}
        {editing ? (
          <textarea
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void save();
              }
              if (e.key === 'Escape') setEditing(false);
            }}
            rows={Math.min(8, draft.split('\n').length)}
            className="w-[min(520px,60vw)] resize-none rounded-2xl bg-surface-3 p-3 text-[15px] outline-none ring-2 ring-accent"
          />
        ) : message.kind === 'game' && message.data ? (
          <GameCard id={message.id} data={message.data as GameData} author={mine ? 'Você' : message.author.displayName} />
        ) : message.kind === 'sticker' && message.data ? (
          <StickerMessage data={message.data as StickerMessageData} mine={mine} />
        ) : (
          message.content && (
            <div
              className={cx(
                'px-4 py-2.5 text-[15px] leading-relaxed wrap-anywhere whitespace-pre-wrap',
                mine ? 'rounded-[18px] rounded-br-md bg-accent text-on-accent' : 'rounded-[18px] rounded-bl-md bg-surface-3 text-fg',
              )}
            >
              <RichText text={message.content} mine={mine} />
              {message.editedAt && <span className="ml-1.5 text-[10px] opacity-60">(editada)</span>}
            </div>
          )
        )}
        {!editing && <MessageAttachments items={message.attachments} mine={mine} />}
      </div>
      {mine && !editing && (
        <div className="flex shrink-0 items-center gap-0.5 self-center opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
          {(message.kind ?? 'text') === 'text' && (
            <IconButton label="Editar" className="h-8 w-8" onClick={() => { setDraft(message.content); setEditing(true); }}>
              <Pencil size={14} />
            </IconButton>
          )}
          <IconButton label="Apagar" danger className="h-8 w-8" onClick={() => void api.del(`/dm-messages/${message.id}`).catch(toast.error)}>
            <Trash2 size={14} />
          </IconButton>
        </div>
      )}
    </div>
  );
}

function DmComposer({ dm }: { dm: DirectChannel }) {
  const [text, setText] = useState('');
  const files = useAttachmentDraft();
  useEffect(() => {
    setText('');
    files.clear();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dm.id]);

  async function send() {
    const content = text.trim();
    if (files.uploading) return toast.info('Espere os arquivos terminarem de subir.');
    const attachments = files.ids;
    if (!content && !attachments.length) return;
    setText('');
    try {
      await api.post(`/dms/${dm.id}/messages`, { content, ...(attachments.length ? { attachments } : {}) });
      files.clear();
    } catch (err) {
      setText(content);
      toast.error(err);
    }
  }

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  };

  return (
    <div className="relative shrink-0 px-6 pb-5">
      <PendingAttachments items={files.items} onRemove={files.remove} />
      <div className="flex items-end gap-2" onDragOver={(e) => e.preventDefault()} onDrop={files.onDrop}>
        <GameMenuButton target={{ kind: 'dm', id: dm.id }} />
        <StickerButton target={{ kind: 'dm', id: dm.id }} />
        <AttachButton onFiles={files.add} />
        <label className="sr-only" htmlFor="dm-composer">
          Mensagem para {dm.user.displayName}
        </label>
        <textarea
          id="dm-composer"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          onPaste={files.onPaste}
          rows={Math.min(6, text.split('\n').length)}
          placeholder={`Mensagem para ${dm.user.displayName}`}
          className={cx(
            'block max-h-48 min-w-0 flex-1 resize-none bg-surface-3 px-5 py-3.5 text-[15px] outline-none placeholder:text-fg-subtle focus:ring-2 focus:ring-accent/60',
            text.includes('\n') ? 'rounded-3xl' : 'rounded-full',
          )}
        />
      </div>
    </div>
  );
}
