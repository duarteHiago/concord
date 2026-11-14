// Laboratório de layout (só no Concord de testes): três modos de montar a tela do servidor, escolhidos no botão
// flutuante. A escolha do modo fica no navegador de quem testa (localStorage); a montagem de cada modo (a grade,
// os encaixes, a tela da sala) é do dono do servidor e vai publicada na Oficina.
import { create } from 'zustand';

export type LabMode =
  /** 1 · Livre com limites: grade livre, mas os blocos principais têm tamanho mínimo e não somem */
  | 'livre'
  /** 2 · Encaixes: lugares fixos; cada bloco principal só vai nos lugares dele */
  | 'encaixes'
  /** 3 · Livre + tela de call: fora da call como o 1; na call, a tela da sala (montada pelo dono) */
  | 'call';

export const LAB_MODES: { id: LabMode; n: number; label: string; short: string; hint: string; color: string }[] = [
  {
    id: 'livre',
    n: 1,
    label: 'Livre com limites',
    short: 'Livre',
    hint: 'O dono monta como quiser. Os blocos principais (canais, conversa, voz e perfil) não podem ser apagados e têm um tamanho mínimo. Na call, a sala abre no lugar da conversa.',
    color: '#2f6fed',
  },
  {
    id: 'encaixes',
    n: 2,
    label: 'Encaixes',
    short: 'Encaixes',
    hint: 'A tela tem lugares fixos. A conversa e a sala ficam sempre no centro; canais, membros e voz escolhem entre os lugares deles. Widgets vão nas zonas livres.',
    color: '#0f9d76',
  },
  {
    id: 'call',
    n: 3,
    label: 'Livre + tela de call',
    short: 'Tela de call',
    hint: 'Fora da call, igual ao modo 1. Ao entrar na call, a tela desliza para a tela da sala, que o dono monta na Oficina: as laterais e os botões da barra. Ao sair da call, volta.',
    color: '#c2410c',
  },
];
export const labMode = (id: LabMode) => LAB_MODES.find((m) => m.id === id) ?? LAB_MODES[0];

interface LabStore {
  mode: LabMode;
  open: boolean;
  setOpen: (open: boolean) => void;
  setMode: (mode: LabMode) => void;
}

const KEY = 'concord.layoutLab';

function loadMode(): LabMode {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}') as { mode?: string };
    return raw.mode === 'encaixes' || raw.mode === 'call' ? raw.mode : 'livre';
  } catch {
    return 'livre';
  }
}

export const useLab = create<LabStore>((set) => ({
  mode: loadMode(),
  open: false,
  setOpen: (open) => set({ open }),
  setMode: (mode) => {
    set({ mode });
    try {
      localStorage.setItem(KEY, JSON.stringify({ mode }));
    } catch {
      // ignorado
    }
  },
}));

// ---------------------------------------------------------------- mínimos em pixels

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

/** O modo 1 garante o mínimo na menor janela em que a tela montada vale (1100 px), já em call. */
export const BASE_WINDOW = { w: 1100, h: 680 };
export const WORST_CASE = { inCall: true, voiceRoom: false };

const PAD = 16;
const GAP = 16;
const STRIP = 96;

/** Área da grade (px) numa janela. */
export const gridArea = (win: { w: number; h: number }) => ({ w: win.w - PAD * 2, h: win.h - PAD * 2 - STRIP - GAP });

/** Quantas casas da grade 12×12 um bloco precisa, no mínimo, para caber em pixels numa janela. */
export function minCells(block: CoreBlock, ctx: { inCall: boolean; voiceRoom: boolean }, win: { w: number; h: number } = BASE_WINDOW, cols = 12, rows = 12): [number, number] {
  const min = blockMinPx(block, ctx);
  const a = gridArea(win);
  const cw = (a.w - GAP * (cols - 1)) / cols;
  const ch = (a.h - GAP * (rows - 1)) / rows;
  return [Math.min(cols, Math.ceil((min.w + GAP) / (cw + GAP))), Math.min(rows, Math.ceil((min.h + GAP) / (ch + GAP)))];
}

/**
 * O mínimo (px) de cada coluna e linha da grade 12×12, para que cada bloco tenha pelo menos o mínimo da situação.
 * Quem precisa de mais que a parte igual fica fixo no mínimo e os outros dividem o que sobra (com "minmax(mínimo,
 * 1fr)" o navegador igualaria todos os trilhos ao maior mínimo). Se a soma passar da área, a tela rola.
 */
export function limitTracks(
  items: { x: number; y: number; w: number; h: number; type: string; block?: string }[],
  ctx: { inCall: boolean; voiceRoom: boolean },
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

export const LAB_SPRING = { type: 'spring', stiffness: 300, damping: 32, mass: 0.9 } as const;
