// Estado da Oficina no cliente: as versões publicadas dos servidores da pessoa, o Mural aberto, o editor e as
// preferências de quem vê (dá para desligar efeitos, sons e intros dos servidores).
import { create } from 'zustand';
import { PIECE_INFO, type WorkshopConfig, type WorkshopPackId, type WorkshopPiece } from '../../../shared/workshop.ts';
import { api } from '../lib/api';
import { reduceMotion } from '../lib/motion';
import { STAGING } from '../lib/staging';
import { useApp } from '../store/app';
import { PACKS, type Pack } from './packs';

/** A Oficina só existe no Concord de testes, por enquanto. */
export const WORKSHOP_ENABLED = STAGING || import.meta.env.VITE_WORKSHOP === 'true';

export interface WorkshopPrefs {
  /** ver a Oficina dos servidores (efeitos, Mural, sons). Desligado: tudo no visual padrão. */
  show: boolean;
  sounds: boolean;
  intros: boolean;
  /** usar a tela montada pelo servidor na Oficina (desligado: layout padrão) */
  layouts: boolean;
  /** 0 a 100 */
  volume: number;
}

export function workshopPrefs(): WorkshopPrefs {
  const raw = (useApp.getState().me?.settings as { workshop?: Partial<WorkshopPrefs> } | undefined)?.workshop ?? {};
  return { show: raw.show ?? true, sounds: raw.sounds ?? true, intros: raw.intros ?? true, layouts: raw.layouts ?? true, volume: raw.volume ?? 70 };
}

interface WorkshopStore {
  configs: Record<string, WorkshopConfig | null>;
  loaded: boolean;
  /** servidor com o Mural aberto no lugar do canal */
  muralFor: string | null;
  /** servidor aberto no editor */
  studioFor: string | null;
  /** prévia do editor: os efeitos (intro, sons) do rascunho, sem publicar */
  preview: { serverId: string; config: WorkshopConfig } | null;
  load: () => Promise<void>;
  setConfig: (serverId: string, config: WorkshopConfig | null) => void;
  openMural: (serverId: string) => void;
  closeMural: () => void;
  openStudio: (serverId: string) => void;
  closeStudio: () => void;
  setPreview: (p: WorkshopStore['preview']) => void;
}

export const useWorkshop = create<WorkshopStore>((set, get) => ({
  configs: {},
  loaded: false,
  muralFor: null,
  studioFor: null,
  preview: null,
  load: async () => {
    if (!WORKSHOP_ENABLED) return;
    try {
      set({ configs: await api.get<Record<string, WorkshopConfig>>('/workshop'), loaded: true });
    } catch {
      // sem Oficina: tudo fica no padrão
    }
  },
  setConfig: (serverId, config) => {
    set({ configs: { ...get().configs, [serverId]: config } });
    if (!config && get().muralFor === serverId) set({ muralFor: null });
  },
  openMural: (serverId) => {
    set({ muralFor: serverId });
    useApp.setState({ mobileView: 'chat', releasesOpen: false, profile: null, settings: null });
  },
  closeMural: () => get().muralFor && set({ muralFor: null }),
  openStudio: (serverId) => {
    useApp.getState().closeModal();
    set({ studioFor: serverId });
  },
  closeStudio: () => set({ studioFor: null, preview: null }),
  setPreview: (preview) => set({ preview }),
}));

/** Configuração em vigor para quem vê: a prévia do editor, ou a publicada (se a pessoa não desligou). */
export function activeConfig(serverId: string | null | undefined): WorkshopConfig | null {
  if (!WORKSHOP_ENABLED || !serverId) return null;
  const st = useWorkshop.getState();
  if (st.preview?.serverId === serverId) return st.preview.config;
  if (!workshopPrefs().show) return null;
  return st.configs[serverId] ?? null;
}

/** Pacote de uma peça, respeitando as preferências (som desligado, movimento reduzido, intros desligadas). */
export function pieceFor(serverId: string | null | undefined, piece: WorkshopPiece, config = activeConfig(serverId)): Pack | null {
  const id = config?.pieces[piece] as WorkshopPackId | undefined;
  if (!id) return null;
  const prefs = workshopPrefs();
  const info = PIECE_INFO[piece];
  if (info.sound && !prefs.sounds && !info.motion) return null;
  if (piece === 'intro' && (!prefs.intros || reduceMotion())) return null;
  return PACKS[id] ?? null;
}

/** Hook: a configuração em vigor para um servidor (re-renderiza quando muda). */
export function useActiveConfig(serverId: string | null | undefined): WorkshopConfig | null {
  const config = useWorkshop((s) => (serverId ? (s.preview?.serverId === serverId ? s.preview.config : s.configs[serverId]) : null) ?? null);
  const show = useApp((s) => (s.me?.settings as { workshop?: Partial<WorkshopPrefs> } | undefined)?.workshop?.show ?? true);
  const isPreview = useWorkshop((s) => s.preview?.serverId === serverId);
  if (!WORKSHOP_ENABLED || !serverId) return null;
  return show || isPreview ? config : null;
}

export function usePiece(serverId: string | null | undefined, piece: WorkshopPiece): Pack | null {
  const config = useActiveConfig(serverId);
  useApp((s) => s.me?.settings); // re-renderiza quando as preferências mudam
  return pieceFor(serverId, piece, config);
}
