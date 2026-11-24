// O que ficou por ler (bolinha e negrito), o contador de menções e o nível de aviso de cada servidor/canal.
// O servidor guarda tudo (ver server/src/unreads.ts) para valer em todos os aparelhos; aqui fica o espelho que a
// tela lê, atualizado pelos eventos em tempo real.
import { create } from 'zustand';
import { api } from '../lib/api';
import type { Message, NotifyLevel } from '../lib/types';

interface ChannelUnread {
  serverId: string;
  lastMessageAt: number;
  lastReadAt: number;
  mentions: number;
}

interface LevelEntry {
  level: NotifyLevel | null;
  mutedUntil: number | null;
}

interface UnreadState {
  loaded: boolean;
  channels: Record<string, ChannelUnread>;
  levels: Record<string, LevelEntry>;
  load: () => Promise<void>;
  /** mensagem nova num canal (de qualquer pessoa) */
  onMessage: (msg: Message, meId: string) => void;
  onMention: (channelId: string, serverId: string) => void;
  /** li o canal até agora (ou até `at`) */
  markRead: (channelId: string, at?: number) => void;
  applyRead: (channelId: string, lastReadAt: number) => void;
  setLevel: (targetId: string, entry: LevelEntry) => Promise<void>;
  applyLevel: (targetId: string, entry: LevelEntry) => void;
}

/** "até eu reativar": silencia até o ano 9999 (o mesmo do servidor) */
export const MUTED_FOREVER = 253402300799000;

let reloadTimer: ReturnType<typeof setTimeout> | undefined;
const pendingRead = new Map<string, ReturnType<typeof setTimeout>>();

export const useUnreads = create<UnreadState>((set, get) => ({
  loaded: false,
  channels: {},
  levels: {},

  load: async () => {
    try {
      const data = await api.get<{ channels: Record<string, ChannelUnread>; levels: Record<string, LevelEntry> }>('/me/unreads');
      set({ loaded: true, channels: data.channels, levels: data.levels });
    } catch {
      // sem a lista, a barra lateral só não mostra bolinhas: tenta de novo na próxima reconexão
    }
  },

  onMessage: (msg, meId) => {
    const cur = get().channels[msg.channelId];
    if (!cur) {
      // canal que a lista ainda não conhece (criado agora, ou acabei de ganhar acesso): busca de novo, sem pressa
      clearTimeout(reloadTimer);
      reloadTimer = setTimeout(() => void get().load(), 1500);
      return;
    }
    const next =
      msg.author.id === meId
        ? { ...cur, lastReadAt: Math.max(cur.lastReadAt, msg.createdAt) } // escrever é ter lido até ali
        : { ...cur, lastMessageAt: Math.max(cur.lastMessageAt, msg.createdAt) };
    set({ channels: { ...get().channels, [msg.channelId]: next } });
  },

  onMention: (channelId, serverId) => {
    const cur = get().channels[channelId] ?? { serverId, lastMessageAt: Date.now(), lastReadAt: 0, mentions: 0 };
    set({ channels: { ...get().channels, [channelId]: { ...cur, mentions: cur.mentions + 1 } } });
  },

  markRead: (channelId, at) => {
    const cur = get().channels[channelId];
    if (!cur) return;
    const when = at ?? Date.now();
    const nothingNew = cur.lastMessageAt <= cur.lastReadAt && cur.mentions === 0;
    get().applyRead(channelId, Math.max(cur.lastReadAt, when));
    if (nothingNew) return;
    // várias mensagens chegando com o canal aberto viram um pedido só
    clearTimeout(pendingRead.get(channelId));
    pendingRead.set(
      channelId,
      setTimeout(() => {
        pendingRead.delete(channelId);
        void api.post(`/channels/${channelId}/read`, { at: when }).catch(() => {});
      }, 600),
    );
  },

  applyRead: (channelId, lastReadAt) => {
    const cur = get().channels[channelId];
    if (!cur) return;
    set({ channels: { ...get().channels, [channelId]: { ...cur, lastReadAt: Math.max(cur.lastReadAt, lastReadAt), mentions: 0 } } });
  },

  setLevel: async (targetId, entry) => {
    get().applyLevel(targetId, entry);
    await api.put(`/me/notify-levels/${targetId}`, entry);
  },

  applyLevel: (targetId, entry) => {
    const levels = { ...get().levels };
    if (entry.level === null && entry.mutedUntil === null) delete levels[targetId];
    else levels[targetId] = entry;
    set({ levels });
  },
}));

// ------------------------------------------------------------------ leituras para a tela

export const isUnread = (c: ChannelUnread | undefined) => !!c && c.lastMessageAt > c.lastReadAt;

const mutedNow = (e: LevelEntry | undefined) => !!e?.mutedUntil && e.mutedUntil > Date.now();

/** Como avisar sobre um canal: o nível dele, senão o do servidor, senão "só menções". Silenciado vale como "nada". */
export function effectiveLevel(levels: Record<string, LevelEntry>, serverId: string, channelId?: string): { level: NotifyLevel; muted: boolean } {
  const ch = channelId ? levels[channelId] : undefined;
  const srv = levels[serverId];
  const muted = mutedNow(ch) || mutedNow(srv);
  return { level: ch?.level ?? srv?.level ?? 'mentions', muted };
}

/** Bolinha e contador de um servidor: algum canal por ler (fora os silenciados) e a soma das menções. */
export function serverBadge(state: Pick<UnreadState, 'channels' | 'levels'>, serverId: string) {
  let unread = false;
  let mentions = 0;
  const serverMuted = mutedNow(state.levels[serverId]);
  for (const [id, c] of Object.entries(state.channels)) {
    if (c.serverId !== serverId) continue;
    mentions += c.mentions;
    if (!serverMuted && !mutedNow(state.levels[id]) && isUnread(c)) unread = true;
  }
  return { unread, mentions };
}

export const totalMentions = (channels: Record<string, ChannelUnread>) => Object.values(channels).reduce((n, c) => n + c.mentions, 0);
