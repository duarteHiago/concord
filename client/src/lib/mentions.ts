// Menções, mensagens diretas e mensagens de canal: som e aviso (ver notify.ts para onde o aviso aparece).
import { useApp } from '../store/app';
import { toast } from '../store/toast';
import { effectiveLevel, useUnreads } from '../store/unreads';
import { deliverNotice } from './notify';
import { notifySettings } from './nudge';
import type { DirectChannel, Message, ThreadMeta, User } from './types';
import { threadVisible } from '../store/threads';

/** Resposta numa thread que eu sigo (ver server/src/threads.ts#onReply). */
export interface ThreadActivity {
  serverId: string;
  serverName: string;
  channelId: string;
  channelName: string;
  rootId: string;
  rootPreview: string;
  message: Message;
  thread: ThreadMeta;
}

export interface MentionEvent {
  message: Message;
  serverId: string;
  serverName: string;
  channelName: string;
  everyone: boolean;
}

/** A mensagem menciona este usuário? (para destacar o balão) */
export function mentionsMe(content: string, username: string): boolean {
  if (/(^|\s)@(todos|everyone|all)\b/i.test(content)) return true;
  return new RegExp(`(^|\\s)@${username.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(content);
}

/** Texto curto do aviso: o começo da mensagem, ou o que ela carrega quando não tem texto. */
function preview(message: Message): string {
  if (message.content) return message.content.length > 200 ? `${message.content.slice(0, 200)}…` : message.content;
  if (message.attachments?.length) return message.attachments.length > 1 ? `${message.attachments.length} arquivos` : message.attachments[0].name;
  if (message.kind === 'sticker') return 'Figurinha';
  return 'Mensagem';
}

/** Nome de quem mandou: o que vem da mensagem do webhook (se houver), senão o nome da conta. */
const authorName = (message: Message) => (message.data as { webhook?: { name?: string } } | null)?.webhook?.name || message.author.displayName;

/** Já estou olhando essa conversa com a janela em foco? Aí não precisa avisar. */
function viewingChannel(serverId: string, channelId: string) {
  const app = useApp.getState();
  return app.activeServerId === serverId && app.activeChannels[serverId] === channelId && document.hasFocus() && !document.hidden;
}

/** Nova mensagem privada: som e aviso (o clique abre a conversa). */
export function receiveDirectMessage(dm: DirectChannel, message: Message) {
  const me = useApp.getState().me;
  if (!me || !notifySettings(me).mentions) return;
  deliverNotice(
    {
      who: dm.user.displayName,
      where: 'mensagem direta',
      text: preview(message),
      avatar: { url: dm.user.avatarUrl, color: dm.user.avatarColor },
      mention: false,
      target: { dmId: dm.id },
    },
    'message',
  );
}

/** Pedido de amizade recebido: aviso no app, som e notificação (o clique abre a tela de Amigos). */
export function receiveFriendRequest(from: User) {
  const me = useApp.getState().me;
  if (!me) return;
  toast.info(`${from.displayName} quer ser seu amigo. Veja em Mensagens > Amigos.`);
  if (!notifySettings(me).mentions) return;
  deliverNotice(
    {
      who: from.displayName,
      where: 'pedido de amizade',
      text: `@${from.username} quer ser seu amigo.`,
      avatar: { url: from.avatarUrl, color: from.avatarColor },
      mention: false,
      target: { friends: true },
    },
    'mention',
  );
}

export function receiveMention(m: MentionEvent) {
  const app = useApp.getState();
  const me = app.me;
  useUnreads.getState().onMention(m.message.channelId, m.serverId);
  if (!me || !notifySettings(me).mentions) return;
  // menção dentro de uma thread só conta como vista com a thread aberta (no canal a resposta não aparece)
  const threadId = m.message.threadId;
  const seen = threadId ? threadVisible(threadId) : viewingChannel(m.serverId, m.message.channelId);
  if (seen) return;
  // servidor/canal em "nada" ou silenciado: fica só o contador
  const { level, muted } = effectiveLevel(useUnreads.getState().levels, m.serverId, m.message.channelId);
  if (muted || level === 'none') return;
  const channel = m.channelName.replace(/^#/, '');
  deliverNotice(
    {
      who: authorName(m.message),
      where: m.everyone ? `@todos em #${channel} · ${m.serverName}` : `mencionou você em #${channel} · ${m.serverName}`,
      text: preview(m.message),
      avatar: { url: m.message.author.avatarUrl, color: m.message.author.avatarColor },
      mention: true,
      // menção dentro de uma thread: o clique abre a thread
      target: { serverId: m.serverId, channelId: m.message.channelId, ...(m.message.threadId ? { threadId: m.message.threadId } : {}) },
    },
    'mention',
  );
}

/**
 * Resposta numa thread que sigo: aviso com o som de mensagem, a não ser que eu já esteja com a thread aberta, que o
 * canal esteja silenciado/em "nada", ou que a resposta me mencione (aí o aviso de menção já cuida).
 */
export function receiveThreadActivity(e: ThreadActivity) {
  const me = useApp.getState().me;
  if (!me || !notifySettings(me).mentions) return;
  if (e.message.author.id === me.id) return;
  if (threadVisible(e.rootId)) return;
  const { level, muted } = effectiveLevel(useUnreads.getState().levels, e.serverId, e.channelId);
  if (muted || level === 'none') return;
  if (mentionsMe(e.message.content, me.username)) return;
  deliverNotice(
    {
      who: authorName(e.message),
      where: `respondeu numa thread em #${e.channelName} · ${e.serverName}`,
      text: preview(e.message),
      avatar: { url: e.message.author.avatarUrl, color: e.message.author.avatarColor },
      mention: false,
      target: { serverId: e.serverId, channelId: e.channelId, threadId: e.rootId },
    },
    'message',
  );
}

/**
 * Mensagem nova num canal: só avisa se o canal (ou o servidor) está em "todas as mensagens". Menção e resposta
 * já chegam pelo evento de menção, com o som dela; aqui ficam de fora para não avisar duas vezes.
 */
export function receiveChannelMessage(message: Message) {
  const app = useApp.getState();
  const me = app.me;
  if (!me || message.author.id === me.id) return;
  const serverId = useUnreads.getState().channels[message.channelId]?.serverId;
  if (!serverId || viewingChannel(serverId, message.channelId)) return;
  const { level, muted } = effectiveLevel(useUnreads.getState().levels, serverId, message.channelId);
  if (muted || level !== 'all') return;
  const repliesToMe = !!message.replyTo && 'authorId' in message.replyTo && message.replyTo.authorId === me.id;
  if (repliesToMe || mentionsMe(message.content, me.username)) return;
  const server = app.servers.find((s) => s.id === serverId);
  const channel = app.details[serverId]?.channels.find((c) => c.id === message.channelId);
  deliverNotice(
    {
      who: authorName(message),
      where: [channel ? `#${channel.name}` : null, server?.name].filter(Boolean).join(' · '),
      text: preview(message),
      avatar: { url: message.author.avatarUrl, color: message.author.avatarColor },
      mention: false,
      target: { serverId, channelId: message.channelId },
    },
    'message',
  );
}
