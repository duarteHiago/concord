import type { PointerEvent } from 'react';
import { create } from 'zustand';

interface PopoverState {
  userId: string | null;
  serverId: string | null;
  x: number;
  y: number;
  /** aberto por passar o mouse: fecha sozinho quando o mouse sai (do gatilho e do cartão) */
  hover: boolean;
  open: (userId: string, serverId: string, rect: DOMRect | { left: number; top: number; right: number }, hover?: boolean) => void;
  close: () => void;
}

export const usePopover = create<PopoverState>((set) => ({
  userId: null,
  serverId: null,
  x: 0,
  y: 0,
  hover: false,
  open: (userId, serverId, rect, hover = false) => {
    // abre ao lado do elemento, preferindo a esquerda quando está perto da borda direita
    // (a altura é ajustada pelo próprio cartão, que mede o tamanho dele: ver MemberPopover)
    const width = 320;
    const x = rect.right + 12 + width > window.innerWidth ? rect.left - width - 12 : rect.right + 12;
    clearTimeout(closeTimer);
    set({ userId, serverId, hover, x: Math.max(8, x), y: rect.top });
  },
  close: () => {
    clearTimeout(openTimer);
    clearTimeout(closeTimer);
    set({ userId: null, serverId: null, hover: false });
  },
}));

// ------------------------------------------------------------------ passar o mouse / clicar

const OPEN_DELAY = 400;
const CLOSE_DELAY = 250;
let openTimer: ReturnType<typeof setTimeout> | undefined;
let closeTimer: ReturnType<typeof setTimeout> | undefined;
/** o último toque foi de dedo: no celular não tem "passar o mouse", então o toque abre o mini perfil */
let lastPointer: string = 'mouse';

/** O mouse entrou no cartão: não fecha. */
export function keepPopoverOpen() {
  clearTimeout(closeTimer);
}

/** O mouse saiu (do gatilho ou do cartão): fecha daqui a pouco, se foi aberto passando o mouse. */
export function releasePopover() {
  clearTimeout(openTimer);
  if (!usePopover.getState().hover) return;
  clearTimeout(closeTimer);
  closeTimer = setTimeout(() => usePopover.getState().close(), CLOSE_DELAY);
}

/**
 * Clique direto numa foto/linha que abre o mini perfil (sem passar pelo profileTriggers, ver abaixo):
 * clicar de novo no mesmo gatilho fecha, em vez de reabrir o cartão do zero. Clicar em outro gatilho,
 * ou em qualquer outro lugar da tela, também funciona.
 *
 * O MemberPopover fecha ao clicar fora escutando "mousedown" na window — que dispara ANTES do "click"
 * do próprio gatilho. Sem o armPopoverToggle abaixo, ao clicar de novo no mesmo gatilho esse mousedown
 * já teria limpado o usuário aberto antes do clique decidir se fecha ou abre, e ele sempre reabria.
 */
let pendingToggleClose = false;

/** Primeiro passo (mousedown/pointerdown): guarda a decisão antes do fecha-ao-clicar-fora rodar. */
export function armPopoverToggle(userId: string) {
  const state = usePopover.getState();
  pendingToggleClose = state.userId === userId && !state.hover;
}

/** Segundo passo (click): usa a decisão guardada, não o estado atual (que o mousedown já pode ter limpado). */
export function toggleOrOpenPopover(userId: string, serverId: string, rect: DOMRect | { left: number; top: number; right: number }) {
  if (pendingToggleClose) {
    pendingToggleClose = false;
    usePopover.getState().close();
    return;
  }
  usePopover.getState().open(userId, serverId, rect);
}

/**
 * Gatilhos de perfil para foto ou nome de alguém: passar o mouse abre o mini perfil, clicar abre a página do
 * perfil (`onOpenPage`). No toque (celular), o toque abre o mini perfil, que tem o botão "Ver perfil".
 */
export function profileTriggers(userId: string, serverId: string | null | undefined, onOpenPage: () => void) {
  return {
    onPointerDown: (e: PointerEvent<HTMLElement>) => {
      lastPointer = e.pointerType;
      if (e.pointerType !== 'mouse') armPopoverToggle(userId);
    },
    onPointerEnter: (e: PointerEvent<HTMLElement>) => {
      if (e.pointerType !== 'mouse' || !serverId) return;
      const rect = e.currentTarget.getBoundingClientRect();
      clearTimeout(openTimer);
      clearTimeout(closeTimer);
      const state = usePopover.getState();
      // outro cartão já aberto por clique: não troca só por passar o mouse
      if (state.userId && !state.hover) return;
      openTimer = setTimeout(() => usePopover.getState().open(userId, serverId, rect, true), state.userId ? 120 : OPEN_DELAY);
    },
    onPointerLeave: () => releasePopover(),
    onClick: (e: { currentTarget: HTMLElement; stopPropagation: () => void }) => {
      e.stopPropagation();
      clearTimeout(openTimer);
      if (lastPointer !== 'mouse' && serverId) {
        toggleOrOpenPopover(userId, serverId, e.currentTarget.getBoundingClientRect());
        return;
      }
      usePopover.getState().close();
      onOpenPage();
    },
  };
}
