import type { ThemeSettings } from './types';

/** Tokens de cor que um tema define. São as mesmas variáveis do @theme em index.css. */
export interface ThemePalette {
  'surface-0': string;
  'surface-1': string;
  'surface-2': string;
  'surface-3': string;
  'surface-4': string;
  line: string;
  'line-strong': string;
  fg: string;
  'fg-muted': string;
  'fg-subtle': string;
  accent: string;
  'accent-2': string;
  /** cor do texto sobre o destaque (botões, pílulas) */
  'on-accent': string;
}

export interface ThemePreset {
  id: string;
  name: string;
  palette: ThemePalette;
}

const dark = (p: Partial<ThemePalette>): ThemePalette => ({
  'surface-0': '#0a0b0f',
  'surface-1': '#101218',
  'surface-2': '#15171e',
  'surface-3': '#1c1f28',
  'surface-4': '#252935',
  line: 'rgb(255 255 255 / 0.07)',
  'line-strong': 'rgb(255 255 255 / 0.12)',
  fg: '#e8eaf0',
  'fg-muted': '#a1a7b5',
  'fg-subtle': '#6b7180',
  accent: '#7c5cff',
  'accent-2': '#22d3ee',
  'on-accent': '#ffffff',
  ...p,
});

export const PRESETS: ThemePreset[] = [
  {
    id: 'noturno',
    name: 'Noturno',
    palette: dark({
      'surface-0': '#120e16',
      'surface-1': '#17121c',
      'surface-2': '#211a28',
      'surface-3': '#2b2234',
      'surface-4': '#362c41',
      'line-strong': 'rgb(255 255 255 / 0.13)',
      fg: '#f3ecf7',
      'fg-muted': '#b3a6c2',
      'fg-subtle': '#9486a6',
      accent: '#ff8a6b',
      'accent-2': '#c4a5ff',
      'on-accent': '#2a1410',
    }),
  },
  { id: 'concord', name: 'Violeta', palette: dark({}) },
  {
    id: 'midnight',
    name: 'Meia-noite',
    palette: dark({ 'surface-0': '#000000', 'surface-1': '#050506', 'surface-2': '#0a0a0c', 'surface-3': '#121216', 'surface-4': '#1b1b21', accent: '#8b7bff' }),
  },
  {
    id: 'nord',
    name: 'Nórdico',
    palette: dark({ 'surface-0': '#232831', 'surface-1': '#2b313c', 'surface-2': '#2e3440', 'surface-3': '#3b4252', 'surface-4': '#434c5e', fg: '#eceff4', 'fg-muted': '#c4cad6', 'fg-subtle': '#8a93a6', accent: '#88c0d0', 'accent-2': '#a3be8c', 'on-accent': '#1b222c' }),
  },
  {
    id: 'synthwave',
    name: 'Synthwave',
    palette: dark({ 'surface-0': '#120b1e', 'surface-1': '#1a1029', 'surface-2': '#211534', 'surface-3': '#2c1c45', 'surface-4': '#3a2659', fg: '#f6e9ff', 'fg-muted': '#c9b3e0', 'fg-subtle': '#8c74a8', accent: '#ff3cac', 'accent-2': '#2bd2ff', 'on-accent': '#ffffff' }),
  },
  {
    id: 'forest',
    name: 'Floresta',
    palette: dark({ 'surface-0': '#0b120e', 'surface-1': '#101a14', 'surface-2': '#14201a', 'surface-3': '#1b2a22', 'surface-4': '#24372d', fg: '#e6f2ea', 'fg-muted': '#a7c0b1', 'fg-subtle': '#7d9688', accent: '#34d399', 'accent-2': '#facc15', 'on-accent': '#05200f' }),
  },
  {
    id: 'ember',
    name: 'Brasa',
    palette: dark({ 'surface-0': '#120c0a', 'surface-1': '#1a1210', 'surface-2': '#201714', 'surface-3': '#2a1e1a', 'surface-4': '#372822', fg: '#f6ebe6', 'fg-muted': '#c8b0a6', 'fg-subtle': '#9a8078', accent: '#f97316', 'accent-2': '#fbbf24', 'on-accent': '#2a1206' }),
  },
  {
    id: 'light',
    name: 'Claro',
    palette: {
      'surface-0': '#e3e5ea',
      'surface-1': '#eef0f3',
      'surface-2': '#ffffff',
      'surface-3': '#f2f3f6',
      'surface-4': '#e1e3e9',
      line: 'rgb(0 0 0 / 0.08)',
      'line-strong': 'rgb(0 0 0 / 0.14)',
      fg: '#15171e',
      'fg-muted': '#4b5160',
      'fg-subtle': '#7c8291',
      accent: '#6246ea',
      'accent-2': '#0891b2',
      'on-accent': '#ffffff',
    },
  },
];

export const DEFAULT_THEME: ThemeSettings = {
  preset: 'noturno',
  accent: null,
  background: { url: null, blur: 0, dim: 0.35 },
  scale: 1,
  customCss: '',
};

export function normalizeTheme(t: Partial<ThemeSettings> | undefined): ThemeSettings {
  return {
    ...DEFAULT_THEME,
    ...t,
    background: { ...DEFAULT_THEME.background, ...t?.background },
  };
}

const CACHE_KEY = 'concord.theme';

export function cachedTheme(): ThemeSettings {
  try {
    return normalizeTheme(JSON.parse(localStorage.getItem(CACHE_KEY) ?? '{}'));
  } catch {
    return DEFAULT_THEME;
  }
}

/** Texto escuro sobre cores claras, branco sobre cores escuras (luminância relativa do WCAG). */
function readableOn(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return '#ffffff';
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(m[1].slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  // contraste com branco vs. com quase-preto: fica com o maior
  return (1.05) / (lum + 0.05) >= (lum + 0.05) / 0.06 ? '#ffffff' : '#1a1014';
}

/** Aplica o tema na página: variáveis de cor, fundo, escala e CSS personalizado. */
export function applyTheme(theme: ThemeSettings) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(theme));
  } catch {
    // ignorado
  }
  const root = document.documentElement;
  const preset = PRESETS.find((p) => p.id === theme.preset) ?? PRESETS[0];
  const palette: ThemePalette = {
    ...preset.palette,
    ...(theme.accent ? { accent: theme.accent, 'on-accent': readableOn(theme.accent) } : {}),
  };
  const hasBg = !!theme.background.url;

  for (const [key, value] of Object.entries(palette)) {
    // com imagem de fundo, os painéis ficam translúcidos para ela aparecer
    const translucent = hasBg && key.startsWith('surface-');
    const alpha = key === 'surface-0' ? 55 : key === 'surface-1' ? 72 : 80;
    root.style.setProperty(`--color-${key}`, translucent ? `color-mix(in srgb, ${value} ${alpha}%, transparent)` : value);
  }
  root.style.setProperty('--color-accent-hover', `color-mix(in srgb, ${palette.accent} 82%, black)`);
  root.style.colorScheme = preset.id === 'light' ? 'light' : 'dark';
  root.style.fontSize = `${Math.round(16 * Math.min(1.3, Math.max(0.75, theme.scale)))}px`;

  let layer = document.getElementById('concord-bg');
  if (hasBg) {
    if (!layer) {
      layer = document.createElement('div');
      layer.id = 'concord-bg';
      layer.style.cssText = 'position:fixed;inset:-40px;z-index:-1;background-size:cover;background-position:center;pointer-events:none';
      document.body.prepend(layer);
    }
    const dim = Math.min(0.9, Math.max(0, theme.background.dim));
    layer.style.backgroundImage = `linear-gradient(rgb(0 0 0 / ${dim}), rgb(0 0 0 / ${dim})), url("${theme.background.url!.replace(/"/g, '%22')}")`;
    layer.style.filter = theme.background.blur ? `blur(${theme.background.blur}px)` : '';
    document.body.style.background = palette['surface-0'];
  } else {
    layer?.remove();
    document.body.style.background = '';
  }

  let style = document.getElementById('concord-custom-css') as HTMLStyleElement | null;
  if (theme.customCss.trim()) {
    if (!style) {
      style = document.createElement('style');
      style.id = 'concord-custom-css';
      document.head.appendChild(style);
    }
    style.textContent = theme.customCss;
  } else {
    style?.remove();
  }
}
