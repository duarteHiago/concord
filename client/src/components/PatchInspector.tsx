import { Heart, RotateCcw, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { tierInfo, type SupporterTier } from '../../../shared/supporter.ts';
import type { Patch } from '../lib/types';
import { useApp } from '../store/app';
import { usePatchInspect } from '../store/patchInspect';
import { Patch3D, type Patch3DControls } from './Patch3D';

/** Patch grande no meio da tela: arraste para girar em 3D (como inspecionar item em jogo). */
/** Camada da inspeção (montada uma vez no App, por cima de tudo). */
export function PatchInspectorHost() {
  const patch = usePatchInspect((s) => s.patch);
  const supporter = usePatchInspect((s) => s.supporter);
  const caption = usePatchInspect((s) => s.caption);
  if (supporter) return <PatchInspector key={`supporter-${supporter}`} supporter={supporter} caption={caption} />;
  return patch ? <PatchInspector key={patch.id} patch={patch} caption={caption} /> : null;
}

function PatchInspector({ patch, supporter, caption }: { patch?: Patch; supporter?: SupporterTier; caption?: string }) {
  const close = usePatchInspect((s) => s.close);
  const openModal = useApp((s) => s.openModal);
  const controls = useRef<Patch3DControls>(null);
  const [zoom, setZoom] = useState(1);
  const title = supporter ? `Apoiador do Concord · ${tierInfo(supporter).name}` : patch?.text;

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

  return (
    <div
      role="dialog"
      aria-label={`Patch ${title || ''}${caption ? ` ${caption}` : ''}`}
      onClick={close}
      className="fixed inset-0 z-[70] flex animate-fade-in flex-col items-center justify-center bg-black/60 backdrop-blur-xl"
    >
      <button aria-label="Fechar" onClick={close} className="absolute top-5 right-5 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20">
        <X size={18} />
      </button>

      <Patch3D patch={patch} supporter={supporter} zoomable onZoom={setZoom} controls={controls} />

      <div className="pointer-events-none mt-2 text-center text-white" onClick={(e) => e.stopPropagation()}>
        {title && <div className="font-display text-2xl font-bold tracking-wide">{title}</div>}
        {caption && <div className="text-sm text-white/70">{caption}</div>}
        <div className="mt-3 text-xs text-white/50">Arraste para girar · role o mouse para aproximar ({Math.round(zoom * 100)}%) · Esc fecha</div>
      </div>
      <div className="mt-3 flex gap-2">
        <button
          onClick={(e) => {
            e.stopPropagation();
            controls.current?.reset();
          }}
          className="flex h-9 items-center gap-1.5 rounded-full bg-white/10 px-4 text-sm font-semibold text-white hover:bg-white/20"
        >
          <RotateCcw size={14} /> Voltar à posição
        </button>
        {supporter && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              close();
              openModal({ type: 'support' });
            }}
            className="flex h-9 items-center gap-1.5 rounded-full bg-accent px-4 text-sm font-bold text-on-accent hover:bg-accent-hover"
          >
            <Heart size={14} /> Quero o meu
          </button>
        )}
      </div>
    </div>
  );
}
