import { create } from 'zustand';
import { api } from '../lib/api';
import type { StickerPack } from '../lib/types';

interface StickerPacksState {
  /** packs de figurinhas do chat na biblioteca da pessoa */
  packs: StickerPack[];
  loaded: boolean;
  load: () => Promise<void>;
  /** aviso do servidor (importação, outro aparelho...): recarrega, juntando avisos seguidos */
  changed: () => void;
}

let reload: ReturnType<typeof setTimeout> | undefined;

export const useStickerPacks = create<StickerPacksState>((set, get) => ({
  packs: [],
  loaded: false,
  async load() {
    const packs = await api.get<StickerPack[]>('/me/sticker-packs').catch(() => null);
    if (packs) set({ packs, loaded: true });
  },
  changed() {
    if (!get().loaded) return;
    clearTimeout(reload);
    reload = setTimeout(() => void get().load(), 400);
  },
}));
