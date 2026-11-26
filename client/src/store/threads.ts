// Threads: a thread aberta no painel (respostas, se sigo), a lista da aba "Threads" (o que sigo) e os eventos em tempo
// real que mantêm tudo isso e o resumo na mensagem do canal atualizados. Ver server/src/threads.ts.
import { create } from 'zustand';
import { api } from '../lib/api';
import type { Message, ThreadMeta } from '../lib/types';
import { toast } from './toast';
import { useApp } from './app';

export interface OpenThread {
  serverId: string;
  channelId: string;
  rootId: string;
  root: Message | null;
  replies: Message[];
  following: boolean;
  loading: boolean;
  /** ainda tem respostas mais antigas para buscar (elas vêm aos poucos, ao rolar para cima) */
  hasMore: boolean;
  loadingOlder: boolean;
}

/** Uma linha da aba "Threads". */
export interface FollowedThread extends ThreadMeta {
  serverId: string;
  serverName: string;
  channelId: string;
  channelName: string;
  root: { content: string; authorName: string; avatarUrl: string | null; avatarColor: string };
  unread: boolean;
}

interface ThreadState {
  open: OpenThread | null;
  followed: FollowedThread[] | null;
  openThread: (serverId: string, channelId: string, rootId: string) => void;
  closeThread: () => void;
  /** busca as respostas anteriores às que já estão no painel */
  loadOlder: () => Promise<void>;
  loadFollowed: () => Promise<void>;
  setStatus: (status: 'open' | 'resolved') => Promise<void>;
  setFollowing: (following: boolean) => Promise<void>;
  // eventos
  onReply: (e: { channelId: string; rootId: string; message: Message; thread: ThreadMeta }) => void;
  onUpdate: (e: { channelId: string; rootId: string; thread: ThreadMeta }) => void;
  onMessageUpdate: (msg: Message) => void;
  onMessageDelete: (id: string) => void;
  onActivity: (e: { rootId: string; thread: ThreadMeta }) => void;
  onRead: (rootId: string) => void;
  onFollow: (rootId: string, following: boolean) => void;
}

/** O resumo da thread também vive na mensagem que a abriu, na lista do canal: atualiza lá. */
function patchRoot(channelId: string, rootId: string, thread: ThreadMeta) {
  const app = useApp.getState();
  const list = app.messages[channelId];
  if (!list || !list.some((m) => m.id === rootId)) return;
  useApp.setState({ messages: { ...app.messages, [channelId]: list.map((m) => (m.id === rootId ? { ...m, thread } : m)) } });
}

/**
 * A thread está à vista de verdade: aberta no painel, com o canal dela na tela (não as Novidades, a aba Threads, o
 * perfil ou as configurações por cima) e a janela em foco. Só aí o que chega conta como lido.
 */
export function threadVisible(rootId: string) {
  const o = useThreads.getState().open;
  if (o?.rootId !== rootId || !document.hasFocus() || document.hidden) return false;
  const app = useApp.getState();
  return (
    app.activeServerId === o.serverId &&
    app.activeChannels[o.serverId] === o.channelId &&
    !app.threadsOpen &&
    !app.releasesOpen &&
    !app.profile &&
    !app.settings
  );
}
const viewing = (_s: ThreadState, rootId: string) => threadVisible(rootId);

let readTimer: ReturnType<typeof setTimeout> | undefined;
/** Marca a thread como lida (no servidor, sem pressa, e na aba Threads na hora). */
export function readThread(rootId: string) {
  markRead(rootId);
  useThreads.getState().onRead(rootId);
}
function markRead(rootId: string) {
  clearTimeout(readTimer);
  readTimer = setTimeout(() => void api.post(`/threads/${rootId}/read`, {}).catch(() => {}), 500);
}

export const useThreads = create<ThreadState>((set, get) => ({
  open: null,
  followed: null,

  openThread: (serverId, channelId, rootId) => {
    set({ open: { serverId, channelId, rootId, root: null, replies: [], following: false, loading: true, hasMore: false, loadingOlder: false } });
    void api
      .get<{ root: Message; replies: Message[]; following: boolean; hasMore: boolean }>(`/messages/${rootId}/thread`)
      .then((t) => {
        if (get().open?.rootId !== rootId) return;
        set({
          open: { serverId, channelId, rootId, root: t.root, replies: t.replies, following: t.following, loading: false, hasMore: !!t.hasMore, loadingOlder: false },
        });
        markRead(rootId);
        get().onRead(rootId);
      })
      .catch((err) => {
        toast.error(err);
        if (get().open?.rootId === rootId) set({ open: null });
      });
  },

  closeThread: () => set({ open: null }),

  loadOlder: async () => {
    const o = get().open;
    if (!o || o.loading || o.loadingOlder || !o.hasMore || !o.replies.length) return;
    set({ open: { ...o, loadingOlder: true } });
    try {
      const t = await api.get<{ replies: Message[]; hasMore: boolean }>(`/messages/${o.rootId}/thread?before=${o.replies[0].createdAt}`);
      const cur = get().open;
      if (cur?.rootId !== o.rootId) return;
      const known = new Set(cur.replies.map((m) => m.id));
      set({ open: { ...cur, replies: [...t.replies.filter((m) => !known.has(m.id)), ...cur.replies], hasMore: t.hasMore, loadingOlder: false } });
    } catch (err) {
      toast.error(err);
      const cur = get().open;
      if (cur?.rootId === o.rootId) set({ open: { ...cur, loadingOlder: false } });
    }
  },

  loadFollowed: async () => {
    try {
      set({ followed: await api.get<FollowedThread[]>('/me/threads') });
    } catch {
      // sem a lista, a aba só fica vazia até a próxima tentativa
    }
  },

  setStatus: async (status) => {
    const o = get().open;
    if (!o) return;
    try {
      await api.patch(`/threads/${o.rootId}`, { status });
    } catch (err) {
      toast.error(err);
    }
  },

  setFollowing: async (following) => {
    const o = get().open;
    if (!o) return;
    set({ open: { ...o, following } });
    try {
      await api.put(`/threads/${o.rootId}/follow`, { following });
      void get().loadFollowed();
    } catch (err) {
      toast.error(err);
      set({ open: { ...o, following: !following } });
    }
  },

  onReply: ({ channelId, rootId, message, thread }) => {
    patchRoot(channelId, rootId, thread);
    const o = get().open;
    if (o?.rootId === rootId && !o.replies.some((m) => m.id === message.id)) {
      set({ open: { ...o, replies: [...o.replies, message], root: o.root ? { ...o.root, thread } : o.root } });
      if (viewing(get(), rootId)) markRead(rootId);
    }
  },

  onUpdate: ({ channelId, rootId, thread }) => {
    patchRoot(channelId, rootId, thread);
    const o = get().open;
    if (o?.rootId === rootId && o.root) set({ open: { ...o, root: { ...o.root, thread } } });
    const f = get().followed;
    if (f?.some((t) => t.id === rootId)) set({ followed: f.map((t) => (t.id === rootId ? { ...t, ...thread } : t)) });
  },

  onMessageUpdate: (msg) => {
    const o = get().open;
    if (!o) return;
    if (o.root?.id === msg.id) set({ open: { ...o, root: { ...msg, thread: o.root.thread } } });
    else if (o.replies.some((m) => m.id === msg.id)) set({ open: { ...o, replies: o.replies.map((m) => (m.id === msg.id ? msg : m)) } });
  },

  onMessageDelete: (id) => {
    const o = get().open;
    if (!o) return;
    // a mensagem que abriu sumiu: a thread inteira foi junto
    if (o.rootId === id) {
      set({ open: null });
      toast.info('A mensagem dessa thread foi apagada.');
      return;
    }
    if (o.replies.some((m) => m.id === id)) set({ open: { ...o, replies: o.replies.filter((m) => m.id !== id) } });
  },

  onActivity: ({ rootId, thread }) => {
    const f = get().followed;
    const read = viewing(get(), rootId);
    if (f?.some((t) => t.id === rootId)) {
      set({ followed: [...f].map((t) => (t.id === rootId ? { ...t, ...thread, unread: !read } : t)).sort((a, b) => (b.lastReplyAt ?? 0) - (a.lastReplyAt ?? 0)) });
    } else {
      // thread nova na lista (passei a seguir agora): busca a lista de novo
      void get().loadFollowed();
    }
  },

  onRead: (rootId) => {
    const f = get().followed;
    if (f?.some((t) => t.id === rootId && t.unread)) set({ followed: f.map((t) => (t.id === rootId ? { ...t, unread: false } : t)) });
  },

  onFollow: (rootId, following) => {
    const o = get().open;
    if (o?.rootId === rootId && o.following !== following) set({ open: { ...o, following } });
    void get().loadFollowed();
  },
}));

export const unreadThreads = (f: FollowedThread[] | null) => (f ?? []).filter((t) => t.unread).length;
