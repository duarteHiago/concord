import { Check, ImagePlus, Move, RotateCcw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { ART_OFFSET, ART_SCALE, PATCH_SHAPES } from '../../../shared/cosmetics.ts';
import type { Patch } from '../lib/types';
import { pickImage, prepareImage, uploadImage } from '../lib/upload';
import { toast } from '../store/toast';
import { PatchBadge } from './PatchBadge';
import { Button, ImageHint, Input, cx } from './ui';

const SHAPE_NAMES: Record<Patch['shape'], string> = {
  circle: 'Redondo',
  shield: 'Escudo',
  rect: 'Retângulo',
  hex: 'Hexágono',
  star: 'Selo',
  banner: 'Faixa',
};

/** Editor de patch: formato, cores, emoji, texto e logo. */
export function PatchForm({
  initial,
  onCancel,
  onSave,
  saveLabel = 'Costurar',
  extra,
}: {
  initial: Patch;
  onCancel: () => void;
  onSave: (p: Patch) => Promise<void>;
  saveLabel?: string;
  /** opções extras abaixo do formulário (ex.: compartilhar no servidor) */
  extra?: React.ReactNode;
}) {
  const [p, setP] = useState<Patch>(initial);
  const [busy, setBusy] = useState(false);
  // aceita um pedaço do patch ou uma função (para eventos rápidos, como a rolagem do mouse)
  const set = (part: Partial<Patch> | ((cur: Patch) => Partial<Patch>)) => setP((cur) => ({ ...cur, ...(typeof part === 'function' ? part(cur) : part) }));

  async function uploadLogo() {
    const file = await pickImage();
    if (!file) return;
    setBusy(true);
    try {
      // 512 px para continuar nítida mesmo ampliada dentro do patch
      const { url } = await uploadImage<{ url: string }>('/me/patch-image', await prepareImage(file, 512, false));
      set({ image: url, artScale: undefined, artX: undefined, artY: undefined });
    } catch (err) {
      toast.error(err);
    }
    setBusy(false);
  }

  return (
    // empilha quando o espaço é estreito (aba Estilo) e fica lado a lado quando cabe
    <div className="@container mt-3">
    <div className="flex animate-pop-in flex-col gap-4 rounded-2xl bg-surface-0 p-4 @xl:flex-row">
      <ArtPreview patch={p} onChange={set} />
      <div className="min-w-0 flex-1 space-y-3">
        <div className="flex flex-wrap gap-1.5">
          {PATCH_SHAPES.map((shape) => (
            <button
              key={shape}
              onClick={() => set({ shape })}
              aria-pressed={p.shape === shape}
              className={cx(
                'rounded-full px-3 py-1 text-xs font-semibold',
                p.shape === shape ? 'bg-accent text-on-accent' : 'bg-surface-3 text-fg-muted hover:text-fg',
              )}
            >
              {SHAPE_NAMES[shape]}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-[1fr_88px] gap-2">
          <Input label="Texto" value={p.text} maxLength={14} onChange={(e) => set({ text: e.target.value })} placeholder="Ex.: CLUTCH" />
          <Input label="Emoji" value={p.icon} onChange={(e) => set({ icon: [...e.target.value].slice(0, 4).join('') })} placeholder="🔥" />
        </div>
        <div className="flex flex-wrap items-center gap-4 text-xs font-semibold text-fg-muted">
          <ColorField label="Tecido" value={p.bg} onChange={(bg) => set({ bg })} />
          <ColorField label="Borda" value={p.border} onChange={(border) => set({ border })} />
          <ColorField label="Linha" value={p.fg} onChange={(fg) => set({ fg })} />
        </div>
        {extra}
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" className="h-9 text-xs" loading={busy} onClick={uploadLogo}>
            <ImagePlus size={14} /> {p.image ? 'Trocar logo' : 'Usar logo/imagem'}
          </Button>
          <ImageHint spec="patchLogo" className="w-full" />
          {p.image && (
            <Button variant="ghost" className="h-9 text-xs" onClick={() => set({ image: undefined })}>
              Tirar logo
            </Button>
          )}
          <div className="ml-auto flex gap-2">
            <Button variant="ghost" className="h-9" onClick={onCancel}>
              Cancelar
            </Button>
            <Button
              className="h-9"
              disabled={!p.text.trim() && !p.icon && !p.image}
              onClick={async () => {
                setBusy(true);
                await onSave({ ...p, text: p.text.trim() });
                setBusy(false);
              }}
            >
              <Check size={15} /> {saveLabel}
            </Button>
          </div>
        </div>
      </div>
    </div>
    </div>
  );
}

const PREVIEW = 150;
const clampNum = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/** Prévia grande: arraste o desenho para mover, role o mouse (ou use o controle) para mudar o tamanho. */
function ArtPreview({ patch, onChange }: { patch: Patch; onChange: (part: Partial<Patch> | ((cur: Patch) => Partial<Patch>)) => void }) {
  const hasArt = !!patch.image || !!patch.icon;
  const drag = useRef<{ x: number; y: number; ax: number; ay: number } | null>(null);
  const scale = patch.artScale ?? 1;
  const unit = 100 / PREVIEW; // px da prévia → unidades do patch
  const moved = (patch.artX ?? 0) !== 0 || (patch.artY ?? 0) !== 0 || scale !== 1;
  const box = useRef<HTMLDivElement>(null);
  const change = useRef(onChange);
  change.current = onChange;

  // a rolagem sobre a prévia muda o tamanho e não rola a janela de configurações
  // (listener nativo porque o do React é passivo e não deixa cancelar a rolagem)
  useEffect(() => {
    const el = box.current;
    if (!el || !hasArt) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      change.current((cur) => ({ artScale: clampNum((cur.artScale ?? 1) * (e.deltaY < 0 ? 1.08 : 0.92), ART_SCALE.min, ART_SCALE.max) }));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [hasArt]);

  return (
    <div className="flex shrink-0 flex-col items-center gap-2 self-center @xl:w-48 @xl:self-start">
      <div
        ref={box}
        aria-label={hasArt ? 'Prévia do patch: arraste o desenho para mover e role o mouse para mudar o tamanho' : 'Prévia do patch'}
        title={hasArt ? 'Arraste para mover · role o mouse para mudar o tamanho' : undefined}
        className={cx('relative flex touch-none items-center justify-center rounded-2xl bg-surface-2 p-3', hasArt && 'cursor-grab active:cursor-grabbing')}
        onPointerDown={(e) => {
          if (!hasArt) return;
          e.preventDefault();
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          drag.current = { x: e.clientX, y: e.clientY, ax: patch.artX ?? 0, ay: patch.artY ?? 0 };
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d) return;
          onChange({
            artX: clampNum(d.ax + (e.clientX - d.x) * unit, -ART_OFFSET, ART_OFFSET),
            artY: clampNum(d.ay + (e.clientY - d.y) * unit, -ART_OFFSET, ART_OFFSET),
          });
        }}
        onPointerUp={() => (drag.current = null)}
        onPointerCancel={() => (drag.current = null)}
      >
        <PatchBadge patch={patch} size={PREVIEW} />
        {hasArt && <Move size={14} className="pointer-events-none absolute right-2 bottom-2 text-fg-subtle" />}
      </div>
      {hasArt && (
        <div className="flex w-full items-center gap-2">
          <input
            type="range"
            min={ART_SCALE.min}
            max={ART_SCALE.max}
            step={0.05}
            value={scale}
            aria-label="Tamanho do desenho"
            onChange={(e) => onChange({ artScale: Number(e.target.value) })}
            className="min-w-0 flex-1"
          />
          <span className="w-9 text-right text-[11px] text-fg-muted">{Math.round(scale * 100)}%</span>
          <button
            title="Centralizar e voltar ao tamanho original"
            aria-label="Centralizar o desenho"
            disabled={!moved}
            onClick={() => onChange({ artScale: undefined, artX: undefined, artY: undefined })}
            className="flex h-7 w-7 items-center justify-center rounded-full text-fg-muted hover:bg-surface-3 hover:text-fg disabled:opacity-30"
          >
            <RotateCcw size={13} />
          </button>
        </div>
      )}
    </div>
  );
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex items-center gap-2">
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="h-8 w-8 cursor-pointer rounded-lg border-0 bg-transparent p-0" />
      {label}
    </label>
  );
}
