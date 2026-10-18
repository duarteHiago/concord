// Visuais dos minigames (roleta, dados 3D, moeda 3D e confete), em qualquer tamanho.
import { Crown, Sun } from 'lucide-react';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { playCoin, playRattle, playTick } from '../lib/sounds';
import type { GameData } from '../lib/types';
import { cx } from './ui';

export const WHEEL_COLORS = ['#ff8a6b', '#c4a5ff', '#5eead4', '#f5c451', '#7c9cff', '#ff6b9a', '#8fd4b8', '#ffb547'];

type Roulette = Extract<GameData, { type: 'roulette' }>;
type Dice = Extract<GameData, { type: 'dice' }>;
type Coin = Extract<GameData, { type: 'coin' }>;

const reduceMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// ------------------------------------------------------------------ roleta

/** Roleta que gira com desaceleração e faz "tique" a cada fatia que passa pelo ponteiro. */
export function Wheel({ data, size, animate, sound, onDone }: { data: Roulette; size: number; animate: boolean; sound?: boolean; onDone?: () => void }) {
  const n = data.items.length;
  const seg = 360 / n;
  // termina com o meio da fatia sorteada embaixo do ponteiro (no topo)
  const final = data.turns * 360 + (360 - (data.result + 0.5) * seg);
  const [angle, setAngle] = useState(animate && !reduceMotion() ? 0 : final);
  const [kick, setKick] = useState(0);
  const done = useRef(onDone);
  done.current = onDone;

  useEffect(() => {
    if (!animate || reduceMotion()) {
      if (animate) done.current?.();
      return;
    }
    const duration = 5200;
    const start = performance.now();
    let last = 0;
    let raf = 0;
    const step = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - p, 4); // rápido no começo, devagar no fim
      const a = final * eased;
      setAngle(a);
      const slot = Math.floor((a + seg / 2) / seg);
      if (slot !== last) {
        last = slot;
        setKick((k) => k + 1);
        if (sound) playTick();
      }
      if (p < 1) raf = requestAnimationFrame(step);
      else done.current?.();
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const r = 92;
  const slice = (i: number) => {
    const a0 = ((i * seg - 90) * Math.PI) / 180;
    const a1 = (((i + 1) * seg - 90) * Math.PI) / 180;
    return `M100 100 L${100 + r * Math.cos(a0)} ${100 + r * Math.sin(a0)} A${r} ${r} 0 ${seg > 180 ? 1 : 0} 1 ${100 + r * Math.cos(a1)} ${100 + r * Math.sin(a1)} Z`;
  };

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg viewBox="0 0 200 200" className="h-full w-full drop-shadow-xl" role="img" aria-label={`Roleta com ${n} opções; resultado: ${data.items[data.result]}`}>
        <circle cx="100" cy="100" r="98" fill="#17121c" />
        <g style={{ transform: `rotate(${angle}deg)`, transformOrigin: '100px 100px' }}>
          {data.items.map((item, i) => {
            const mid = (((i + 0.5) * seg - 90) * Math.PI) / 180;
            const tx = 100 + 60 * Math.cos(mid);
            const ty = 100 + 60 * Math.sin(mid);
            return (
              <g key={i}>
                <path d={slice(i)} fill={WHEEL_COLORS[i % WHEEL_COLORS.length]} stroke="#17121c" strokeWidth="1.5" />
                <text
                  x={tx}
                  y={ty}
                  fill="#1a1014"
                  fontSize={n > 12 ? 7 : n > 8 ? 9 : 11}
                  fontWeight="800"
                  textAnchor="middle"
                  dominantBaseline="middle"
                  transform={`rotate(${(i + 0.5) * seg} ${tx} ${ty})`}
                >
                  {item.length > 13 ? `${item.slice(0, 12)}…` : item}
                </text>
              </g>
            );
          })}
          {/* pinos na borda */}
          {data.items.map((_, i) => {
            const a = ((i * seg - 90) * Math.PI) / 180;
            return <circle key={`p${i}`} cx={100 + 92 * Math.cos(a)} cy={100 + 92 * Math.sin(a)} r="2.6" fill="#f3ecf7" />;
          })}
        </g>
        <circle cx="100" cy="100" r="15" fill="#17121c" stroke="#f3ecf7" strokeWidth="3" />
      </svg>
      {/* ponteiro: dá um tranco a cada pino */}
      <div
        key={kick}
        className="wheel-pointer absolute top-[-4%] left-1/2"
        style={{ width: size * 0.11, height: size * 0.13, marginLeft: -(size * 0.055) }}
        aria-hidden="true"
      >
        <svg viewBox="0 0 20 24" className="h-full w-full drop-shadow-md">
          <path d="M10 24 L1 3 Q10 -2 19 3 Z" fill="#f3ecf7" stroke="#17121c" strokeWidth="1.5" />
        </svg>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ dados 3D

const PIPS: Record<number, [number, number][]> = {
  1: [[50, 50]],
  2: [[28, 28], [72, 72]],
  3: [[25, 25], [50, 50], [75, 75]],
  4: [[28, 28], [72, 28], [28, 72], [72, 72]],
  5: [[25, 25], [75, 25], [50, 50], [25, 75], [75, 75]],
  6: [[28, 22], [72, 22], [28, 50], [72, 50], [28, 78], [72, 78]],
};

function Face({ value, sides, size, transform }: { value: number; sides: number; size: number; transform: string }) {
  return (
    <div
      className="absolute inset-0 flex items-center justify-center rounded-[22%] border-2 border-black/10 bg-accent font-display font-extrabold text-on-accent"
      style={{ transform, backfaceVisibility: 'hidden', fontSize: size * (value >= 100 ? 0.3 : 0.42), boxShadow: 'inset 0 0 0 3px rgba(255,255,255,.18)' }}
    >
      {sides === 6 ? (
        <svg viewBox="0 0 100 100" className="h-full w-full" aria-hidden="true">
          {PIPS[value].map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r="9" fill="currentColor" />
          ))}
        </svg>
      ) : (
        value
      )}
    </div>
  );
}

/** Um dado 3D que rola e para mostrando o valor na frente. */
function Die({ value, sides, size, animate, delay }: { value: number; sides: number; size: number; animate: boolean; delay: number }) {
  const [rot, setRot] = useState(() =>
    animate && !reduceMotion()
      ? { x: 720 + Math.random() * 720, y: 720 + Math.random() * 720, z: Math.random() * 360 }
      : { x: 0, y: 0, z: 0 },
  );
  const others = useRef(
    Array.from({ length: 5 }, (_, i) => (sides === 6 ? [1, 2, 3, 4, 5, 6].filter((v) => v !== value)[i] : 1 + Math.floor(Math.random() * sides))),
  ).current;

  useEffect(() => {
    if (!animate || reduceMotion()) return;
    const t = setTimeout(() => setRot({ x: 0, y: 0, z: 0 }), 30 + delay);
    return () => clearTimeout(t);
  }, [animate, delay]);

  const half = size / 2;
  return (
    <div className={cx(animate && 'dice-bounce')} style={{ width: size, height: size, perspective: size * 5, animationDelay: `${delay}ms` }}>
      <div
        className="relative h-full w-full"
        style={{
          transformStyle: 'preserve-3d',
          transform: `rotateX(${rot.x}deg) rotateY(${rot.y}deg) rotateZ(${rot.z}deg)`,
          transition: animate ? `transform 1.5s cubic-bezier(0.2, 0.75, 0.25, 1.05) ${delay}ms` : 'none',
        }}
      >
        <Face value={value} sides={sides} size={size} transform={`translateZ(${half}px)`} />
        <Face value={others[0]} sides={sides} size={size} transform={`rotateY(180deg) translateZ(${half}px)`} />
        <Face value={others[1]} sides={sides} size={size} transform={`rotateY(90deg) translateZ(${half}px)`} />
        <Face value={others[2]} sides={sides} size={size} transform={`rotateY(-90deg) translateZ(${half}px)`} />
        <Face value={others[3]} sides={sides} size={size} transform={`rotateX(90deg) translateZ(${half}px)`} />
        <Face value={others[4]} sides={sides} size={size} transform={`rotateX(-90deg) translateZ(${half}px)`} />
      </div>
    </div>
  );
}

export function DiceSet({ data, size, animate, sound, onDone }: { data: Dice; size: number; animate: boolean; sound?: boolean; onDone?: () => void }) {
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => {
    if (!animate) return;
    if (sound) playRattle(1.3);
    const t = setTimeout(() => done.current?.(), reduceMotion() ? 50 : 1500 + data.rolls.length * 80);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div className="flex flex-wrap justify-center" style={{ gap: size * 0.3 }}>
      {data.rolls.map((v, i) => (
        <Die key={i} value={v} sides={data.sides} size={size} animate={animate} delay={i * 80} />
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ moeda 3D

export function Coin3D({ data, size, animate, sound, onDone }: { data: Coin; size: number; animate: boolean; sound?: boolean; onDone?: () => void }) {
  const final = 1800 + (data.result === 'coroa' ? 180 : 0);
  const [rot, setRot] = useState(animate && !reduceMotion() ? 0 : final);
  const done = useRef(onDone);
  done.current = onDone;

  useEffect(() => {
    if (!animate) return;
    if (reduceMotion()) {
      done.current?.();
      return;
    }
    if (sound) playCoin();
    const t1 = setTimeout(() => setRot(final), 30);
    const t2 = setTimeout(() => {
      if (sound) playCoin();
      done.current?.();
    }, 1750);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const face = (label: string, icon: React.ReactNode, back: boolean) => (
    <div
      className="absolute inset-0 flex flex-col items-center justify-center rounded-full font-display font-extrabold"
      style={{
        backfaceVisibility: 'hidden',
        transform: back ? 'rotateY(180deg)' : undefined,
        background: 'radial-gradient(circle at 35% 30%, #ffe69a, #f5c451 45%, #c98f1f)',
        color: '#5a3b07',
        boxShadow: 'inset 0 0 0 4px rgba(255,255,255,.35), inset 0 0 0 8px rgba(120,80,10,.35)',
        fontSize: size * 0.16,
      }}
    >
      {icon}
      {label}
    </div>
  );

  return (
    <div className={cx(animate && 'coin-jump')} style={{ width: size, height: size, perspective: size * 6 }}>
      <div
        className="relative h-full w-full"
        style={{ transformStyle: 'preserve-3d', transform: `rotateY(${rot}deg)`, transition: animate ? 'transform 1.7s cubic-bezier(0.25, 0.6, 0.3, 1)' : 'none' }}
      >
        {face('Cara', <Sun size={size * 0.32} strokeWidth={2.5} />, false)}
        {face('Coroa', <Crown size={size * 0.32} strokeWidth={2.5} />, true)}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ confete

export function Confetti({ count = 36 }: { count?: number }) {
  const pieces = useRef(
    Array.from({ length: count }, (_, i) => ({
      x: (Math.random() - 0.5) * 520,
      y: -160 - Math.random() * 220,
      r: Math.random() * 720 - 360,
      color: WHEEL_COLORS[i % WHEEL_COLORS.length],
      delay: Math.random() * 120,
      w: 6 + Math.random() * 6,
    })),
  ).current;
  if (reduceMotion()) return null;
  return (
    <div className="pointer-events-none absolute top-1/2 left-1/2 h-0 w-0" aria-hidden="true">
      {pieces.map((p, i) => (
        <span
          key={i}
          className="confetti-piece absolute rounded-sm"
          style={{ width: p.w, height: p.w * 1.6, background: p.color, animationDelay: `${p.delay}ms`, '--x': `${p.x}px`, '--y': `${p.y}px`, '--r': `${p.r}deg` } as CSSProperties}
        />
      ))}
    </div>
  );
}
