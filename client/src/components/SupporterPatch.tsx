// Patch de apoiador: bordado, como os outros patches (PatchBadge), com o mesmo desenho para todo mundo
// (roseta com o símbolo do Concord em ponto cetim e uma fita costurada por cima). O que muda é a linha
// da borda, que sobe conforme o total apoiado (shared/supporter.ts). Animações em index.css (.sp-*),
// desligadas com "reduzir movimento".
import { useId, type CSSProperties } from 'react';
import { tierInfo, type SupporterTier } from '../../../shared/supporter.ts';
import { cx } from './ui';

interface Finish {
  /** linha da borda (gradiente metálico/colorido) */
  border: string[];
  /** cor de base do overlock (aparece na lateral do patch em 3D) */
  edge: string;
  bg: [string, string];
  /** ponto corrido do tecido */
  stitch: string;
  ribbon: string;
  ribbonText: string;
  glow: string;
  label: string;
  /** brilho que corre em volta da borda */
  glint: string;
  sparkles?: number;
  /** cores girando (holográfico) / respirando (aurora) */
  hue?: 'full' | 'soft';
  stars?: boolean;
}

const FINISHES: Record<SupporterTier, Finish> = {
  aurora: {
    border: ['#ff8a6b', '#ff6fae', '#c4a5ff', '#5eead4', '#ff8a6b'],
    edge: '#b5577a',
    bg: ['#3a2547', '#1a1220'],
    stitch: '#ffb59f',
    ribbon: '#ff8a6b',
    ribbonText: '#2a1410',
    glow: 'rgb(255 138 107 / 0.75)',
    label: 'APOIADOR',
    glint: '#fff1e8',
    hue: 'soft',
  },
  gold: {
    border: ['#8a5f12', '#f7d77c', '#fff6d6', '#d9a52c', '#8a5f12', '#f7d77c'],
    edge: '#8a5f12',
    bg: ['#43300e', '#1a1206'],
    stitch: '#f1c759',
    ribbon: '#e9b949',
    ribbonText: '#3a2600',
    glow: 'rgb(245 196 81 / 0.75)',
    label: 'OURO',
    glint: '#fffbe8',
    sparkles: 2,
  },
  holo: {
    border: ['#ff6ec7', '#ffd36e', '#7afcff', '#a0ff8f', '#c48bff', '#ff6ec7'],
    edge: '#7a5fc4',
    bg: ['#2f2850', '#141026'],
    stitch: '#d9c7ff',
    ribbon: '#efe9ff',
    ribbonText: '#3a2b6b',
    glow: 'rgb(196 165 255 / 0.8)',
    label: 'HOLOGRÁFICO',
    glint: '#ffffff',
    sparkles: 3,
    hue: 'full',
  },
  diamond: {
    border: ['#dff3ff', '#9fd8ff', '#ffffff', '#6fbdf2', '#dff3ff', '#ffffff'],
    edge: '#4f9fd6',
    bg: ['#18436a', '#071827'],
    stitch: '#bfe6ff',
    ribbon: '#e6f6ff',
    ribbonText: '#0c3550',
    glow: 'rgb(159 216 255 / 0.9)',
    label: 'DIAMANTE',
    glint: '#ffffff',
    sparkles: 5,
  },
  cosmic: {
    border: ['#4b1fa0', '#8a2be2', '#ff4fd8', '#6a2fd0', '#ff8a6b', '#4b1fa0'],
    edge: '#3a1478',
    bg: ['#45227f', '#08031c'],
    stitch: '#ff9cec',
    ribbon: '#1f0d40',
    ribbonText: '#ffc2f2',
    glow: 'rgb(255 79 216 / 0.75)',
    label: 'CÓSMICO',
    glint: '#ffd6fb',
    sparkles: 3,
    hue: 'soft',
    stars: true,
  },
};

/** Roseta (16 pontas arredondadas), centrada em (50, 42) num quadro 100×100. */
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
/** Contorno inteiro (roseta + fita), para a máscara e a espessura da inspeção 3D. */
export const SUPPORTER_SILHOUETTE = `${ROSETTE} ${RIBBON}`;
export const supporterEdge = (tier: SupporterTier) => FINISHES[tier].edge;

const growAt = (cx: number, cy: number, k: number) => `translate(${cx} ${cy}) scale(${k}) translate(-${cx} -${cy})`;
const SPARKLE = 'M0 -5 L1.2 -1.2 L5 0 L1.2 1.2 L0 5 L-1.2 1.2 L-5 0 L-1.2 -1.2 Z';
const SPARKLE_SPOTS = [
  [82, 12],
  [16, 20],
  [86, 50],
  [20, 56],
  [50, 2],
];
const STARS = [
  [34, 28, 0.9],
  [66, 24, 0.7],
  [38, 54, 0.6],
  [68, 52, 0.8],
  [28, 42, 0.5],
  [72, 38, 0.5],
];

// símbolo do Concord (traços do logo, quadro 216×216), bordado no centro da roseta
const LOGO_C = 'M155.2,44.8 A78,78 0 1,0 155.2,155.2 L124,124 A34,34 0 1,1 124,76 Z';
const LOGO_TAIL = 'M148,118 Q156,134 182,138 Q170,128 170,110 Z';
const LOGO = 'translate(50 41) scale(0.16) translate(-112 -108)';

export function SupporterPatch({
  tier,
  size = 40,
  locked,
  plain,
  title,
  className,
}: {
  tier: SupporterTier;
  size?: number;
  /** prévia de um acabamento ainda não liberado */
  locked?: boolean;
  /** sem o brilho em volta (inspeção 3D: lá o patch tem espessura e reflexo próprios) */
  plain?: boolean;
  title?: string;
  className?: string;
}) {
  const id = useId().replace(/:/g, '');
  const f = FINISHES[tier];
  const name = tierInfo(tier).name;
  const stops = (colors: string[]) => colors.map((c, i) => <stop key={i} offset={i / (colors.length - 1)} stopColor={c} />);
  const labelSize = Math.min(10.5, 66 / (f.label.length * 0.68));
  const animated = !locked;

  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      role="img"
      aria-label={title ?? `Patch de apoiador do Concord · ${name}`}
      className={cx('shrink-0 overflow-visible', animated && !plain && 'sp-glow', locked && 'opacity-45 grayscale', className)}
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
        {/* sarja do tecido */}
        <pattern id={`t${id}`} width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="4" stroke="#000" strokeOpacity="0.2" strokeWidth="1.4" />
          <line x1="2" y1="0" x2="2" y2="4" stroke="#fff" strokeOpacity="0.07" strokeWidth="0.8" />
        </pattern>
        {/* ponto cetim do bordado: linhas finas e paralelas */}
        <pattern id={`k${id}`} width="1.6" height="1.6" patternUnits="userSpaceOnUse" patternTransform="rotate(-35)">
          <line x1="0" y1="0" x2="0" y2="1.6" stroke="#000" strokeOpacity="0.22" strokeWidth="0.55" />
          <line x1="0.8" y1="0" x2="0.8" y2="1.6" stroke="#fff" strokeOpacity="0.16" strokeWidth="0.35" />
        </pattern>
        {/* luz de cima (volume do bordado) */}
        <radialGradient id={`l${id}`} cx="35%" cy="22%" r="80%">
          <stop offset="0" stopColor="#fff" stopOpacity="0.24" />
          <stop offset="0.6" stopColor="#fff" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity="0.3" />
        </radialGradient>
        <clipPath id={`c${id}`}>
          <path d={ROSETTE} transform={growAt(50, 42, 0.84)} />
        </clipPath>
        <clipPath id={`r${id}`}>
          <path d={RIBBON} transform={growAt(50, 73, 0.9)} />
        </clipPath>
      </defs>

      {/* ---- roseta ---- */}
      {/* borda overlock: linha colorida + fios enrolados + brilho correndo em volta */}
      <g className={animated ? (f.hue === 'full' ? 'sp-hue' : f.hue === 'soft' ? 'sp-hue-soft' : undefined) : undefined}>
        <path d={ROSETTE} fill={`url(#b${id})`} />
      </g>
      <path d={ROSETTE} fill="none" stroke="#000" strokeOpacity="0.32" strokeWidth="7" strokeDasharray="0.9 1.5" transform={growAt(50, 42, 0.93)} />
      {animated && (
        <path
          d={ROSETTE}
          pathLength={100}
          fill="none"
          stroke={f.glint}
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeDasharray="7 93"
          className="sp-run"
          transform={growAt(50, 42, 0.93)}
          style={{ filter: `drop-shadow(0 0 1.5px ${f.glint})` }}
        />
      )}
      {/* tecido */}
      <path d={ROSETTE} fill={`url(#f${id})`} transform={growAt(50, 42, 0.84)} />
      <path d={ROSETTE} fill={`url(#t${id})`} transform={growAt(50, 42, 0.84)} />
      {f.stars &&
        STARS.map(([x, y, r], i) => (
          <circle key={i} cx={x} cy={y} r={r} fill="#fff" className={animated ? 'sp-twinkle' : undefined} style={{ animationDelay: `${i * 0.37}s` }} />
        ))}
      {/* ponto corrido */}
      <path
        d={ROSETTE}
        fill="none"
        stroke={f.stitch}
        strokeOpacity="0.7"
        strokeWidth="1.3"
        strokeDasharray="3 2.2"
        strokeLinecap="round"
        transform={growAt(50, 42, 0.75)}
      />

      {/* símbolo bordado em ponto cetim, com a costura de contorno */}
      <g clipPath={`url(#c${id})`}>
        <g transform={LOGO}>
          <g fill="#140f19" stroke="#140f19" strokeWidth="16" strokeLinejoin="round" opacity="0.55" transform="translate(5 7)">
            <path d={LOGO_C} />
            <circle cx="139.6" cy="60.4" r="22" />
            <circle cx="139.6" cy="139.6" r="22" />
            <circle cx="160" cy="100" r="26" />
            <path d={LOGO_TAIL} />
          </g>
          <g fill="#ff8a6b" stroke="#7a2e1c" strokeWidth="5" strokeLinejoin="round">
            <path d={LOGO_C} />
            <circle cx="139.6" cy="60.4" r="22" />
            <circle cx="139.6" cy="139.6" r="22" />
          </g>
          <g fill={`url(#k${id})`}>
            <path d={LOGO_C} />
            <circle cx="139.6" cy="60.4" r="22" />
            <circle cx="139.6" cy="139.6" r="22" />
          </g>
          <path d="M44,88 A60,60 0 0,1 72,48" fill="none" stroke="#ffd0c2" strokeWidth="9" strokeLinecap="round" strokeDasharray="7 4" />
          <g fill="#c4a5ff" stroke="#4b2f8a" strokeWidth="5" strokeLinejoin="round">
            <circle cx="160" cy="100" r="26" />
            <path d={LOGO_TAIL} />
          </g>
          <g fill={`url(#k${id})`}>
            <circle cx="160" cy="100" r="26" />
            <path d={LOGO_TAIL} />
          </g>
          <g fill="#140f19">
            <circle cx="149" cy="100" r="4.5" />
            <circle cx="160" cy="100" r="4.5" />
            <circle cx="171" cy="100" r="4.5" />
          </g>
        </g>
      </g>
      {/* volume do bordado */}
      <path d={ROSETTE} fill={`url(#l${id})`} transform={growAt(50, 42, 0.84)} />

      {/* ---- fita costurada por cima ---- */}
      <path d={RIBBON} fill="#000" opacity="0.35" transform="translate(0 1.6)" />
      <path d={RIBBON} fill={f.ribbon} />
      <path d={RIBBON} fill={`url(#t${id})`} />
      <path d={RIBBON} fill="none" stroke="#000" strokeOpacity="0.35" strokeWidth="2.6" strokeDasharray="0.8 1.3" />
      <path d={RIBBON} fill="none" stroke={f.ribbonText} strokeOpacity="0.45" strokeWidth="0.8" strokeDasharray="2.4 1.8" transform={growAt(50, 73, 0.9)} />
      <text
        x="50"
        y="73.4"
        textAnchor="middle"
        dominantBaseline="central"
        fill={f.ribbonText}
        fontFamily="Outfit, system-ui, sans-serif"
        fontWeight="900"
        fontSize={labelSize}
        letterSpacing="0.6"
        stroke="#000"
        strokeOpacity="0.2"
        strokeWidth="0.5"
        paintOrder="stroke"
      >
        {f.label}
      </text>
      <path d={RIBBON} fill={`url(#l${id})`} />

      {/* linha metálica refletindo (atravessa só a fita e o tecido) */}
      {animated && (
        <g opacity="0.55">
          <g clipPath={`url(#r${id})`}>
            <g transform="rotate(20 50 50)">
              <rect className="sp-sheen" x="-30" y="-20" width="18" height="140" fill="#fff" opacity="0.35" />
            </g>
          </g>
        </g>
      )}
      {animated &&
        SPARKLE_SPOTS.slice(0, f.sparkles ?? 0).map(([x, y], i) => (
          <path key={i} d={SPARKLE} transform={`translate(${x} ${y})`} fill="#fff" className="sp-twinkle" style={{ animationDelay: `${i * 0.55}s` }} />
        ))}
    </svg>
  );
}
