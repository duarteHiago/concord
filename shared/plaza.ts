// Praça do servidor: o servidor desenhado como um lugar, em vista isométrica. Cada sala de voz vira uma mesa
// (sentar = entrar na call), a transmissão de tela aparece na TV da mesa e a conversa é por balão, só para quem
// está na praça (não fica salva). Este arquivo é usado pelos dois lados: o servidor confere os passos com o
// mesmo mapa que o app desenha.

// ---- avatar ----

export const SKIN_TONES = ['#f6d5bd', '#eab894', '#cf9670', '#a8724b', '#7c4d2f', '#523222'];
export const HAIR_STYLES = ['Curto', 'Longo', 'Cacheado', 'Moicano', 'Coque', 'Raspado'];
export const HAIR_COLORS = ['#1f1a17', '#4a2f1f', '#8a5a2b', '#d9a54a', '#ebe4d6', '#d4483b', '#2f62e6', '#8b5cf6'];
export const TOP_STYLES = ['Camiseta', 'Moletom', 'Jaqueta', 'Regata'];
export const CLOTH_COLORS = ['#2f62e6', '#d4483b', '#2e9e6a', '#f5c451', '#8b5cf6', '#ececec', '#2b2b38', '#f08fb0', '#3fb8c9', '#8a5a2b'];
export const ACCESSORIES = ['Nada', 'Boné', 'Gorro', 'Fone', 'Óculos', 'Flor'];

export interface PlazaAvatar {
  skin: number;
  hair: number;
  hairColor: number;
  top: number;
  topColor: number;
  bottomColor: number;
  accessory: number;
}

const pick = (raw: unknown, size: number, fallback: number) =>
  typeof raw === 'number' && Number.isInteger(raw) && raw >= 0 && raw < size ? raw : fallback;

function hash(text: string) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Avatar de quem ainda não montou o seu: sai sempre o mesmo para a mesma pessoa. */
export function defaultAvatar(userId: string): PlazaAvatar {
  const h = hash(userId);
  return {
    skin: h % SKIN_TONES.length,
    hair: (h >>> 3) % HAIR_STYLES.length,
    hairColor: (h >>> 6) % 5,
    top: (h >>> 9) % TOP_STYLES.length,
    topColor: (h >>> 12) % CLOTH_COLORS.length,
    bottomColor: 6,
    accessory: 0,
  };
}

/** Só índices válidos passam; o resto volta para o avatar padrão da pessoa. */
export function sanitizeAvatar(raw: unknown, userId: string): PlazaAvatar {
  const base = defaultAvatar(userId);
  if (!raw || typeof raw !== 'object') return base;
  const a = raw as Record<string, unknown>;
  return {
    skin: pick(a.skin, SKIN_TONES.length, base.skin),
    hair: pick(a.hair, HAIR_STYLES.length, base.hair),
    hairColor: pick(a.hairColor, HAIR_COLORS.length, base.hairColor),
    top: pick(a.top, TOP_STYLES.length, base.top),
    topColor: pick(a.topColor, CLOTH_COLORS.length, base.topColor),
    bottomColor: pick(a.bottomColor, CLOTH_COLORS.length, base.bottomColor),
    accessory: pick(a.accessory, ACCESSORIES.length, base.accessory),
  };
}

// ---- balões e gestos ----

export const SAY_MAX = 120;

/** Limpa o texto de um balão: uma linha só, sem caracteres de controle, até SAY_MAX. Vazio = descartar. */
export function cleanSay(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  // eslint-disable-next-line no-control-regex
  return raw.replace(/[\u0000-\u001f\u007f​-‏‪-‮⁦-⁩]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, SAY_MAX);
}

export const EMOTES = [
  { id: 'wave', label: 'Acenar', emoji: '👋' },
  { id: 'dance', label: 'Dançar', emoji: '💃' },
  { id: 'clap', label: 'Palmas', emoji: '👏' },
  { id: 'love', label: 'Coração', emoji: '❤️' },
  { id: 'laugh', label: 'Rir', emoji: '😂' },
] as const;
export type EmoteId = (typeof EMOTES)[number]['id'];
export const isEmote = (raw: unknown): raw is EmoteId => EMOTES.some((e) => e.id === raw);

// ---- mapa ----

/** Mesas no máximo (uma por sala de voz, na ordem da lista de canais). */
export const MAX_TABLES = 12;
const COLS = 3;
const CELL = 7;
const TOP = 5;

export interface Point {
  x: number;
  y: number;
}

export interface PlazaTable {
  /** canto de cima da mesa (ela ocupa 2×2 casas a partir daqui) */
  x: number;
  y: number;
  /** onde a pessoa para antes de sentar (e onde fica de pé ao sair da call) */
  front: Point;
  /** cadeiras em volta, na ordem em que vão sendo ocupadas */
  seats: (Point & { facing: Facing })[];
  /** TV atrás da mesa (2 casas a partir daqui) */
  tv: Point;
}

/** Para onde o boneco olha: 0 = baixo-direita, 1 = baixo-esquerda, 2 = cima-esquerda, 3 = cima-direita */
export type Facing = 0 | 1 | 2 | 3;

export interface PlazaLayout {
  w: number;
  h: number;
  tables: PlazaTable[];
  /** casa por casa (y * w + x): 1 = não dá para pisar */
  blocked: Uint8Array;
  spawn: Point;
  /** prédio do servidor, no fundo (de x0 a x1, nas linhas 0 a 2) */
  building: { x0: number; x1: number };
  lamps: Point[];
  plants: Point[];
  benches: (Point & { facing: Facing })[];
}

export function buildLayout(tableCount: number): PlazaLayout {
  const n = Math.max(0, Math.min(MAX_TABLES, Math.floor(tableCount)));
  const rows = Math.max(1, Math.ceil(n / COLS));
  const w = 2 + COLS * CELL + 1;
  const h = TOP + rows * CELL + 4;
  const blocked = new Uint8Array(w * h);
  const block = (x: number, y: number) => {
    if (x >= 0 && y >= 0 && x < w && y < h) blocked[y * w + x] = 1;
  };

  const building = { x0: Math.floor(w / 2) - 4, x1: Math.floor(w / 2) + 3 };
  for (let x = building.x0; x <= building.x1; x++) for (let y = 0; y <= 2; y++) block(x, y);

  const tables: PlazaTable[] = [];
  for (let i = 0; i < n; i++) {
    const col = i % COLS;
    const row = Math.floor(i / COLS);
    const x = 3 + col * CELL;
    const y = TOP + 2 + row * CELL;
    const seats: PlazaTable['seats'] = [
      { x: x - 1, y, facing: 0 },
      { x: x + 2, y: y + 1, facing: 2 },
      { x, y: y + 2, facing: 3 },
      { x: x + 1, y: y - 1, facing: 1 },
      { x: x - 1, y: y + 1, facing: 0 },
      { x: x + 2, y, facing: 2 },
      { x: x + 1, y: y + 2, facing: 3 },
      { x, y: y - 1, facing: 1 },
    ];
    const tv = { x, y: y - 2 };
    for (let dx = 0; dx < 2; dx++) for (let dy = 0; dy < 2; dy++) block(x + dx, y + dy);
    for (const s of seats) block(s.x, s.y);
    block(tv.x, tv.y);
    block(tv.x + 1, tv.y);
    tables.push({ x, y, seats, tv, front: { x: x + 1, y: y + 3 } });
  }

  const lamps = [
    { x: 1, y: 3 },
    { x: w - 2, y: 3 },
    { x: 1, y: h - 2 },
    { x: w - 2, y: h - 2 },
  ];
  const plants = [
    { x: building.x0 - 1, y: 0 },
    { x: building.x1 + 1, y: 0 },
    { x: 0, y: Math.floor(h / 2) },
    { x: w - 1, y: Math.floor(h / 2) },
  ];
  const benches: PlazaLayout['benches'] = [
    { x: 0, y: Math.floor(h / 2) + 2, facing: 0 },
    { x: w - 1, y: Math.floor(h / 2) + 2, facing: 1 },
  ];
  for (const p of [...lamps, ...plants, ...benches]) block(p.x, p.y);

  const spawn = { x: Math.floor(w / 2), y: h - 2 };
  return { w, h, tables, blocked, spawn, building, lamps, plants, benches };
}

export const walkable = (layout: PlazaLayout, x: number, y: number) =>
  Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < layout.w && y < layout.h && !layout.blocked[y * layout.w + x];

/**
 * Caminho mais curto andando de casa em casa (4 direções), sem incluir a casa de saída. Vazio = já está lá ou
 * não tem como chegar. Determinístico: todo mundo vê o mesmo boneco fazer o mesmo caminho.
 */
export function findPath(layout: PlazaLayout, from: Point, to: Point): Point[] {
  if (!walkable(layout, to.x, to.y)) return [];
  const { w, h } = layout;
  const start = from.y * w + from.x;
  const goal = to.y * w + to.x;
  if (start === goal) return [];
  const prev = new Int32Array(w * h).fill(-1);
  prev[start] = start;
  const queue = [start];
  const dirs = [
    [1, 0],
    [0, 1],
    [-1, 0],
    [0, -1],
  ];
  for (let head = 0; head < queue.length; head++) {
    const cur = queue[head];
    if (cur === goal) break;
    const cx = cur % w;
    const cy = (cur - cx) / w;
    for (const [dx, dy] of dirs) {
      const nx = cx + dx;
      const ny = cy + dy;
      const next = ny * w + nx;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h || prev[next] !== -1 || layout.blocked[next]) continue;
      prev[next] = cur;
      queue.push(next);
    }
  }
  if (prev[goal] === -1) return [];
  const path: Point[] = [];
  for (let cur = goal; cur !== start; cur = prev[cur]) path.push({ x: cur % w, y: Math.floor(cur / w) });
  return path.reverse();
}

/** Casa livre mais perto de `p` (para quem caiu numa casa bloqueada depois que o mapa mudou). */
export function nearestWalkable(layout: PlazaLayout, p: Point): Point {
  if (walkable(layout, p.x, p.y)) return p;
  for (let r = 1; r < Math.max(layout.w, layout.h); r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
        if (walkable(layout, p.x + dx, p.y + dy)) return { x: p.x + dx, y: p.y + dy };
      }
    }
  }
  return layout.spawn;
}
