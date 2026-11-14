// Laboratório de layout (só no Concord de testes): cada caminho de docs/ideias de layout vira uma chave que a
// pessoa liga e desliga na hora, para comparar. Fica só no navegador de quem testa (localStorage); não muda o
// servidor para ninguém. Quando decidirmos o caminho, isto vira configuração de verdade (ou some).
import { create } from 'zustand';

/** Como a tela do servidor é montada. */
export type LabMode =
  /** a grade livre 12×12 de hoje, sem regras (é o que quebra nos prints) */
  | 'atual'
  /** caminho 2: a mesma grade, mas cada bloco tem mínimo em pixels por situação; nada se sobrepõe */
  | 'limites'
  /** caminho 3: esqueleto fixo (molde) para o essencial, divisórias com limite, widgets só nas zonas livres */
  | 'moldes';

export type LabTemplate = 'classico' | 'palco' | 'comunidade' | 'compacto';

/** Arranjo da sala de voz escolhido por quem vê (caminho 4). */
export type LabRoom = 'normal' | 'palco' | 'grade';

export interface LabState {
  mode: LabMode;
  template: LabTemplate;
  /** caminho 1: os blocos principais mudam pelo espaço que têm (container queries) */
  adaptive: boolean;
  /** caminho 4: ao abrir uma sala de voz a tela muda de arrumação */
  voiceLayout: boolean;
  room: LabRoom;
  /** caminho 5: animação de layout entre telas (servidor ↔ conversas, texto ↔ voz, troca de molde) */
  animate: boolean;
  /** caminho 6: contorna cada bloco (verde = cabe; vermelho = menor que o mínimo) */
  showLimits: boolean;
  /** caminho 6: simula uma janela menor (largura em px; null = janela real) */
  simulate: number | null;
  /** larguras das divisórias dos moldes (px), por molde */
  splits: Partial<Record<LabTemplate, { nav: number; side: number }>>;
}

export const LAB_DEFAULT: LabState = {
  mode: 'atual',
  template: 'classico',
  adaptive: false,
  voiceLayout: false,
  room: 'normal',
  animate: false,
  showLimits: false,
  simulate: null,
  splits: {},
};

const KEY = 'concord.layoutLab';

function load(): LabState {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<LabState>;
    return { ...LAB_DEFAULT, ...raw };
  } catch {
    return LAB_DEFAULT;
  }
}

interface LabStore extends LabState {
  open: boolean;
  setOpen: (open: boolean) => void;
  set: (patch: Partial<LabState>) => void;
  reset: () => void;
}

export const useLab = create<LabStore>((set, get) => ({
  ...load(),
  open: false,
  setOpen: (open) => set({ open }),
  set: (patch) => {
    set(patch);
    const { open: _open, setOpen: _s, set: _set, reset: _r, ...state } = get();
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      // ignorado
    }
  },
  reset: () => {
    set(LAB_DEFAULT);
    try {
      localStorage.removeItem(KEY);
    } catch {
      // ignorado
    }
  },
}));

/** Algum caminho ligado (a tela do servidor passa a ser montada pelo laboratório, mesmo sem tela da Oficina). */
export const labActive = (s: LabState) => s.mode !== 'atual' || s.adaptive || s.voiceLayout || s.animate;

// ---------------------------------------------------------------- mínimos em pixels (caminhos 2 e 6)

export type CoreBlock = 'channels' | 'main' | 'members' | 'voicebar';

/** Mínimo de cada bloco em pixels, pela situação: o mesmo bloco precisa de mais espaço em call. */
export function blockMinPx(block: CoreBlock, ctx: { inCall: boolean; voiceRoom: boolean }): { w: number; h: number } {
  switch (block) {
    case 'channels':
      return { w: 220, h: 240 };
    case 'members':
      return { w: 200, h: 200 };
    case 'voicebar':
      // em call aparece o "Na sala" em cima do seu perfil: quase o dobro da altura
      return { w: 240, h: ctx.inCall ? 150 : 76 };
    case 'main':
      // a sala de voz tem palco, dez botões e o papo ao lado; o chat cabe bem mais estreito
      return ctx.voiceRoom ? { w: 640, h: 380 } : { w: 380, h: 300 };
  }
}

// ---------------------------------------------------------------- tamanho real na prévia do editor (caminho 6)

/** Janelas para a prévia do editor: o mesmo layout muda muito entre um notebook e um monitor grande. */
export const PREVIEW_WINDOWS = [
  { id: 'note', w: 1100, h: 680, label: 'Notebook pequeno · 1100 px' },
  { id: 'hd', w: 1366, h: 768, label: 'Notebook · 1366 px' },
  { id: 'fhd', w: 1920, h: 1080, label: 'Monitor · 1920 px' },
] as const;
export type PreviewWindow = (typeof PREVIEW_WINDOWS)[number];

// a tela montada de verdade: 16 px de margem, barra de servidores (~96 px) e 16 px entre tudo
const PAD = 16;
const GAP = 16;
const STRIP = 96;

/** Área da grade (px) numa janela. */
export const gridArea = (win: { w: number; h: number }) => ({ w: win.w - PAD * 2, h: win.h - PAD * 2 - STRIP - GAP });

/** Tamanho real (px) de um item de grade 12×12 numa janela. */
export function cellsToPx(item: { w: number; h: number }, win: { w: number; h: number }, cols = 12, rows = 12) {
  const a = gridArea(win);
  const cw = (a.w - GAP * (cols - 1)) / cols;
  const ch = (a.h - GAP * (rows - 1)) / rows;
  return { w: Math.round(item.w * cw + (item.w - 1) * GAP), h: Math.round(item.h * ch + (item.h - 1) * GAP) };
}

/** Quantas casas um bloco precisa, no mínimo, para caber em pixels numa janela. */
export function minCells(block: CoreBlock, ctx: { inCall: boolean; voiceRoom: boolean }, win: { w: number; h: number }, cols = 12, rows = 12): [number, number] {
  const min = blockMinPx(block, ctx);
  const a = gridArea(win);
  const cw = (a.w - GAP * (cols - 1)) / cols;
  const ch = (a.h - GAP * (rows - 1)) / rows;
  return [Math.min(cols, Math.ceil((min.w + GAP) / (cw + GAP))), Math.min(rows, Math.ceil((min.h + GAP) / (ch + GAP)))];
}

/**
 * Grade com limites: o mínimo (px) de cada coluna e linha da grade 12×12, para que cada bloco tenha pelo menos o
 * mínimo da situação. Cada trilho vira minmax(mínimo, 1fr): a grade só passa da janela se a soma dos mínimos
 * passar (aí a tela rola), e nunca por causa do conteúdo dos blocos.
 */
export function limitTracks(
  items: { x: number; y: number; w: number; h: number; type: string; block?: string }[],
  ctx: { inCall: boolean; voiceRoom: boolean },
  /** tamanho da área da grade (px); sem ele, cai no minmax simples */
  size?: { w: number; h: number },
  cols = 12,
  rows = 12,
): { cols: string; rows: string } {
  const c = new Array(cols).fill(0);
  const r = new Array(rows).fill(0);
  for (const it of items) {
    if (it.type !== 'block' || !it.block) continue;
    const min = blockMinPx(it.block as CoreBlock, ctx);
    const perCol = Math.ceil((min.w - GAP * (it.w - 1)) / it.w);
    const perRow = Math.ceil((min.h - GAP * (it.h - 1)) / it.h);
    for (let i = it.x; i < it.x + it.w; i++) c[i] = Math.max(c[i], perCol);
    for (let j = it.y; j < it.y + it.h; j++) r[j] = Math.max(r[j], perRow);
  }
  // com "minmax(mínimo, 1fr)" o navegador iguala todos os trilhos ao maior mínimo (é como o fr funciona): uma linha
  // que precisa de 67 px deixava as 12 com 67. Então: quem precisa de mais que a parte igual fica fixo no mínimo,
  // e os outros dividem o que sobra.
  const fit = (need: number[], total: number | undefined) => {
    if (total === undefined) return need.map((m) => `minmax(${Math.max(0, m)}px, 1fr)`).join(' ');
    const free = total - GAP * (need.length - 1);
    const fixed = new Set<number>();
    for (let guard = 0; guard < need.length; guard++) {
      const rest = need.length - fixed.size;
      const left = free - [...fixed].reduce((a, i) => a + need[i], 0);
      const share = rest > 0 ? left / rest : 0;
      let changed = false;
      need.forEach((m, i) => {
        if (!fixed.has(i) && m > share) {
          fixed.add(i);
          changed = true;
        }
      });
      if (!changed) break;
    }
    return need.map((m, i) => (fixed.has(i) ? `${m}px` : 'minmax(0, 1fr)')).join(' ');
  };
  return { cols: fit(c, size?.w), rows: fit(r, size?.h) };
}

// ---------------------------------------------------------------- moldes (caminho 3)

export interface TemplateInfo {
  id: LabTemplate;
  label: string;
  hint: string;
  /** coluna da direita: membros, widgets, os dois, ou nada */
  side: 'members' | 'widgets' | 'both' | 'none';
  /** faixa de widgets em cima da conversa */
  topStrip: boolean;
  nav: { def: number; min: number; max: number };
  sideW: { def: number; min: number; max: number };
}

export const TEMPLATES: TemplateInfo[] = [
  {
    id: 'classico',
    label: 'Clássico',
    hint: 'Canais à esquerda, conversa no meio, membros à direita. Widgets numa faixa em cima.',
    side: 'members',
    topStrip: true,
    nav: { def: 280, min: 230, max: 360 },
    sideW: { def: 250, min: 210, max: 340 },
  },
  {
    id: 'palco',
    label: 'Palco',
    hint: 'Conversa ou transmissão ocupa quase tudo. Canais estreitos, sem coluna da direita.',
    side: 'none',
    topStrip: false,
    nav: { def: 240, min: 220, max: 300 },
    sideW: { def: 0, min: 0, max: 0 },
  },
  {
    id: 'comunidade',
    label: 'Comunidade',
    hint: 'Coluna da direita com membros e widgets do servidor (Mural em destaque).',
    side: 'both',
    topStrip: false,
    nav: { def: 270, min: 230, max: 340 },
    sideW: { def: 300, min: 250, max: 420 },
  },
  {
    id: 'compacto',
    label: 'Compacto',
    hint: 'Só canais e conversa. Bom para janela pequena ou notebook.',
    side: 'none',
    topStrip: false,
    nav: { def: 240, min: 220, max: 300 },
    sideW: { def: 0, min: 0, max: 0 },
  },
];

export const templateInfo = (id: LabTemplate) => TEMPLATES.find((t) => t.id === id) ?? TEMPLATES[0];
