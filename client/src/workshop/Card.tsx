// Card dos widgets e medidas da grade do Mural. Fica separado (e sem Motion) porque a tela do servidor usa
// no layout principal do app; as animações moram nos módulos da Oficina carregados sob demanda.
import type { CSSProperties, ReactNode } from 'react';
import { cx } from '../components/ui';
import type { Pack } from './packs';
import type { WidgetContext } from './widgets';

export const ROW_PX = 84;
export const GAP_PX = 12;

export const cardShape = (pack: Pack | null) => (pack?.art === 'scan' ? 'ws-shape-cut rounded-none' : pack?.art === 'pixel' ? 'rounded-md' : 'rounded-3xl');

/** Classes do card: com pacote, as cores dele; sem pacote, o tema (cores e formato dos painéis). */
export const cardClass = (ctx: WidgetContext) =>
  cx('relative min-w-0 overflow-hidden p-4', ctx.pack ? cx('ws-card', cardShape(ctx.pack)) : 'ws-plain-card rounded-[var(--radius-panel)] bg-surface-2 text-fg ring-1 ring-line');

export function WidgetCard({ ctx, children, className, style }: { ctx: WidgetContext; children: ReactNode; className?: string; style?: CSSProperties }) {
  return (
    <div className={cx(cardClass(ctx), className)} style={style}>
      {children}
    </div>
  );
}
