// Editor da tela no modo "Moldes" (caminho 3): escolher um molde, ajustar as divisórias dentro dos limites e pôr
// widgets nas zonas livres. A prévia é desenhada no tamanho real da janela escolhida e reduzida para caber, então
// o que aparece aqui é o que a pessoa vai ver (inclusive se a sala de voz ficaria apertada).
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import type { BlockPlacement, WidgetPlacement, WidgetType } from '../../../shared/workshop.ts';
import { cx } from '../components/ui';
import type { ServerDetail } from '../lib/types';
import { WidgetCard } from './Card';
import { BlockMock, type MockSituation } from './Mocks';
import { blockMinPx, gridArea, templateInfo, TEMPLATES, type LabTemplate } from './lab';
import { springs } from './motion';
import { WidgetBody, type WidgetContext } from './widgets';

const GAP = 16;
const block = (b: BlockPlacement['block']): BlockPlacement => ({ id: b, type: 'block', block: b, x: 0, y: 0, w: 1, h: 1 });

export function TemplatePicker({ value, onChange }: { value: LabTemplate; onChange: (t: LabTemplate) => void }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="radiogroup" aria-label="Molde">
      {TEMPLATES.map((t) => (
        <motion.button
          key={t.id}
          type="button"
          role="radio"
          aria-checked={value === t.id}
          whileTap={{ scale: 0.97 }}
          onClick={() => onChange(t.id)}
          title={t.hint}
          className={cx('rounded-2xl p-2 text-left ring-1', value === t.id ? 'bg-accent/10 ring-2 ring-accent' : 'ring-line hover:bg-surface-3')}
        >
          {/* desenho do molde */}
          <div className="mb-1.5 flex h-12 gap-1 rounded-lg bg-surface-0 p-1" aria-hidden>
            <div className="flex w-1/4 flex-col gap-1">
              <span className="flex-1 rounded bg-surface-4" />
              <span className="h-2 rounded bg-surface-4" />
            </div>
            <div className="flex flex-1 flex-col gap-1">
              {t.topStrip && <span className="h-2 rounded bg-accent/50" />}
              <span className="flex-1 rounded bg-accent/25" />
            </div>
            {t.side !== 'none' && (
              <div className="flex w-1/5 flex-col gap-1">
                {(t.side === 'members' || t.side === 'both') && <span className="flex-[3] rounded bg-surface-4" />}
                {(t.side === 'widgets' || t.side === 'both') && <span className="flex-[2] rounded bg-accent/50" />}
              </div>
            )}
          </div>
          <div className="text-xs font-bold">{t.label}</div>
        </motion.button>
      ))}
    </div>
  );
}

export function TemplateEditor({
  template,
  widgets,
  detail,
  ctx,
  win,
  sit,
  splits,
  onSplit,
  selected,
  onSelect,
  onDropWidget,
  readOnly,
}: {
  template: LabTemplate;
  widgets: WidgetPlacement[];
  detail: ServerDetail;
  ctx: WidgetContext;
  win: { w: number; h: number };
  sit: Omit<MockSituation, 'real'>;
  splits: { nav: number; side: number } | undefined;
  onSplit: (s: { nav: number; side: number }) => void;
  selected: string | null;
  onSelect: (id: string | null) => void;
  onDropWidget: (type: WidgetType) => void;
  readOnly?: boolean;
}) {
  const info = templateInfo(template);
  const area = gridArea(win);
  const ref = useRef<HTMLDivElement>(null);
  const [cw, setCw] = useState(800);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setCw(el.clientWidth));
    ro.observe(el);
    setCw(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  const scale = cw / area.w;
  const clamp = (v: number, r: { min: number; max: number }) => Math.min(r.max, Math.max(r.min, v));
  const navW = clamp(splits?.nav ?? info.nav.def, info.nav);
  const sideW = info.side === 'none' ? 0 : clamp(splits?.side ?? info.sideW.def, info.sideW);
  const mainW = area.w - navW - GAP - (sideW ? sideW + GAP : 0);
  const voiceH = sit.inCall ? 150 : 76;
  const topZone = info.topStrip;
  const sideZone = info.side === 'widgets' || info.side === 'both';
  const hasMembers = info.side === 'members' || info.side === 'both';
  const zoneless = !topZone && !sideZone;
  const mainH = area.h - (topZone && widgets.length ? 132 + GAP : 0);
  const mainMin = blockMinPx('main', sit);

  // arrastar uma divisória: o movimento na tela vira px reais (a prévia está reduzida)
  const drag = useRef<{ which: 'nav' | 'side'; x: number; v: number } | null>(null);
  const startDrag = (e: React.PointerEvent, which: 'nav' | 'side') => {
    if (readOnly) return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { which, x: e.clientX, v: which === 'nav' ? navW : sideW };
  };
  const moveDrag = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const delta = (e.clientX - d.x) / scale;
    if (d.which === 'nav') onSplit({ nav: clamp(d.v + delta, info.nav), side: sideW });
    else onSplit({ nav: navW, side: clamp(d.v - delta, info.sideW) });
  };

  const zoneDrop = {
    onDragOver: (e: React.DragEvent) => {
      if (readOnly) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    },
    onDrop: (e: React.DragEvent) => {
      const type = e.dataTransfer.getData('application/x-concord-widget') as WidgetType;
      if (readOnly || !type) return;
      e.preventDefault();
      onDropWidget(type);
    },
  };

  const widgetCard = (w: WidgetPlacement, style: React.CSSProperties) => (
    <motion.div
      key={w.id}
      layout
      transition={springs.snappy}
      className={cx('flex shrink-0', selected === w.id && !readOnly && 'rounded-2xl outline-2 outline-offset-4 outline-accent')}
      style={style}
      onPointerDown={(e) => {
        if (readOnly) return;
        e.stopPropagation();
        onSelect(w.id);
      }}
    >
      <WidgetCard ctx={ctx} className="h-full w-full p-3 text-[13px]">
        <div className="pointer-events-none h-full">
          <WidgetBody w={w} ctx={ctx} />
        </div>
      </WidgetCard>
    </motion.div>
  );

  return (
    <div>
      <div ref={ref} className="relative w-full overflow-hidden" style={{ height: area.h * scale }} onPointerMove={moveDrag} onPointerUp={() => (drag.current = null)}>
        <div className="absolute top-0 left-0 flex origin-top-left gap-4" style={{ width: area.w, height: area.h, transform: `scale(${scale})` }}>
          {/* coluna de navegação: canais + voz como uma peça só */}
          <motion.div layout transition={springs.snappy} className="flex shrink-0 flex-col gap-4" style={{ width: navW }}>
            <div className="min-h-0 flex-1">
              <BlockMock b={block('channels')} detail={detail} dragging={false} compact={false} sit={{ ...sit, real: { w: navW, h: area.h - voiceH - GAP } }} />
            </div>
            <div className="shrink-0" style={{ height: voiceH }}>
              {/* nos moldes o bloco de voz tem a altura do conteúdo: nunca corta */}
              <BlockMock b={block('voicebar')} detail={detail} dragging={false} compact={false} sit={{ ...sit, real: { w: navW, h: voiceH } }} />
            </div>
          </motion.div>
          <Handle onPointerDown={(e) => startDrag(e, 'nav')} disabled={readOnly} />

          <div className="flex min-w-0 flex-1 flex-col gap-4">
            <AnimatePresence initial={false}>
              {topZone && (
                <motion.div
                  key="top"
                  {...zoneDrop}
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: widgets.length ? 132 : 64 }}
                  exit={{ opacity: 0, height: 0 }}
                  className={cx('flex shrink-0 gap-4 overflow-hidden', !widgets.length && 'items-center justify-center rounded-2xl border-2 border-dashed border-line-strong text-sm text-fg-muted')}
                >
                  {widgets.length ? widgets.map((w) => widgetCard(w, { width: 260, height: 132 })) : 'Zona de widgets: arraste da gaveta para cá'}
                </motion.div>
              )}
            </AnimatePresence>
            <div className="min-h-0 flex-1">
              <BlockMock b={block('main')} detail={detail} dragging={false} compact={false} sit={{ ...sit, real: { w: mainW, h: mainH } }} />
            </div>
          </div>

          {sideW > 0 && (
            <>
              <Handle onPointerDown={(e) => startDrag(e, 'side')} disabled={readOnly} />
              <motion.div layout transition={springs.snappy} className="flex shrink-0 flex-col gap-4" style={{ width: sideW }}>
                {hasMembers && (
                  <div className={cx('min-h-0', sideZone ? 'flex-[3]' : 'flex-1')}>
                    <BlockMock b={block('members')} detail={detail} dragging={false} compact={false} sit={{ ...sit, real: { w: sideW, h: area.h } }} />
                  </div>
                )}
                {sideZone && (
                  <div {...zoneDrop} className={cx('flex min-h-0 flex-[2] flex-col gap-4 overflow-hidden', !widgets.length && 'items-center justify-center rounded-2xl border-2 border-dashed border-line-strong p-4 text-center text-sm text-fg-muted')}>
                    {widgets.length ? widgets.map((w) => widgetCard(w, { height: 150 })) : 'Zona de widgets: arraste da gaveta para cá'}
                  </div>
                )}
              </motion.div>
            </>
          )}
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-fg-subtle">
        <span>
          Conversa: <b className={cx(mainW < mainMin.w ? 'text-danger' : 'text-fg-muted')}>{Math.round(mainW)} px</b> de largura
          {sit.voiceRoom && ` (a sala de voz pede ${mainMin.w})`}
        </span>
        <span>Canais: {Math.round(navW)} px</span>
        {sideW > 0 && <span>Coluna da direita: {Math.round(sideW)} px</span>}
        {zoneless && widgets.length > 0 && <span>Este molde não tem zona de widgets: os {widgets.length} widgets ficam guardados e voltam nos moldes com zona.</span>}
        {!readOnly && <span>Arraste as divisórias entre as colunas (com limite).</span>}
      </div>
    </div>
  );
}

function Handle({ onPointerDown, disabled }: { onPointerDown: (e: React.PointerEvent) => void; disabled?: boolean }) {
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      onPointerDown={onPointerDown}
      className={cx('group -mx-3 flex w-2 shrink-0 items-center justify-center', !disabled && 'cursor-col-resize')}
    >
      {!disabled && <span className="h-24 w-1.5 rounded-full bg-accent/40 transition-colors group-hover:bg-accent" />}
    </div>
  );
}
