// Logos oficiais dos navegadores (client/public/brand/browsers, do projeto alrra/browser-logos), para a
// página /compatibilidade mostrar de relance quais funcionam com H.265. Marcas dos respectivos donos,
// usadas só para indicar compatibilidade. Por <img>: os ids internos de cada SVG não colidem entre si.

type LogoProps = { size?: number };

const logo = (file: string) =>
  function BrowserLogo({ size = 44 }: LogoProps) {
    return <img src={`/brand/browsers/${file}.svg`} alt="" width={size} height={size} draggable={false} />;
  };

export const ChromeLogo = logo('chrome');
export const EdgeLogo = logo('edge');
export const FirefoxLogo = logo('firefox');
export const SafariLogo = logo('safari');
export const OperaLogo = logo('opera');
export const BraveLogo = logo('brave');

export function ConcordLogo({ size = 44 }: LogoProps) {
  return <img src="/brand/concord-simbolo.svg" alt="" width={size} height={size} draggable={false} />;
}
