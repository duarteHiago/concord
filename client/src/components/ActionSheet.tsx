import { useEffect, useRef, type MouseEvent, type ReactNode, type TouchEvent } from 'react';
import { useBackHandler } from '../lib/backStack';
import { useSwipeDown } from './SwipeBack';
import { createPortal } from 'react-dom';
import { cx } from './ui';

export type SheetAction = { label: string; icon: ReactNode; onClick: () => void; danger?: boolean };

/** Menu que sobe da parte de baixo da tela (celular): as ações de uma mensagem no toque longo. */
export function ActionSheet({ title, actions, onClose }: { title?: ReactNode; actions: SheetAction[]; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  useBackHandler(true, onClose);
  const { sheet, handleProps } = useSwipeDown(onClose);

  // no body: dentro da lista de mensagens, um ancestral com transform prenderia o "fixed" a ele
  return createPortal(
    <div className="fixed inset-0 z-[70] flex animate-fade-in items-end bg-black/50" onClick={onClose}>
      <div
        ref={sheet}
        role="menu"
        className="w-full animate-slide-up rounded-t-[28px] bg-surface-2 px-3 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* pegadinha: arrastar para baixo fecha */}
        <div {...handleProps} className="-mx-3 -mt-2 flex touch-none justify-center pt-2 pb-2">
          <span className="h-1 w-10 rounded-full bg-line-strong" />
        </div>
        {title && <div className="mb-1 truncate px-3 py-1 text-sm text-fg-muted">{title}</div>}
        {actions.map((a) => (
          <button
            key={a.label}
            role="menuitem"
            onClick={() => {
              onClose();
              a.onClick();
            }}
            className={cx(
              'flex h-13 w-full items-center gap-3.5 rounded-2xl px-3 text-left text-[15px] font-semibold active:bg-surface-3',
              a.danger ? 'text-danger' : 'text-fg',
            )}
          >
            <span className={cx('flex h-9 w-9 shrink-0 items-center justify-center rounded-full', a.danger ? 'bg-danger/12' : 'bg-surface-3')}>{a.icon}</span>
            {a.label}
          </button>
        ))}
      </div>
    </div>,
    document.body,
  );
}

/** Tela de toque (sem mouse): onde o hover não existe e as ações vão para o toque longo. */
export const isTouchOnly = () => typeof matchMedia !== 'undefined' && matchMedia('(hover: none)').matches;

/**
 * Toque longo (~0,45 s parado) em telas de toque. Arrastar cancela, para não atrapalhar a rolagem.
 * No Android o toque longo também dispara "contextmenu": tratado aqui para não abrir o menu do navegador.
 */
export function useLongPress(onLongPress: () => void, enabled = true) {
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const start = useRef<{ x: number; y: number } | null>(null);
  const fired = useRef(false);
  const cancel = () => {
    clearTimeout(timer.current);
    start.current = null;
  };
  useEffect(() => cancel, []);
  if (!enabled) return {};
  const fire = () => {
    cancel();
    fired.current = true;
    onLongPress();
  };
  return {
    onTouchStart: (e: TouchEvent) => {
      if (e.touches.length !== 1) return cancel();
      fired.current = false;
      start.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      clearTimeout(timer.current);
      timer.current = setTimeout(fire, 450);
    },
    onTouchMove: (e: TouchEvent) => {
      const s = start.current;
      if (s && Math.hypot(e.touches[0].clientX - s.x, e.touches[0].clientY - s.y) > 10) cancel();
    },
    onTouchEnd: (e: TouchEvent) => {
      cancel();
      // o toque que abriu o menu não vira clique em link/avatar embaixo do dedo
      if (fired.current) e.preventDefault();
    },
    onTouchCancel: cancel,
    onContextMenu: (e: MouseEvent) => {
      if (!isTouchOnly()) return;
      e.preventDefault();
      if (!fired.current) fire();
    },
  };
}
