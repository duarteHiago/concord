import { create } from 'zustand';
import { api, getToken, setToken, setUnauthorizedHandler } from '../lib/api';
import { connectSocket, disconnectSocket } from '../lib/socket';
import type { Message, ServerDetail, ServerSummary, User, VoiceState } from '../lib/types';
import { toast } from './toast';
import { useVoice } from './voice';

export type Modal =
  | { type: 'addServer'; tab?: 'create' | 'join'; code?: string }
  | { type: 'invite'; serverId: string }
  | { type: 'serverSettings'; serverId: string; tab?: string }
  | { type: 'channelSettings'; channelId: string; serverId: string }
  | { type: 'createChannel'; serverId: string; kind: 'text' | 'voice' }
  | { type: 'userSettings' }
  | { type: 'shareScreen' }
  | { type: 'confirm'; title: string; message: string; confirmLabel: string; danger?: boolean; onConfirm: () => Promise<void> | void };

interface AppState {
  ready: boolean;
  me: User | null;
  servers: ServerSummary[];
  details: Record<string, ServerDetail>;
  activeServerId: string | null;
  activeChannels: Record<string, string>;
  messages: Record<string, Message[]>;
  hasMore: Record<string, boolean>;
  voiceStates: Record<string, VoiceState[]>;
  online: Record<string, true>;
  typing: Record<string, Record<string, number>>;
  modal: Modal | null;
  memberListOpen: boolean;
  pendingInvite: string | null;

  bootstrap: () => Promise<void>;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string, displayName: string) => Promise<void>;
  logout: () => void;
  setMe: (me: User) => void;
  loadServers: () => Promise<void>;
  loadDetail: (serverId: string) => Promise<void>;
  openServer: (serverId: string) => void;
  openChannel: (serverId: string, channelId: string) => void;
  loadMessages: (channelId: string, older?: boolean) => Promise<void>;
  openModal: (modal: Modal) => void;
  closeModal: () => void;
  toggleMemberList: () => void;
}

const LAST_KEY = 'concord.last';
function saveLast(serverId: string, channels: Record<string, string>) {
  try {
    localStorage.setItem(LAST_KEY, JSON.stringify({ serverId, channels }));
  } catch {
    // ignorado
  }
}
function loadLast(): { serverId?: string; channels?: Record<string, string> } {
  try {
    return JSON.parse(localStorage.getItem(LAST_KEY) ?? '{}');
  } catch {
    return {};
  }
}

const reloadTimers: Record<string, ReturnType<typeof setTimeout>> = {};

export const useApp = create<AppState>((set, get) => {
  function startSession(token: string, me: User) {
    setToken(token);
    const code = get().pendingInvite;
    set({ me, pendingInvite: null, ...(code ? { modal: { type: 'addServer', tab: 'join', code } } : {}) });
    const socket = connectSocket(token);

    socket.on('connect', () => {
      void get().loadServers();
      useVoice.getState().resync();
    });
    socket.on('connect_error', (err) => {
      if (err.message === 'unauthorized') get().logout();
    });
    socket.on('server:changed', ({ serverId }: { serverId: string }) => {
      if (!get().details[serverId]) return;
      clearTimeout(reloadTimers[serverId]);
      reloadTimers[serverId] = setTimeout(() => void get().loadDetail(serverId), 120);
    });
    socket.on('server:removed', ({ serverId, reason }: { serverId: string; reason: string }) => {
      if (useVoice.getState().serverId === serverId) void useVoice.getState().leave();
      const { [serverId]: _d, ...details } = get().details;
      const servers = get().servers.filter((s) => s.id !== serverId);
      set({ servers, details, activeServerId: get().activeServerId === serverId ? (servers[0]?.id ?? null) : get().activeServerId });
      const next = get().activeServerId;
      if (next) get().openServer(next);
      toast.info(reason);
    });
    socket.on('voice:states', ({ serverId, states }: { serverId: string; states: VoiceState[] }) => {
      set({ voiceStates: { ...get().voiceStates, [serverId]: states } });
    });
    socket.on('presence:list', (ids: string[]) => {
      set({ online: Object.fromEntries(ids.map((id) => [id, true as const])) });
    });
    socket.on('presence', ({ userId, online }: { userId: string; online: boolean }) => {
      const next = { ...get().online };
      if (online) next[userId] = true;
      else delete next[userId];
      set({ online: next });
    });
    socket.on('message:new', (msg: Message) => {
      const list = get().messages[msg.channelId];
      const typing = { ...get().typing[msg.channelId] };
      delete typing[msg.author.id];
      set({
        typing: { ...get().typing, [msg.channelId]: typing },
        ...(list && !list.some((m) => m.id === msg.id) ? { messages: { ...get().messages, [msg.channelId]: [...list, msg] } } : {}),
      });
    });
    socket.on('message:update', (msg: Message) => {
      const list = get().messages[msg.channelId];
      if (list) set({ messages: { ...get().messages, [msg.channelId]: list.map((m) => (m.id === msg.id ? msg : m)) } });
    });
    socket.on('message:delete', ({ id, channelId }: { id: string; channelId: string }) => {
      const list = get().messages[channelId];
      if (list) set({ messages: { ...get().messages, [channelId]: list.filter((m) => m.id !== id) } });
    });
    socket.on('typing', ({ channelId, userId }: { channelId: string; userId: string }) => {
      if (userId === get().me?.id) return;
      set({ typing: { ...get().typing, [channelId]: { ...get().typing[channelId], [userId]: Date.now() + 6000 } } });
    });
    useVoice.getState().bindSocket(socket);
  }

  return {
    ready: false,
    me: null,
    servers: [],
    details: {},
    activeServerId: null,
    activeChannels: loadLast().channels ?? {},
    messages: {},
    hasMore: {},
    voiceStates: {},
    online: {},
    typing: {},
    modal: null,
    memberListOpen: true,
    pendingInvite: null,

    bootstrap: async () => {
      setUnauthorizedHandler(() => get().logout());
      const match = location.pathname.match(/^\/invite\/([\w-]+)/);
      if (match) {
        // o convite só é aberto depois do login (startSession)
        history.replaceState(null, '', '/');
        set({ pendingInvite: match[1] });
      }
      const token = getToken();
      if (token) {
        try {
          const me = await api.get<User>('/me');
          startSession(token, me);
        } catch {
          setToken(null);
        }
      }
      set({ ready: true });
    },

    login: async (username, password) => {
      const { token, user } = await api.post<{ token: string; user: User }>('/auth/login', { username, password });
      startSession(token, user);
    },

    register: async (username, password, displayName) => {
      const { token, user } = await api.post<{ token: string; user: User }>('/auth/register', { username, password, displayName });
      startSession(token, user);
    },

    logout: () => {
      void useVoice.getState().leave();
      disconnectSocket();
      setToken(null);
      set({ me: null, servers: [], details: {}, activeServerId: null, messages: {}, voiceStates: {}, modal: null });
    },

    setMe: (me) => set({ me }),

    loadServers: async () => {
      const servers = await api.get<ServerSummary[]>('/servers');
      set({ servers });
      const current = get().activeServerId;
      const last = loadLast().serverId;
      const target = servers.find((s) => s.id === current)?.id ?? servers.find((s) => s.id === last)?.id ?? servers[0]?.id;
      if (target) get().openServer(target);
      else set({ activeServerId: null });
      // recarrega os servidores já abertos (reconexão)
      for (const id of Object.keys(get().details)) if (id !== target) void get().loadDetail(id);
    },

    loadDetail: async (serverId) => {
      try {
        const detail = await api.get<ServerDetail>(`/servers/${serverId}`);
        set({
          details: { ...get().details, [serverId]: detail },
          voiceStates: { ...get().voiceStates, [serverId]: detail.voiceStates },
        });
        // canal ativo sumiu (apagado ou sem permissão)? escolhe outro
        const active = get().activeChannels[serverId];
        if (!active || !detail.channels.some((c) => c.id === active)) {
          const first = detail.channels.find((c) => c.type === 'text') ?? detail.channels[0];
          if (first) get().openChannel(serverId, first.id);
        } else if (get().activeServerId === serverId) {
          const ch = detail.channels.find((c) => c.id === active);
          if (ch?.type === 'text' && !get().messages[ch.id]) void get().loadMessages(ch.id);
        }
      } catch (err) {
        toast.error(err);
      }
    },

    openServer: (serverId) => {
      set({ activeServerId: serverId });
      saveLast(serverId, get().activeChannels);
      void get().loadDetail(serverId);
    },

    openChannel: (serverId, channelId) => {
      const activeChannels = { ...get().activeChannels, [serverId]: channelId };
      set({ activeChannels });
      saveLast(serverId, activeChannels);
      const ch = get().details[serverId]?.channels.find((c) => c.id === channelId);
      if (ch?.type === 'text' && !get().messages[channelId]) void get().loadMessages(channelId);
    },

    loadMessages: async (channelId, older = false) => {
      const current = get().messages[channelId] ?? [];
      const before = older && current.length ? `&before=${current[0].createdAt}` : '';
      try {
        const batch = await api.get<Message[]>(`/channels/${channelId}/messages?limit=50${before}`);
        const merged = older ? [...batch, ...current] : batch;
        set({
          messages: { ...get().messages, [channelId]: merged },
          hasMore: { ...get().hasMore, [channelId]: batch.length === 50 },
        });
      } catch (err) {
        toast.error(err);
      }
    },

    openModal: (modal) => set({ modal }),
    closeModal: () => set({ modal: null }),
    toggleMemberList: () => set({ memberListOpen: !get().memberListOpen }),
  };
});

// ---- Seletores utilitários ----

export function useActiveDetail(): ServerDetail | undefined {
  return useApp((s) => (s.activeServerId ? s.details[s.activeServerId] : undefined));
}

export function memberTopRole(detail: ServerDetail, userId: string) {
  const m = detail.members.find((x) => x.id === userId);
  if (!m) return undefined;
  return detail.roles.filter((r) => m.roleIds.includes(r.id)).sort((a, b) => b.position - a.position)[0];
}

export function memberColor(detail: ServerDetail | undefined, userId: string): string | undefined {
  if (!detail) return undefined;
  const m = detail.members.find((x) => x.id === userId);
  if (!m) return undefined;
  return detail.roles
    .filter((r) => m.roleIds.includes(r.id) && r.color)
    .sort((a, b) => b.position - a.position)[0]?.color ?? undefined;
}

/** Posição do cargo mais alto (para checar hierarquia no cliente). */
export function memberPosition(detail: ServerDetail, userId: string): number {
  if (detail.server.ownerId === userId) return 1e9;
  const m = detail.members.find((x) => x.id === userId);
  return Math.max(0, ...detail.roles.filter((r) => m?.roleIds.includes(r.id)).map((r) => r.position));
}
