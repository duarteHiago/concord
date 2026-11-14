// Caminho 3 do laboratório de layout: moldes. O essencial tem lugar certo — canais e voz numa coluna só (a voz
// com a altura que o conteúdo pedir, nunca por cima dos canais), a conversa sempre a maior área — e a pessoa
// só ajusta as divisórias, dentro de limites. Widgets ficam nas zonas livres (faixa em cima, coluna da direita).
// Também é a arrumação de voz do caminho 4 (molde "Palco" ao abrir uma sala).
import { AnimatePresence } from 'motion/react';
import { useRef, type ReactNode } from 'react';
import type { WidgetPlacement } from '../../../shared/workshop.ts';
import { cx } from '../components/ui';
import { templateInfo, useLab, type LabTemplate } from './lab';
import { CoreBlockBody, ScreenRoot, ScreenWidget, Slot } from './Screen';
import type { ThemeScope } from './theme';

export function TemplateScreen({
  template,
  widgets,
  main,
  theme,
  voiceMorph,
}: {
  template: LabTemplate;
  widgets: WidgetPlacement[];
  main: ReactNode;
  theme: ThemeScope | null;
  /** montada pela arrumação de voz (caminho 4): divisórias não ficam salvas no molde */
  voiceMorph?: boolean;
}) {
  const info = templateInfo(template);
  const lab = useLab();
  const saved = lab.splits[template];
  const navW = clamp(saved?.nav ?? info.nav.def, info.nav.min, info.nav.max);
  const sideW = clamp(saved?.side ?? info.sideW.def, info.sideW.min, info.sideW.max);
  const saveSplit = (patch: Partial<{ nav: number; side: number }>) => {
    if (voiceMorph) return;
    lab.set({ splits: { ...lab.splits, [template]: { nav: navW, side: sideW, ...patch } } });
  };
  const showSide = info.side !== 'none';
  const sideWidgets = info.side === 'widgets' || info.side === 'both' ? widgets : [];
  const topWidgets = info.topStrip ? widgets : [];

  return (
    <ScreenRoot theme={theme}>
      <div className="flex min-h-0 flex-1 gap-4 overflow-x-auto">
        {/* coluna de navegação: canais + voz/perfil como uma peça só */}
        <div className="flex shrink-0 flex-col gap-4" style={{ width: navW }}>
          <Slot id="channels" block="channels" className="flex-1">
            <CoreBlockBody block="channels" main={null} />
          </Slot>
          {/* altura pelo conteúdo: o bloco de voz por dentro é flex-1/min-h-0 (feito para a grade) e aqui sumiria */}
          <Slot id="voicebar" block="voicebar" className="lab-auto-h shrink-0 [&>div>div]:flex-none">
            <CoreBlockBody block="voicebar" main={null} />
          </Slot>
        </div>
        <Divider value={navW} min={info.nav.min} max={info.nav.max} onChange={(nav) => saveSplit({ nav })} onReset={() => saveSplit({ nav: info.nav.def })} />

        {/* centro: faixa de widgets (zona livre) e a conversa, que nunca fica mais estreita que 480 px */}
        <div className="flex min-w-[480px] flex-1 flex-col gap-4">
          <AnimatePresence initial={false}>
            {topWidgets.length > 0 && (
              <Slot id="top-strip" block={null} className="h-[132px] shrink-0 gap-4 overflow-x-auto">
                {topWidgets.map((w) => (
                  <div key={w.id} className="flex h-full w-[260px] shrink-0">
                    <ScreenWidget w={w} />
                  </div>
                ))}
              </Slot>
            )}
          </AnimatePresence>
          <Slot id="main" block="main" className="lab-main flex-1">
            <CoreBlockBody block="main" main={main} />
          </Slot>
        </div>

        {showSide && (
          <>
            <Divider value={sideW} min={info.sideW.min} max={info.sideW.max} invert onChange={(side) => saveSplit({ side })} onReset={() => saveSplit({ side: info.sideW.def })} />
            <div className="flex shrink-0 flex-col gap-4" style={{ width: sideW }}>
              {(info.side === 'members' || info.side === 'both') && (
                <Slot id="members" block="members" className={cx(sideWidgets.length ? 'min-h-[240px] flex-[3]' : 'flex-1')}>
                  <CoreBlockBody block="members" main={null} />
                </Slot>
              )}
              {sideWidgets.length > 0 && (
                <Slot id="side-widgets" block={null} className="min-h-0 flex-[2] flex-col gap-4 overflow-y-auto">
                  {sideWidgets.map((w) => (
                    <div key={w.id} className="flex min-h-[150px] shrink-0">
                      <ScreenWidget w={w} />
                    </div>
                  ))}
                </Slot>
              )}
            </div>
          </>
        )}
      </div>
    </ScreenRoot>
  );
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/** Divisória arrastável entre colunas, com limites. Duplo clique volta ao padrão do molde. Setas no teclado. */
function Divider({
  value,
  min,
  max,
  invert,
  onChange,
  onReset,
}: {
  value: number;
  min: number;
  max: number;
  /** a coluna fica à direita da divisória (arrastar para a esquerda aumenta) */
  invert?: boolean;
  onChange: (v: number) => void;
  onReset: () => void;
}) {
  const drag = useRef<{ x: number; v: number } | null>(null);
  const live = useRef(value);
  live.current = value;
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-valuenow={value}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      title="Arraste para ajustar · duplo clique volta ao padrão"
      onPointerDown={(e) => {
        e.preventDefault();
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        drag.current = { x: e.clientX, v: value };
        document.body.style.cursor = 'col-resize';
      }}
      onPointerMove={(e) => {
        if (!drag.current) return;
        const d = e.clientX - drag.current.x;
        onChange(clamp(drag.current.v + (invert ? -d : d), min, max));
      }}
      onPointerUp={() => {
        drag.current = null;
        document.body.style.cursor = '';
      }}
      onDoubleClick={onReset}
      onKeyDown={(e) => {
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
        e.preventDefault();
        const step = (e.shiftKey ? 40 : 10) * (e.key === 'ArrowRight' ? 1 : -1) * (invert ? -1 : 1);
        onChange(clamp(live.current + step, min, max));
      }}
      className="group -mx-3 flex w-2 shrink-0 cursor-col-resize items-center justify-center outline-none"
    >
      <span className="h-16 w-1 rounded-full bg-line-strong opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:bg-accent group-focus-visible:opacity-100" />
    </div>
  );
}
