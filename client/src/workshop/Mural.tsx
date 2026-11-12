// Mural do servidor: a página com os widgets arrumados na grade da Oficina.
import { ArrowLeft, LayoutDashboard, Wrench } from 'lucide-react';
import type { CSSProperties, ReactNode } from 'react';
import { P, has } from '../../../shared/permissions.ts';
import { GRID_COLS, type WidgetPlacement, type WorkshopConfig } from '../../../shared/workshop.ts';
import { useMobile } from '../lib/mobile';
import { useApp } from '../store/app';
import { cx } from '../components/ui';
import { Backdrop, packVars } from './Art';
import type { Pack } from './packs';
import { useActiveConfig, usePiece, useWorkshop } from './store';
import { WidgetBody, type WidgetContext } from './widgets';

export const ROW_PX = 84;
export const GAP_PX = 12;

export const cardShape = (pack: Pack | null) => (pack?.art === 'scan' ? 'ws-shape-cut rounded-none' : pack?.art === 'pixel' ? 'rounded-md' : 'rounded-3xl');

export function WidgetCard({ ctx, children, className, style }: { ctx: WidgetContext; children: ReactNode; className?: string; style?: CSSProperties }) {
  return (
    <div
      className={cx(
        'relative min-w-0 overflow-hidden p-4',
        // sem pacote, o card segue o tema (cores e formato dos painéis)
        ctx.pack ? cx('ws-card', cardShape(ctx.pack)) : 'ws-plain-card rounded-[var(--radius-panel)] bg-surface-2 text-fg ring-1 ring-line',
        className,
      )}
      style={style}
    >
      {children}
    </div>
  );
}

/** Só a grade, sem editar (o editor usa a própria). */
export function MuralGrid({ config, ctx }: { config: WorkshopConfig; ctx: WidgetContext }) {
  const mobile = useMobile();
  const widgets = [...config.mural.widgets].sort((a, b) => a.y - b.y || a.x - b.x);
  if (mobile) {
    return (
      <div className="space-y-3">
        {widgets.map((w) => (
          <WidgetCard key={w.id} ctx={ctx} style={{ minHeight: Math.max(1, Math.min(w.h, 4)) * ROW_PX }}>
            <WidgetBody w={w} ctx={ctx} />
          </WidgetCard>
        ))}
      </div>
    );
  }
  return (
    <div className="grid" style={{ gridTemplateColumns: `repeat(${GRID_COLS}, minmax(0, 1fr))`, gridAutoRows: ROW_PX, gap: GAP_PX }}>
      {widgets.map((w: WidgetPlacement) => (
        <WidgetCard key={w.id} ctx={ctx} style={{ gridColumn: `${w.x + 1} / span ${w.w}`, gridRow: `${w.y + 1} / span ${w.h}` }}>
          <WidgetBody w={w} ctx={ctx} />
        </WidgetCard>
      ))}
    </div>
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
          <button
            type="button"
            onClick={() => useWorkshop.getState().openStudio(serverId)}
            className={cx('flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-bold', pack ? 'bg-white/10 hover:bg-white/15' : 'bg-surface-3 hover:bg-surface-4')}
          >
            <Wrench size={15} />
            Abrir a Oficina
          </button>
        )}
        {!mobile && (
          <button type="button" onClick={close} className={cx('rounded-full px-3 py-1.5 text-sm font-semibold', pack ? 'hover:bg-white/10' : 'text-fg-muted hover:bg-surface-3')}>
            Fechar
          </button>
        )}
      </header>
      <div className="relative z-10 min-h-0 flex-1 overflow-y-auto px-6 pb-6">
        {config && config.mural.widgets.length ? (
          <MuralGrid config={config} ctx={ctx} />
        ) : (
          <div className="mt-16 text-center text-sm text-fg-muted">O Mural ainda está vazio.</div>
        )}
      </div>
    </main>
  );
}
