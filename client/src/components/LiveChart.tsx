// Gráfico de linha simples pra séries em tempo real (CPU, latência, bitrate etc.) da janela
// de diagnóstico. Sem biblioteca externa: é só um SVG com a tendência das últimas amostras —
// a janela de valores (não um "zero fixo") é o que importa aqui, pra variações pequenas
// continuarem visíveis.
import { useRef, useState, type PointerEvent } from 'react';

export function LiveChart({
  data,
  color = 'var(--color-accent)',
  height = 56,
  formatValue = (v: number) => String(Math.round(v)),
  unit = '',
}: {
  data: number[];
  color?: string;
  height?: number;
  formatValue?: (v: number) => string;
  unit?: string;
}) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const W = 300;
  const H = height;
  const PAD = 4;

  const latest = data.length > 0 ? data[data.length - 1] : undefined;

  if (data.length < 2) {
    return (
      <div className="flex items-center justify-center text-xs text-fg-subtle" style={{ height }}>
        coletando amostras…
      </div>
    );
  }

  const max = Math.max(...data);
  const min = Math.min(...data);
  const span = Math.max(max - min, max * 0.05, 1e-6);
  const x = (i: number) => (i / (data.length - 1)) * W;
  const y = (v: number) => H - PAD - ((v - min) / span) * (H - PAD * 2);

  const linePath = data.map((v, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  const areaPath = `${linePath} L ${x(data.length - 1).toFixed(1)} ${H} L ${x(0).toFixed(1)} ${H} Z`;

  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    setHoverIdx(Math.round(ratio * (data.length - 1)));
  };

  const shown = hoverIdx !== null ? data[hoverIdx] : latest;
  const labelLeft = hoverIdx !== null ? (hoverIdx / (data.length - 1)) * 100 : 100;

  return (
    <div className="relative" style={{ height }}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="h-full w-full cursor-crosshair"
        onPointerMove={onMove}
        onPointerLeave={() => setHoverIdx(null)}
      >
        <line x1={0} y1={H - PAD} x2={W} y2={H - PAD} stroke="var(--color-line)" strokeWidth={1} />
        <path d={areaPath} fill={color} opacity={0.1} stroke="none" />
        <path d={linePath} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        {hoverIdx !== null && (
          <>
            <line x1={x(hoverIdx)} y1={0} x2={x(hoverIdx)} y2={H} stroke="var(--color-line-strong)" strokeWidth={1} />
            <circle cx={x(hoverIdx)} cy={y(data[hoverIdx])} r={4} fill={color} stroke="var(--color-surface-2)" strokeWidth={2} />
          </>
        )}
      </svg>
      {shown !== undefined && (
        <div
          className="pointer-events-none absolute top-0 -translate-y-full rounded-lg bg-surface-4 px-2 py-1 font-mono text-xs font-semibold text-fg shadow-lg"
          style={{ left: `${labelLeft}%`, transform: `translate(${labelLeft > 85 ? '-100%' : '-50%'}, -6px)` }}
        >
          {formatValue(shown)}
          {unit}
        </div>
      )}
    </div>
  );
}
