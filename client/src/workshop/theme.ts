// Tema do servidor no cliente: vira variáveis CSS num invólucro em volta da área do servidor. Como o Tailwind 4
// lê cores, fontes e raios de variáveis, tudo lá dentro muda junto; o que fica fora (modais, configurações,
// login) continua no tema da própria pessoa.
import type { CSSProperties } from 'react';
import { FONT_INFO, themeTokens, type ServerTheme } from '../../../shared/workshop.ts';
import { HOME, useApp } from '../store/app';
import { WORKSHOP_ENABLED, useActiveConfig } from './store';
import './workshop.css';

export interface ThemeScope {
  style: CSSProperties;
  /** vai em data-ws-shape (o formato recortado precisa de clip-path, ver workshop.css) */
  shape: ServerTheme['shape'];
}

export function themeScope(t: ServerTheme): ThemeScope {
  const tokens = themeTokens(t);
  const hasBg = !!t.background.url;
  const vars: Record<string, string> = {};
  for (const [key, value] of Object.entries(tokens)) {
    // com imagem de fundo, os painéis ficam translúcidos para ela aparecer (como no tema pessoal)
    const translucent = hasBg && key.startsWith('surface-');
    const alpha = key === 'surface-0' ? 55 : key === 'surface-1' ? 70 : 84;
    vars[`--color-${key}`] = translucent ? `color-mix(in srgb, ${value} ${alpha}%, transparent)` : value;
  }
  vars['--color-accent-hover'] = `color-mix(in srgb, ${tokens.accent} 82%, black)`;
  vars['--color-popover'] = tokens['surface-3'];
  vars['--font-sans'] = FONT_INFO[t.font].sans;
  vars['--font-display'] = FONT_INFO[t.font].display;
  vars['--radius-panel'] = t.shape === 'pill' ? '40px' : t.shape === 'cut' ? '4px' : '28px';
  const dim = t.background.dim / 100;
  return {
    shape: t.shape,
    style: {
      ...vars,
      colorScheme: t.base,
      color: tokens.fg,
      // a família do body é herdada já resolvida: precisa ser redefinida aqui
      fontFamily: FONT_INFO[t.font].sans,
      ...(hasBg
        ? {
            backgroundImage: `linear-gradient(rgb(0 0 0 / ${dim}), rgb(0 0 0 / ${dim})), url("${t.background.url}")`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }
        : {}),
    } as CSSProperties,
  };
}

/** Tema do servidor aberto agora, se vale (não vale em DMs, configurações, perfil e Novidades). */
export function useServerThemeScope(): ThemeScope | null {
  const serverId = useApp((s) => s.activeServerId);
  const systemOpen = useApp((s) => s.releasesOpen || !!s.profile || !!s.settings);
  const config = useActiveConfig(serverId && serverId !== HOME ? serverId : null);
  if (!WORKSHOP_ENABLED || systemOpen || !config?.theme) return null;
  return themeScope(config.theme);
}
