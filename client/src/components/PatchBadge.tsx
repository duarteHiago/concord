import { useId } from 'react';
import type { Patch } from '../lib/types';

/** Contornos dos patches num quadro 100×100. */
function scallop(bumps: number, outer: number, inner: number) {
  const pts: string[] = [];
  for (let i = 0; i < bumps * 2; i++) {
    const a = (Math.PI * i) / bumps - Math.PI / 2;
    const r = i % 2 ? inner : outer;
    pts.push(`${(50 + r * Math.cos(a)).toFixed(2)},${(50 + r * Math.sin(a)).toFixed(2)}`);
  }
  return `M${pts.join('L')}Z`;
}

const SHAPES: Record<Patch['shape'], string> = {
  circle: 'M50 3a47 47 0 1 0 0.01 0Z',
  shield: 'M50 3 L93 17 V49 C93 76 73 90 50 98 C27 90 7 76 7 49 V17 Z',
  rect: 'M18 14 H82 Q96 14 96 28 V72 Q96 86 82 86 H18 Q4 86 4 72 V28 Q4 14 18 14 Z',
  hex: 'M50 2 L92 26 V74 L50 98 L8 74 V26 Z',
  star: scallop(14, 48, 41),
  banner: 'M2 26 H98 L88 50 L98 74 H2 L12 50 Z',
};

const grow = (k: number) => `translate(50 50) scale(${k}) translate(-50 -50)`;

/** Patch bordado: borda "overlock", ponto corrido por dentro e textura de tecido. */
export function PatchBadge({ patch, size = 40, tilt = 0, title }: { patch: Patch; size?: number; tilt?: number; title?: string }) {
  const uid = useId().replace(/:/g, '');
  const d = SHAPES[patch.shape] ?? SHAPES.circle;
  const wide = patch.shape === 'banner' || patch.shape === 'rect';
  const hasIcon = !!patch.icon || !!patch.image;
  const text = patch.text.toUpperCase();
  // cabe na largura útil do patch (letras pesadas ≈ 0,7 da altura)
  const usable = wide ? 74 : hasIcon ? 66 : 60;
  const textSize = Math.min(hasIcon ? (wide ? 17 : 15) : wide ? 24 : 22, usable / (Math.max(3, text.length) * 0.72));

  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      role="img"
      aria-label={title ?? (patch.text || 'Patch')}
      className="patch shrink-0"
      style={{ transform: `rotate(${tilt}deg)` }}
    >
      <title>{title ?? patch.text}</title>
      <defs>
        <pattern id={`f${uid}`} width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="4" height="4" fill="transparent" />
          <line x1="0" y1="0" x2="0" y2="4" stroke="#000" strokeOpacity="0.16" strokeWidth="1.4" />
          <line x1="2" y1="0" x2="2" y2="4" stroke="#fff" strokeOpacity="0.07" strokeWidth="0.8" />
        </pattern>
        <radialGradient id={`l${uid}`} cx="35%" cy="25%" r="80%">
          <stop offset="0" stopColor="#fff" stopOpacity="0.22" />
          <stop offset="0.6" stopColor="#fff" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity="0.25" />
        </radialGradient>
        <clipPath id={`c${uid}`}>
          <path d={d} transform={grow(0.84)} />
        </clipPath>
      </defs>

      {/* borda overlock: base + linhas enroladas */}
      <path d={d} fill={patch.border} />
      <path d={d} fill="none" stroke="#000" strokeOpacity="0.35" strokeWidth="7" strokeDasharray="0.9 1.6" transform={grow(0.93)} />
      {/* tecido */}
      <path d={d} fill={patch.bg} transform={grow(0.84)} />
      <path d={d} fill={`url(#f${uid})`} transform={grow(0.84)} />
      {/* ponto corrido */}
      <path
        d={d}
        fill="none"
        stroke={patch.fg}
        strokeOpacity="0.55"
        strokeWidth="1.6"
        strokeDasharray="3.5 2.5"
        strokeLinecap="round"
        transform={grow(0.75)}
      />

      {patch.image ? (
        <image
          href={patch.image}
          x={wide ? 30 : 22}
          y={wide ? (text ? 24 : 26) : text ? 18 : 22}
          width={wide ? 40 : 56}
          height={wide ? (text ? 30 : 48) : text ? 46 : 56}
          preserveAspectRatio="xMidYMid meet"
          clipPath={`url(#c${uid})`}
        />
      ) : patch.icon ? (
        <text
          x="50"
          y={text ? (wide ? 46 : 50) : 52}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={text ? (wide ? 26 : 36) : 50}
          style={{ filter: 'drop-shadow(0 1.5px 0 rgba(0,0,0,.45))' }}
        >
          {patch.icon}
        </text>
      ) : null}

      {text && (
        <text
          x="50"
          y={hasIcon ? (wide ? 70 : 78) : 51}
          textAnchor="middle"
          dominantBaseline="central"
          fill={patch.fg}
          fontFamily="Outfit, system-ui, sans-serif"
          fontWeight="900"
          fontSize={textSize}
          letterSpacing="0.5"
          stroke="#000"
          strokeOpacity="0.35"
          strokeWidth="0.8"
          paintOrder="stroke"
        >
          {text}
        </text>
      )}

      {/* volume do bordado */}
      <path d={d} fill={`url(#l${uid})`} transform={grow(0.84)} />
    </svg>
  );
}

/** Inclinações fixas para parecer costurado à mão. */
export const PATCH_TILTS = [-8, 6, -4, 9, -10, 5];

/** Patches prontos (designs originais). */
export const PATCH_PRESETS: Omit<Patch, 'id'>[] = [
  { shape: 'shield', bg: '#1c2a44', border: '#ffcc33', fg: '#ffcc33', icon: '🎯', text: 'HEADSHOT' },
  { shape: 'circle', bg: '#3a0d0d', border: '#ff5a36', fg: '#ffd2c2', icon: '🔥', text: 'CLUTCH' },
  { shape: 'banner', bg: '#f7c948', border: '#1b1020', fg: '#1b1020', icon: '', text: 'RUSH B' },
  { shape: 'star', bg: '#151515', border: '#e5e5e5', fg: '#ffffff', icon: '♠️', text: 'ACE' },
  { shape: 'hex', bg: '#2d1b4e', border: '#ffd700', fg: '#ffd700', icon: '👑', text: 'MVP' },
  { shape: 'circle', bg: '#0f3d2e', border: '#5cffb0', fg: '#ffffff', icon: '🤝', text: 'GG WP' },
  { shape: 'rect', bg: '#ffd6e7', border: '#ff4fa3', fg: '#b3135f', icon: '🍼', text: 'NOOB' },
  { shape: 'shield', bg: '#14213d', border: '#4cc9f0', fg: '#ffffff', icon: '⚔️', text: 'PENTAKILL' },
  { shape: 'hex', bg: '#1b1b1b', border: '#ff8a6b', fg: '#ff8a6b', icon: '💥', text: '1 TAP' },
  { shape: 'circle', bg: '#2b2234', border: '#a78bfa', fg: '#ede9fe', icon: '🛡️', text: 'SUPORTE' },
  { shape: 'banner', bg: '#e63946', border: '#ffffff', fg: '#ffffff', icon: '', text: 'TILTADO' },
  { shape: 'star', bg: '#0b132b', border: '#c0c0c0', fg: '#ffffff', icon: '🐐', text: 'GOAT' },
  { shape: 'rect', bg: '#0d1b2a', border: '#ffb703', fg: '#ffb703', icon: '💣', text: 'PLANTEI' },
  { shape: 'circle', bg: '#1d3557', border: '#f1faee', fg: '#f1faee', icon: '🧠', text: 'IGL' },
  { shape: 'shield', bg: '#2a0a3d', border: '#d946ef', fg: '#fae8ff', icon: '🐉', text: 'BARÃO' },
  { shape: 'hex', bg: '#052e16', border: '#22c55e', fg: '#dcfce7', icon: '🌿', text: 'JUNGLE' },
];
