import { create } from 'zustand';
import type { SupporterTier } from '../../../shared/supporter.ts';
import type { Patch } from '../lib/types';

/**
 * Inspeção 3D de patch: fica numa camada própria, por cima de qualquer modal.
 * Assim, ao fechar, a pessoa volta exatamente para onde estava (ex.: escolhendo patches nas configurações).
 */
interface PatchInspectState {
  patch: Patch | null;
  /** patch de apoiador (desenho fixo; muda só o acabamento) */
  supporter: SupporterTier | null;
  caption?: string;
  open: (patch: Patch, caption?: string) => void;
  openSupporter: (tier: SupporterTier, caption?: string) => void;
  close: () => void;
}

export const usePatchInspect = create<PatchInspectState>((set) => ({
  patch: null,
  supporter: null,
  open: (patch, caption) => set({ patch, supporter: null, caption }),
  openSupporter: (supporter, caption) => set({ supporter, patch: null, caption }),
  close: () => set({ patch: null, supporter: null, caption: undefined }),
}));
