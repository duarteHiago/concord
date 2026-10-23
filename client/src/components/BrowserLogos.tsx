// Marcas simplificadas dos navegadores, desenhadas aqui (sem imagens de fora), para a página
// /compatibilidade mostrar de relance quais funcionam com H.265.

type LogoProps = { size?: number };

export function ChromeLogo({ size = 44 }: LogoProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden>
      <path d="M24 24 L4.95 13 A22 22 0 0 1 43.05 13 Z" fill="#EA4335" />
      <path d="M24 24 L43.05 13 A22 22 0 0 1 24 46 Z" fill="#FBBC04" />
      <path d="M24 24 L24 46 A22 22 0 0 1 4.95 13 Z" fill="#34A853" />
      <circle cx="24" cy="24" r="10" fill="#fff" />
      <circle cx="24" cy="24" r="7.8" fill="#4285F4" />
    </svg>
  );
}

export function EdgeLogo({ size = 44 }: LogoProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden>
      <defs>
        <linearGradient id="edge-a" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#35C1F1" />
          <stop offset="0.55" stopColor="#1A8FDB" />
          <stop offset="1" stopColor="#0C59A4" />
        </linearGradient>
        <linearGradient id="edge-b" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#2FBF71" />
          <stop offset="1" stopColor="#7AE2A0" />
        </linearGradient>
      </defs>
      <circle cx="24" cy="24" r="22" fill="url(#edge-a)" />
      {/* a "onda" do Edge: a curva verde por baixo e a abertura do "e" */}
      <path d="M6 26c2 13 22 21 35 8-8 5-22 4-24-7z" fill="url(#edge-b)" />
      <path d="M17 27c0-9 16-11 17-3 0 3-3 4-6 4z" fill="#0B4F94" />
    </svg>
  );
}

export function FirefoxLogo({ size = 44 }: LogoProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden>
      <defs>
        <linearGradient id="ff-a" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#FFBD4F" />
          <stop offset="0.5" stopColor="#FF7139" />
          <stop offset="1" stopColor="#E31587" />
        </linearGradient>
      </defs>
      <circle cx="24" cy="25" r="13" fill="#7542E5" />
      {/* a raposa abraçando o globo */}
      <path d="M36 10A18 18 0 1 0 42 25" fill="none" stroke="url(#ff-a)" strokeWidth="8" strokeLinecap="round" />
      <path d="M11 11l5-7 3 8z" fill="#FF9500" />
    </svg>
  );
}

export function SafariLogo({ size = 44 }: LogoProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden>
      <defs>
        <linearGradient id="sf-a" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#19D7FF" />
          <stop offset="1" stopColor="#1E64F0" />
        </linearGradient>
      </defs>
      <circle cx="24" cy="24" r="22" fill="#fff" />
      <circle cx="24" cy="24" r="19.5" fill="url(#sf-a)" />
      <g stroke="#fff" strokeWidth="1.2" opacity="0.7">
        {Array.from({ length: 12 }, (_, i) => (
          <line key={i} x1="24" y1="6.5" x2="24" y2="9" transform={`rotate(${i * 30} 24 24)`} />
        ))}
      </g>
      <g transform="rotate(45 24 24)">
        <path d="M24 9 L27.5 24 L20.5 24 Z" fill="#FF3B30" />
        <path d="M24 39 L27.5 24 L20.5 24 Z" fill="#fff" />
      </g>
    </svg>
  );
}

export function OperaLogo({ size = 44 }: LogoProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden>
      <defs>
        <linearGradient id="op-a" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FF1B2D" />
          <stop offset="1" stopColor="#A70014" />
        </linearGradient>
      </defs>
      <path d="M24 2C11.8 2 3 11.8 3 24s8.8 22 21 22 21-9.8 21-22S36.2 2 24 2zm0 8c4.6 0 7.5 6.3 7.5 14S28.6 38 24 38s-7.5-6.3-7.5-14S19.4 10 24 10z" fill="url(#op-a)" fillRule="evenodd" />
    </svg>
  );
}

export function ConcordLogo({ size = 44 }: LogoProps) {
  return <img src="/brand/concord-simbolo.svg" alt="" width={size} height={size} />;
}
