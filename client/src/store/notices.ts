// Avisos de mensagem/menção dentro do app (o cartão de vidro no canto, ver NoticeStack.tsx).
import { create } from 'zustand';

export type NoticeTarget = { serverId: string; channelId: string } | { dmId: string } | { friends: true };

export interface Notice {
  id: string;
  /** nome de quem mandou (negrito) */
  who: string;
  /** de onde veio: "mencionou você em #incidentes", "#produto · Ops", "mensagem direta" */
  where: string;
  text: string;
  avatar: { url: string | null; color: string };
  /** a menção destaca o @ na cor do tema */
  mention: boolean;
  target: NoticeTarget;
}

interface NoticeState {
  list: Notice[];
  push: (n: Omit<Notice, 'id'>) => void;
  dismiss: (id: string) => void;
  clear: () => void;
}

/** quantos cabem na pilha (os de trás aparecem como cartões menores) */
const MAX = 4;
let seq = 0;

export const useNotices = create<NoticeState>((set, get) => ({
  list: [],
  push: (n) => set({ list: [{ ...n, id: `n${++seq}` }, ...get().list].slice(0, MAX) }),
  dismiss: (id) => set({ list: get().list.filter((x) => x.id !== id) }),
  clear: () => set({ list: [] }),
}));
