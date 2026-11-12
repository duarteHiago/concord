// Arte dos pacotes da Oficina, desenhada em SVG e CSS (sem imagens de fora). Ver workshop.css.
import { lazy, Suspense, type CSSProperties } from 'react';
import type { ArtKind, Pack } from './packs';
import './workshop.css';

// a cena em shader da faixa vem sob demanda (OGL fora do pacote principal)
const LazyScene = lazy(() => import('./Scene'));

export const packVars = (pack: Pack): CSSProperties =>
  ({
    '--wa': pack.colors.a,
    '--wb': pack.colors.b,
    '--wg': pack.colors.glow,
    '--wbg': pack.colors.bg,
    '--wbg2': pack.colors.bg2,
    '--wink': pack.colors.ink,
  }) as CSSProperties;

// posições "aleatórias" fixas, para a arte não mudar a cada render
const rand = (i: number, salt = 1) => {
  const x = Math.sin(i * 12.9898 * salt + 78.233) * 43758.5453;
  return x - Math.floor(x);
};

// ------------------------------------------------------------------ ícone animado

export function RailEffect({ pack }: { pack: Pack }) {
  return (
    <span className="ws-rail ws-vars" style={packVars(pack)} aria-hidden="true">
      <RailArt kind={pack.art} />
    </span>
  );
}

function RailArt({ kind }: { kind: ArtKind }) {
  switch (kind) {
    case 'runes':
      return (
        <>
          <span className="ws-rail-glow" />
          <svg viewBox="0 0 58 58">
            <g className="ws-spin">
              <circle cx="29" cy="29" r="27.5" fill="none" stroke="var(--wa)" strokeWidth="1.4" strokeDasharray="5 3 1 3" />
            </g>
            <g className="ws-spin-rev">
              {[0, 60, 120, 180, 240, 300].map((a) => (
                <rect key={a} x="27.5" y="-0.5" width="3" height="3" fill="var(--wb)" transform={`rotate(${a} 29 29) rotate(45 29 1)`} />
              ))}
            </g>
          </svg>
        </>
      );
    case 'scan':
      return (
        <>
          <svg viewBox="0 0 58 58">
            {[
              'M2 12 V2 H12',
              'M46 2 H56 V12',
              'M56 46 V56 H46',
              'M12 56 H2 V46',
            ].map((d) => (
              <path key={d} d={d} fill="none" stroke="var(--wa)" strokeWidth="2.4" strokeLinecap="square" />
            ))}
          </svg>
          <span className="ws-scanline" />
        </>
      );
    case 'steam':
      return (
        <>
          <span className="ws-steam" />
          {[0, 1, 2].map((i) => (
            <span key={i} className={`ws-mote ${i % 2 ? 'b' : ''}`} style={{ left: `${30 + i * 20}%`, top: 2, animationDelay: `${i * 0.8}s`, width: 5, height: 5 }} />
          ))}
        </>
      );
    case 'pixel':
      return (
        <>
          <span className="ws-pixel-border" />
          {[
            [0, 0],
            [1, 0],
            [0, 1],
            [1, 1],
          ].map(([x, y], i) => (
            <span
              key={i}
              style={{
                position: 'absolute',
                width: 5,
                height: 5,
                [x ? 'right' : 'left']: 0,
                [y ? 'bottom' : 'top']: 0,
                background: i % 2 ? 'var(--wb)' : 'var(--wa)',
                animation: `ws-blink 0.8s steps(1) ${i * 0.2}s infinite`,
              }}
            />
          ))}
        </>
      );
    case 'embers':
      return (
        <>
          <span className="ws-rail-glow" style={{ boxShadow: '0 6px 14px -2px var(--wg), 0 0 0 1.5px color-mix(in srgb, var(--wa) 70%, transparent)' }} />
          {[0, 1, 2, 3, 4].map((i) => (
            <span
              key={i}
              className={`ws-mote ${i === 2 ? 'b' : ''}`}
              style={{ left: `${15 + rand(i) * 70}%`, bottom: 2, width: 3, height: 3, animationDelay: `${i * 0.5}s`, animationDuration: `${2 + rand(i, 2)}s` }}
            />
          ))}
        </>
      );
    case 'orbit':
      return (
        <svg viewBox="0 0 58 58">
          <ellipse cx="29" cy="29" rx="28" ry="10" fill="none" stroke="color-mix(in srgb, var(--wa) 70%, transparent)" strokeWidth="1" transform="rotate(-20 29 29)" />
          <g className="ws-spin" style={{ animationDuration: '4s' }}>
            <circle cx="29" cy="1.5" r="3" fill="var(--wb)" style={{ filter: 'drop-shadow(0 0 3px var(--wb))' }} />
          </g>
          <circle cx="29" cy="29" r="27.5" fill="none" stroke="var(--wg)" strokeWidth="1" />
        </svg>
      );
  }
}

// ------------------------------------------------------------------ faixa do cabeçalho

export function BannerArt({ pack }: { pack: Pack }) {
  return (
    <div className="ws-banner ws-vars" style={packVars(pack)} aria-hidden="true">
      <Suspense fallback={<BannerMotif kind={pack.art} />}>
        <LazyScene pack={pack} density={16} quality={0.6} />
      </Suspense>
      <div className="ws-banner-shade" />
    </div>
  );
}

function BannerMotif({ kind }: { kind: ArtKind }) {
  switch (kind) {
    case 'runes':
      return (
        <svg className="ws-banner-art" viewBox="0 0 300 110" preserveAspectRatio="xMaxYMid slice">
          <g className="ws-spin" style={{ transformOrigin: '250px 55px', animationDuration: '30s' }}>
            <circle cx="250" cy="55" r="62" fill="none" stroke="var(--wa)" strokeOpacity=".5" strokeWidth="1.5" strokeDasharray="10 4 2 4" />
            <circle cx="250" cy="55" r="46" fill="none" stroke="var(--wb)" strokeOpacity=".45" strokeWidth="1" />
            <polygon points="250,13 286,76 214,76" fill="none" stroke="var(--wa)" strokeOpacity=".5" />
            <polygon points="250,97 286,34 214,34" fill="none" stroke="var(--wa)" strokeOpacity=".5" />
          </g>
          <circle cx="250" cy="55" r="8" fill="var(--wb)" opacity=".7" style={{ filter: 'blur(3px)' }} />
        </svg>
      );
    case 'scan':
      return (
        <>
          <div className="ws-banner-art ws-grid-lines" />
          <svg className="ws-banner-art" viewBox="0 0 300 110" preserveAspectRatio="xMaxYMid slice">
            <g transform="translate(250 55)" stroke="var(--wa)" fill="none" strokeWidth="1.5" opacity=".8">
              <circle r="24" />
              <circle r="3" fill="var(--wa)" />
              <path d="M-38 0 H-14 M14 0 H38 M0 -38 V-14 M0 14 V38" />
            </g>
          </svg>
        </>
      );
    case 'steam':
      return (
        <svg className="ws-banner-art" viewBox="0 0 300 110" preserveAspectRatio="xMaxYMid slice">
          {[0, 1, 2].map((i) => (
            <circle key={i} cx={200 + i * 40} cy={40 + (i % 2) * 30} r={30 + i * 6} fill={i % 2 ? 'var(--wb)' : 'var(--wa)'} opacity=".22" style={{ filter: 'blur(14px)', animation: `ws-bob ${5 + i}s ease-in-out ${i}s infinite` }} />
          ))}
          <g transform="translate(240 50)" fill="none" stroke="var(--wink)" strokeOpacity=".55" strokeWidth="2" strokeLinecap="round">
            <path d="M-16 10 h32 v14 a14 14 0 0 1 -14 14 h-4 a14 14 0 0 1 -14 -14 z" />
            <path d="M16 14 h5 a6 6 0 0 1 0 12 h-5" />
            {[-8, 0, 8].map((x, i) => (
              <path key={x} d={`M${x} 4 q-4 -6 0 -12 q4 -6 0 -12`} style={{ animation: `ws-steam-up 2.4s ease-out ${i * 0.6}s infinite` }} />
            ))}
          </g>
        </svg>
      );
    case 'pixel':
      return (
        <svg className="ws-banner-art" viewBox="0 0 300 110" preserveAspectRatio="xMaxYMax slice" shapeRendering="crispEdges">
          {Array.from({ length: 22 }, (_, i) => (
            <rect key={i} x={rand(i) * 300} y={rand(i, 3) * 60} width="3" height="3" fill={i % 3 ? 'var(--wink)' : 'var(--wb)'} style={{ animation: `ws-blink ${0.8 + rand(i, 5)}s steps(1) infinite` }} />
          ))}
          {Array.from({ length: 15 }, (_, i) => {
            const h = 18 + Math.round(rand(i, 7) * 34);
            return <rect key={`b${i}`} x={150 + i * 10} y={110 - h} width="10" height={h} fill="var(--wa)" opacity={0.25 + (i % 3) * 0.12} />;
          })}
        </svg>
      );
    case 'embers':
      return (
        <svg className="ws-banner-art" viewBox="0 0 300 110" preserveAspectRatio="xMaxYMax slice">
          <path d="M150 110 L190 70 L215 88 L245 52 L300 96 L300 110 Z" fill="var(--wb)" opacity=".22" />
          <g transform="translate(250 100)">
            <g style={{ transformOrigin: '0 0', animation: 'ws-flicker 0.9s ease-in-out infinite' }}>
              <path d="M0 0 C-14 -6 -12 -24 0 -40 C4 -28 14 -24 10 -10 C9 -4 5 0 0 0 Z" fill="var(--wa)" opacity=".9" />
              <path d="M0 0 C-6 -4 -6 -14 0 -22 C3 -14 7 -10 4 -4 Z" fill="var(--wink)" opacity=".8" />
            </g>
            <path d="M-18 2 L18 -4 M-18 -4 L18 2" stroke="#6b4423" strokeWidth="5" strokeLinecap="round" />
          </g>
          {Array.from({ length: 8 }, (_, i) => (
            <circle key={i} cx={230 + rand(i) * 40} cy={70} r="1.6" fill="var(--wa)" style={{ animation: `ws-float ${2 + rand(i, 3) * 2}s ease-out ${rand(i, 9) * 2}s infinite`, ['--po' as string]: 1 }} />
          ))}
        </svg>
      );
    case 'orbit':
      return (
        <svg className="ws-banner-art" viewBox="0 0 300 110" preserveAspectRatio="xMaxYMid slice">
          {Array.from({ length: 30 }, (_, i) => (
            <circle key={i} cx={rand(i) * 300} cy={rand(i, 2) * 110} r={rand(i, 4) * 1.2 + 0.3} fill="var(--wink)" opacity={0.3 + rand(i, 6) * 0.6} />
          ))}
          <g transform="translate(250 55)">
            <circle r="22" fill="var(--wa)" opacity=".85" />
            <circle r="22" fill="url(#ws-planet-shade)" />
            <ellipse rx="40" ry="9" fill="none" stroke="var(--wb)" strokeWidth="2" opacity=".8" transform="rotate(-18)" />
            <defs>
              <radialGradient id="ws-planet-shade" cx="35%" cy="30%">
                <stop offset="0" stopColor="#fff" stopOpacity=".35" />
                <stop offset="1" stopColor="#000" stopOpacity=".45" />
              </radialGradient>
            </defs>
          </g>
        </svg>
      );
  }
}

// ------------------------------------------------------------------ emblema (intro e cards da Oficina)

export function Emblem({ pack, size = 160 }: { pack: Pack; size?: number }) {
  return (
    <svg className="ws-emblem" width={size} height={size} viewBox="-100 -100 200 200" style={packVars(pack)} aria-hidden="true">
      <EmblemArt kind={pack.art} />
    </svg>
  );
}

function EmblemArt({ kind }: { kind: ArtKind }) {
  switch (kind) {
    case 'runes':
      return (
        <>
          <g className="ws-spin" style={{ animationDuration: '12s' }}>
            <circle r="92" fill="none" stroke="var(--wa)" strokeWidth="3" strokeDasharray="18 6 4 6" />
            {Array.from({ length: 12 }, (_, i) => (
              <rect key={i} x="-3" y="-80" width="6" height="6" fill="var(--wb)" transform={`rotate(${i * 30}) rotate(45 0 -77)`} />
            ))}
          </g>
          <g className="ws-spin-rev">
            <polygon points="0,-64 55,32 -55,32" fill="none" stroke="var(--wa)" strokeWidth="3" />
            <polygon points="0,64 55,-32 -55,-32" fill="none" stroke="var(--wa)" strokeWidth="3" />
          </g>
          <polygon points="0,-24 14,0 0,24 -14,0" fill="var(--wb)" style={{ filter: 'drop-shadow(0 0 10px var(--wb))' }} />
        </>
      );
    case 'scan':
      return (
        <g stroke="var(--wa)" fill="none" strokeWidth="4">
          <g className="ws-spin" style={{ animationDuration: '6s' }}>
            <circle r="80" strokeDasharray="30 12" />
          </g>
          <circle r="48" stroke="var(--wb)" strokeWidth="3" />
          <path d="M-96 0 H-58 M58 0 H96 M0 -96 V-58 M0 58 V96" />
          <circle r="6" fill="var(--wa)" />
          <path d="M-70 -70 h22 M-70 -70 v22 M70 70 h-22 M70 70 v-22" strokeWidth="5" />
        </g>
      );
    case 'steam':
      return (
        <g fill="none" stroke="var(--wink)" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round">
          <circle r="90" stroke="var(--wa)" strokeOpacity=".35" strokeWidth="3" />
          <path d="M-46 -6 h80 v34 a34 34 0 0 1 -34 34 h-12 a34 34 0 0 1 -34 -34 z" fill="var(--wbg2)" />
          <path d="M34 4 h12 a14 14 0 0 1 0 28 h-12" />
          <path d="M-60 76 h112" stroke="var(--wa)" />
          {[-22, -2, 18].map((x, i) => (
            <path key={x} d={`M${x} -18 q-9 -12 0 -24 q9 -12 0 -24`} stroke="var(--wb)" style={{ animation: `ws-steam-up 2.2s ease-out ${i * 0.5}s infinite` }} />
          ))}
        </g>
      );
    case 'pixel':
      return (
        <g shapeRendering="crispEdges" style={{ animation: 'ws-bob 1.2s steps(4) infinite' }}>
          {/* ficha 8-bit */}
          {[
            '..XXXX..',
            '.XAAAAX.',
            'XAABBAAX',
            'XABAABAX',
            'XABAABAX',
            'XAABBAAX',
            '.XAAAAX.',
            '..XXXX..',
          ].flatMap((row, y) =>
            [...row].map((c, x) =>
              c === '.' ? null : <rect key={`${x}-${y}`} x={-80 + x * 20} y={-80 + y * 20} width="20" height="20" fill={c === 'X' ? 'var(--wink)' : c === 'A' ? 'var(--wa)' : 'var(--wb)'} />,
            ),
          )}
        </g>
      );
    case 'embers':
      return (
        <>
          <circle r="90" fill="none" stroke="var(--wa)" strokeOpacity=".3" strokeWidth="3" />
          <g transform="translate(0 50)">
            <g style={{ transformOrigin: '0 0', animation: 'ws-flicker 0.8s ease-in-out infinite' }}>
              <path d="M0 0 C-44 -18 -38 -76 0 -124 C12 -88 44 -76 32 -30 C28 -12 16 0 0 0 Z" fill="var(--wa)" />
              <path d="M0 0 C-18 -10 -18 -42 0 -66 C9 -44 20 -32 12 -12 Z" fill="var(--wink)" />
            </g>
            <path d="M-56 8 L56 -10 M-56 -10 L56 8" stroke="#6b4423" strokeWidth="14" strokeLinecap="round" />
          </g>
        </>
      );
    case 'orbit':
      return (
        <>
          <circle r="52" fill="var(--wa)" />
          <circle r="52" fill="url(#ws-emblem-shade)" />
          <ellipse rx="92" ry="22" fill="none" stroke="var(--wb)" strokeWidth="5" transform="rotate(-18)" />
          <g className="ws-spin" style={{ animationDuration: '5s' }}>
            <circle cx="0" cy="-86" r="9" fill="var(--wink)" />
          </g>
          <defs>
            <radialGradient id="ws-emblem-shade" cx="35%" cy="30%">
              <stop offset="0" stopColor="#fff" stopOpacity=".4" />
              <stop offset="1" stopColor="#000" stopOpacity=".5" />
            </radialGradient>
          </defs>
        </>
      );
  }
}

// ------------------------------------------------------------------ fundo do Mural

export function Backdrop({ pack }: { pack: Pack }) {
  const square = pack.art === 'pixel' || pack.art === 'scan';
  return (
    <div className="ws-backdrop ws-vars" style={packVars(pack)} aria-hidden="true">
      {pack.art === 'scan' && <div className="ws-banner-art ws-grid-lines" style={{ opacity: 0.6 }} />}
      {Array.from({ length: 26 }, (_, i) => {
        const size = 2 + rand(i, 3) * (square ? 4 : 5);
        return (
          <span
            key={i}
            className={`ws-particle ${i % 3 === 0 ? 'b' : ''} ${square ? 'square' : ''}`}
            style={{
              left: `${rand(i) * 100}%`,
              top: `${20 + rand(i, 2) * 80}%`,
              width: size,
              height: size,
              animationDelay: `${rand(i, 4) * 9}s`,
              animationDuration: `${7 + rand(i, 5) * 6}s`,
              ['--po' as string]: 0.25 + rand(i, 6) * 0.5,
              filter: pack.art === 'steam' ? 'blur(1.5px)' : undefined,
            }}
          />
        );
      })}
    </div>
  );
}
