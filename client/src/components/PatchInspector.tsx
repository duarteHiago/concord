import { RotateCcw, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { Patch } from '../lib/types';
import { usePatchInspect } from '../store/patchInspect';
import { Patch3D, type Patch3DControls } from './Patch3D';

/** Patch grande no meio da tela: arraste para girar em 3D (como inspecionar item em jogo). */
/** Camada da inspeção (montada uma vez no App, por cima de tudo). */
export function PatchInspectorHost() {
  const patch = usePatchInspect((s) => s.patch);
  const caption = usePatchInspect((s) => s.caption);
  return patch ? <PatchInspector key={patch.id} patch={patch} caption={caption} /> : null;
}

function PatchInspector({ patch, caption }: { patch: Patch; caption?: string }) {
  const close = usePatchInspect((s) => s.close);
  const controls = useRef<Patch3DControls>(null);
  const [zoom, setZoom] = useState(1);

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
      aria-label={`Patch ${patch.text || ''}${caption ? ` ${caption}` : ''}`}
      onClick={close}
      className="fixed inset-0 z-[70] flex animate-fade-in flex-col items-center justify-center bg-black/60 backdrop-blur-xl"
    >
      <button aria-label="Fechar" onClick={close} className="absolute top-5 right-5 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20">
        <X size={18} />
      </button>

      <Patch3D patch={patch} zoomable onZoom={setZoom} controls={controls} />

      <div className="pointer-events-none mt-2 text-center text-white" onClick={(e) => e.stopPropagation()}>
        {patch.text && <div className="font-display text-2xl font-bold tracking-wide">{patch.text}</div>}
        {caption && <div className="text-sm text-white/70">{caption}</div>}
        <div className="mt-3 text-xs text-white/50">Arraste para girar · role o mouse para aproximar ({Math.round(zoom * 100)}%) · Esc fecha</div>
      </div>
      <button
        onClick={(e) => {
          e.stopPropagation();
          controls.current?.reset();
        }}
        className="mt-3 flex h-9 items-center gap-1.5 rounded-full bg-white/10 px-4 text-sm font-semibold text-white hover:bg-white/20"
      >
        <RotateCcw size={14} /> Voltar à posição
      </button>
    </div>
  );
}
