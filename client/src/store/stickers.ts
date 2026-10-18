import { create } from 'zustand';
import { api } from '../lib/api';
import type { CustomSticker, PlacedSticker } from '../lib/types';

const HIDDEN_KEY = 'concord.hideStickers';

function readHidden() {
  try {
    return localStorage.getItem(HIDDEN_KEY) === '1';
  } catch {
    return false;
  }
}

interface StickersState {
  /** stickers colados por sala de voz */
  placed: Record<string, PlacedSticker[]>;
  /** stickers enviados por servidor */
  custom: Record<string, CustomSticker[]>;
  /** esconder os stickers do palco (só para mim) */
  hidden: boolean;
  loadPlaced: (channelId: string) => Promise<void>;
  loadCustom: (serverId: string) => Promise<void>;
  setPlaced: (channelId: string, list: PlacedSticker[]) => void;
  setHidden: (v: boolean) => void;
}

export const useStickers = create<StickersState>((set) => ({
  placed: {},
  custom: {},
  hidden: readHidden(),
  async loadPlaced(channelId) {
    const list = await api.get<PlacedSticker[]>(`/channels/${channelId}/stickers`).catch(() => null);
    if (list) set((s) => ({ placed: { ...s.placed, [channelId]: list } }));
  },
  async loadCustom(serverId) {
    const list = await api.get<CustomSticker[]>(`/servers/${serverId}/stickers`).catch(() => null);
    if (list) set((s) => ({ custom: { ...s.custom, [serverId]: list } }));
  },
  setPlaced: (channelId, list) => set((s) => ({ placed: { ...s.placed, [channelId]: list } })),
  setHidden(v) {
    try {
      localStorage.setItem(HIDDEN_KEY, v ? '1' : '0');
    } catch {
      // ignorado
    }
    set({ hidden: v });
  },
}));
