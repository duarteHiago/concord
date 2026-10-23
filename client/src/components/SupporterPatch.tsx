// Patch de apoiador: o mesmo desenho para todo mundo (roseta com o símbolo do Concord e uma fita);
// o que muda é o acabamento, que sobe conforme o total apoiado (shared/supporter.ts). Animações em
// index.css (.sp-*), desligadas com "reduzir movimento".
import { useId, type CSSProperties } from 'react';
import { tierInfo, type SupporterTier } from '../../../shared/supporter.ts';
import { cx } from './ui';

interface Finish {
  border: string[];
  bg: [string, string];
  ribbon: string;
  ribbonText: string;
  glow: string;
  label: string;
  /** brilho que passa por cima */
  sheen: number;
  sparkles?: number;
  /** cores girando (holográfico) / respirando (aurora) */
  hue?: 'full' | 'soft';
  stars?: boolean;
}

const FINISHES: Record<SupporterTier, Finish> = {
  aurora: {
    border: ['#ff8a6b', '#ff6fae', '#c4a5ff', '#5eead4', '#ff8a6b'],
    bg: ['#33203f', '#17121c'],
    ribbon: '#ff8a6b',
    ribbonText: '#2a1410',
    glow: 'rgb(255 138 107 / 0.75)',
    label: 'APOIADOR',
    sheen: 0.28,
    hue: 'soft',
  },
  gold: {
    border: ['#7a5410', '#f7d77c', '#fff6d6', '#d9a52c', '#8a5f12', '#f7d77c'],
    bg: ['#3d2c0c', '#160f04'],
    ribbon: '#efc354',
    ribbonText: '#3a2600',
    glow: 'rgb(245 196 81 / 0.7)',
    label: 'OURO',
    sheen: 0.55,
    sparkles: 2,
  },
  holo: {
    border: ['#ff6ec7', '#ffd36e', '#7afcff', '#a0ff8f', '#c48bff', '#ff6ec7'],
    bg: ['#2c2547', '#120f22'],
    ribbon: '#f1ecff',
    ribbonText: '#3a2b6b',
    glow: 'rgb(196 165 255 / 0.75)',
    label: 'HOLOGRÁFICO',
    sheen: 0.5,
    sparkles: 3,
    hue: 'full',
  },
  diamond: {
    border: ['#f2fbff', '#9fd8ff', '#ffffff', '#6fbdf2', '#dff3ff', '#ffffff'],
    bg: ['#163d5c', '#061522'],
    ribbon: '#e6f6ff',
    ribbonText: '#0c3550',
    glow: 'rgb(159 216 255 / 0.85)',
    label: 'DIAMANTE',
    sheen: 0.7,
    sparkles: 5,
  },
  cosmic: {
    border: ['#2a0d4d', '#8a2be2', '#ff4fd8', '#4b1fa0', '#ff8a6b', '#2a0d4d'],
    bg: ['#40207a', '#07031a'],
    ribbon: '#1c0b3a',
    ribbonText: '#ffc2f2',
    glow: 'rgb(255 79 216 / 0.7)',
    label: 'CÓSMICO',
    sheen: 0.4,
    sparkles: 3,
    hue: 'soft',
    stars: true,
  },
};

/** Roseta (16 pontas arredondadas) num quadro 100×100. */
function rosette(bumps: number, outer: number, inner: number) {
  const pts: string[] = [];
  for (let i = 0; i < bumps * 2; i++) {
    const a = (Math.PI * i) / bumps - Math.PI / 2;
    const r = i % 2 ? inner : outer;
    pts.push(`${(50 + r * Math.cos(a)).toFixed(2)},${(42 + r * Math.sin(a)).toFixed(2)}`);
  }
  return `M${pts.join('L')}Z`;
}
const ROSETTE = rosette(16, 41, 37);
const RIBBON = 'M4 64 H96 L90 73 L96 82 H4 L10 73 Z';
const SPARKLE = 'M0 -5 L1.2 -1.2 L5 0 L1.2 1.2 L0 5 L-1.2 1.2 L-5 0 L-1.2 -1.2 Z';
const SPARKLE_SPOTS = [
  [80, 14],
  [18, 22],
  [84, 52],
  [24, 58],
  [50, 6],
];
const STARS = [
  [36, 30, 0.9],
  [62, 26, 0.7],
  [44, 52, 0.6],
  [66, 48, 0.8],
  [30, 44, 0.5],
  [56, 36, 0.5],
];

export function SupporterPatch({
  tier,
  size = 40,
  locked,
  title,
  className,
}: {
  tier: SupporterTier;
  size?: number;
  /** prévia de um acabamento ainda não liberado */
  locked?: boolean;
  title?: string;
  className?: string;
}) {
  const id = useId().replace(/:/g, '');
  const f = FINISHES[tier];
  const name = tierInfo(tier).name;
  const stops = (colors: string[]) => colors.map((c, i) => <stop key={i} offset={i / (colors.length - 1)} stopColor={c} />);
  const label = f.label;
  const labelSize = Math.min(11, 70 / (label.length * 0.68));

  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      role="img"
      aria-label={title ?? `Patch de apoiador do Concord · ${name}`}
      className={cx('shrink-0 overflow-visible', !locked && 'sp-glow', locked && 'opacity-45 grayscale', className)}
      style={{ '--sp-glow': f.glow } as CSSProperties}
    >
      <title>{title ?? `Apoiador do Concord · ${name}`}</title>
      <defs>
        <linearGradient id={`b${id}`} x1="0" y1="0" x2="1" y2="1">
          {stops(f.border)}
        </linearGradient>
        <radialGradient id={`f${id}`} cx="40%" cy="30%" r="75%">
          <stop offset="0" stopColor={f.bg[0]} />
          <stop offset="1" stopColor={f.bg[1]} />
        </radialGradient>
        <linearGradient id={`s${id}`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset="0.5" stopColor="#fff" stopOpacity={f.sheen} />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <clipPath id={`c${id}`}>
          <path d={ROSETTE} />
          <path d={RIBBON} />
        </clipPath>
      </defs>

      {/* roseta: borda metálica/colorida + miolo */}
      <g className={f.hue === 'full' ? 'sp-hue' : f.hue === 'soft' ? 'sp-hue-soft' : undefined}>
        <path d={ROSETTE} fill={`url(#b${id})`} />
      </g>
      <circle cx="50" cy="42" r="31" fill={`url(#f${id})`} />
      <circle cx="50" cy="42" r="31" fill="none" stroke={`url(#b${id})`} strokeWidth="2.2" />
      <circle cx="50" cy="42" r="27.5" fill="none" stroke="#fff" strokeOpacity="0.14" strokeWidth="0.8" strokeDasharray="2 2" />
      {f.stars &&
        STARS.map(([x, y, r], i) => (
          <circle key={i} cx={x} cy={y} r={r} fill="#fff" className="sp-twinkle" style={{ animationDelay: `${i * 0.37}s` }} />
        ))}
      <image href="/brand/concord-simbolo.svg" x="33" y="25" width="34" height="34" style={{ filter: 'drop-shadow(0 1.5px 0 rgba(0,0,0,.5))' }} />

      {/* fita com o nome do acabamento */}
      <path d={RIBBON} fill={f.ribbon} />
      <path d={RIBBON} fill="none" stroke="#000" strokeOpacity="0.25" strokeWidth="1" />
      <text
        x="50"
        y="73.5"
        textAnchor="middle"
        dominantBaseline="central"
        fill={f.ribbonText}
        fontFamily="Outfit, system-ui, sans-serif"
        fontWeight="900"
        fontSize={labelSize}
        letterSpacing="0.6"
      >
        {label}
      </text>

      {/* brilho que atravessa o patch */}
      {!locked && (
        <g clipPath={`url(#c${id})`}>
          <g transform="rotate(20 50 50)">
            <rect className="sp-sheen" x="-30" y="-20" width="26" height="140" fill={`url(#s${id})`} />
          </g>
        </g>
      )}
      {!locked &&
        SPARKLE_SPOTS.slice(0, f.sparkles ?? 0).map(([x, y], i) => (
          <path key={i} d={SPARKLE} transform={`translate(${x} ${y})`} fill="#fff" className="sp-twinkle" style={{ animationDelay: `${i * 0.55}s` }} />
        ))}
    </svg>
  );
}
