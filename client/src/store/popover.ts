import { create } from 'zustand';

interface PopoverState {
  userId: string | null;
  serverId: string | null;
  x: number;
  y: number;
  open: (userId: string, serverId: string, rect: DOMRect | { left: number; top: number; right: number }) => void;
  close: () => void;
}

export const usePopover = create<PopoverState>((set) => ({
  userId: null,
  serverId: null,
  x: 0,
  y: 0,
  open: (userId, serverId, rect) => {
    // abre ao lado do elemento, preferindo a esquerda quando está perto da borda direita
    const width = 320;
    const x = rect.right + 12 + width > window.innerWidth ? rect.left - width - 12 : rect.right + 12;
    set({ userId, serverId, x: Math.max(8, x), y: Math.min(rect.top, window.innerHeight - 440) });
  },
  close: () => set({ userId: null, serverId: null }),
}));
