import { RotateCcw, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { reduceMotion } from '../lib/motion';
import type { Patch } from '../lib/types';
import { onVisibilityChange } from '../lib/visibility';
import { usePatchInspect } from '../store/patchInspect';
import { PatchBadge, patchShapePath } from './PatchBadge';

const SIZE = 340;
const LAYERS = 9; // camadas da espessura do tecido (px)

/** Escurece uma cor #rrggbb (para a lateral do patch). */
function shade(hex: string, k: number) {
  const n = parseInt(hex.slice(1), 16);
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v * k)));
  return `rgb(${c(n >> 16)}, ${c((n >> 8) & 255)}, ${c(n & 255)})`;
}

function Silhouette({ d, fill, style }: { d: string; fill: string; style?: React.CSSProperties }) {
  return (
    <svg viewBox="0 0 100 100" width={SIZE} height={SIZE} className="absolute inset-0" style={style} aria-hidden="true">
      <path d={d} fill={fill} />
    </svg>
  );
}

/** Verso do patch: tecido de fundo (entretela) com a costura aparente. */
function Back({ patch, d }: { patch: Patch; d: string }) {
  const grow = (k: number) => `translate(50 50) scale(${k}) translate(-50 -50)`;
  return (
    <svg viewBox="0 0 100 100" width={SIZE} height={SIZE} aria-hidden="true">
      <defs>
        <pattern id="felt" width="3" height="3" patternUnits="userSpaceOnUse" patternTransform="rotate(30)">
          <rect width="3" height="3" fill="#e9e3d6" />
          <circle cx="1" cy="1" r="0.5" fill="#d3cbbb" />
        </pattern>
      </defs>
      <path d={d} fill={shade(patch.border, 0.8)} />
      <path d={d} fill="url(#felt)" transform={grow(0.9)} />
      <path d={d} fill="none" stroke={patch.border} strokeWidth="1.4" strokeDasharray="3 2.5" transform={grow(0.8)} opacity="0.8" />
      <rect x="34" y="44" width="32" height="12" rx="2" fill="#fff" stroke="#bdb4a3" strokeWidth="0.6" />
      <text x="50" y="50.5" textAnchor="middle" dominantBaseline="central" fontFamily="Outfit, system-ui, sans-serif" fontWeight="800" fontSize="5" fill="#6b5f7a" letterSpacing="0.6">
        CONCORD
      </text>
    </svg>
  );
}

/** Patch grande no meio da tela: arraste para girar em 3D (como inspecionar item em jogo). */
/** Camada da inspeção (montada uma vez no App, por cima de tudo). */
export function PatchInspectorHost() {
  const patch = usePatchInspect((s) => s.patch);
  const caption = usePatchInspect((s) => s.caption);
  return patch ? <PatchInspector key={patch.id} patch={patch} caption={caption} /> : null;
}

function PatchInspector({ patch, caption }: { patch: Patch; caption?: string }) {
  const close = usePatchInspect((s) => s.close);
  const d = patchShapePath(patch.shape);
  const item = useRef<HTMLDivElement>(null);
  const glare = useRef<HTMLDivElement>(null);
  const state = useRef({ rx: -8, ry: -18, vx: 0, vy: 0, dragging: false, lastX: 0, lastY: 0, idle: 0, zoom: 1 });
  const [zoom, setZoom] = useState(1);
  const mask = `url("data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="${d}"/></svg>`)}")`;

  // Esc fecha só a inspeção: captura antes e não deixa chegar no modal de baixo (configurações etc.)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopImmediatePropagation();
      e.preventDefault();
      close();
    };
    window.addEventListener('keydown', onKey, { capture: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true });
  }, [close]);

  // laço de animação: inércia depois de soltar e um leve balanço parado.
  // Fica pausado com a aba/janela oculta: o app desktop desliga o throttling do Electron
  // para o áudio/vídeo continuarem em segundo plano, então sem isso esse giro decorativo
  // rodaria pra sempre em CPU/GPU mesmo com a janela minimizada.
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
          s.ry += Math.sin(s.idle / 70) * 0.12;
          s.rx += Math.cos(s.idle / 90) * 0.05;
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
  }, []);

  const reset = () => {
    Object.assign(state.current, { rx: -8, ry: -18, vx: 0, vy: 0, zoom: 1 });
    setZoom(1);
  };

  return (
    <div
      role="dialog"
      aria-label={`Patch ${patch.text || ''}${caption ? ` ${caption}` : ''}`}
      onClick={close}
      className="fixed inset-0 z-[70] flex animate-fade-in flex-col items-center justify-center bg-black/60 backdrop-blur-xl"
    >
      <button aria-label="Fechar" onClick={close} className="absolute top-5 right-5 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20">
        <X size={18} />
      </button>

      <div
        className="cursor-grab touch-none select-none active:cursor-grabbing"
        style={{ perspective: 1100, width: SIZE + 120, height: SIZE + 120, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
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
        onDoubleClick={reset}
        onWheel={(e) => {
          const z = Math.max(0.6, Math.min(1.7, state.current.zoom * (e.deltaY < 0 ? 1.08 : 0.92)));
          state.current.zoom = z;
          setZoom(z);
        }}
      >
        <div ref={item} className="relative" style={{ width: SIZE, height: SIZE, transformStyle: 'preserve-3d', animation: 'patch-enter 0.5s cubic-bezier(0.2, 1.3, 0.4, 1)' }}>
          {/* espessura: camadas do contorno, mais escuras na lateral */}
          {Array.from({ length: LAYERS }, (_, i) => (
            <Silhouette key={i} d={d} fill={shade(patch.border, 0.55 + (i % 2) * 0.08)} style={{ transform: `translateZ(${-i - 1}px)` }} />
          ))}
          {/* frente */}
          <div className="absolute inset-0" style={{ transform: 'translateZ(0.5px)', backfaceVisibility: 'hidden' }}>
            <PatchBadge patch={patch} size={SIZE} plain title={patch.text || 'Patch'} />
            <div ref={glare} className="pointer-events-none absolute inset-0 mix-blend-soft-light" style={{ maskImage: mask, WebkitMaskImage: mask }} />
          </div>
          {/* verso */}
          <div className="absolute inset-0" style={{ transform: `translateZ(${-LAYERS - 0.5}px) rotateY(180deg)`, backfaceVisibility: 'hidden' }}>
            <Back patch={patch} d={d} />
          </div>
        </div>
      </div>

      <div className="pointer-events-none mt-2 text-center text-white" onClick={(e) => e.stopPropagation()}>
        {patch.text && <div className="font-display text-2xl font-bold tracking-wide">{patch.text}</div>}
        {caption && <div className="text-sm text-white/70">{caption}</div>}
        <div className="mt-3 text-xs text-white/50">Arraste para girar · role o mouse para aproximar ({Math.round(zoom * 100)}%) · Esc fecha</div>
      </div>
      <button
        onClick={(e) => {
          e.stopPropagation();
          reset();
        }}
        className="mt-3 flex h-9 items-center gap-1.5 rounded-full bg-white/10 px-4 text-sm font-semibold text-white hover:bg-white/20"
      >
        <RotateCcw size={14} /> Voltar à posição
      </button>
    </div>
  );
}
