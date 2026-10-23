import { useEffect, useRef, type CSSProperties, type RefObject } from 'react';
import type { SupporterTier } from '../../../shared/supporter.ts';
import { reduceMotion } from '../lib/motion';
import type { Patch } from '../lib/types';
import { onVisibilityChange } from '../lib/visibility';
import { PatchBadge, patchShapePath } from './PatchBadge';
import { SUPPORTER_SILHOUETTE, SupporterPatch, supporterEdge } from './SupporterPatch';

const LAYERS = 9; // camadas da espessura do tecido (px)

/** Escurece uma cor #rrggbb (para a lateral do patch). */
function shade(hex: string, k: number) {
  const n = parseInt(hex.slice(1), 16);
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v * k)));
  return `rgb(${c(n >> 16)}, ${c((n >> 8) & 255)}, ${c(n & 255)})`;
}

function Silhouette({ d, fill, size, style }: { d: string; fill: string; size: number; style?: CSSProperties }) {
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} className="absolute inset-0" style={style} aria-hidden="true">
      <path d={d} fill={fill} />
    </svg>
  );
}

/** Verso do patch: tecido de fundo (entretela) com a costura aparente. */
function Back({ border, d, size }: { border: string; d: string; size: number }) {
  const grow = (k: number) => `translate(50 50) scale(${k}) translate(-50 -50)`;
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden="true">
      <defs>
        <pattern id="felt" width="3" height="3" patternUnits="userSpaceOnUse" patternTransform="rotate(30)">
          <rect width="3" height="3" fill="#e9e3d6" />
          <circle cx="1" cy="1" r="0.5" fill="#d3cbbb" />
        </pattern>
      </defs>
      <path d={d} fill={shade(border, 0.8)} />
      <path d={d} fill="url(#felt)" transform={grow(0.9)} />
      <path d={d} fill="none" stroke={border} strokeWidth="1.4" strokeDasharray="3 2.5" transform={grow(0.8)} opacity="0.8" />
      <rect x="34" y="44" width="32" height="12" rx="2" fill="#fff" stroke="#bdb4a3" strokeWidth="0.6" />
      <text x="50" y="50.5" textAnchor="middle" dominantBaseline="central" fontFamily="Outfit, system-ui, sans-serif" fontWeight="800" fontSize="5" fill="#6b5f7a" letterSpacing="0.6">
        CONCORD
      </text>
    </svg>
  );
}

export interface Patch3DControls {
  reset: () => void;
}

/**
 * Patch em 3D com espessura, verso e reflexo: arraste para girar (com inércia), role para aproximar.
 * `showcase` faz o patch girar sozinho devagar (vitrine), parando enquanto a pessoa arrasta.
 * Com `supporter`, mostra o patch de apoiador (desenho fixo) em vez de `patch`.
 */
export function Patch3D({
  patch,
  supporter,
  size = 340,
  showcase = false,
  zoomable = false,
  onZoom,
  controls,
}: {
  patch?: Patch;
  supporter?: SupporterTier;
  size?: number;
  showcase?: boolean;
  zoomable?: boolean;
  onZoom?: (zoom: number) => void;
  controls?: RefObject<Patch3DControls | null>;
}) {
  const d = supporter ? SUPPORTER_SILHOUETTE : patchShapePath(patch!.shape);
  const edge = supporter ? supporterEdge(supporter) : patch!.border;
  const item = useRef<HTMLDivElement>(null);
  const glare = useRef<HTMLDivElement>(null);
  const state = useRef({ rx: -8, ry: -18, vx: 0, vy: 0, dragging: false, lastX: 0, lastY: 0, idle: 0, zoom: 1 });
  const mask = `url("data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="${d}"/></svg>`)}")`;

  if (controls) {
    controls.current = {
      reset: () => {
        Object.assign(state.current, { rx: -8, ry: -18, vx: 0, vy: 0, zoom: 1 });
        onZoom?.(1);
      },
    };
  }

  // laço de animação: inércia depois de soltar e um leve balanço parado (ou giro de vitrine).
  // Pausa com a aba/janela oculta: o app desktop desliga o throttling do Electron, então sem isso
  // esse giro decorativo rodaria pra sempre mesmo com a janela minimizada.
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const still = reduceMotion();
    const tick = (now: number) => {
      const dt = Math.min(50, now - last) / 16.7;
      last = now;
      const s = state.current;
      if (!s.dragging) {
        s.ry += s.vy * dt;
        s.rx += s.vx * dt;
        s.vy *= Math.pow(0.94, dt);
        s.vx *= Math.pow(0.94, dt);
        s.idle += dt;
        if (!still && Math.abs(s.vy) < 0.05 && Math.abs(s.vx) < 0.05) {
          if (showcase) {
            s.ry += 0.6 * dt;
            s.rx += (Math.sin(s.idle / 60) * 10 - 6 - s.rx) * 0.02 * dt;
          } else {
            s.ry += Math.sin(s.idle / 70) * 0.12;
            s.rx += Math.cos(s.idle / 90) * 0.05;
          }
        }
      }
      s.rx = Math.max(-70, Math.min(70, s.rx));
      if (item.current) item.current.style.transform = `scale(${s.zoom}) rotateX(${s.rx}deg) rotateY(${s.ry}deg)`;
      if (glare.current) {
        // reflexo acompanha a luz (vem de cima à esquerda)
        const gx = 50 - Math.sin((s.ry * Math.PI) / 180) * 60;
        const gy = 40 + Math.sin((s.rx * Math.PI) / 180) * 60;
        glare.current.style.background = `radial-gradient(circle at ${gx}% ${gy}%, rgb(255 255 255 / 0.38), rgb(255 255 255 / 0.08) 35%, transparent 60%)`;
      }
      raf = requestAnimationFrame(tick);
    };
    const start = () => {
      if (raf) return;
      last = performance.now();
      raf = requestAnimationFrame(tick);
    };
    const stop = () => {
      cancelAnimationFrame(raf);
      raf = 0;
    };
    const off = onVisibilityChange((hidden) => (hidden ? stop() : start()));
    return () => {
      off();
      stop();
    };
  }, [showcase]);

  return (
    <div
      className="cursor-grab touch-none select-none active:cursor-grabbing"
      style={{ perspective: 1100, width: size + size * 0.35, height: size + size * 0.35, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => {
        const s = state.current;
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        Object.assign(s, { dragging: true, lastX: e.clientX, lastY: e.clientY, vx: 0, vy: 0 });
      }}
      onPointerMove={(e) => {
        const s = state.current;
        if (!s.dragging) return;
        const dx = e.clientX - s.lastX;
        const dy = e.clientY - s.lastY;
        s.ry += dx * 0.45;
        s.rx -= dy * 0.45;
        s.vy = dx * 0.45;
        s.vx = -dy * 0.45;
        s.lastX = e.clientX;
        s.lastY = e.clientY;
      }}
      onPointerUp={() => (state.current.dragging = false)}
      onPointerCancel={() => (state.current.dragging = false)}
      onDoubleClick={() => controls?.current?.reset()}
      onWheel={
        zoomable
          ? (e) => {
              const z = Math.max(0.6, Math.min(1.7, state.current.zoom * (e.deltaY < 0 ? 1.08 : 0.92)));
              state.current.zoom = z;
              onZoom?.(z);
            }
          : undefined
      }
    >
      <div ref={item} className="relative" style={{ width: size, height: size, transformStyle: 'preserve-3d', animation: 'patch-enter 0.5s cubic-bezier(0.2, 1.3, 0.4, 1)' }}>
        {/* espessura: camadas do contorno, mais escuras na lateral */}
        {Array.from({ length: LAYERS }, (_, i) => (
          <Silhouette key={i} d={d} size={size} fill={shade(edge, 0.55 + (i % 2) * 0.08)} style={{ transform: `translateZ(${-i - 1}px)` }} />
        ))}
        {/* frente */}
        <div className="absolute inset-0" style={{ transform: 'translateZ(0.5px)', backfaceVisibility: 'hidden' }}>
          {supporter ? <SupporterPatch tier={supporter} size={size} plain /> : <PatchBadge patch={patch!} size={size} plain title={patch!.text || 'Patch'} />}
          <div ref={glare} className="pointer-events-none absolute inset-0 mix-blend-soft-light" style={{ maskImage: mask, WebkitMaskImage: mask }} />
        </div>
        {/* verso */}
        <div className="absolute inset-0" style={{ transform: `translateZ(${-LAYERS - 0.5}px) rotateY(180deg)`, backfaceVisibility: 'hidden' }}>
          <Back border={edge} d={d} size={size} />
        </div>
      </div>
    </div>
  );
}
