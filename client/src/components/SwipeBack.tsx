// Gestos do celular: deslizar da esquerda para a direita volta (o mesmo que o botão voltar: fecha a camada de cima,
// ver lib/backStack.ts), com uma setinha que acompanha o dedo, como no Android. As folhas que sobem de baixo
// (modais e menus) fecham arrastando para baixo (useSwipeDown).
import { ChevronLeft } from 'lucide-react';
import { useEffect, useRef, useState, type TouchEvent as ReactTouchEvent } from 'react';
import { canGoBack, goBack } from '../lib/backStack';

/** quanto o dedo precisa andar para valer como "voltar" */
const TRIGGER = 90;

const isIOS = typeof navigator !== 'undefined' && (/iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));
const standalone = typeof window !== 'undefined' && (window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true);

/** O toque começou em algo que já usa o arrastar de lado (campo de texto, lista que rola para o lado...)? */
function claimed(target: EventTarget | null): boolean {
  let el = target as HTMLElement | null;
  while (el && el !== document.body) {
    if (el.matches('input, textarea, select, [contenteditable="true"], [data-no-swipe]')) return true;
    if (el.scrollWidth > el.clientWidth + 2) {
      const ox = getComputedStyle(el).overflowX;
      if (ox === 'auto' || ox === 'scroll') return true;
    }
    el = el.parentElement;
  }
  return false;
}

export function SwipeBack() {
  const bubble = useRef<HTMLDivElement>(null);
  const [touch] = useState(() => typeof window !== 'undefined' && window.matchMedia('(hover: none)').matches);

  useEffect(() => {
    if (!touch) return;
    let start: { x: number; y: number } | null = null;
    let mode: 'undecided' | 'swipe' | 'off' = 'off';
    let dx = 0;

    const show = (x: number, y: number) => {
      const el = bubble.current;
      if (!el) return;
      const p = Math.min(1, x / TRIGGER);
      el.style.opacity = String(p);
      el.style.top = `${y - 22}px`;
      el.style.transform = `translateX(${Math.min(x * 0.45, 56) - 44}px) scale(${0.7 + p * 0.3})`;
      el.dataset.ready = x >= TRIGGER ? 'true' : 'false';
    };
    const hide = () => {
      const el = bubble.current;
      if (!el) return;
      el.style.opacity = '0';
      el.style.transform = 'translateX(-44px) scale(0.7)';
    };

    const onStart = (e: TouchEvent) => {
      mode = 'off';
      if (e.touches.length !== 1 || !canGoBack()) return;
      const t = e.touches[0];
      // no Safari do iPhone (fora do app instalado) a borda esquerda já é o "voltar" do navegador, que cai na mesma pilha
      if (isIOS && !standalone && t.clientX < 24) return;
      if (claimed(e.target)) return;
      start = { x: t.clientX, y: t.clientY };
      mode = 'undecided';
      dx = 0;
    };
    const onMove = (e: TouchEvent) => {
      if (mode === 'off' || !start) return;
      const t = e.touches[0];
      dx = t.clientX - start.x;
      const dy = t.clientY - start.y;
      if (mode === 'undecided') {
        if (Math.abs(dx) < 12 && Math.abs(dy) < 12) return;
        // só vale para a direita e bem na horizontal; o resto (rolar a conversa) segue normal
        mode = dx > 0 && dx > Math.abs(dy) * 1.5 ? 'swipe' : 'off';
        if (mode === 'off') return hide();
      }
      e.preventDefault(); // decidido que é o gesto: a tela não rola junto
      show(Math.max(0, dx), t.clientY);
    };
    const onEnd = () => {
      if (mode === 'swipe' && dx >= TRIGGER) {
        navigator.vibrate?.(6);
        goBack();
      }
      mode = 'off';
      start = null;
      hide();
    };

    window.addEventListener('touchstart', onStart, { passive: true });
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onEnd);
    window.addEventListener('touchcancel', onEnd);
    return () => {
      window.removeEventListener('touchstart', onStart);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);
      window.removeEventListener('touchcancel', onEnd);
    };
  }, [touch]);

  if (!touch) return null;
  return (
    <div
      ref={bubble}
      aria-hidden="true"
      className="pointer-events-none fixed left-0 z-[300] flex h-11 w-11 items-center justify-center rounded-full bg-surface-2 text-fg shadow-lg ring-1 ring-line transition-colors data-[ready=true]:bg-accent data-[ready=true]:text-on-accent"
      style={{ opacity: 0, transform: 'translateX(-44px) scale(0.7)' }}
    >
      <ChevronLeft size={22} strokeWidth={2.5} />
    </div>
  );
}

/**
 * Arrastar para baixo fecha uma folha (modal ou menu que sobe de baixo no celular). Só vale começando pela
 * pegadinha/cabeçalho (`handleProps`), para não brigar com a rolagem do conteúdo.
 */
export function useSwipeDown(onClose: () => void) {
  const sheet = useRef<HTMLDivElement>(null);
  const start = useRef<number | null>(null);
  const dy = useRef(0);

  const handleProps = {
    onTouchStart: (e: ReactTouchEvent) => {
      if (e.touches.length !== 1) return;
      start.current = e.touches[0].clientY;
      dy.current = 0;
      if (sheet.current) sheet.current.style.transition = 'none';
    },
    onTouchMove: (e: ReactTouchEvent) => {
      if (start.current === null || !sheet.current) return;
      dy.current = Math.max(0, e.touches[0].clientY - start.current);
      sheet.current.style.transform = `translateY(${dy.current}px)`;
    },
    onTouchEnd: () => {
      if (start.current === null || !sheet.current) return;
      start.current = null;
      const el = sheet.current;
      el.style.transition = 'transform 0.2s ease-out';
      if (dy.current > 100) {
        el.style.transform = 'translateY(100%)';
        setTimeout(onClose, 160);
      } else {
        el.style.transform = '';
      }
    },
  };
  return { sheet, handleProps };
}
