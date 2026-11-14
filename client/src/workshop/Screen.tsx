// Tela do servidor montada na Oficina. A barra de servidores fica fixa em cima (é por ela que a pessoa sai do
// servidor). Vale só em tela larga, fora das telas do sistema (configurações, perfil, Novidades), e cada membro
// pode voltar ao layout padrão.
//
// Laboratório de layout (lab.ts, só no Concord de testes): três modos, escolhidos no botão flutuante.
// 1 · Livre com limites: a grade 12×12 do dono; cada bloco principal recebe o mínimo em pixels da situação.
// 2 · Encaixes: lugares fixos (SlotLayout do dono): conversa no centro, canais/membros/voz nos lugares deles.
// 3 · Livre + tela de call: a grade do 1 e, com uma sala de voz aberta, a tela da sala (RoomLayout do dono),
//     com a mesma animação de layout da troca para as conversas privadas.
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import {
  SCREEN_COLS,
  SCREEN_ROWS,
  defaultRoom,
  defaultScreen,
  defaultSlots,
  isBlock,
  ROOM_LIMITS,
  SLOT_LIMITS,
  type RoomLayout,
  type RoomSide,
  type ScreenItem,
  type SlotLayout,
  type WidgetPlacement,
  type WorkshopConfig,
} from '../../../shared/workshop.ts';
import { ChannelsBlock, VoiceUserBlock } from '../components/ChannelSidebar';
import { Composer, MessageFeed } from '../components/ChatView';
import { MemberListBody } from '../components/MemberList';
import { ServerStrip } from '../components/ServerRail';
import { cx } from '../components/ui';
import { VoiceView } from '../components/VoiceView';
import { HOME, useApp } from '../store/app';
import { useVoice } from '../store/voice';
import { WidgetCard } from './Card';
import { LAB_SPRING, limitTracks, useLab, type CoreBlock, type LabMode } from './lab';
import { WORKSHOP_ENABLED, useActiveConfig, workshopPrefs } from './store';
import type { ThemeScope } from './theme';
import { WidgetBody } from './widgets';
import './lab.css';

/** Largura mínima para a tela montada (abaixo disso, o layout padrão, que já se adapta). */
const MIN_WIDTH = 1100;

function useWide() {
  const query = `(min-width: ${MIN_WIDTH}px)`;
  const [wide, setWide] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setWide(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [query]);
  return wide;
}

export interface ScreenPlan {
  config: WorkshopConfig;
  items: ScreenItem[];
  mode: LabMode;
}

/** Como montar a tela do servidor agora; null = layout padrão (que também é o das conversas privadas). */
export function useServerScreen(): ScreenPlan | null {
  const serverId = useApp((s) => s.activeServerId);
  const systemOpen = useApp((s) => s.releasesOpen || !!s.profile || !!s.settings);
  useApp((s) => s.me?.settings); // preferências
  const config = useActiveConfig(serverId && serverId !== HOME ? serverId : null);
  const mode = useLab((s) => s.mode);
  const wide = useWide();
  if (!WORKSHOP_ENABLED || !wide || systemOpen || !serverId || serverId === HOME) return null;
  // só servidor com tela montada na Oficina; os outros ficam com o layout normal do Concord
  if (!config || !(config.screen || config.slots || config.room) || !workshopPrefs().layouts) return null;
  return { config, items: config.screen?.items ?? defaultScreen(), mode };
}

/** A sala aberta agora é de voz? (a tela da sala e os mínimos do bloco principal dependem disso) */
export function useVoiceRoomOpen() {
  return useApp((s) => {
    const sid = s.activeServerId;
    const cid = sid ? s.activeChannels[sid] : undefined;
    return !!(sid && cid && s.details[sid]?.channels.find((c) => c.id === cid)?.type === 'voice');
  });
}

export function ServerScreen({ plan, main, theme }: { plan: ScreenPlan; main: ReactNode; theme: ThemeScope | null }) {
  // modo 3: a tela da sala é a da call. Só abrir a sala de voz continua na tela do servidor (com o "Entrar na
  // sala" no lugar da conversa); ao entrar na call, a tela desliza para a tela da sala e fica enquanto durar a call
  const activeServerId = useApp((s) => s.activeServerId);
  const inCallHere = useVoice((s) => s.status !== 'idle' && s.serverId === activeServerId);
  const widgets = plan.items.filter((i): i is WidgetPlacement => !isBlock(i));
  if (plan.mode === 'encaixes') return <SlotScreen slots={plan.config.slots ?? defaultSlots()} widgets={widgets} main={main} theme={theme} />;
  if (plan.mode === 'call' && inCallHere) return <RoomScreen room={plan.config.room ?? defaultRoom()} main={main} theme={theme} />;
  return <GridScreen items={plan.items} main={main} theme={theme} animate={plan.mode === 'call'} />;
}

// ---------------------------------------------------------------- modos 1 e 3: a grade com limites

function GridScreen({ items, main, theme, animate }: { items: ScreenItem[]; main: ReactNode; theme: ThemeScope | null; animate: boolean }) {
  const inCall = useVoice((s) => s.status !== 'idle');
  const voiceRoom = useVoiceRoomOpen();
  // o tamanho da área decide quais linhas e colunas precisam ficar fixas no mínimo
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ w: number; h: number } | undefined>(undefined);
  useEffect(() => {
    const el = box.current?.parentElement;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const tracks = limitTracks(items, { inCall, voiceRoom }, size);
  return (
    <ScreenRoot theme={theme}>
      <div className="flex min-h-0 flex-1 flex-col overflow-auto">
        <div ref={box} className="grid min-h-0 flex-1 shrink-0 gap-4" style={{ gridTemplateColumns: tracks.cols, gridTemplateRows: tracks.rows }}>
          <AnimatePresence initial={false}>
            {items.map((it) => (
              <Slot key={it.id} id={isBlock(it) ? it.block : it.id} block={isBlock(it) ? it.block : null} animate={animate} style={{ gridColumn: `${it.x + 1} / span ${it.w}`, gridRow: `${it.y + 1} / span ${it.h}` }}>
                {isBlock(it) ? <CoreBlockBody block={it.block} main={main} /> : <ScreenWidget w={it} />}
              </Slot>
            ))}
          </AnimatePresence>
        </div>
      </div>
    </ScreenRoot>
  );
}

// ---------------------------------------------------------------- modo 2: encaixes

function SlotScreen({ slots, widgets, main, theme }: { slots: SlotLayout; widgets: WidgetPlacement[]; main: ReactNode; theme: ThemeScope | null }) {
  const inZone = (z: 'top' | 'left' | 'right') => widgets.filter((w) => slots.widgets[w.id] === z);
  const sizes = slots.sizes ?? {};
  const column = (side: 'left' | 'right') => {
    const channels = slots.channels === side;
    const members = slots.members === side;
    const ws = inZone(side);
    if (!channels && !members && !ws.length) return null;
    // tamanhos do dono, com os mesmos mínimos do modo 1 (coluna 240, canais 240 de altura, membros 200)
    const width = sizes[side] ?? SLOT_LIMITS.colDefault;
    const split = (side === 'left' ? sizes.leftSplit : sizes.rightSplit) ?? 60;
    return (
      // canais 240 e membros 200 de altura no mínimo: se a janela for baixa, a coluna rola (como o modo 1)
      <div className="flex shrink-0 flex-col gap-4 overflow-y-auto" style={{ width }}>
        {channels && (
          <Slot id="channels" block="channels" className="min-h-[240px]" style={{ flex: members ? split : 1 }}>
            <CoreBlockBody block="channels" main={null} />
          </Slot>
        )}
        {members && (
          <Slot id="members" block="members" className="min-h-[200px]" style={{ flex: channels ? 100 - split : 1 }}>
            <CoreBlockBody block="members" main={null} />
          </Slot>
        )}
        {ws.map((w) => (
          <div key={w.id} className="flex min-h-[140px] shrink-0">
            <ScreenWidget w={w} />
          </div>
        ))}
        {channels && slots.voicebar === 'column' && (
          <Slot id="voicebar" block="voicebar" className="lab-auto-h shrink-0 [&>div>div]:flex-none">
            <CoreBlockBody block="voicebar" main={null} />
          </Slot>
        )}
      </div>
    );
  };
  const top = inZone('top');
  return (
    <ScreenRoot theme={theme}>
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-x-auto">
        {top.length > 0 && (
          <div className="flex shrink-0 gap-4 overflow-x-auto" style={{ height: sizes.top ?? SLOT_LIMITS.topDefault }}>
            {top.map((w) => (
              <div key={w.id} className="flex h-full w-[260px] shrink-0">
                <ScreenWidget w={w} />
              </div>
            ))}
          </div>
        )}
        <div className="flex min-h-0 flex-1 gap-4">
          {column('left')}
          <Slot id="main" block="main" className="min-w-[380px] flex-1">
            <CoreBlockBody block="main" main={main} />
          </Slot>
          {column('right')}
        </div>
        {slots.voicebar === 'bottom' && (
          <Slot id="voicebar" block="voicebar" className="lab-auto-h lab-bottom-bar shrink-0 [&>div>div]:flex-none">
            <CoreBlockBody block="voicebar" main={null} />
          </Slot>
        )}
      </div>
    </ScreenRoot>
  );
}

// ---------------------------------------------------------------- modo 3: a tela da sala

function RoomScreen({ room, main, theme }: { room: RoomLayout; main: ReactNode; theme: ThemeScope | null }) {
  const serverId = useApp((s) => s.activeServerId)!;
  const viewed = useApp((s) => {
    const cid = s.activeChannels[serverId];
    return s.details[serverId]?.channels.find((c) => c.id === cid);
  });
  // a sala da call (para o palco e o papo): a que está aberta, ou aquela em que a pessoa está conectada
  const callChannelId = useVoice((s) => (s.serverId === serverId ? s.channelId : null));
  const callChannel = useApp((s) => s.details[serverId]?.channels.find((c) => c.id === callChannelId));
  const voiceChannel = viewed?.type === 'voice' ? viewed : callChannel;
  // cada pessoa pode recolher as laterais (só no navegador dela)
  const [collapsed, setCollapsed] = useState<{ left?: boolean; right?: boolean }>(() => {
    try {
      return JSON.parse(localStorage.getItem('concord.roomCollapsed') ?? '{}');
    } catch {
      return {};
    }
  });
  const toggle = (where: 'left' | 'right') => {
    const next = { ...collapsed, [where]: !collapsed[where] };
    setCollapsed(next);
    try {
      localStorage.setItem('concord.roomCollapsed', JSON.stringify(next));
    } catch {
      // ignorado
    }
  };
  if (!voiceChannel) return null;
  const width = (where: 'left' | 'right') => room.sizes?.[where] ?? ROOM_LIMITS.sideDefault;

  const sideContent = (what: RoomSide, where: 'left' | 'right') => {
    if (what === 'nav')
      return (
        <div className="flex min-h-0 flex-1 flex-col gap-4">
          <Slot id="channels" block="channels" animate className="min-h-0 flex-1">
            <CoreBlockBody block="channels" main={null} />
          </Slot>
          <Slot id="voicebar" block="voicebar" animate className="lab-auto-h shrink-0 [&>div>div]:flex-none">
            <CoreBlockBody block="voicebar" main={null} />
          </Slot>
        </div>
      );
    if (what === 'members')
      return (
        <Slot id="members" block="members" animate className="min-h-0 flex-1">
          <CoreBlockBody block="members" main={null} />
        </Slot>
      );
    return (
      <Slot id={`room-chat-${where}`} block={null} animate className="min-h-0 flex-1">
        <aside aria-label="Papo da sala" className="panel flex min-w-0 flex-1 flex-col overflow-hidden">
          <div className="px-4 pt-4 pb-1 text-xs font-extrabold tracking-wider text-fg-subtle uppercase">Papo da sala</div>
          <MessageFeed channel={voiceChannel} compact />
          <Composer channel={voiceChannel} compact />
        </aside>
      </Slot>
    );
  };

  const side = (what: RoomSide, where: 'left' | 'right') => {
    if (what === 'none') return null;
    const closed = !!collapsed[where];
    return (
      <motion.div key={`${where}-${what}`} layout transition={LAB_SPRING} className="relative flex shrink-0 flex-col" style={{ width: closed ? 52 : width(where) }}>
        {closed ? (
          <button
            type="button"
            onClick={() => toggle(where)}
            title={`Abrir ${ROOM_SIDE_LABEL[what]}`}
            className="panel flex flex-1 flex-col items-center gap-2 pt-4 text-fg-muted hover:text-fg"
          >
            {where === 'left' ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
            <span className="text-[11px] font-bold [writing-mode:vertical-rl]">{ROOM_SIDE_LABEL[what]}</span>
          </button>
        ) : (
          <>
            {sideContent(what, where)}
            <button
              type="button"
              onClick={() => toggle(where)}
              title={`Recolher ${ROOM_SIDE_LABEL[what]}`}
              aria-label={`Recolher ${ROOM_SIDE_LABEL[what]}`}
              // na borda virada para o palco, no meio da altura: não cobre o cabeçalho do painel
              className={cx('absolute top-1/2 z-30 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-surface-3 text-fg-muted shadow ring-1 ring-line hover:text-fg', where === 'left' ? '-right-3.5' : '-left-3.5')}
            >
              {where === 'left' ? <ChevronLeft size={15} /> : <ChevronRight size={15} />}
            </button>
          </>
        )}
      </motion.div>
    );
  };

  return (
    <ScreenRoot theme={theme}>
      <div className="flex min-h-0 flex-1 gap-4 overflow-x-auto">
        {side(room.left, 'left')}
        <Slot id="main" block="main" animate className="min-w-[480px] flex-1">
          {/* na call: o palco da sala; abriu um canal de texto durante a call, a conversa vai para o centro */}
          {viewed?.type === 'voice' ? <VoiceView channel={viewed} dock={room.dock} /> : main}
        </Slot>
        {side(room.right, 'right')}
      </div>
    </ScreenRoot>
  );
}

const ROOM_SIDE_LABEL: Record<RoomSide, string> = { nav: 'servidores e salas', chat: 'papo da sala', members: 'membros', none: '' };

// ---------------------------------------------------------------- peças comuns

/** Raiz comum das telas montadas: tema, barra de servidores em cima; os blocos sempre se adaptam ao espaço. */
export function ScreenRoot({ theme, children }: { theme: ThemeScope | null; children: ReactNode }) {
  return (
    <div className="flex h-full flex-col gap-4 bg-surface-1 p-4" style={theme?.style} data-ws-shape={theme?.shape} data-lab-adaptive="">
      <div className="panel shrink-0">
        <ServerStrip />
      </div>
      {children}
    </div>
  );
}

/** O conteúdo de cada bloco do sistema. */
export function CoreBlockBody({ block, main }: { block: CoreBlock; main: ReactNode }) {
  const serverId = useApp((s) => s.activeServerId)!;
  const detail = useApp((s) => s.details[serverId]);
  if (block === 'main') return <>{main}</>;
  if (block === 'channels') return <aside className="panel flex min-w-0 flex-1 flex-col overflow-hidden">{detail && <ChannelsBlock detail={detail} />}</aside>;
  if (block === 'members')
    return (
      <aside aria-label="Membros" className="panel flex min-w-0 flex-1 flex-col overflow-hidden">
        <MemberListBody />
      </aside>
    );
  return (
    <div className="panel flex min-w-0 flex-1 flex-col overflow-hidden">
      <VoiceUserBlock />
    </div>
  );
}

export function ScreenWidget({ w, className }: { w: WidgetPlacement; className?: string }) {
  const serverId = useApp((s) => s.activeServerId)!;
  // os widgets da tela seguem o tema (do servidor ou o da pessoa), como os blocos ao lado
  return (
    <WidgetCard ctx={{ serverId, pack: null }} className={cx('flex-1', className)}>
      <WidgetBody w={w} ctx={{ serverId, pack: null }} />
    </WidgetCard>
  );
}

/**
 * Um lugar da tela. Com `animate` (modo 3), é um motion.div com layoutId: o mesmo bloco desliza da tela do
 * servidor para a tela da sala e para o layout das conversas privadas, em vez de trocar seco.
 */
export function Slot({ id, block, animate, className, style, children }: { id: string; block: CoreBlock | null; animate?: boolean; className?: string; style?: CSSProperties; children: ReactNode }) {
  const mode = useLab((s) => s.mode);
  const cls = cx('relative flex min-h-0 min-w-0', block && `lab-slot lab-slot-${block}`, className);
  if (!(animate ?? mode === 'call')) {
    return (
      <div className={cls} style={style}>
        {children}
      </div>
    );
  }
  return (
    <motion.div
      layoutId={`lab-${id}`}
      layout
      className={cls}
      style={style}
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={LAB_SPRING}
    >
      {children}
    </motion.div>
  );
}

export { SCREEN_COLS, SCREEN_ROWS };
