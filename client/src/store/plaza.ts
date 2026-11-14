// Praça do servidor (ver shared/plaza.ts e server/src/plaza.ts): quem está andando por ela, os balões e os gestos.
// O desenho e a animação dos passos ficam no componente (components/plaza/); aqui só o que vem do servidor.
import type { Socket } from 'socket.io-client';
import { create } from 'zustand';
import type { EmoteId, PlazaAvatar, Scene } from '../../../shared/plaza.ts';
import { getSocket } from '../lib/socket';
import { toast } from './toast';

export interface Walker {
  userId: string;
  /** na praça (lobby) ou dentro do estabelecimento */
  scene: Scene;
  x: number;
  y: number;
  avatar: PlazaAvatar;
  activeAt: number;
}

export interface Bubble {
  id: number;
  userId: string;
  text: string;
  at: number;
}

type Ack = { ok: boolean; error?: string; tables?: (string | null)[]; walkers?: Walker[] };

interface PlazaState {
  /** servidor cuja praça está aberta (null = fechada) */
  serverId: string | null;
  /** 'arriving': a animação do globo está passando; 'ready': já chegou */
  phase: 'arriving' | 'ready' | null;
  /** canal de cada mesa, na ordem do mapa (null = sala que eu não vejo) */
  tables: (string | null)[];
  walkers: Record<string, Walker>;
  bubbles: Bubble[];
  /** conversa da praça desde que entrei (só neste aparelho, some ao sair) */
  log: Bubble[];
  emotes: Record<string, { emote: EmoteId; at: number }>;
  /** quantas pessoas estão em cada praça (o número no globo) */
  counts: Record<string, number>;
  /** cara de quem está sentado numa mesa sem ter aberto a praça (pedida ao servidor) */
  avatars: Record<string, PlazaAvatar>;
  fetchAvatars: (userIds: string[]) => void;
  open: (serverId: string) => void;
  arrived: () => void;
  close: () => void;
  move: (x: number, y: number) => void;
  /** pisei na porta: o servidor confere e troca de lugar */
  door: () => void;
  say: (text: string) => Promise<boolean>;
  emote: (emote: EmoteId) => void;
  avatarChanged: () => void;
  setCount: (serverId: string, count: number) => void;
}

let bubbleSeq = 0;
/** de quem já pedi a cara (não pede de novo a cada quadro) */
const asked = new Set<string>();

export const usePlaza = create<PlazaState>((set, get) => {
  function enter(serverId: string) {
    getSocket()?.emit('plaza:enter', { serverId }, (r: Ack) => {
      if (get().serverId !== serverId) return;
      if (!r?.ok) {
        toast.error(r?.error ?? 'Não deu para entrar na praça.');
        set({ serverId: null, phase: null });
        return;
      }
      const walkers: Record<string, Walker> = {};
      for (const w of r.walkers ?? []) walkers[w.userId] = w;
      set({ tables: r.tables ?? [], walkers });
    });
  }

  return {
    serverId: null,
    phase: null,
    tables: [],
    walkers: {},
    bubbles: [],
    log: [],
    emotes: {},
    counts: {},
    avatars: {},
    fetchAvatars: (userIds) => {
      const serverId = get().serverId;
      const missing = userIds.filter((id) => !asked.has(id));
      if (!serverId || !missing.length) return;
      for (const id of missing) asked.add(id);
      getSocket()?.emit('plaza:avatars', { serverId, userIds: missing }, (r: Record<string, PlazaAvatar>) => {
        if (get().serverId === serverId && r && typeof r === 'object') set({ avatars: { ...get().avatars, ...r } });
      });
    },

    open: (serverId) => {
      if (get().serverId === serverId) return;
      if (get().serverId) get().close();
      asked.clear();
      set({ serverId, phase: 'arriving', tables: [], walkers: {}, bubbles: [], log: [], emotes: {}, avatars: {} });
      enter(serverId);
    },
    arrived: () => set({ phase: 'ready' }),
    close: () => {
      const serverId = get().serverId;
      if (serverId) getSocket()?.emit('plaza:leave', { serverId });
      set({ serverId: null, phase: null, walkers: {}, bubbles: [], log: [], emotes: {} });
    },
    move: (x, y) => {
      const serverId = get().serverId;
      if (serverId) getSocket()?.emit('plaza:move', { serverId, x, y });
    },
    door: () => {
      const serverId = get().serverId;
      if (serverId) getSocket()?.emit('plaza:door', { serverId });
    },
    say: (text) =>
      new Promise((resolve) => {
        const serverId = get().serverId;
        const socket = getSocket();
        if (!serverId || !socket) return resolve(false);
        socket.emit('plaza:say', { serverId, text }, (r: Ack) => {
          if (!r?.ok) toast.error(r?.error ?? 'O balão não saiu.');
          resolve(!!r?.ok);
        });
      }),
    emote: (emote) => {
      const serverId = get().serverId;
      if (serverId) getSocket()?.emit('plaza:emote', { serverId, emote });
    },
    avatarChanged: () => getSocket()?.emit('plaza:avatar'),
    setCount: (serverId, count) => set({ counts: { ...get().counts, [serverId]: count } }),
  };

  // (os eventos do servidor entram por bindPlazaSocket, chamado junto com os outros em store/app.ts)
});

/** Liga os eventos da praça na conexão em tempo real (uma vez por conexão). */
export function bindPlazaSocket(socket: Socket) {
  const s = () => usePlaza.getState();
  const here = (serverId: string) => s().serverId === serverId;
  const patchWalker = (userId: string, patch: Partial<Walker>) => {
    const cur = s().walkers[userId];
    if (cur) usePlaza.setState({ walkers: { ...s().walkers, [userId]: { ...cur, ...patch } } });
  };

  // reconectou com a praça aberta: entra de novo (o servidor esqueceu esta conexão)
  socket.on('connect', () => {
    const serverId = s().serverId;
    if (serverId) {
      usePlaza.setState({ serverId: null });
      s().open(serverId);
      usePlaza.setState({ phase: 'ready' });
    }
  });
  socket.on('plaza:count', ({ serverId, count }: { serverId: string; count: number }) => s().setCount(serverId, count));
  socket.on('plaza:joined', ({ serverId, walker }: { serverId: string; walker: Walker }) => {
    if (here(serverId)) usePlaza.setState({ walkers: { ...s().walkers, [walker.userId]: walker } });
  });
  socket.on('plaza:left', ({ serverId, userId }: { serverId: string; userId: string }) => {
    if (!here(serverId)) return;
    const { [userId]: _gone, ...rest } = s().walkers;
    usePlaza.setState({ walkers: rest });
  });
  socket.on('plaza:move', ({ serverId, userId, scene, x, y }: { serverId: string; userId: string; scene: Scene; x: number; y: number }) => {
    if (here(serverId)) patchWalker(userId, { scene, x, y, activeAt: Date.now() });
  });
  socket.on('plaza:scene', ({ serverId, userId, scene, x, y }: { serverId: string; userId: string; scene: Scene; x: number; y: number }) => {
    if (here(serverId)) patchWalker(userId, { scene, x, y, activeAt: Date.now() });
  });
  socket.on('plaza:avatar', ({ serverId, userId, avatar }: { serverId: string; userId: string; avatar: PlazaAvatar }) => {
    if (!here(serverId)) return;
    patchWalker(userId, { avatar });
    usePlaza.setState({ avatars: { ...s().avatars, [userId]: avatar } });
  });
  socket.on('plaza:say', ({ serverId, userId, text, at }: { serverId: string; userId: string; text: string; at: number }) => {
    if (!here(serverId)) return;
    const bubble = { id: ++bubbleSeq, userId, text, at: Date.now() || at };
    usePlaza.setState({
      // no máximo 3 balões por pessoa na tela; os mais velhos sobem e somem
      bubbles: [...s().bubbles.filter((b) => b.userId !== userId || s().bubbles.filter((o) => o.userId === userId && o.id > b.id).length < 2), bubble],
      log: [...s().log, bubble].slice(-60),
    });
    patchWalker(userId, { activeAt: Date.now() });
    setTimeout(() => usePlaza.setState({ bubbles: s().bubbles.filter((b) => b.id !== bubble.id) }), 7000);
  });
  socket.on('plaza:emote', ({ serverId, userId, emote }: { serverId: string; userId: string; emote: EmoteId }) => {
    if (!here(serverId)) return;
    const at = Date.now();
    usePlaza.setState({ emotes: { ...s().emotes, [userId]: { emote, at } } });
    patchWalker(userId, { activeAt: at });
  });
}
