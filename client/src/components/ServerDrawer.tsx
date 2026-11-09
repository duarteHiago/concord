import { ChevronDown } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { ServerSummary } from '../lib/types';
import { cx, initials } from './ui';

/** Quantos servidores cabem no topo, como o dock do iPhone. O resto fica na gaveta. */
export const RAIL_MAX = 4;

/** Os servidores fixados no topo, na ordem escolhida. Quem nunca organizou vê os primeiros. */
export function pinnedServers(servers: ServerSummary[], saved: string[] | undefined): ServerSummary[] {
  if (!saved) return servers.slice(0, RAIL_MAX);
  const byId = new Map(servers.map((s) => [s.id, s]));
  return saved.map((id) => byId.get(id)).filter((s): s is ServerSummary => !!s).slice(0, RAIL_MAX);
}

type Zone = 'top' | 'drawer';
interface Drag {
  id: string;
  x: number;
  y: number;
  over: { zone: Zone; index: number } | null;
}

/** Como o topo fica se soltar agora: é a prévia ao vivo enquanto arrasta. Topo cheio troca de lugar. */
function arrange(pinnedIds: string[], drag: Drag | null): string[] {
  if (!drag?.over) return pinnedIds;
  const rest = pinnedIds.filter((id) => id !== drag.id);
  if (drag.over.zone === 'drawer') return rest;
  const full = rest.length >= RAIL_MAX;
  const at = Math.min(drag.over.index, rest.length, full ? RAIL_MAX - 1 : RAIL_MAX);
  const next = [...rest];
  next.splice(at, full ? 1 : 0, drag.id);
  return next;
}

/** O que estiver embaixo do ponteiro com data-drop (o ícone fantasma não pega clique). */
function hit(x: number, y: number): Drag['over'] {
  for (const el of document.elementsFromPoint(x, y)) {
    const zone = (el as HTMLElement).dataset?.drop as Zone | undefined;
    if (zone) return { zone, index: Number((el as HTMLElement).dataset.index ?? 0) };
  }
  return null;
}

/**
 * Arrastar servidores entre o topo e a gaveta, com o dedo ou o mouse: segurar um instante "descola" o
 * ícone, que segue o ponteiro; ao soltar, `onChange` recebe a nova ordem do topo.
 */
export function useServerDrag(enabled: boolean, pinnedIds: string[], onChange: (ids: string[]) => void) {
  const [drag, setDrag] = useState<Drag | null>(null);
  const [editing, setEditing] = useState(false);
  const pending = useRef<{ x: number; y: number; timer: ReturnType<typeof setTimeout> } | null>(null);
  const swallowClick = useRef(false);
  const live = useRef({ drag, pinnedIds, onChange });
  live.current = { drag, pinnedIds, onChange };

  useEffect(() => {
    if (!enabled) setEditing(false);
  }, [enabled]);

  useEffect(() => {
    const move = (e: PointerEvent) => {
      const p = pending.current;
      if (p && Math.hypot(e.clientX - p.x, e.clientY - p.y) > 10) {
        clearTimeout(p.timer);
        pending.current = null;
      }
      if (live.current.drag) {
        e.preventDefault();
        setDrag({ ...live.current.drag, x: e.clientX, y: e.clientY, over: hit(e.clientX, e.clientY) });
      }
    };
    const up = () => {
      if (pending.current) clearTimeout(pending.current.timer);
      pending.current = null;
      const d = live.current.drag;
      if (!d) return;
      swallowClick.current = true;
      const next = arrange(live.current.pinnedIds, d);
      if (next.join() !== live.current.pinnedIds.join()) live.current.onChange(next);
      setDrag(null);
    };
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
  }, []);

  /** Props para cada ícone de servidor (no topo ou na gaveta). */
  const handle = (id: string) => ({
    onPointerDown: (e: React.PointerEvent) => {
      if (!enabled || e.button > 0) return;
      const x = e.clientX;
      const y = e.clientY;
      pending.current = {
        x,
        y,
        timer: setTimeout(() => {
          pending.current = null;
          setEditing(true);
          navigator.vibrate?.(8);
          setDrag({ id, x, y, over: hit(x, y) });
        }, 280),
      };
    },
    onClickCapture: (e: React.MouseEvent) => {
      if (!swallowClick.current) return;
      swallowClick.current = false;
      e.preventDefault();
      e.stopPropagation();
    },
    onContextMenu: (e: React.MouseEvent) => {
      if (enabled) e.preventDefault();
    },
  });

  return { drag, editing, setEditing, handle, preview: arrange(pinnedIds, drag) };
}

export function ServerFace({ server, className }: { server: ServerSummary; className?: string }) {
  return server.iconUrl ? (
    <img src={server.iconUrl} alt="" draggable={false} className={cx('h-12 w-12 rounded-[18px] object-cover', className)} />
  ) : (
    <span className={cx('flex h-12 w-12 items-center justify-center rounded-[18px] bg-surface-3 font-display text-base font-bold text-fg-muted', className)}>
      {initials(server.name)}
    </span>
  );
}

/** O ícone que segue o ponteiro enquanto arrasta. */
export function DragGhost({ server, x, y }: { server: ServerSummary; x: number; y: number }) {
  return (
    <div className="pointer-events-none fixed z-[100] -translate-x-1/2 -translate-y-1/2" style={{ left: x, top: y }} aria-hidden="true">
      <div className="server-drag-ghost">
        <ServerFace server={server} />
      </div>
    </div>
  );
}

/** A linha entre o topo e o servidor aberto: com a seta, abre e fecha a gaveta. */
export function DrawerLine({ open, count, onToggle }: { open: boolean; count: number; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      aria-controls="server-drawer"
      aria-label={open ? 'Fechar a gaveta de servidores' : `Abrir a gaveta de servidores${count ? ` (mais ${count})` : ''}`}
      title={open ? 'Fechar a gaveta' : count ? `Mais ${count} na gaveta` : 'Gaveta de servidores'}
      data-tour="server-drawer"
      className="group relative flex h-5 w-full shrink-0 items-center justify-center"
    >
      <span className="absolute inset-x-0 top-1/2 h-px bg-line" />
      <span className="relative flex h-5 w-9 items-center justify-center rounded-full border border-line bg-surface-2 text-fg-subtle transition-colors group-hover:border-line-strong group-hover:text-fg">
        <ChevronDown size={14} strokeWidth={2.5} className={cx('transition-transform duration-300', open && 'rotate-180')} />
      </span>
    </button>
  );
}

/** A gaveta: abre na linha, empurrando o servidor aberto para baixo. Só os ícones, sem texto. */
export function ServerDrawerPanel({
  open,
  servers,
  activeId,
  dragId,
  editing,
  handle,
  onOpen,
  onPin,
  onStopEditing,
}: {
  open: boolean;
  servers: ServerSummary[];
  activeId: string | null;
  dragId: string | null;
  editing: boolean;
  handle: (id: string) => object;
  onOpen: (id: string) => void;
  onPin: (id: string) => void;
  onStopEditing: () => void;
}) {
  return (
    <div
      id="server-drawer"
      role="region"
      aria-label="Gaveta de servidores"
      inert={!open}
      className={cx('grid transition-[grid-template-rows] duration-300 ease-out', open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]')}
    >
      <div className="overflow-hidden">
        <div
          data-drop="drawer"
          onClick={(e) => e.target === e.currentTarget && onStopEditing()}
          className={cx(
            'server-drawer-tray mx-3 mb-1 flex min-h-[72px] flex-wrap content-start gap-2 rounded-[22px] bg-surface-1 p-3',
            open && 'server-drawer-open',
            dragId && 'outline-2 outline-offset-[-2px] outline-accent/40 outline-dashed',
          )}
        >
          {servers.map((s, i) => (
            <button
              key={s.id}
              type="button"
              title={s.name}
              aria-label={editing ? `${s.name}: toque para pôr no topo` : `Abrir ${s.name}`}
              aria-current={s.id === activeId ? 'true' : undefined}
              {...handle(s.id)}
              onClick={() => (editing ? onPin(s.id) : onOpen(s.id))}
              style={{ animationDelay: `${40 + i * 25}ms` }}
              className={cx(
                'server-drawer-item relative shrink-0 touch-none rounded-[18px] transition-opacity select-none',
                s.id === activeId && 'ring-[3px] ring-accent',
                s.id === dragId && 'opacity-30',
              )}
            >
              <span className={cx('block', editing && 'server-drawer-jiggle', editing && i % 2 === 1 && 'server-drawer-jiggle-alt')}>
                <ServerFace server={s} />
              </span>
            </button>
          ))}
          {servers.length === 0 && (
            <p className="pointer-events-none m-auto px-2 text-center text-xs text-fg-subtle">
              {dragId ? 'Solte aqui para guardar na gaveta.' : 'Todos os seus servidores já estão no topo.'}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
