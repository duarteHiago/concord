import { desktop } from './desktop';

/** Cores da logo (o "C" com o balão de conversa) de um tema. */
export interface BrandIcon {
  /** corpo do "C" */
  body: string;
  /** balão de conversa */
  bubble: string;
  /** contorno e sombra */
  ink: string;
}

// mesmo desenho de public/icon.svg, com as cores trocadas
const C_SHAPE =
  '<path d="M155.2,44.8 A78,78 0 1,0 155.2,155.2 L124,124 A34,34 0 1,1 124,76 Z"/><circle cx="139.6" cy="60.4" r="22"/><circle cx="139.6" cy="139.6" r="22"/>';
const BUBBLE = '<circle cx="160" cy="100" r="26"/><path d="M148,118 Q156,134 182,138 Q170,128 170,110 Z"/>';

export function brandIconSvg({ body, bubble, ink }: BrandIcon, size = 216): string {
  const outline = `fill="${ink}" stroke="${ink}" stroke-width="22" stroke-linejoin="round"`;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 216 216" width="${size}" height="${size}"><g transform="translate(8 8)">` +
    `<g ${outline}>${C_SHAPE}</g><g fill="${body}">${C_SHAPE}</g>` +
    `<g ${outline}>${BUBBLE}</g><g fill="${bubble}">${BUBBLE}</g>` +
    `<g fill="${ink}"><circle cx="149" cy="100" r="4.5"/><circle cx="160" cy="100" r="4.5"/><circle cx="171" cy="100" r="4.5"/></g>` +
    `</g></svg>`
  );
}

const svgUrl = (svg: string) => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);

/** A logo do tema como URL de imagem (prévia na escolha de tema). */
export const brandIconUrl = (icon: BrandIcon) => svgUrl(brandIconSvg(icon));

function toPng(svg: string, size: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject(new Error('sem canvas'));
      ctx.drawImage(img, 0, 0, size, size);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => reject(new Error('svg inválido'));
    img.src = svgUrl(svg);
  });
}

let current: string | null = null;

/** Troca o ícone da aba (e, no app desktop, o da barra de tarefas) pelas cores do tema.
 * Sem `icon`, volta aos ícones padrão. O ícone do PWA instalado não muda: ele é fixo no manifesto. */
export function applyBrandIcon(icon: BrandIcon | undefined) {
  const key = icon ? `${icon.body}|${icon.bubble}|${icon.ink}` : '';
  if (key === current) return;
  const first = current === null;
  current = key;

  const svg = icon ? brandIconSvg(icon) : null;
  document.querySelectorAll<HTMLLinkElement>('link[rel="icon"]').forEach((link) => {
    if (link.dataset.defaultHref === undefined) {
      link.dataset.defaultHref = link.getAttribute('href') ?? '';
      link.dataset.defaultType = link.getAttribute('type') ?? '';
    }
    if (svg) {
      link.href = svgUrl(svg);
      link.type = 'image/svg+xml';
    } else {
      link.setAttribute('href', link.dataset.defaultHref);
      if (link.dataset.defaultType) link.type = link.dataset.defaultType;
      else link.removeAttribute('type');
    }
  });

  if (!desktop?.setAppIcon) return;
  // na abertura com o tema padrão não há nada a trocar no desktop
  if (!svg) {
    if (!first) void desktop.setAppIcon(null);
    return;
  }
  toPng(brandIconSvg(icon!, 256), 256)
    .then((png) => {
      if (current === key) return desktop?.setAppIcon?.(png);
    })
    .catch(() => {});
}
