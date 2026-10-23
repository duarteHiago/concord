// Comemoração quando o Pix do apoio cai: a caixa de presente chacoalha, a tampa voa, explodem confetes
// e o patch de apoiador sobe de dentro dela. Animações em index.css (.gift-*); com "reduzir movimento"
// vai direto para o patch.
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import type { SupporterTier } from '../../../shared/supporter.ts';
import { reduceMotion } from '../lib/motion';
import { playRattle, playWin } from '../lib/sounds';
import { SupporterPatch } from './SupporterPatch';

type Phase = 'shake' | 'open' | 'done';

const CONFETTI_COLORS = ['#ff8a6b', '#c4a5ff', '#5eead4', '#f5c451', '#ff6fae', '#fbf1e8'];

export function GiftReveal({ tier, children }: { tier: SupporterTier; children: ReactNode }) {
  const [reduced] = useState(reduceMotion);
  const [phase, setPhase] = useState<Phase>(reduced ? 'done' : 'shake');

  useEffect(() => {
    if (reduced) return;
    playRattle(1);
    const open = setTimeout(() => {
      setPhase('open');
      playWin();
    }, 1150);
    const done = setTimeout(() => setPhase('done'), 2000);
    return () => {
      clearTimeout(open);
      clearTimeout(done);
    };
  }, [reduced]);

  // confetes: direção, distância, giro e cor sorteados uma vez
  const confetti = useMemo(
    () =>
      Array.from({ length: 56 }, (_, i) => {
        const angle = (Math.PI * 2 * i) / 56 + Math.random() * 0.3;
        const dist = 110 + Math.random() * 120;
        return {
          '--dx': `${Math.cos(angle) * dist}px`,
          '--dy': `${Math.sin(angle) * dist * 0.8 - 40}px`,
          '--rot': `${Math.round(Math.random() * 720 - 360)}deg`,
          '--delay': `${Math.random() * 0.12}s`,
          background: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
          width: i % 3 ? 8 : 6,
          height: i % 3 ? 4 : 10,
          borderRadius: i % 4 === 0 ? 999 : 2,
        } as CSSProperties;
      }),
    [],
  );

  return (
    <div className="flex flex-col items-center gap-4 text-center">
      <div className="relative flex h-[230px] w-full items-center justify-center" aria-hidden={phase !== 'done'}>
        {/* raios de luz atrás do patch */}
        {phase !== 'shake' && <div className="gift-rays absolute h-[300px] w-[300px]" />}

        {/* confetes */}
        {phase !== 'shake' && !reduced && (
          <div className="pointer-events-none absolute top-1/2 left-1/2">
            {confetti.map((style, i) => (
              <span key={i} className="gift-confetti absolute" style={style} />
            ))}
          </div>
        )}

        {/* a caixa */}
        {phase !== 'done' && (
          <svg viewBox="0 0 120 120" width={150} height={150} className={phase === 'shake' ? 'gift-box gift-shake absolute' : 'gift-box gift-drop absolute'}>
            <defs>
              <linearGradient id="gift-body" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#ff8a6b" />
                <stop offset="1" stopColor="#e8613f" />
              </linearGradient>
            </defs>
            {/* corpo */}
            <rect x="18" y="54" width="84" height="58" rx="8" fill="url(#gift-body)" />
            <rect x="52" y="54" width="16" height="58" fill="#c4a5ff" />
            <rect x="18" y="54" width="84" height="8" fill="#000" opacity="0.15" />
            {/* tampa e laço */}
            <g className={phase === 'open' ? 'gift-lid-off' : undefined}>
              <rect x="12" y="40" width="96" height="18" rx="6" fill="#ff8a6b" />
              <rect x="52" y="40" width="16" height="18" fill="#c4a5ff" />
              <path d="M60 40 C46 18 26 26 36 38 C40 42 52 41 60 40 Z" fill="#c4a5ff" />
              <path d="M60 40 C74 18 94 26 84 38 C80 42 68 41 60 40 Z" fill="#b48cff" />
              <circle cx="60" cy="40" r="5" fill="#9d72ff" />
            </g>
          </svg>
        )}
        {/* o patch sobe de dentro da caixa (desenhado depois: fica na frente dela) */}
        {phase !== 'shake' && (
          <div className={reduced ? undefined : 'gift-rise'}>
            <SupporterPatch tier={tier} size={150} />
          </div>
        )}

      </div>
      <div className={`flex flex-col items-center gap-4 ${phase === 'done' ? 'gift-text-in' : 'invisible'}`}>{children}</div>
    </div>
  );
}
