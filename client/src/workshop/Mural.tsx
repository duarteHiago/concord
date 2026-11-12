// Mural do servidor: a página com os widgets arrumados na grade da Oficina. Carregado sob demanda (usa Motion).
import { ArrowLeft, LayoutDashboard, Wrench } from 'lucide-react';
import { MotionConfig, motion } from 'motion/react';
import { P, has } from '../../../shared/permissions.ts';
import { GRID_COLS, type WorkshopConfig } from '../../../shared/workshop.ts';
import { useMobile } from '../lib/mobile';
import { useApp } from '../store/app';
import { cx } from '../components/ui';
import { Backdrop, packVars } from './Art';
import { GAP_PX, ROW_PX, cardClass } from './Card';
import { motionPref, springs } from './motion';
import { useActiveConfig, usePiece, useWorkshop } from './store';
import { WidgetBody, type WidgetContext } from './widgets';

export { GAP_PX, ROW_PX, WidgetCard, cardShape } from './Card';

/** Só a grade, sem editar (o editor usa a própria). Os cards entram em cascata, de cima para baixo. */
export function MuralGrid({ config, ctx }: { config: WorkshopConfig; ctx: WidgetContext }) {
  const mobile = useMobile();
  const widgets = [...config.mural.widgets].sort((a, b) => a.y - b.y || a.x - b.x);
  const enter = (i: number) => ({
    initial: { opacity: 0, y: 22, scale: 0.94 },
    animate: { opacity: 1, y: 0, scale: 1 },
    transition: { ...springs.bouncy, delay: 0.04 + i * 0.045 },
    whileHover: { y: -3, transition: springs.snappy },
  });
  return (
    <MotionConfig reducedMotion={motionPref()}>
      {mobile ? (
        <div className="space-y-3">
          {widgets.map((w, i) => (
            <motion.div key={w.id} className={cardClass(ctx)} style={{ minHeight: Math.max(1, Math.min(w.h, 4)) * ROW_PX }} {...enter(i)}>
              <WidgetBody w={w} ctx={ctx} />
            </motion.div>
          ))}
        </div>
      ) : (
        <div className="grid" style={{ gridTemplateColumns: `repeat(${GRID_COLS}, minmax(0, 1fr))`, gridAutoRows: ROW_PX, gap: GAP_PX }}>
          {widgets.map((w, i) => (
            <motion.div key={w.id} className={cardClass(ctx)} style={{ gridColumn: `${w.x + 1} / span ${w.w}`, gridRow: `${w.y + 1} / span ${w.h}` }} {...enter(i)}>
              <WidgetBody w={w} ctx={ctx} />
            </motion.div>
          ))}
        </div>
      )}
    </MotionConfig>
  );
}

export function MuralView({ serverId }: { serverId: string }) {
  const config = useActiveConfig(serverId);
  const pack = usePiece(serverId, 'backdrop');
  const detail = useApp((s) => s.details[serverId]);
  const mobile = useMobile();
  const close = useWorkshop((s) => s.closeMural);
  const canEdit = !!detail && has(detail.permissions, P.MANAGE_SERVER);
  const ctx: WidgetContext = { serverId, pack };

  return (
    <main className={cx('panel relative flex min-w-0 flex-1 flex-col overflow-hidden', pack && 'ws-vars')} style={pack ? packVars(pack) : undefined}>
      {pack && <Backdrop pack={pack} />}
      <header className={cx('relative z-10 flex items-center gap-3 px-6 pt-5 pb-3', pack && 'text-[var(--wink)]')}>
        {mobile && (
          <button type="button" aria-label="Voltar" onClick={() => useApp.getState().setMobileView('sidebar')} className="-ml-2 p-2">
            <ArrowLeft size={20} />
          </button>
        )}
        <LayoutDashboard size={20} className={pack ? 'text-[var(--wa)]' : 'text-accent'} />
        <h1 className="min-w-0 flex-1 truncate font-display text-xl font-extrabold">{config?.mural.title ?? 'Mural'}</h1>
        {canEdit && (
          <motion.button
            type="button"
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.95 }}
            transition={springs.snappy}
            onClick={() => useWorkshop.getState().openStudio(serverId)}
            className={cx('flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-bold', pack ? 'bg-white/10 hover:bg-white/15' : 'bg-surface-3 hover:bg-surface-4')}
          >
            <Wrench size={15} />
            Abrir a Oficina
          </motion.button>
        )}
        {!mobile && (
          <button type="button" onClick={close} className={cx('rounded-full px-3 py-1.5 text-sm font-semibold', pack ? 'hover:bg-white/10' : 'text-fg-muted hover:bg-surface-3')}>
            Fechar
          </button>
        )}
      </header>
      <div className="relative z-10 min-h-0 flex-1 overflow-y-auto px-6 pb-6">
        {config && config.mural.widgets.length ? (
          <MuralGrid key={serverId} config={config} ctx={ctx} />
        ) : (
          <div className="mt-16 text-center text-sm text-fg-muted">O Mural ainda está vazio.</div>
        )}
      </div>
    </main>
  );
}
