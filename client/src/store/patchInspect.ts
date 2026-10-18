import { create } from 'zustand';
import type { Patch } from '../lib/types';

/**
 * Inspeção 3D de patch: fica numa camada própria, por cima de qualquer modal.
 * Assim, ao fechar, a pessoa volta exatamente para onde estava (ex.: escolhendo patches nas configurações).
 */
interface PatchInspectState {
  patch: Patch | null;
  caption?: string;
  open: (patch: Patch, caption?: string) => void;
  close: () => void;
}

export const usePatchInspect = create<PatchInspectState>((set) => ({
  patch: null,
  open: (patch, caption) => set({ patch, caption }),
  close: () => set({ patch: null, caption: undefined }),
}));
