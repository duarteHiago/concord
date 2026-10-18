import { Heart } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { create } from 'zustand';
import { getSocket } from '../lib/socket';
import { cx } from './ui';

/** Os mesmos emojis aceitos pelo servidor. */
export const REACTIONS = ['❤️', '😂', '🔥', '👏', '😮', '🎉', '💀', '👀', '💯', '😍', '🤣', '😭'];

interface ReactionEvent {
  userId: string;
  emoji: string;
  x: number;
  y: number;
  at: number;
}

const useReactions = create<{ open: boolean; armed: string | null; set: (p: Partial<{ open: boolean; armed: string | null }>) => void }>((set) => ({
  open: false,
  armed: null,
  set: (p) => set(p),
}));

function send(emoji: string, x?: number, y?: number) {
  getSocket()?.emit('reaction', { emoji, x: x ?? 0.35 + Math.random() * 0.3, y: y ?? 0.85 });
}

/** Botão do dock que abre a bandeja de emojis. */
export function ReactionsButton() {
  const { open, armed, set } = useReactions();
  return (
    <button
      title="Reações"
      aria-label="Reações"
      aria-expanded={open}
      onClick={() => set({ open: !open, armed: open ? null : armed })}
      className={cx(
        'flex h-[52px] w-[52px] items-center justify-center rounded-full transition-all hover:scale-105',
        armed ? 'bg-accent text-on-accent' : open ? 'bg-fg text-surface-1' : 'bg-surface-3 text-fg hover:bg-surface-4',
      )}
    >
      {armed ? <span className="text-xl leading-none">{armed}</span> : <Heart size={20} />}
    </button>
  );
}

/** Camada sobre o palco: bandeja de emojis, cliques para soltar e as partículas subindo. */
export function ReactionLayer() {
  const { open, armed, set } = useReactions();
  const [particles, setParticles] = useState<
    { id: number; emoji: string; left: number; top: number; dx: number; size: number; dur: number; delay: number }[]
  >([]);
  const seq = useRef(0);

  useEffect(() => {
    const onReaction = (e: Event) => {
      const r = (e as CustomEvent<ReactionEvent>).detail;
      const burst = Array.from({ length: 7 + Math.floor(Math.random() * 4) }, (_, i) => ({
        id: ++seq.current,
        emoji: r.emoji,
        left: r.x * 100 + (Math.random() - 0.5) * 6,
        top: r.y * 100,
        dx: (Math.random() - 0.5) * 140,
        size: 26 + Math.random() * 22,
        dur: 1.6 + Math.random() * 1.1,
        delay: i * 0.06,
      }));
      setParticles((p) => [...p.slice(-120), ...burst]);
      const ids = new Set(burst.map((b) => b.id));
      setTimeout(() => setParticles((p) => p.filter((x) => !ids.has(x.id))), 3200);
    };
    window.addEventListener('concord:reaction', onReaction);
    return () => window.removeEventListener('concord:reaction', onReaction);
  }, []);

  useEffect(() => {
    if (!armed && !open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && set({ armed: null, open: false });
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [armed, open, set]);

  return (
    <>
      {/* com um emoji "armado", cada clique no palco solta uma rajada no ponto clicado */}
      {armed && (
        <div
          className="absolute inset-0 z-10 cursor-crosshair"
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            send(armed, (e.clientX - rect.left) / rect.width, (e.clientY - rect.top) / rect.height);
          }}
        />
      )}

      <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden" aria-hidden="true">
        {particles.map((p) => (
          <span
            key={p.id}
            className="reaction-particle absolute"
            style={
              {
                left: `${p.left}%`,
                top: `${p.top}%`,
                fontSize: p.size,
                animationDuration: `${p.dur}s`,
                animationDelay: `${p.delay}s`,
                '--dx': `${p.dx}px`,
              } as React.CSSProperties
            }
          >
            {p.emoji}
          </span>
        ))}
      </div>

      {open && (
        <div className="absolute right-0 bottom-4 left-0 z-30 flex flex-col items-center gap-2">
          <div className="flex flex-wrap justify-center gap-1 rounded-full bg-surface-2/95 p-1.5 shadow-2xl ring-1 ring-line backdrop-blur">
            {REACTIONS.map((emoji) => (
              <button
                key={emoji}
                title={armed === emoji ? 'Desarmar' : 'Soltar e armar (depois é só clicar na tela)'}
                onClick={() => {
                  if (armed === emoji) return set({ armed: null });
                  send(emoji);
                  set({ armed: emoji });
                }}
                className={cx(
                  'flex h-11 w-11 items-center justify-center rounded-full text-2xl transition-transform hover:scale-125',
                  armed === emoji && 'bg-accent/25 ring-2 ring-accent',
                )}
              >
                {emoji}
              </button>
            ))}
          </div>
          {armed && (
            <span className="rounded-full bg-surface-1/90 px-3 py-1 text-xs font-semibold backdrop-blur">
              Clique na tela para soltar {armed} · Esc para parar
            </span>
          )}
        </div>
      )}
    </>
  );
}
