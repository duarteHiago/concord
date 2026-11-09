import { Minus, Plus } from 'lucide-react';
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

function ServerIcon({ server, size = 'h-11 w-11 lg:h-12 lg:w-12' }: { server: ServerSummary; size?: string }) {
  return server.iconUrl ? (
    <img src={server.iconUrl} alt="" draggable={false} className={cx(size, 'rounded-[18px] object-cover')} />
  ) : (
    <span className={cx(size, 'flex items-center justify-center rounded-[18px] bg-surface-3 font-display text-base font-bold text-fg-muted')}>
      {initials(server.name)}
    </span>
  );
}

/**
 * Gaveta de servidores: abre por baixo da fileira do topo, vista de cima. Toque abre o servidor;
 * segurar (ou "Organizar") faz os ícones tremerem para escolher quais ficam no topo e em que ordem.
 */
export function ServerDrawer({
  servers,
  pinned,
  activeId,
  onOpen,
  onPinnedChange,
  onClose,
}: {
  servers: ServerSummary[];
  pinned: ServerSummary[];
  activeId: string | null;
  onOpen: (id: string) => void;
  onPinnedChange: (ids: string[]) => void;
  onClose: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [closing, setClosing] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const press = useRef<{ timer: ReturnType<typeof setTimeout>; fired: boolean } | null>(null);

  const pinnedIds = pinned.map((s) => s.id);
  const rest = servers.filter((s) => !pinnedIds.includes(s.id));
  const full = pinnedIds.length >= RAIL_MAX;

  const close = () => {
    if (closing) return;
    setClosing(true);
    setTimeout(onClose, 170);
  };

  useEffect(() => {
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (editing) setEditing(false);
      else close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(''), 2600);
    return () => clearTimeout(t);
  }, [notice]);

  const unpin = (id: string) => onPinnedChange(pinnedIds.filter((p) => p !== id));
  const pin = (id: string, at = pinnedIds.length) => {
    const next = pinnedIds.filter((p) => p !== id);
    if (next.length >= RAIL_MAX) {
      setNotice(`O topo tem lugar para ${RAIL_MAX}. Tire um antes.`);
      return;
    }
    next.splice(Math.min(at, next.length), 0, id);
    onPinnedChange(next);
  };

  // segurar meio segundo entra no modo organizar (no toque e no mouse)
  const pressStart = () => {
    if (editing) return;
    press.current = { fired: false, timer: setTimeout(() => {
      if (press.current) press.current.fired = true;
      setEditing(true);
    }, 500) };
  };
  const pressEnd = () => {
    if (press.current) clearTimeout(press.current.timer);
  };
  const tap = (id: string) => {
    if (press.current?.fired) {
      press.current = null;
      return;
    }
    press.current = null;
    if (editing) return;
    onOpen(id);
    close();
  };

  const drop = (target: 'top' | 'rest', at?: number) => (e: React.DragEvent) => {
    e.preventDefault();
    const id = dragId ?? e.dataTransfer.getData('text/plain');
    setDragId(null);
    if (!id) return;
    if (target === 'rest') unpin(id);
    else pin(id, at);
  };

  const tile = (s: ServerSummary, i: number, inTop: boolean) => (
    <li
      key={s.id}
      className="server-drawer-item flex min-w-0 flex-col items-center gap-1.5"
      style={{ animationDelay: `${60 + i * 28}ms` }}
      onDragOver={inTop && editing ? (e) => e.preventDefault() : undefined}
      onDrop={inTop && editing ? drop('top', i) : undefined}
    >
      <div className={cx('relative', editing && 'server-drawer-jiggle', editing && i % 2 === 1 && 'server-drawer-jiggle-alt')}>
        <button
          type="button"
          title={s.name}
          aria-label={editing ? `${s.name}: ${inTop ? 'no topo' : 'na gaveta'}` : `Abrir ${s.name}`}
          aria-current={s.id === activeId ? 'true' : undefined}
          draggable={editing}
          onDragStart={(e) => {
            setDragId(s.id);
            e.dataTransfer.setData('text/plain', s.id);
            e.dataTransfer.effectAllowed = 'move';
          }}
          onDragEnd={() => setDragId(null)}
          onPointerDown={pressStart}
          onPointerUp={pressEnd}
          onPointerLeave={pressEnd}
          onContextMenu={(e) => editing && e.preventDefault()}
          onClick={() => tap(s.id)}
          className={cx(
            'block rounded-[18px] transition-transform',
            !editing && 'hover:-translate-y-0.5 active:scale-95',
            s.id === activeId && 'ring-[3px] ring-accent',
            dragId === s.id && 'opacity-40',
          )}
        >
          <ServerIcon server={s} />
        </button>
        {editing && (
          <button
            type="button"
            aria-label={inTop ? `Tirar ${s.name} do topo` : `Pôr ${s.name} no topo`}
            title={inTop ? 'Tirar do topo' : full ? `O topo tem lugar para ${RAIL_MAX}` : 'Pôr no topo'}
            onClick={() => (inTop ? unpin(s.id) : pin(s.id))}
            className={cx(
              'absolute -top-1.5 -left-1.5 flex h-6 w-6 items-center justify-center rounded-full border-2 border-surface-1 shadow-md transition-transform hover:scale-110',
              inTop ? 'bg-fg text-surface-1' : full ? 'bg-surface-4 text-fg-subtle' : 'bg-accent text-on-accent',
            )}
          >
            {inTop ? <Minus size={13} strokeWidth={3} /> : <Plus size={13} strokeWidth={3} />}
          </button>
        )}
      </div>
      <span className="w-full truncate text-center text-[11px] font-semibold text-fg-muted">{s.name}</span>
    </li>
  );

  return (
    <div
      ref={ref}
      id="server-drawer"
      role="dialog"
      aria-label="Gaveta de servidores"
      tabIndex={-1}
      className={cx('server-drawer absolute inset-x-0 top-full z-40 outline-none', closing && 'server-drawer-closing')}
    >
      {/* fundo: clicar fora fecha */}
      <div className="fixed inset-0 -z-10" onClick={close} aria-hidden="true" />
      <div className="server-drawer-box mx-2 overflow-hidden rounded-b-[26px] border border-t-0 border-line-strong bg-surface-1">
        <div className="server-drawer-depth max-h-[min(70vh,520px)] overflow-y-auto px-3 pt-4 pb-3">
          <div className="mb-3 flex items-center gap-2">
            <h2 className="font-display text-sm font-bold">Seus servidores</h2>
            <span className="text-xs text-fg-subtle">{servers.length}</span>
            <button
              type="button"
              onClick={() => setEditing(!editing)}
              className={cx(
                'ml-auto rounded-full px-3 py-1 text-xs font-bold transition-colors',
                editing ? 'bg-accent text-on-accent' : 'bg-surface-3 text-fg hover:bg-surface-4',
              )}
            >
              {editing ? 'Pronto' : 'Organizar'}
            </button>
          </div>

          {/* o "dock": quem fica no topo */}
          <div
            className="rounded-[22px] bg-surface-0/70 p-2.5 ring-1 ring-line"
            onDragOver={editing ? (e) => e.preventDefault() : undefined}
            onDrop={editing ? drop('top') : undefined}
          >
            <div className="mb-2 flex items-center justify-between text-[11px] font-bold text-fg-subtle">
              <span>No topo</span>
              <span>{pinnedIds.length} de {RAIL_MAX}</span>
            </div>
            <ul className="grid grid-cols-4 gap-x-1 gap-y-3">
              {pinned.map((s, i) => tile(s, i, true))}
              {Array.from({ length: RAIL_MAX - pinned.length }, (_, i) => (
                <li key={`vazio-${i}`} className="flex flex-col items-center gap-1.5" aria-hidden="true">
                  <span className="h-11 w-11 rounded-[18px] border-2 border-dashed border-line-strong lg:h-12 lg:w-12" />
                  <span className="text-[11px] text-transparent">.</span>
                </li>
              ))}
            </ul>
          </div>

          <div
            className="mt-3 min-h-16"
            onDragOver={editing ? (e) => e.preventDefault() : undefined}
            onDrop={editing ? drop('rest') : undefined}
          >
            <div className="mb-2 px-1 text-[11px] font-bold text-fg-subtle">Na gaveta</div>
            {rest.length ? (
              <ul className="grid grid-cols-4 gap-x-1 gap-y-3">{rest.map((s, i) => tile(s, i + pinned.length, false))}</ul>
            ) : (
              <p className="px-1 pb-2 text-xs text-fg-subtle">
                {editing ? 'Arraste um servidor do topo para cá.' : 'Todos os seus servidores estão no topo.'}
              </p>
            )}
          </div>

          <p className="mt-2 min-h-4 px-1 text-[11px] text-fg-subtle" aria-live="polite">
            {notice || (editing ? 'Toque no + ou no − para escolher quem fica no topo. No computador, dá para arrastar.' : 'Segure um ícone para organizar.')}
          </p>
        </div>
        {/* puxador da gaveta */}
        <button
          type="button"
          onClick={close}
          aria-label="Fechar a gaveta"
          className="flex w-full justify-center border-t border-line bg-surface-2 py-2 hover:bg-surface-3"
        >
          <span className="h-1.5 w-12 rounded-full bg-line-strong" />
        </button>
      </div>
    </div>
  );
}
