// "Na tela de verdade": a grade desenhada no tamanho real da janela da prévia, com as mesmas regras da tela montada
// (Screen.tsx). Na grade livre, as casas encolhem até caber (o que estiver pequeno corta). Na grade com limites,
// cada bloco ganha o mínimo em pixels da situação e a grade cresce: se passar da janela, a tela rola.
import { useEffect, useRef, useState } from 'react';
import { isBlock, type ScreenItem } from '../../../shared/workshop.ts';
import type { ServerDetail } from '../lib/types';
import { BlockMock, type MockSituation } from './Mocks';
import { gridArea, limitTracks, type LabMode } from './lab';

export function LivePreview({ items, detail, win, sit, mode }: { items: ScreenItem[]; detail: ServerDetail; win: { w: number; h: number }; sit: Omit<MockSituation, 'real'>; mode: LabMode }) {
  const area = gridArea(win);
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [cw, setCw] = useState(800);
  const [sizes, setSizes] = useState<Record<string, { w: number; h: number }>>({});
  const [overflowH, setOverflowH] = useState(0);
  const limits = mode === 'limites';

  useEffect(() => {
    const el = outer.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setCw(el.clientWidth));
    ro.observe(el);
    setCw(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  // mede o tamanho real de cada bloco já com as regras aplicadas (é isso que decide se corta ou se rearruma)
  useEffect(() => {
    const el = inner.current;
    if (!el) return;
    const measure = () => {
      const next: Record<string, { w: number; h: number }> = {};
      el.querySelectorAll<HTMLElement>('[data-live-id]').forEach((n) => (next[n.dataset.liveId!] = { w: Math.round(n.offsetWidth), h: Math.round(n.offsetHeight) }));
      setSizes((cur) => (JSON.stringify(cur) === JSON.stringify(next) ? cur : next));
      setOverflowH(Math.max(0, el.scrollHeight - area.h));
    };
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    measure();
    return () => ro.disconnect();
  }, [items, limits, sit.inCall, sit.voiceRoom, area.h]);

  const scale = cw / area.w;
  const tracks = limits ? limitTracks(items, sit, area) : { cols: 'repeat(12, minmax(0, 1fr))', rows: 'repeat(12, minmax(0, 1fr))' };
  return (
    <div>
      <div ref={outer} className="relative w-full overflow-hidden rounded-2xl bg-surface-0" style={{ height: area.h * scale }}>
        <div
          ref={inner}
          className="absolute top-0 left-0 grid origin-top-left gap-4"
          style={{ width: area.w, minHeight: area.h, height: limits ? undefined : area.h, gridTemplateColumns: tracks.cols, gridTemplateRows: tracks.rows, transform: `scale(${scale})` }}
        >
          {items.map((it) => {
            const real = sizes[it.id];
            return (
              <div
                key={it.id}
                data-live-id={it.id}
                className="flex min-h-0 min-w-0"
                style={{ gridColumn: `${it.x + 1} / span ${it.w}`, gridRow: `${it.y + 1} / span ${it.h}` }}
              >
                {isBlock(it) ? (
                  <div className="h-full w-full text-[15px]">
                    <BlockMock b={it} detail={detail} dragging={false} compact={false} sit={{ ...sit, real }} />
                  </div>
                ) : (
                  <div className="flex h-full w-full items-center justify-center rounded-2xl bg-accent/20 text-sm font-bold text-fg-muted ring-1 ring-line">widget</div>
                )}
              </div>
            );
          })}
        </div>
        {overflowH > 0 && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center bg-gradient-to-t from-warn/40 to-transparent pt-6 pb-1.5">
            <span className="rounded-full bg-warn px-2.5 py-0.5 text-[11px] font-extrabold text-black">a tela passa {Math.round(overflowH)} px da janela: rola para baixo</span>
          </div>
        )}
      </div>
    </div>
  );
}

/** Quanto falta para cada bloco caber, para a legenda embaixo da prévia. */
export const liveCaption = (mode: LabMode, adaptive: boolean) =>
  mode === 'limites'
    ? 'Grade com limites: cada bloco recebe o mínimo da situação; o que não cabe na janela faz a tela rolar, nada fica por cima de nada.'
    : adaptive
      ? 'Grade livre com blocos que se adaptam: o tamanho é o da grade, mas o bloco apertado se rearruma (linha única, botões em duas linhas).'
      : 'Grade livre: o tamanho é o da grade; o que ficou pequeno corta (o "Na sala" some por cima, os botões da sala vazam pelos lados).';

