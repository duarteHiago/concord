import { Eye, EyeOff, RotateCcw, RotateCw, Sparkles, Sticker, Trash2, Upload, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { PRESET_STICKERS, STICKER_FINISHES, type StickerFinish } from '../../../shared/cosmetics.ts';
import { P, has } from '../../../shared/permissions.ts';
import { api } from '../lib/api';
import { STICKER_NAMES, presetStickerUrl } from '../lib/stickerArt';
import { memberName, type Channel, type CustomSticker, type PlacedSticker } from '../lib/types';
import { pickImage, prepareImage, uploadImage } from '../lib/upload';
import { useActiveDetail, useApp } from '../store/app';
import { useStickers } from '../store/stickers';
import { toast } from '../store/toast';
import { cx } from './ui';

const FINISH_NAMES: Record<StickerFinish, string> = { gloss: 'Brilho', holo: 'Holográfico', gold: 'Ouro', glitter: 'Glitter' };
const BASE = 118; // tamanho do sticker no palco com escala 1

/** Endereço da arte de um sticker ("preset:x" ou "custom:id"). */
function stickerSrc(sticker: string, custom: CustomSticker[] | undefined): string | null {
  if (sticker.startsWith('preset:')) return presetStickerUrl(sticker.slice(7));
  return custom?.find((c) => `custom:${c.id}` === sticker)?.url ?? null;
}

/** Sticker com recorte branco, sombra e brilho do acabamento. */
export function StickerView({ src, finish, size, className }: { src: string; finish: StickerFinish; size: number; className?: string }) {
  const mask = `url("${src}")`;
  return (
    <div className={cx('sticker relative', `sticker-${finish}`, className)} style={{ width: size, height: size }}>
      <img src={src} alt="" draggable={false} className="sticker-art" />
      <div className="sticker-shine" style={{ maskImage: mask, WebkitMaskImage: mask }} />
    </div>
  );
}

// ------------------------------------------------------------------ palco

export function StickerLayer({ channel }: { channel: Channel }) {
  const detail = useActiveDetail();
  const serverId = detail?.server.id;
  const list = useStickers((s) => s.placed[channel.id]);
  const custom = useStickers((s) => (serverId ? s.custom[serverId] : undefined));
  const hidden = useStickers((s) => s.hidden);
  const meId = useApp((s) => s.me?.id);
  const box = useRef<HTMLDivElement>(null);
  const known = useRef<Set<string> | null>(null);
  const [area, setArea] = useState({ w: 0, h: 0 });

  // tamanho do palco: os stickers ficam sempre inteiros dentro dele
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setArea({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, [list?.length, hidden]);

  useEffect(() => {
    known.current = null;
    void useStickers.getState().loadPlaced(channel.id);
  }, [channel.id]);
  useEffect(() => {
    if (serverId && !useStickers.getState().custom[serverId]) void useStickers.getState().loadCustom(serverId);
  }, [serverId]);

  // stickers que chegaram agora aparecem com animação de "colar"
  const fresh = new Set<string>();
  if (list) {
    if (known.current) for (const s of list) if (!known.current.has(s.id)) fresh.add(s.id);
    known.current = new Set(list.map((s) => s.id));
  }

  if (!list?.length || hidden) return null;
  const canModerate = has(channel.permissions, P.MANAGE_MESSAGES);

  return (
    <div
      ref={box}
      aria-label="Stickers da sala"
      className="pointer-events-none absolute inset-0 z-[5] overflow-hidden"
      style={{ clipPath: 'inset(0 round 32px)', contain: 'paint' }}
    >
      {list.map((s) => {
        const src = stickerSrc(s.sticker, custom);
        if (!src) return null;
        const author = detail?.members.find((m) => m.id === s.authorId);
        return (
          <PlacedStickerEl
            key={s.id}
            channelId={channel.id}
            sticker={s}
            src={src}
            fresh={fresh.has(s.id)}
            box={box}
            area={area}
            editable={s.authorId === meId || canModerate}
            label={`${s.sticker.startsWith('preset:') ? (STICKER_NAMES[s.sticker.slice(7) as keyof typeof STICKER_NAMES] ?? 'Sticker') : (custom?.find((c) => `custom:${c.id}` === s.sticker)?.name ?? 'Sticker')}${author ? ` · colado por ${memberName(author)}` : ''}`}
          />
        );
      })}
    </div>
  );
}

function PlacedStickerEl({
  channelId,
  sticker,
  src,
  fresh,
  box,
  area,
  editable,
  label,
}: {
  channelId: string;
  sticker: PlacedSticker;
  src: string;
  fresh: boolean;
  box: React.RefObject<HTMLDivElement | null>;
  area: { w: number; h: number };
  editable: boolean;
  label: string;
}) {
  // posição local enquanto arrasta / gira (o servidor confirma depois)
  const [local, setLocal] = useState<Partial<PlacedSticker> | null>(null);
  const drag = useRef<{ px: number; py: number; x: number; y: number; moved: boolean } | null>(null);
  const scaleTimer = useRef<number | undefined>(undefined);
  const s = { ...sticker, ...local };

  useEffect(() => setLocal(null), [sticker.x, sticker.y, sticker.rot, sticker.scale, sticker.finish]);

  const save = (part: Partial<PlacedSticker>) =>
    api.patch(`/channels/${channelId}/stickers/${sticker.id}`, part).catch((err) => {
      setLocal(null);
      toast.error(err);
    });

  function onPointerDown(e: React.PointerEvent) {
    if (!editable || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { px: e.clientX, py: e.clientY, x: s.x, y: s.y, moved: false };
  }
  function onPointerMove(e: React.PointerEvent) {
    const d = drag.current;
    const rect = box.current?.getBoundingClientRect();
    if (!d || !rect) return;
    const x = Math.min(1, Math.max(0, d.x + (e.clientX - d.px) / rect.width));
    const y = Math.min(1, Math.max(0, d.y + (e.clientY - d.py) / rect.height));
    d.moved = true;
    setLocal((cur) => ({ ...cur, x, y }));
  }
  function onPointerUp() {
    const d = drag.current;
    drag.current = null;
    if (d?.moved && local?.x !== undefined) void save({ x: local.x, y: local.y });
  }
  function onWheel(e: React.WheelEvent) {
    if (!editable) return;
    e.stopPropagation();
    const scale = Math.min(3, Math.max(0.4, s.scale * (e.deltaY < 0 ? 1.1 : 0.9)));
    setLocal((cur) => ({ ...cur, scale }));
    window.clearTimeout(scaleTimer.current);
    scaleTimer.current = window.setTimeout(() => void save({ scale }), 350);
  }
  const rotate = (by: number) => {
    const rot = ((((s.rot + by + 180) % 360) + 360) % 360) - 180;
    setLocal((cur) => ({ ...cur, rot }));
    void save({ rot });
  };
  const nextFinish = () => {
    const finish = STICKER_FINISHES[(STICKER_FINISHES.indexOf(s.finish) + 1) % STICKER_FINISHES.length];
    setLocal((cur) => ({ ...cur, finish }));
    void save({ finish });
  };

  // nunca maior que o palco e sempre inteiro dentro dele (a rotação pode pedir um pouco mais de folga)
  const room = Math.min(area.w, area.h) || BASE * 3;
  const size = Math.min(BASE * s.scale, room * 0.5);
  const half = (size / 2) * (Math.abs(Math.sin((s.rot * Math.PI) / 90)) * 0.2 + 1) + 4;
  const fit = (v: number, total: number) => (total ? Math.min(Math.max(v * total, half), Math.max(half, total - half)) : 0);
  if (!area.w) return null;
  return (
    <div
      className="group pointer-events-auto absolute"
      style={{ left: fit(s.x, area.w), top: fit(s.y, area.h), width: size, height: size, transform: `translate(-50%, -50%) rotate(${s.rot}deg)` }}
      title={label}
      onWheel={onWheel}
    >
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className={cx('h-full w-full touch-none', editable && 'cursor-grab active:cursor-grabbing', fresh && 'sticker-pop')}
      >
        <StickerView src={src} finish={s.finish} size={size} />
      </div>
      {editable && (
        <div
          className="absolute -top-4 left-1/2 hidden -translate-x-1/2 items-center gap-0.5 rounded-full bg-surface-1/95 p-1 shadow-xl ring-1 ring-line group-hover:flex"
          style={{ transform: `translateX(-50%) rotate(${-s.rot}deg)` }}
        >
          <ToolButton label="Girar para a esquerda" onClick={() => rotate(-15)}>
            <RotateCcw size={13} />
          </ToolButton>
          <ToolButton label="Girar para a direita" onClick={() => rotate(15)}>
            <RotateCw size={13} />
          </ToolButton>
          <ToolButton label={`Acabamento: ${FINISH_NAMES[s.finish]} (trocar)`} onClick={nextFinish}>
            <Sparkles size={13} />
          </ToolButton>
          <ToolButton label="Descolar" danger onClick={() => void api.del(`/channels/${channelId}/stickers/${sticker.id}`).catch(toast.error)}>
            <Trash2 size={13} />
          </ToolButton>
        </div>
      )}
    </div>
  );
}

function ToolButton({ label, onClick, danger, children }: { label: string; onClick: () => void; danger?: boolean; children: React.ReactNode }) {
  return (
    <button
      title={label}
      aria-label={label}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={onClick}
      className={cx(
        'flex h-7 w-7 items-center justify-center rounded-full transition-colors',
        danger ? 'text-danger hover:bg-danger hover:text-white' : 'text-fg-muted hover:bg-surface-3 hover:text-fg',
      )}
    >
      {children}
    </button>
  );
}

// ------------------------------------------------------------------ escolher e colar

export function StickerButton({ channel }: { channel: Channel }) {
  const detail = useActiveDetail();
  const serverId = detail?.server.id;
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'preset' | 'server'>('preset');
  const [finish, setFinish] = useState<StickerFinish>('holo');
  const [uploading, setUploading] = useState(false);
  const custom = useStickers((s) => (serverId ? s.custom[serverId] : undefined));
  const hidden = useStickers((s) => s.hidden);
  const setHidden = useStickers((s) => s.setHidden);
  const meId = useApp((s) => s.me?.id);
  const ref = useRef<HTMLDivElement>(null);
  const canPlace = has(channel.permissions, P.CONNECT);
  const canModerate = has(channel.permissions, P.MANAGE_MESSAGES);

  useEffect(() => {
    if (!open) return;
    if (serverId) void useStickers.getState().loadCustom(serverId);
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open, serverId]);

  async function place(sticker: string) {
    if (hidden) setHidden(false);
    try {
      await api.post(`/channels/${channel.id}/stickers`, {
        sticker,
        finish,
        x: 0.15 + Math.random() * 0.7,
        y: 0.15 + Math.random() * 0.6,
        rot: Math.round(Math.random() * 30 - 15),
        scale: 1,
      });
    } catch (err) {
      toast.error(err);
    }
  }

  async function upload() {
    if (!serverId) return;
    const file = await pickImage();
    if (!file) return;
    setUploading(true);
    try {
      const name = file.name.replace(/\.[^.]+$/, '').slice(0, 32) || 'sticker';
      await uploadImage(`/servers/${serverId}/stickers?name=${encodeURIComponent(name)}`, await prepareImage(file, 512, false));
      await useStickers.getState().loadCustom(serverId);
      toast.success('Sticker enviado para o servidor');
    } catch (err) {
      toast.error(err);
    }
    setUploading(false);
  }

  return (
    <div ref={ref} className="relative">
      <button
        title="Stickers"
        aria-label="Stickers"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className={cx(
          'flex h-[52px] w-[52px] items-center justify-center rounded-full transition-all hover:scale-105',
          open ? 'bg-accent text-on-accent' : 'bg-surface-3 text-fg hover:bg-surface-4',
        )}
      >
        <Sticker size={20} />
      </button>

      {open && (
        <div className="absolute bottom-full left-1/2 z-50 mb-3 w-[min(440px,92vw)] -translate-x-1/2 animate-pop-in rounded-[24px] bg-popover p-3 shadow-2xl ring-1 ring-line">
          <div className="mb-2 flex items-center gap-1">
            <div role="tablist" className="flex flex-1 gap-1 rounded-full bg-surface-0 p-1">
              {(
                [
                  ['preset', 'Coleção'],
                  ['server', 'Do servidor'],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  role="tab"
                  aria-selected={tab === id}
                  onClick={() => setTab(id)}
                  className={cx('h-8 flex-1 rounded-full font-display text-sm font-bold', tab === id ? 'bg-surface-3 text-fg' : 'text-fg-muted hover:text-fg')}
                >
                  {label}
                </button>
              ))}
            </div>
            <button
              onClick={() => setHidden(!hidden)}
              title={hidden ? 'Mostrar os stickers do palco' : 'Esconder os stickers do palco (só para você)'}
              aria-label={hidden ? 'Mostrar stickers' : 'Esconder stickers'}
              className="flex h-9 w-9 items-center justify-center rounded-full text-fg-muted hover:bg-surface-3 hover:text-fg"
            >
              {hidden ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>

          <div className="mb-2 flex flex-wrap gap-1.5" role="radiogroup" aria-label="Acabamento">
            {STICKER_FINISHES.map((f) => (
              <button
                key={f}
                role="radio"
                aria-checked={finish === f}
                onClick={() => setFinish(f)}
                className={cx('rounded-full px-3 py-1 text-xs font-semibold', finish === f ? 'bg-accent text-on-accent' : 'bg-surface-3 text-fg-muted hover:text-fg')}
              >
                {FINISH_NAMES[f]}
              </button>
            ))}
          </div>

          <div className="grid max-h-[300px] grid-cols-4 gap-2 overflow-y-auto p-1 sm:grid-cols-5">
            {tab === 'preset' &&
              PRESET_STICKERS.map((id) => (
                <button
                  key={id}
                  disabled={!canPlace}
                  title={`Colar "${STICKER_NAMES[id]}"`}
                  onClick={() => void place(`preset:${id}`)}
                  className="flex aspect-square items-center justify-center rounded-2xl p-2 transition-transform hover:scale-110 hover:bg-surface-2 disabled:opacity-40"
                >
                  <StickerView src={presetStickerUrl(id)!} finish={finish} size={62} />
                </button>
              ))}
            {tab === 'server' && (
              <>
                {(custom ?? []).map((c) => (
                  <div key={c.id} className="group relative">
                    <button
                      disabled={!canPlace}
                      title={`Colar "${c.name}"`}
                      onClick={() => void place(`custom:${c.id}`)}
                      className="flex aspect-square w-full items-center justify-center rounded-2xl p-2 transition-transform hover:scale-110 hover:bg-surface-2 disabled:opacity-40"
                    >
                      <StickerView src={c.url} finish={finish} size={62} />
                    </button>
                    {(c.uploaderId === meId || has(detail?.permissions ?? 0, P.MANAGE_SERVER)) && (
                      <button
                        aria-label={`Apagar sticker ${c.name}`}
                        onClick={() => void api.del(`/stickers/${c.id}`).catch(toast.error)}
                        className="absolute -top-1 -right-1 hidden h-6 w-6 items-center justify-center rounded-full bg-danger text-white shadow group-hover:flex"
                      >
                        <X size={12} />
                      </button>
                    )}
                  </div>
                ))}
                <button
                  onClick={() => void upload()}
                  disabled={uploading}
                  className="flex aspect-square flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-line-strong text-[11px] font-semibold text-fg-muted hover:border-accent hover:text-fg disabled:opacity-50"
                >
                  <Upload size={18} />
                  {uploading ? 'Enviando…' : 'Enviar'}
                </button>
              </>
            )}
          </div>
          {tab === 'server' && <p className="mt-2 px-1 text-[11px] text-fg-subtle">Dica: PNG ou GIF com fundo transparente fica com o recorte de sticker perfeito.</p>}

          <div className="mt-2 flex items-center justify-between border-t border-line px-1 pt-2 text-[11px] text-fg-subtle">
            <span>Arraste para mover · role o mouse para mudar o tamanho</span>
            {canModerate && (
              <button onClick={() => void api.del(`/channels/${channel.id}/stickers`).catch(toast.error)} className="font-semibold text-danger hover:underline">
                Limpar todos
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
