// Editores dos modos 2 e 3 do laboratório de layout, dentro da Oficina.
// - SlotEditor (modo 2 · Encaixes): arrastar um bloco acende os lugares onde ele pode ficar e apaga os outros.
// - RoomEditor (modo 3 · tela da sala): o que vai em cada lateral e a ordem dos botões da barra de interação.
import { ArrowLeftRight, Clapperboard, EyeOff, GripVertical, Headphones, Lock, Mic, MonitorUp, PhoneOff, Scissors, Smile, Sparkles, Sticker, Video, Volume2 } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  DOCK_FIXED,
  DOCK_ITEMS,
  SLOT_LIMITS,
  ROOM_LIMITS,
  WIDGET_INFO,
  type BlockPlacement,
  type DockItem,
  type RoomLayout,
  type RoomSide,
  type SlotLayout,
  type SlotSizes,
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

  // redimensionar (mesmos mínimos do modo 1): colunas, divisão canais/membros e a faixa de cima
  const [fw, setFw] = useState(800);
  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setFw(el.clientWidth));
    ro.observe(el);
    setFw(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  const AREA = { w: 1068, h: 520 };
  const scale = fw / AREA.w;
  type Resize =
    | { kind: 'col'; side: 'left' | 'right'; at: number; start: number; min: number; max: number }
    | { kind: 'split'; side: 'left' | 'right'; at: number; start: number; min: number; max: number; colH: number }
    | { kind: 'top'; at: number; start: number; min: number; max: number };
  const [resize, setResize] = useState<(Resize & { x: number; y: number; value: number }) | null>(null);
  const [draft, setDraft] = useState<SlotSizes | null>(null);
  const sizes: SlotSizes = draft ?? slots.sizes ?? {};
  const colW = (side: 'left' | 'right') => sizes[side] ?? SLOT_LIMITS.colDefault;
  const topH = sizes.top ?? SLOT_LIMITS.topDefault;
  const splitOf = (side: 'left' | 'right') => (side === 'left' ? sizes.leftSplit : sizes.rightSplit) ?? 60;
  const colVisible = (side: 'left' | 'right') => slots.channels === side || slots.members === side || widgets.some((w) => slots.widgets[w.id] === side);
  /** altura útil (px reais) para canais + membros numa coluna, tirando a faixa, a barra de baixo, a voz e os widgets */
  const columnRoom = (side: 'left' | 'right') => {
    let h = AREA.h;
    if (widgets.some((w) => slots.widgets[w.id] === 'top')) h -= topH + 16;
    if (slots.voicebar === 'bottom') h -= 76 + 16;
    if (slots.voicebar === 'column' && slots.channels === side) h -= 150 + 16;
    h -= widgets.filter((w) => slots.widgets[w.id] === side).length * (140 + 16);
    return h - 16;
  };
  const startResize = (e: React.PointerEvent, r: Resize) => {
    if (readOnly || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setResize({ ...r, x: e.clientX, y: e.clientY, value: r.start });
  };
  const moveResize = (e: React.PointerEvent) => {
    if (!resize) return false;
    const d = resize.kind === 'col' ? (e.clientX - resize.at) / scale : (e.clientY - resize.at) / scale;
    let value: number;
    if (resize.kind === 'col') value = resize.start + (resize.side === 'left' ? d : -d);
    else if (resize.kind === 'split') value = resize.start + (d / resize.colH) * 100;
    else value = resize.start + d;
    value = Math.round(Math.min(resize.max, Math.max(resize.min, value)));
    setResize({ ...resize, x: e.clientX, y: e.clientY, value });
    const base = slots.sizes ?? {};
    if (resize.kind === 'col') setDraft({ ...base, ...draft, [resize.side]: value });
    else if (resize.kind === 'split') setDraft({ ...base, ...draft, [resize.side === 'left' ? 'leftSplit' : 'rightSplit']: value });
    else setDraft({ ...base, ...draft, top: value });
    return true;
  };
  const endResize = () => {
    if (!resize) return false;
    if (draft) onChange({ ...slots, sizes: draft });
    setResize(null);
    setDraft(null);
    return true;
  };
  const colLimits = (side: 'left' | 'right') => {
    const other = side === 'left' ? 'right' : 'left';
    // a conversa no centro nunca fica abaixo do mínimo do modo 1 (380 px)
    const max = Math.min(SLOT_LIMITS.col[1], AREA.w - 380 - 32 - (colVisible(other) ? colW(other) : 0));
    return { min: SLOT_LIMITS.col[0], max: Math.max(SLOT_LIMITS.col[0], max) };
  };
  /**
   * Divisão canais/membros: como no modo 1, o mínimo é garantido rolando (não proibindo). Se a coluna não tem altura
   * para canais 240 + membros 200 nessa divisão numa janela de 1100 px, ela rola; o editor avisa.
   */
  const splitLimits = (side: 'left' | 'right') => {
    const room = columnRoom(side);
    return { min: SLOT_LIMITS.split[0], max: SLOT_LIMITS.split[1], room };
  };
  const columnScrolls = (side: 'left' | 'right') => {
    const both = slots.channels === side && slots.members === side;
    if (!both) return false;
    const room = columnRoom(side);
    const split = splitOf(side) / 100;
    return room * split < 240 || room * (1 - split) < 200;
  };

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
    if (moveResize(e)) return;
    if (!drag) return;
    setDrag({ ...drag, x: e.clientX, y: e.clientY });
    setOver(zoneAt(e.clientX, e.clientY));
  };
  const drop = (e: React.PointerEvent) => {
    if (endResize()) return;
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
  const ZoneBox = ({ zone, className, style, children, hint }: { zone: Zone; className?: string; style?: React.CSSProperties; children?: ReactNode; hint?: string }) => {
    const can = drag ? ok.includes(zone) : false;
    const isOver = over === zone;
    return (
      <div data-zone={zone} style={style} className={cx('relative rounded-2xl transition-[opacity,box-shadow] duration-150', className, drag && '[&_.zone-ph]:invisible', drag && !can && 'opacity-35')}>
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
    const split = splitOf(side);
    const sl = splitLimits(side);
    return (
      <ZoneBox zone={side} className="flex min-h-0 shrink-0 flex-col gap-2 bg-surface-0/60 p-1.5" style={{ width: colW(side) * scale }}>
        {channels && (
          <div className="relative min-h-[60px]" style={{ flex: members ? split : 1 }}>
            <BlockMock b={mock('channels')} detail={detail} dragging={drag?.kind === 'channels'} compact sit={SIT} />
            {handle({ kind: 'channels' }, 'Canais')}
          </div>
        )}
        {channels && members && !readOnly && (
          <ResizeBar
            dir="row"
            active={resize?.kind === 'split' && resize.side === side}
            title="Arraste para dividir entre canais e membros"
            onPointerDown={(e) => startResize(e, { kind: 'split', side, at: e.clientY, start: split, min: sl.min, max: sl.max, colH: sl.room })}
          />
        )}
        {members && (
          <div className="relative min-h-[50px]" style={{ flex: channels ? 100 - split : 1 }}>
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
        {columnScrolls(side) && (
          <div className="zone-ph shrink-0 rounded-lg bg-warn/20 px-1.5 py-1 text-[10px] leading-snug">
            Em tela pequena (1100 px) canais e membros não cabem no mínimo aqui: a coluna rola. Leve a voz para a barra de baixo ou os membros para o outro lado.
          </div>
        )}
      </ZoneBox>
    );
  };

  const top = widgets.filter((w) => slots.widgets[w.id] === 'top');
  const stored = widgets.filter((w) => !slots.widgets[w.id]);
  return (
    <div onPointerMove={move} onPointerUp={drop} onPointerCancel={() => setDrag(null)} className="select-none">
      <div ref={frame} className="flex aspect-[1068/520] flex-col gap-2">
        <ZoneBox
          zone="top"
          className={cx('flex shrink-0 gap-2 overflow-hidden bg-surface-0/60 p-1.5', !top.length && 'h-[9%] items-center justify-center')}
          style={top.length ? { height: topH * scale } : undefined}
        >
          {top.length ? top.map((w) => widgetCard(w, true)) : <span className="zone-ph text-[11px] text-fg-subtle">faixa de cima (widgets)</span>}
        </ZoneBox>
        {top.length > 0 && !readOnly && (
          <ResizeBar
            dir="row"
            active={resize?.kind === 'top'}
            title="Arraste para mudar a altura da faixa de widgets"
            onPointerDown={(e) => startResize(e, { kind: 'top', at: e.clientY, start: topH, min: SLOT_LIMITS.top[0], max: SLOT_LIMITS.top[1] })}
          />
        )}
        <div className="flex min-h-0 flex-1 gap-2">
          {column('left')}
          {colVisible('left') && !readOnly && (
            <ResizeBar
              dir="col"
              active={resize?.kind === 'col' && resize.side === 'left'}
              title="Arraste para mudar a largura da coluna (mín. 240 px)"
              onPointerDown={(e) => startResize(e, { kind: 'col', side: 'left', at: e.clientX, start: colW('left'), ...colLimits('left') })}
            />
          )}
          <ZoneBox zone="center" className="min-w-0 flex-1" hint="o centro é só da conversa e da sala">
            <div className="relative h-full">
              <BlockMock b={mock('main')} detail={detail} dragging={false} compact sit={SIT} />
              <span className="absolute top-1.5 right-1.5 flex items-center gap-1 rounded-full bg-surface-1/95 px-2 py-1 text-[10px] font-bold text-fg-muted ring-1 ring-line">
                <Lock size={11} /> Conversa e sala · fixo no centro
              </span>
            </div>
          </ZoneBox>
          {colVisible('right') && !readOnly && (
            <ResizeBar
              dir="col"
              active={resize?.kind === 'col' && resize.side === 'right'}
              title="Arraste para mudar a largura da coluna (mín. 240 px)"
              onPointerDown={(e) => startResize(e, { kind: 'col', side: 'right', at: e.clientX, start: colW('right'), ...colLimits('right') })}
            />
          )}
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
      <p className="mt-2 text-[11px] text-fg-subtle">
        Pegue um bloco pela alça e arraste: os lugares permitidos acendem em verde. Puxe as barrinhas entre os blocos para mudar o tamanho: os mínimos são os mesmos do modo 1 (coluna 240 px, canais 240 de altura, membros 200, conversa 380 de largura), numa janela de 1100 px. A barra de servidores fica sempre em cima.
      </p>

      {resize && (
        <div className="pointer-events-none fixed z-[80] -translate-x-1/2 -translate-y-[160%] rounded-full bg-fg px-3 py-1.5 font-mono text-xs font-bold text-surface-1 shadow-xl" style={{ left: resize.x, top: resize.y }}>
          {resize.kind === 'split' ? `canais ${resize.value}% · membros ${100 - resize.value}%` : `${resize.value} px`}
          {resize.value === resize.min ? ' · mínimo' : resize.value === resize.max ? ' · máximo' : ''}
        </div>
      )}
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

/** Barrinha de redimensionar entre blocos (o mesmo gesto das divisórias da sala). */
function ResizeBar({ dir, active, disabled, title, onPointerDown }: { dir: 'row' | 'col'; active: boolean; disabled?: boolean; title: string; onPointerDown: (e: React.PointerEvent) => void }) {
  return (
    <div
      role="separator"
      aria-orientation={dir === 'col' ? 'vertical' : 'horizontal'}
      title={title}
      onPointerDown={disabled ? undefined : onPointerDown}
      className={cx('group flex shrink-0 items-center justify-center', dir === 'col' ? '-mx-1.5 w-2 cursor-col-resize' : '-my-1.5 h-2 cursor-row-resize', disabled && 'cursor-not-allowed')}
    >
      <span
        className={cx(
          'rounded-full transition-colors',
          dir === 'col' ? 'h-12 w-1.5' : 'h-1.5 w-12',
          disabled ? 'bg-danger/40' : active ? 'bg-accent' : 'bg-accent/35 group-hover:bg-accent',
        )}
      />
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

const ROOM_AREA = { w: 1068, h: 520 };

/**
 * Editor da tela da sala. A prévia é a própria montagem: arraste um painel para a outra lateral (os lugares acendem
 * em verde) ou um item da paleta para uma lateral; arraste os botões na barra para reordenar; puxe as barrinhas
 * para mudar a largura das laterais (mín. 240 px, e o palco nunca abaixo de 480). "Ver a entrada na call" anima a
 * troca da tela do servidor para esta.
 */
export function RoomEditor({ room, detail, onChange, readOnly }: { room: RoomLayout; detail: ServerDetail; onChange: (r: RoomLayout) => void; readOnly?: boolean }) {
  const [dockDrag, setDockDrag] = useState<DockItem | null>(null);
  const [panelDrag, setPanelDrag] = useState<{ what: RoomSide; from: 'left' | 'right' | 'palette'; x: number; y: number } | null>(null);
  const [overSide, setOverSide] = useState<'left' | 'right' | null>(null);
  const [demo, setDemo] = useState<'idle' | 'server' | 'room'>('idle');
  const hidden = DOCK_ITEMS.filter((d) => !room.dock.includes(d));

  // escala da prévia (a prévia é a área de uma janela de 1100 px)
  const frame = useRef<HTMLDivElement>(null);
  const [fw, setFw] = useState(800);
  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setFw(el.clientWidth));
    ro.observe(el);
    setFw(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  const scale = fw / ROOM_AREA.w;
  const [draft, setDraft] = useState<{ left?: number; right?: number } | null>(null);
  const sizes = draft ?? room.sizes ?? {};
  const sideW = (where: 'left' | 'right') => (room[where] === 'none' ? 0 : (sizes[where] ?? ROOM_LIMITS.sideDefault));
  const [resize, setResize] = useState<{ where: 'left' | 'right'; at: number; start: number; max: number; x: number; y: number; value: number } | null>(null);

  const setSides = (left: RoomSide, right: RoomSide) => onChange({ ...room, left, right });
  const place = (what: RoomSide, where: 'left' | 'right') => {
    const other = where === 'left' ? 'right' : 'left';
    const next = { left: room.left, right: room.right };
    next[where] = what;
    // a mesma coisa nas duas laterais não: a outra fica com o que estava aqui
    if (what !== 'none' && room[other] === what) next[other] = room[where];
    setSides(next.left, next.right);
  };
  const moveDock = (item: DockItem, target: DockItem) => {
    if (item === target) return;
    const list = room.dock.filter((d) => d !== item);
    list.splice(list.indexOf(target), 0, item);
    onChange({ ...room, dock: list });
  };

  // arrastar painéis (da paleta ou de uma lateral) com o ponteiro
  const sideAt = (x: number, y: number) => (document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-room-side]')?.dataset.roomSide as 'left' | 'right' | undefined) ?? null;
  const startPanel = (e: React.PointerEvent, what: RoomSide, from: 'left' | 'right' | 'palette') => {
    if (readOnly || e.button !== 0) return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setPanelDrag({ what, from, x: e.clientX, y: e.clientY });
  };
  const onMove = (e: React.PointerEvent) => {
    if (resize) {
      const d = (e.clientX - resize.at) / scale;
      const value = Math.round(Math.min(resize.max, Math.max(ROOM_LIMITS.side[0], resize.start + (resize.where === 'left' ? d : -d))));
      setResize({ ...resize, x: e.clientX, y: e.clientY, value });
      setDraft({ ...room.sizes, ...draft, [resize.where]: value });
      return;
    }
    if (!panelDrag) return;
    setPanelDrag({ ...panelDrag, x: e.clientX, y: e.clientY });
    setOverSide(sideAt(e.clientX, e.clientY));
  };
  const onUp = (e: React.PointerEvent) => {
    if (resize) {
      if (draft) onChange({ ...room, sizes: draft });
      setResize(null);
      setDraft(null);
      return;
    }
    if (!panelDrag) return;
    const target = sideAt(e.clientX, e.clientY);
    const d = panelDrag;
    setPanelDrag(null);
    setOverSide(null);
    if (!target || target === d.from) return;
    if (d.from === 'palette') place(d.what, target);
    // painel de uma lateral solto na outra: troca os dois lados
    else setSides(room.right, room.left);
  };
  const startResize = (e: React.PointerEvent, where: 'left' | 'right') => {
    if (readOnly || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const other = where === 'left' ? 'right' : 'left';
    const max = Math.min(ROOM_LIMITS.side[1], ROOM_AREA.w - ROOM_LIMITS.stageMin - 32 - sideW(other));
    setResize({ where, at: e.clientX, start: sideW(where), max: Math.max(ROOM_LIMITS.side[0], max), x: e.clientX, y: e.clientY, value: sideW(where) });
  };

  const sideBody = (what: RoomSide) =>
    what === 'nav' ? (
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
    );

  const side = (where: 'left' | 'right') => {
    const what = room[where];
    const lit = !!panelDrag && panelDrag.from !== where;
    return (
      <motion.div
        layout
        transition={springs.snappy}
        data-room-side={where}
        className={cx('relative flex shrink-0 flex-col gap-1.5 rounded-2xl', what === 'none' && 'items-center justify-center border-2 border-dashed border-line-strong')}
        style={{ width: what === 'none' ? 64 * scale + 24 : sideW(where) * scale }}
      >
        {what !== 'none' ? sideBody(what) : <span className="px-1 text-center text-[10px] text-fg-subtle">lateral vazia</span>}
        {what !== 'none' && !readOnly && (
          <button
            type="button"
            onPointerDown={(e) => startPanel(e, what, where)}
            className="absolute top-1.5 left-1.5 z-10 flex cursor-grab items-center gap-1 rounded-full bg-surface-1/95 px-2 py-1 text-[10px] font-bold shadow ring-1 ring-line active:cursor-grabbing"
          >
            <GripVertical size={12} />
            {SIDE_LABEL[what]}
          </button>
        )}
        <AnimatePresence>
          {lit && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className={cx('pointer-events-none absolute inset-0 z-20 flex items-center justify-center rounded-2xl border-[3px] border-dashed border-ok p-2 text-center text-[11px] font-extrabold', overSide === where ? 'bg-ok/30' : 'bg-ok/12')}
            >
              {SIDE_LABEL[panelDrag!.what]} {panelDrag!.from === 'palette' ? 'vai aqui' : 'troca de lado'}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    );
  };

  // demonstração: a tela do servidor desliza até a tela da sala
  const playDemo = () => {
    setDemo('server');
    setTimeout(() => setDemo('room'), 650);
    setTimeout(() => setDemo('idle'), 2600);
  };

  return (
    <div className="space-y-3 select-none" onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={() => (setPanelDrag(null), setResize(null), setDraft(null))}>
      {/* paleta: arraste para uma lateral */}
      <div className="flex flex-wrap items-center gap-1.5 rounded-2xl bg-surface-2 p-2.5 ring-1 ring-line">
        <span className="mr-1 text-xs font-bold">Arraste para uma lateral:</span>
        {(['nav', 'chat', 'members', 'none'] as const).map((s) => (
          <button
            key={s}
            type="button"
            disabled={readOnly}
            onPointerDown={(e) => startPanel(e, s, 'palette')}
            className={cx('flex cursor-grab items-center gap-1 rounded-full px-3 py-1 text-xs font-bold', room.left === s || room.right === s ? 'bg-accent/15 text-accent' : 'bg-surface-3 text-fg-muted hover:text-fg')}
          >
            <GripVertical size={12} />
            {SIDE_LABEL[s]}
          </button>
        ))}
        <span className="mx-1 h-4 w-px bg-line" />
        <button type="button" disabled={readOnly} onClick={() => setSides(room.right, room.left)} className="flex items-center gap-1.5 rounded-full bg-surface-3 px-3 py-1 text-xs font-bold hover:bg-surface-4">
          <ArrowLeftRight size={13} /> Trocar os lados
        </button>
        <button type="button" onClick={playDemo} className="ml-auto flex items-center gap-1.5 rounded-full bg-accent px-3 py-1 text-xs font-bold text-on-accent">
          <Clapperboard size={13} /> Ver a entrada na call
        </button>
      </div>

      {/* a prévia é a montagem */}
      <div ref={frame} className="relative flex aspect-[1068/520] gap-1.5 overflow-hidden rounded-2xl bg-surface-0 p-1.5">
        {demo === 'server' ? (
          // a tela do servidor antes de entrar na call: canais à esquerda, conversa no meio, membros à direita
          <>
            <motion.div layoutId="room-demo-left" transition={springs.soft} className="w-[24%] shrink-0">
              <BlockMock b={mock('channels')} detail={detail} dragging={false} compact sit={SIT} />
            </motion.div>
            <motion.div layoutId="room-demo-main" transition={springs.soft} className="min-w-0 flex-1">
              <BlockMock b={mock('main')} detail={detail} dragging={false} compact sit={SIT} />
            </motion.div>
            <motion.div layoutId="room-demo-right" transition={springs.soft} className="w-[20%] shrink-0">
              <BlockMock b={mock('members')} detail={detail} dragging={false} compact sit={SIT} />
            </motion.div>
          </>
        ) : (
          <>
            <motion.div layoutId={demo === 'room' ? 'room-demo-left' : undefined} transition={springs.soft} className="flex">
              {side('left')}
            </motion.div>
            {room.left !== 'none' && !readOnly && <RoomResizeBar active={resize?.where === 'left'} onPointerDown={(e) => startResize(e, 'left')} />}
            <motion.div layoutId={demo === 'room' ? 'room-demo-main' : undefined} layout transition={springs.soft} className="flex min-w-0 flex-1 flex-col gap-1.5 rounded-2xl bg-surface-2 p-2 ring-1 ring-line">
              <div className="text-[11px] font-bold">{detail.channels.find((c) => c.type === 'voice')?.name ?? 'Sala'}</div>
              <div className="flex min-h-0 flex-1 items-center justify-center rounded-xl bg-surface-0 text-[11px] text-fg-subtle">palco (transmissão)</div>
              <div className="flex flex-wrap items-center justify-center gap-1 rounded-2xl bg-surface-3 p-1">
                {room.dock.map((d) => (
                  <motion.span
                    key={d}
                    layout
                    transition={springs.snappy}
                    title={`${DOCK_INFO[d].label} · arraste para reordenar`}
                    draggable={!readOnly}
                    onDragStart={() => setDockDrag(d)}
                    onDragEnd={() => setDockDrag(null)}
                    onDragOver={(e) => {
                      e.preventDefault();
                      if (dockDrag) moveDock(dockDrag, d);
                    }}
                    className={cx(
                      'flex h-7 cursor-grab items-center justify-center rounded-full transition-transform hover:scale-110',
                      d === 'share' ? 'gap-1 bg-accent px-2.5 text-[10px] font-bold text-on-accent' : d === 'leave' ? 'w-7 bg-danger text-white' : 'w-7 bg-surface-4',
                      dockDrag === d && 'scale-110 ring-2 ring-accent',
                    )}
                  >
                    {DOCK_INFO[d].icon}
                    {d === 'share' && 'Transmitir'}
                  </motion.span>
                ))}
              </div>
            </motion.div>
            {room.right !== 'none' && !readOnly && <RoomResizeBar active={resize?.where === 'right'} onPointerDown={(e) => startResize(e, 'right')} />}
            <motion.div layoutId={demo === 'room' ? 'room-demo-right' : undefined} transition={springs.soft} className="flex">
              {side('right')}
            </motion.div>
          </>
        )}
        {demo === 'server' && <span className="absolute top-2 left-1/2 -translate-x-1/2 rounded-full bg-fg px-3 py-1 text-[11px] font-bold text-surface-1">Tela do servidor · entrando na call…</span>}
      </div>
      <p className="text-[11px] text-fg-subtle">
        Arraste o painel de uma lateral para a outra para trocar, ou um item da paleta para uma lateral. Puxe as barrinhas para a largura (mín. 240 px; o palco nunca fica abaixo de 480). Arraste os botões na barra do palco para reordenar.
      </p>

      {/* barra: tirar e devolver botões */}
      <div className="rounded-2xl bg-surface-2 p-3 ring-1 ring-line">
        <div className="mb-2 text-xs font-bold">Botões da barra · clique no × para tirar</div>
        <div className="flex flex-wrap gap-1.5">
          {room.dock.map((d) => {
            const fixed = DOCK_FIXED.includes(d);
            return (
              <motion.div key={d} layout transition={springs.snappy} className={cx('flex items-center gap-1.5 rounded-full bg-surface-0 px-2.5 py-1.5 text-xs font-bold ring-1 ring-line', d === 'leave' && 'text-danger')}>
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

      {/* o que está sendo arrastado / o tamanho, seguindo o cursor */}
      {panelDrag && (
        <div className="pointer-events-none fixed z-[80] -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent px-3 py-1.5 text-xs font-bold text-on-accent shadow-xl" style={{ left: panelDrag.x, top: panelDrag.y }}>
          {SIDE_LABEL[panelDrag.what]}
          {overSide && ` → lateral ${overSide === 'left' ? 'esquerda' : 'direita'}`}
        </div>
      )}
      {resize && (
        <div className="pointer-events-none fixed z-[80] -translate-x-1/2 -translate-y-[160%] rounded-full bg-fg px-3 py-1.5 font-mono text-xs font-bold text-surface-1 shadow-xl" style={{ left: resize.x, top: resize.y }}>
          {resize.value} px{resize.value === ROOM_LIMITS.side[0] ? ' · mínimo' : resize.value === resize.max ? ' · máximo' : ''}
        </div>
      )}
    </div>
  );
}

function RoomResizeBar({ active, onPointerDown }: { active: boolean; onPointerDown: (e: React.PointerEvent) => void }) {
  return (
    <div role="separator" aria-orientation="vertical" title="Arraste para mudar a largura da lateral" onPointerDown={onPointerDown} className="group -mx-1 flex w-1.5 shrink-0 cursor-col-resize items-center justify-center">
      <span className={cx('h-12 w-1.5 rounded-full transition-colors', active ? 'bg-accent' : 'bg-accent/35 group-hover:bg-accent')} />
    </div>
  );
}
