// Editores dos modos 2 e 3 do laboratório de layout, dentro da Oficina.
// - SlotEditor (modo 2 · Encaixes): arrastar um bloco acende os lugares onde ele pode ficar e apaga os outros.
// - RoomEditor (modo 3 · tela da sala): o que vai em cada lateral e a ordem dos botões da barra de interação.
import { ArrowLeftRight, Clapperboard, EyeOff, GripVertical, Headphones, Lock, Mic, MonitorUp, PhoneOff, Scissors, Smile, Sparkles, Sticker, Video, Volume2 } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useRef, useState, type ReactNode } from 'react';
import {
  DOCK_FIXED,
  DOCK_ITEMS,
  WIDGET_INFO,
  type BlockPlacement,
  type DockItem,
  type RoomLayout,
  type RoomSide,
  type SlotLayout,
  type SlotZone,
  type WidgetPlacement,
} from '../../../shared/workshop.ts';
import { cx } from '../components/ui';
import type { ServerDetail } from '../lib/types';
import { WidgetCard } from './Card';
import { labMode, useLab } from './lab';
import { BlockMock } from './Mocks';
import { springs } from './motion';
import { WidgetBody, type WidgetContext } from './widgets';

const mock = (b: BlockPlacement['block']): BlockPlacement => ({ id: b, type: 'block', block: b, x: 0, y: 0, w: 1, h: 1 });
const SIT = { inCall: false, voiceRoom: false, adaptive: true };

/** Faixa no topo do editor: em que modo a pessoa está montando (e onde troca). */
export function ModeBadge() {
  const mode = useLab((s) => s.mode);
  const setOpen = useLab((s) => s.setOpen);
  const m = labMode(mode);
  return (
    <div className="mb-3 flex items-center gap-2.5 rounded-2xl px-3 py-2 text-white" style={{ background: m.color }}>
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/25 font-display text-sm font-extrabold">{m.n}</span>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-extrabold">Montando no modo {m.n} · {m.label}</div>
        <div className="text-[11px] opacity-90">Em teste: a escolha do modo vale só no seu navegador. Fora da Oficina, o botão colorido no canto mostra o modo.</div>
      </div>
      <button type="button" onClick={() => setOpen(true)} className="shrink-0 rounded-full bg-white/25 px-3 py-1.5 text-xs font-bold hover:bg-white/35">
        Trocar modo
      </button>
    </div>
  );
}

// ---------------------------------------------------------------- modo 2 · encaixes

type DragKind = { kind: 'channels' | 'members' | 'voicebar' } | { kind: 'widget'; id: string };
type Zone = SlotZone | 'bottom' | 'center' | 'hidden';

const ZONE_LABEL: Record<Zone, string> = { top: 'faixa de cima', left: 'coluna esquerda', right: 'coluna direita', bottom: 'barra de baixo', center: 'centro', hidden: 'guardado (fora da tela)' };

function allowed(d: DragKind, slots: SlotLayout): Zone[] {
  switch (d.kind) {
    case 'channels':
      return ['left', 'right'];
    case 'members':
      return ['left', 'right', 'hidden'];
    case 'voicebar':
      // embaixo da coluna dos canais, ou a barra de baixo inteira
      return [slots.channels, 'bottom'];
    case 'widget':
      return ['top', 'left', 'right', 'hidden'];
  }
}

function dragLabel(d: DragKind, widgets: WidgetPlacement[]): string {
  if (d.kind !== 'widget') return { channels: 'Canais e salas', members: 'Membros', voicebar: 'Voz e perfil' }[d.kind];
  const id = d.id;
  const type = widgets.find((w) => w.id === id)?.type;
  return type ? WIDGET_INFO[type].label : 'Widget';
}

export function SlotEditor({
  slots,
  widgets,
  detail,
  ctx,
  selected,
  onSelect,
  onChange,
  readOnly,
}: {
  slots: SlotLayout;
  widgets: WidgetPlacement[];
  detail: ServerDetail;
  ctx: WidgetContext;
  selected: string | null;
  onSelect: (id: string | null) => void;
  onChange: (s: SlotLayout) => void;
  readOnly?: boolean;
}) {
  const [drag, setDrag] = useState<(DragKind & { x: number; y: number }) | null>(null);
  const [over, setOver] = useState<Zone | null>(null);
  const frame = useRef<HTMLDivElement>(null);
  const ok = drag ? allowed(drag, slots) : [];

  const zoneAt = (x: number, y: number): Zone | null => {
    const el = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-zone]');
    return (el?.dataset.zone as Zone | undefined) ?? null;
  };
  const start = (e: React.PointerEvent, d: DragKind) => {
    if (readOnly || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setDrag({ ...d, x: e.clientX, y: e.clientY });
  };
  const move = (e: React.PointerEvent) => {
    if (!drag) return;
    setDrag({ ...drag, x: e.clientX, y: e.clientY });
    setOver(zoneAt(e.clientX, e.clientY));
  };
  const drop = (e: React.PointerEvent) => {
    if (!drag) return;
    const z = zoneAt(e.clientX, e.clientY);
    setDrag(null);
    setOver(null);
    if (!z || !allowed(drag, slots).includes(z)) return;
    const next: SlotLayout = { ...slots, widgets: { ...slots.widgets } };
    if (drag.kind === 'channels') next.channels = z as 'left' | 'right';
    else if (drag.kind === 'members') next.members = z as 'left' | 'right' | 'hidden';
    else if (drag.kind === 'voicebar') next.voicebar = z === 'bottom' ? 'bottom' : 'column';
    else if (drag.kind === 'widget') {
      if (z === 'hidden') delete next.widgets[drag.id];
      else next.widgets[drag.id] = z as SlotZone;
    }
    onChange(next);
  };

  /** Um lugar da tela. Arrastando: verde se o bloco pode ir, apagado se não pode. */
  const ZoneBox = ({ zone, className, children, hint }: { zone: Zone; className?: string; children?: ReactNode; hint?: string }) => {
    const can = drag ? ok.includes(zone) : false;
    const isOver = over === zone;
    return (
      <div data-zone={zone} className={cx('relative rounded-2xl transition-[opacity,box-shadow] duration-150', className, drag && '[&_.zone-ph]:invisible', drag && !can && 'opacity-35')}>
        {children}
        <AnimatePresence>
          {drag && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className={cx(
                'pointer-events-none absolute inset-0 z-20 flex items-center justify-center rounded-2xl border-[3px] border-dashed p-2 text-center text-[12px] font-extrabold',
                can ? (isOver ? 'border-ok bg-ok/30 text-fg' : 'border-ok bg-ok/12 text-fg') : 'border-transparent text-fg-subtle',
              )}
            >
              {can ? `${dragLabel(drag, widgets)} pode ficar aqui` : (hint ?? '')}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  };

  const handle = (d: DragKind, label: string) =>
    !readOnly && (
      <button
        type="button"
        onPointerDown={(e) => start(e, d)}
        className="absolute top-1.5 right-1.5 z-10 flex cursor-grab items-center gap-1 rounded-full bg-surface-1/95 px-2 py-1 text-[10px] font-bold shadow ring-1 ring-line active:cursor-grabbing"
      >
        <GripVertical size={12} />
        {label}
      </button>
    );

  const widgetCard = (w: WidgetPlacement, small = false) => (
    <div
      key={w.id}
      className={cx('relative flex shrink-0', small ? 'h-full w-[180px]' : 'min-h-[110px]', selected === w.id && !readOnly && 'rounded-2xl outline-2 outline-offset-2 outline-accent')}
      onPointerDown={() => !readOnly && onSelect(w.id)}
    >
      <WidgetCard ctx={ctx} className="h-full w-full p-2.5 text-[12px]">
        <div className="pointer-events-none h-full">
          <WidgetBody w={w} ctx={ctx} />
        </div>
      </WidgetCard>
      {handle({ kind: 'widget', id: w.id }, WIDGET_INFO[w.type].label)}
    </div>
  );

  const column = (side: 'left' | 'right') => {
    const channels = slots.channels === side;
    const members = slots.members === side;
    const ws = widgets.filter((w) => slots.widgets[w.id] === side);
    return (
      <ZoneBox zone={side} className="flex min-h-0 w-[24%] shrink-0 flex-col gap-2 bg-surface-0/60 p-1.5">
        {channels && (
          <div className="relative min-h-[120px] flex-[3]">
            <BlockMock b={mock('channels')} detail={detail} dragging={drag?.kind === 'channels'} compact sit={SIT} />
            {handle({ kind: 'channels' }, 'Canais')}
          </div>
        )}
        {members && (
          <div className="relative min-h-[90px] flex-[2]">
            <BlockMock b={mock('members')} detail={detail} dragging={drag?.kind === 'members'} compact sit={SIT} />
            {handle({ kind: 'members' }, 'Membros')}
          </div>
        )}
        {ws.map((w) => widgetCard(w))}
        {channels && slots.voicebar === 'column' && (
          <div className="relative h-[54px] shrink-0">
            <BlockMock b={mock('voicebar')} detail={detail} dragging={drag?.kind === 'voicebar'} compact sit={SIT} />
            {handle({ kind: 'voicebar' }, 'Voz')}
          </div>
        )}
        {!channels && !members && !ws.length && <div className="zone-ph flex flex-1 items-center justify-center text-center text-[11px] text-fg-subtle">coluna vazia</div>}
      </ZoneBox>
    );
  };

  const top = widgets.filter((w) => slots.widgets[w.id] === 'top');
  const stored = widgets.filter((w) => !slots.widgets[w.id]);
  return (
    <div onPointerMove={move} onPointerUp={drop} onPointerCancel={() => setDrag(null)} className="select-none">
      <div ref={frame} className="flex aspect-[1068/520] flex-col gap-2">
        <ZoneBox zone="top" className={cx('flex shrink-0 gap-2 overflow-hidden bg-surface-0/60 p-1.5', top.length ? 'h-[22%]' : 'h-[9%] items-center justify-center')}>
          {top.length ? top.map((w) => widgetCard(w, true)) : <span className="zone-ph text-[11px] text-fg-subtle">faixa de cima (widgets)</span>}
        </ZoneBox>
        <div className="flex min-h-0 flex-1 gap-2">
          {column('left')}
          <ZoneBox zone="center" className="min-w-0 flex-1" hint="o centro é só da conversa e da sala">
            <div className="relative h-full">
              <BlockMock b={mock('main')} detail={detail} dragging={false} compact sit={SIT} />
              <span className="absolute top-1.5 right-1.5 flex items-center gap-1 rounded-full bg-surface-1/95 px-2 py-1 text-[10px] font-bold text-fg-muted ring-1 ring-line">
                <Lock size={11} /> Conversa e sala · fixo no centro
              </span>
            </div>
          </ZoneBox>
          {column('right')}
        </div>
        <ZoneBox zone="bottom" className={cx('flex shrink-0 items-center justify-center bg-surface-0/60 p-1.5', slots.voicebar === 'bottom' ? 'h-[12%]' : 'h-[7%]')}>
          {slots.voicebar === 'bottom' ? (
            <div className="relative h-full w-full">
              <BlockMock b={mock('voicebar')} detail={detail} dragging={drag?.kind === 'voicebar'} compact sit={SIT} />
              {handle({ kind: 'voicebar' }, 'Voz')}
            </div>
          ) : (
            <span className="zone-ph text-[11px] text-fg-subtle">barra de baixo (só voz e perfil)</span>
          )}
        </ZoneBox>
      </div>

      {/* guardados: membros escondidos e widgets fora da tela */}
      <ZoneBox zone="hidden" className="mt-3 flex min-h-[64px] flex-wrap items-center gap-2 border-2 border-dashed border-line p-2">
        <span className="flex items-center gap-1 text-[11px] font-bold text-fg-subtle">
          <EyeOff size={13} /> Guardados (não aparecem):
        </span>
        {slots.members === 'hidden' && (
          <button type="button" onPointerDown={(e) => start(e, { kind: 'members' })} className="flex cursor-grab items-center gap-1 rounded-full bg-surface-3 px-2.5 py-1 text-[11px] font-bold">
            <GripVertical size={12} /> Membros
          </button>
        )}
        {stored.map((w) => (
          <button key={w.id} type="button" onPointerDown={(e) => start(e, { kind: 'widget', id: w.id })} className="flex cursor-grab items-center gap-1 rounded-full bg-surface-3 px-2.5 py-1 text-[11px] font-bold">
            <GripVertical size={12} /> {WIDGET_INFO[w.type].label}
          </button>
        ))}
        {slots.members !== 'hidden' && !stored.length && <span className="zone-ph text-[11px] text-fg-subtle">nada guardado. Widgets novos chegam aqui; arraste para uma zona.</span>}
      </ZoneBox>
      <p className="mt-2 text-[11px] text-fg-subtle">Pegue um bloco pela alça e arraste: os lugares permitidos acendem em verde. A barra de servidores fica sempre em cima.</p>

      {/* o que está sendo arrastado segue o cursor */}
      {drag && (
        <div className="pointer-events-none fixed z-[80] -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent px-3 py-1.5 text-xs font-bold text-on-accent shadow-xl" style={{ left: drag.x, top: drag.y }}>
          {dragLabel(drag, widgets)}
          {over && ` → ${ZONE_LABEL[over]}`}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- modo 3 · tela da sala

const SIDE_LABEL: Record<RoomSide, string> = { nav: 'Servidores e salas', chat: 'Papo da sala', members: 'Membros', none: 'Nada' };

const DOCK_INFO: Record<DockItem, { label: string; icon: ReactNode }> = {
  mic: { label: 'Microfone', icon: <Mic size={15} /> },
  deafen: { label: 'Fone', icon: <Headphones size={15} /> },
  camera: { label: 'Câmera', icon: <Video size={15} /> },
  effects: { label: 'Efeitos de voz', icon: <Sparkles size={15} /> },
  sounds: { label: 'Mesa de sons', icon: <Volume2 size={15} /> },
  reactions: { label: 'Reações', icon: <Smile size={15} /> },
  stickers: { label: 'Figurinhas', icon: <Sticker size={15} /> },
  clip: { label: 'Clipe', icon: <Scissors size={15} /> },
  share: { label: 'Transmitir', icon: <MonitorUp size={15} /> },
  leave: { label: 'Sair', icon: <PhoneOff size={15} /> },
};

export function RoomEditor({ room, detail, onChange, readOnly }: { room: RoomLayout; detail: ServerDetail; onChange: (r: RoomLayout) => void; readOnly?: boolean }) {
  const [dragging, setDragging] = useState<DockItem | null>(null);
  const hidden = DOCK_ITEMS.filter((d) => !room.dock.includes(d));

  const setSide = (where: 'left' | 'right', what: RoomSide) => {
    const other = where === 'left' ? 'right' : 'left';
    // a mesma coisa nas duas laterais não: troca de lado
    const next = { ...room, [where]: what } as RoomLayout;
    if (what !== 'none' && room[other] === what) next[other] = room[where];
    onChange(next);
  };
  const moveTo = (item: DockItem, target: DockItem) => {
    if (item === target) return;
    const list = room.dock.filter((d) => d !== item);
    list.splice(list.indexOf(target), 0, item);
    onChange({ ...room, dock: list });
  };

  const sidePicker = (where: 'left' | 'right') => (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="w-28 text-xs font-bold">{where === 'left' ? 'Lateral esquerda' : 'Lateral direita'}</span>
      {(['nav', 'chat', 'members', 'none'] as const).map((s) => (
        <button
          key={s}
          type="button"
          disabled={readOnly}
          onClick={() => setSide(where, s)}
          className={cx('rounded-full px-3 py-1 text-xs font-bold', room[where] === s ? 'bg-accent text-on-accent' : 'bg-surface-3 text-fg-muted hover:text-fg')}
        >
          {SIDE_LABEL[s]}
        </button>
      ))}
    </div>
  );

  const preview = (what: RoomSide) =>
    what === 'none' ? null : (
      <motion.div layout transition={springs.snappy} className="flex w-[22%] shrink-0 flex-col gap-1.5">
        {what === 'nav' ? (
          <>
            <div className="min-h-0 flex-1">
              <BlockMock b={mock('channels')} detail={detail} dragging={false} compact sit={SIT} />
            </div>
            <div className="h-[50px] shrink-0">
              <BlockMock b={mock('voicebar')} detail={detail} dragging={false} compact sit={{ ...SIT, inCall: true }} />
            </div>
          </>
        ) : what === 'members' ? (
          <BlockMock b={mock('members')} detail={detail} dragging={false} compact sit={SIT} />
        ) : (
          <div className="flex h-full flex-col rounded-2xl bg-surface-2 p-2 text-[11px] ring-1 ring-line">
            <div className="mb-1.5 text-[10px] font-extrabold tracking-wider text-fg-subtle uppercase">Papo da sala</div>
            <div className="min-h-0 flex-1 space-y-1.5">
              {[60, 85, 40].map((w, i) => (
                <span key={i} className="block h-2 rounded-full bg-surface-4" style={{ width: `${w}%` }} />
              ))}
            </div>
            <span className="rounded-full bg-surface-3 px-2 py-1 text-[10px] text-fg-subtle">Mensagem…</span>
          </div>
        )}
      </motion.div>
    );

  return (
    <div className="space-y-4">
      <div className="space-y-2 rounded-2xl bg-surface-2 p-3 ring-1 ring-line">
        {sidePicker('left')}
        {sidePicker('right')}
        <button
          type="button"
          disabled={readOnly}
          onClick={() => onChange({ ...room, left: room.right, right: room.left })}
          className="flex items-center gap-1.5 rounded-full bg-surface-3 px-3 py-1 text-xs font-bold hover:bg-surface-4"
        >
          <ArrowLeftRight size={13} /> Trocar os lados
        </button>
      </div>

      <div className="rounded-2xl bg-surface-2 p-3 ring-1 ring-line">
        <div className="mb-2 text-xs font-bold">Barra de interação · arraste para reordenar, clique no × para tirar</div>
        <div className="flex flex-wrap gap-1.5">
          {room.dock.map((d) => {
            const fixed = DOCK_FIXED.includes(d);
            return (
              <motion.div
                key={d}
                layout
                transition={springs.snappy}
                draggable={!readOnly}
                onDragStart={() => setDragging(d)}
                onDragEnd={() => setDragging(null)}
                onDragOver={(e) => {
                  e.preventDefault();
                  if (dragging) moveTo(dragging, d);
                }}
                className={cx('flex cursor-grab items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs font-bold ring-1', dragging === d ? 'bg-accent text-on-accent ring-accent' : 'bg-surface-0 ring-line', d === 'leave' && 'text-danger')}
              >
                <GripVertical size={12} className="opacity-50" />
                {DOCK_INFO[d].icon}
                {DOCK_INFO[d].label}
                {fixed ? (
                  <Lock size={11} className="opacity-50" aria-label="fixo" />
                ) : (
                  !readOnly && (
                    <button type="button" aria-label={`Tirar ${DOCK_INFO[d].label}`} onClick={() => onChange({ ...room, dock: room.dock.filter((x) => x !== d) })} className="ml-0.5 rounded-full px-1 text-fg-muted hover:bg-surface-3 hover:text-fg">
                      ×
                    </button>
                  )
                )}
              </motion.div>
            );
          })}
        </div>
        {hidden.length > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] text-fg-subtle">Fora da barra (clique para voltar):</span>
            {hidden.map((d) => (
              <button key={d} type="button" disabled={readOnly} onClick={() => onChange({ ...room, dock: [...room.dock.slice(0, -1), d, room.dock.at(-1)!] })} className="flex items-center gap-1 rounded-full bg-surface-3 px-2.5 py-1 text-[11px] font-bold text-fg-muted hover:text-fg">
                {DOCK_INFO[d].icon}
                {DOCK_INFO[d].label}
              </button>
            ))}
          </div>
        )}
        <p className="mt-2 text-[11px] text-fg-subtle">Microfone, fone e sair ficam sempre na barra.</p>
      </div>

      {/* prévia da tela da sala */}
      <div>
        <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-extrabold tracking-wider text-fg-subtle uppercase">
          <Clapperboard size={13} /> Como fica a tela da sala
        </div>
        <div className="flex aspect-[1068/520] gap-1.5 rounded-2xl bg-surface-0 p-1.5">
          {preview(room.left)}
          <motion.div layout transition={springs.snappy} className="flex min-w-0 flex-1 flex-col gap-1.5 rounded-2xl bg-surface-2 p-2 ring-1 ring-line">
            <div className="text-[11px] font-bold">{detail.channels.find((c) => c.type === 'voice')?.name ?? 'Sala'}</div>
            <div className="flex min-h-0 flex-1 items-center justify-center rounded-xl bg-surface-0 text-[11px] text-fg-subtle">palco (transmissão)</div>
            <div className="flex flex-wrap items-center justify-center gap-1 rounded-2xl bg-surface-3 p-1">
              {room.dock.map((d) => (
                <motion.span key={d} layout transition={springs.snappy} title={DOCK_INFO[d].label} className={cx('flex h-6 items-center justify-center rounded-full', d === 'share' ? 'gap-1 bg-accent px-2 text-[9px] font-bold text-on-accent' : d === 'leave' ? 'w-6 bg-danger text-white' : 'w-6 bg-surface-4')}>
                  {DOCK_INFO[d].icon}
                  {d === 'share' && 'Transmitir'}
                </motion.span>
              ))}
            </div>
          </motion.div>
          {preview(room.right)}
        </div>
      </div>
    </div>
  );
}
