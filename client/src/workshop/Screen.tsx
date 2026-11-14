// Tela do servidor montada na Oficina: a grade livre de 12×12 com os blocos do sistema e widgets. A barra de
// servidores fica fixa em cima (é por ela que a pessoa sai do servidor). Vale só em tela larga, fora das
// telas do sistema (configurações, perfil, Novidades), e cada membro pode voltar ao layout padrão.
//
// Laboratório de layout (lab.ts): no Concord de testes, quem testa pode trocar como essa tela é montada —
// a grade de hoje ('atual'), a grade com mínimos em pixels ('limites') ou os moldes com esqueleto fixo
// ('moldes', TemplateScreen.tsx) — e ligar os blocos que se adaptam, a arrumação de voz, a animação e o
// contorno dos limites. Nada disso muda o servidor para os outros.
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { SCREEN_COLS, SCREEN_ROWS, isBlock, type ScreenItem, type WidgetPlacement } from '../../../shared/workshop.ts';
import { ChannelsBlock, VoiceUserBlock } from '../components/ChannelSidebar';
import { MemberListBody } from '../components/MemberList';
import { ServerStrip } from '../components/ServerRail';
import { cx } from '../components/ui';
import { HOME, useApp } from '../store/app';
import { useVoice } from '../store/voice';
import { WidgetCard } from './Card';
import { blockMinPx, labActive, limitTracks, useLab, type CoreBlock, type LabMode } from './lab';
import { WORKSHOP_ENABLED, useActiveConfig, workshopPrefs } from './store';
import { TemplateScreen } from './TemplateScreen';
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
  items: ScreenItem[];
  mode: LabMode;
}

/** Como montar a tela do servidor agora; null = layout padrão (que também é o das conversas privadas). */
export function useServerScreen(): ScreenPlan | null {
  const serverId = useApp((s) => s.activeServerId);
  const systemOpen = useApp((s) => s.releasesOpen || !!s.profile || !!s.settings);
  useApp((s) => s.me?.settings); // preferências
  const config = useActiveConfig(serverId && serverId !== HOME ? serverId : null);
  const lab = useLab();
  const wide = useWide();
  if (!WORKSHOP_ENABLED || !wide || systemOpen || !serverId || serverId === HOME) return null;
  // só servidor com tela montada na Oficina: os outros ficam sempre com o layout normal do Concord,
  // com ou sem o laboratório ligado
  if (!config?.screen || !workshopPrefs().layouts) return null;
  return { items: config.screen.items, mode: labActive(lab) ? lab.mode : 'atual' };
}

/** A sala aberta agora é de voz? (a arrumação de voz e os mínimos do bloco principal dependem disso) */
export function useVoiceRoomOpen() {
  return useApp((s) => {
    const sid = s.activeServerId;
    const cid = sid ? s.activeChannels[sid] : undefined;
    return !!(sid && cid && s.details[sid]?.channels.find((c) => c.id === cid)?.type === 'voice');
  });
}

export function ServerScreen({ plan, main, theme }: { plan: ScreenPlan; main: ReactNode; theme: ThemeScope | null }) {
  const lab = useLab();
  const voiceRoom = useVoiceRoomOpen();
  const widgets = plan.items.filter((i): i is WidgetPlacement => !isBlock(i));
  // caminho 4: sala de voz aberta → a tela muda para a arrumação de palco (o molde "Palco", sem widgets)
  if (lab.voiceLayout && voiceRoom) return <TemplateScreen template="palco" widgets={[]} main={main} theme={theme} voiceMorph />;
  if (plan.mode === 'moldes') return <TemplateScreen template={lab.template} widgets={widgets} main={main} theme={theme} />;
  return <GridScreen plan={plan} main={main} theme={theme} />;
}

/** A grade 12×12. Em 'limites', cada bloco tem mínimo em pixels e a grade cresce (com rolagem) em vez de sobrepor. */
function GridScreen({ plan, main, theme }: { plan: ScreenPlan; main: ReactNode; theme: ThemeScope | null }) {
  const limits = plan.mode === 'limites';
  const inCall = useVoice((s) => s.status !== 'idle');
  const voiceRoom = useVoiceRoomOpen();
  // o tamanho da área da grade decide quais linhas e colunas precisam ficar fixas no mínimo
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ w: number; h: number } | undefined>(undefined);
  useEffect(() => {
    const el = box.current?.parentElement;
    if (!el || !limits) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, [limits]);
  const tracks = limits ? limitTracks(plan.items, { inCall, voiceRoom }, size) : null;
  return (
    <ScreenRoot theme={theme}>
      <div className="flex min-h-0 flex-1 flex-col overflow-auto">
      <div
        ref={box}
        className={cx('grid min-h-0 flex-1 gap-4', limits && 'shrink-0')}
        style={{
          gridTemplateColumns: tracks?.cols ?? `repeat(${SCREEN_COLS}, minmax(0, 1fr))`,
          gridTemplateRows: tracks?.rows ?? `repeat(${SCREEN_ROWS}, minmax(0, 1fr))`,
        }}
      >
        <AnimatePresence initial={false}>
          {plan.items.map((it) => (
            <Slot
              key={it.id}
              id={isBlock(it) ? it.block : it.id}
              block={isBlock(it) ? it.block : null}
              enforceMin={false}
              style={{ gridColumn: `${it.x + 1} / span ${it.w}`, gridRow: `${it.y + 1} / span ${it.h}` }}
            >
              {isBlock(it) ? <CoreBlockBody block={it.block} main={main} /> : <ScreenWidget w={it} />}
            </Slot>
          ))}
        </AnimatePresence>
      </div>
      </div>
    </ScreenRoot>
  );
}

/** Raiz comum das telas montadas: tema, barra de servidores em cima e as marcas do laboratório (CSS). */
export function ScreenRoot({ theme, children }: { theme: ThemeScope | null; children: ReactNode }) {
  const lab = useLab();
  return (
    <div
      className="flex h-full flex-col gap-4 bg-surface-1 p-4"
      style={theme?.style}
      data-ws-shape={theme?.shape}
      data-lab-adaptive={lab.adaptive ? '' : undefined}
      data-lab-room={lab.room}
    >
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

export const LAB_SPRING = { type: 'spring', stiffness: 380, damping: 34, mass: 0.9 } as const;

/**
 * Um lugar da tela. Com a animação ligada (caminho 5), é um motion.div com layoutId: o mesmo bloco desliza de
 * uma arrumação para a outra (inclusive para o layout padrão das conversas). Com os limites (caminhos 2 e 6),
 * aplica o mínimo em pixels e/ou desenha o contorno.
 */
export function Slot({
  id,
  block,
  enforceMin,
  className,
  style,
  children,
}: {
  id: string;
  block: CoreBlock | null;
  enforceMin?: boolean;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  const lab = useLab();
  const inCall = useVoice((s) => s.status !== 'idle');
  const voiceRoom = useVoiceRoomOpen();
  const min = block ? blockMinPx(block, { inCall, voiceRoom }) : null;
  const cls = cx('relative flex min-h-0 min-w-0', block && `lab-slot lab-slot-${block}`, className);
  const st: CSSProperties = { ...style, ...(enforceMin && min ? { minWidth: min.w, minHeight: min.h } : {}) };
  const body = (
    <>
      {children}
      {/* o contorno dos limites fica no editor da Oficina (laboratório de layout) */}
    </>
  );
  if (!lab.animate) {
    return (
      <div className={cls} style={st}>
        {body}
      </div>
    );
  }
  return (
    <motion.div
      layoutId={`lab-${id}`}
      layout
      className={cls}
      style={st}
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={LAB_SPRING}
    >
      {body}
    </motion.div>
  );
}
