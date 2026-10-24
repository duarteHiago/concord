import { useEffect, useLayoutEffect, useState } from 'react';
import { create } from 'zustand';
import { toast } from '../store/toast';
import { Button } from './ui';

// "Mostrar onde fica": escurece a tela e aponta um botão de verdade da interface, com uma dica curta.
// O botão precisa ter data-tour="<target>".

interface Spot {
  target: string;
  title: string;
  tip: string;
  /** mensagem quando o botão não está na tela agora */
  fallback: string;
}

const useSpot = create<{ spot: Spot | null }>(() => ({ spot: null }));

/** o mesmo botão pode existir em mais de um lugar (chat e sala de voz): fica com o que está visível */
const find = (target: string) => [...document.querySelectorAll<HTMLElement>(`[data-tour="${target}"]`)].find((el) => el.getClientRects().length > 0);

export function showSpotlight(spot: Spot) {
  const el = find(spot.target);
  if (!el) {
    toast.info(spot.fallback);
    return;
  }
  el.scrollIntoView({ block: 'nearest' });
  useSpot.setState({ spot });
}

const PAD = 6;
const CARD_W = 280;

export function SpotlightHost() {
  const spot = useSpot((s) => s.spot);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const close = () => useSpot.setState({ spot: null });

  useLayoutEffect(() => {
    if (!spot) return setRect(null);
    const update = () => {
      const el = find(spot.target);
      if (el) setRect(el.getBoundingClientRect());
      else close();
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [spot]);

  useEffect(() => {
    if (!spot) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [spot]);

  if (!spot || !rect) return null;

  const box = { left: rect.left - PAD, top: rect.top - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2 };
  const left = Math.min(Math.max(12, box.left + box.width / 2 - CARD_W / 2), window.innerWidth - CARD_W - 12);
  // dica acima do botão, ou abaixo quando não cabe
  const above = box.top > 200;
  const cardPos = above ? { bottom: window.innerHeight - box.top + 14 } : { top: box.top + box.height + 14 };

  return (
    <div
      className="fixed inset-0 z-[80] animate-fade-in"
      onClick={(e) => {
        // clicar no próprio botão destacado já usa o botão
        const inside = e.clientX >= box.left && e.clientX <= box.left + box.width && e.clientY >= box.top && e.clientY <= box.top + box.height;
        close();
        if (inside) find(spot.target)?.click();
      }}
    >
      <div className="pointer-events-none fixed rounded-2xl shadow-[0_0_0_9999px_rgb(0_0_0/0.62)] ring-[3px] ring-accent transition-all" style={box} />
      <div className="spotlight-ping pointer-events-none fixed rounded-2xl ring-2 ring-accent" style={box} />
      <div
        role="dialog"
        aria-label={spot.title}
        className="fixed flex animate-pop-in flex-col gap-2 rounded-3xl bg-popover p-4 shadow-2xl ring-1 ring-line"
        style={{ left, width: CARD_W, ...cardPos }}
        onClick={(e) => e.stopPropagation()}
      >
        <b className="font-display text-[15px]">{spot.title}</b>
        <p className="text-sm text-fg-muted">{spot.tip}</p>
        <Button className="mt-1 h-9 self-end" autoFocus onClick={close}>
          Entendi
        </Button>
      </div>
    </div>
  );
}
