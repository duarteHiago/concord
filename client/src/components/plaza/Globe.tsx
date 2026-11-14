// O globo da Praça em pixel art: oceano azul-cobalto, continentes coral girando por trás de um recorte redondo.
import { useId } from 'react';

// continentes num mapa de 32×16 "pixels", repetido duas vezes para girar sem emenda
const LAND = [
  '....##.........###.......#......',
  '...####.......#####.....###.....',
  '..######.....######....#####....',
  '..#######....#####......####....',
  '...######.....###........##..#..',
  '....####.......##..........###..',
  '.....###.......###.........###..',
  '......##......#####.........#...',
  '.......#.....######.............',
  '......##.....#####.......##.....',
  '.....###......###.......####....',
  '.....##........#........#####...',
  '......#..................###....',
  '.........................##.....',
  '..##.....#####..................',
  '.####...#######......####.......',
];

const rects = (() => {
  const out: { x: number; y: number; w: number }[] = [];
  LAND.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      if (row[x] !== '#') {
        x++;
        continue;
      }
      let w = 1;
      while (row[x + w] === '#') w++;
      out.push({ x, y, w });
      x += w;
    }
  });
  return out;
})();

export function Globe({ size = 48, spinning = true, className }: { size?: number; spinning?: boolean; className?: string }) {
  const id = useId().replace(/:/g, '');
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" shapeRendering="crispEdges" className={className} aria-hidden="true">
      <defs>
        <clipPath id={`g${id}`}>
          <circle cx="8" cy="8" r="7" />
        </clipPath>
      </defs>
      <circle cx="8" cy="8" r="7.6" fill="#1b1430" />
      <g clipPath={`url(#g${id})`}>
        <rect x="0" y="0" width="16" height="16" fill="#2f62e6" />
        <g className={spinning ? 'plaza-globe-spin' : undefined}>
          {[0, 16].map((dx) => (
            <g key={dx} transform={`translate(${dx} 0) scale(0.5 1)`}>
              {rects.map((r, i) => (
                <rect key={i} x={r.x} y={r.y} width={r.w} height="1" fill="#e8685a" />
              ))}
            </g>
          ))}
        </g>
        {/* volume: sombra do lado direito e brilho no alto */}
        <path d="M11 1h5v15h-5z" fill="#1b1430" opacity="0.28" />
        <path d="M13 2h3v13h-3z" fill="#1b1430" opacity="0.25" />
        <rect x="4" y="3" width="2" height="1" fill="#fff" opacity="0.7" />
        <rect x="3" y="4" width="1" height="2" fill="#fff" opacity="0.5" />
      </g>
    </svg>
  );
}
