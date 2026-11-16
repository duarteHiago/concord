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
// a ordem é o que fica salvo (índice): item novo entra sempre no fim
export const ACCESSORIES = ['Nada', 'Boné', 'Gorro', 'Fone', 'Óculos', 'Flor', 'Coroa', 'Cartola', 'Chapéu de bruxa', 'Chifres', 'Auréola', 'Orelhas de gato', 'Viking', 'Abóbora'];
export const FACES = ['Nada', 'Hóquei', 'Fantasma', 'Caveira', 'Cirúrgica', 'Bandana', 'Bigode', 'Tapa-olho', 'Nariz de palhaço', 'Óculos escuros'];

export interface PlazaAvatar {
  skin: number;
  hair: number;
  hairColor: number;
  top: number;
  topColor: number;
  bottomColor: number;
  accessory: number;
  /** máscara ou o que mais vai no rosto (FACES) */
  face: number;
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
    face: 0,
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
    face: pick(a.face, FACES.length, base.face),
  };
}

// ---- balões e gestos ----

export const SAY_MAX = 120;

// ---- proximidade (só no lobby; lá dentro vale o lugar inteiro) ----

/** Até quantas casas um balão do lobby chega. */
export const SAY_RADIUS = 8;
/** Até quantas casas se ouve alguém no lobby (perto disso, o volume vai a zero). */
export const HEAR_RADIUS = 7;
/** Volume de quem está a `d` casas: cheio até 2 casas, caindo até sumir em HEAR_RADIUS. */
export function proximityVolume(d: number) {
  if (d <= 2) return 1;
  if (d >= HEAR_RADIUS) return 0;
  const k = 1 - (d - 2) / (HEAR_RADIUS - 2);
  return k * k;
}
export const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
// ---- espiar uma mesa (ouvir a call por alguns segundos, com aviso para quem está nela) ----

/** Quanto dura uma espiada. */
export const PEEK_MS = 10_000;
/** Depois de espiar uma mesa, quanto esperar para espiar a mesma de novo. */
export const PEEK_COOLDOWN_MS = 60_000;
/** Ouvir de perto: até quantas casas do meio da mesa a conversa dela chega (sem falar, com aviso para a mesa). */
export const NEAR_RADIUS = 3;
/** Ouvir de perto vale por este tempo e o app renova enquanto a pessoa continua perto. */
export const NEAR_MS = 12_000;

/** Volume do cochicho de quem espia, para quem está na call. */
export const WHISPER_VOLUME = 0.3;

/** Sala de voz do lobby de um servidor, no LiveKit. */
export const lobbyRoom = (serverId: string) => `plaza_${serverId}`;

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

// ---- bebidas do balcão (lá dentro do estabelecimento) ----

export const DRINKS = [
  { id: 'refri', label: 'Refri', emoji: '🥤', color: '#e8685a' },
  { id: 'suco', label: 'Suco', emoji: '🧃', color: '#f5c451' },
  { id: 'chopp', label: 'Chopp', emoji: '🍺', color: '#f0b429' },
  { id: 'cafe', label: 'Café', emoji: '☕', color: '#6e4834' },
  { id: 'milkshake', label: 'Milkshake', emoji: '🥛', color: '#f08fb0' },
  { id: 'agua', label: 'Água', emoji: '💧', color: '#8fd3ff' },
] as const;
export type DrinkId = (typeof DRINKS)[number]['id'];
export const isDrink = (raw: unknown): raw is DrinkId => DRINKS.some((d) => d.id === raw);
/** Quanto tempo a bebida fica na mão (vai junto para a mesa quando a pessoa senta). */
export const DRINK_MS = 30 * 60_000;

/** Está perto o bastante do balcão para pedir (a fila logo na frente dele, lá dentro). */
export function nearCounter(layout: PlazaLayout, p: Point) {
  const { x0, x1 } = layout.building;
  return layout.kind === 'inside' && layout.level === 0 && p.y >= 3 && p.y <= 4 && p.x >= x0 - 1 && p.x <= x1 + 1;
}

/** A praça (lobby, ao ar livre) ou o estabelecimento do servidor (por dentro, com as mesas das calls). */
/** a praça, o estabelecimento, o corredor dos quartos e o quarto de alguém */
export type Scene = 'lobby' | 'inside' | 'hall' | 'room';
/** Os lugares que quem gerencia o servidor monta (o quarto, só o dono). */
export type PlaceScene = 'lobby' | 'inside';
export const isPlaceScene = (raw: unknown): raw is PlaceScene => raw === 'lobby' || raw === 'inside';

// ---- móveis e cores (o editor da Praça, para quem gerencia o servidor) ----

export interface FurnitureDef {
  label: string;
  /** casas ao longo de x e de y (girado, troca) */
  w: number;
  h: number;
  /** não dá para pisar em cima (o tapete dá) */
  block: boolean;
  scenes: Scene[];
  /** dá para escolher a cor (ITEM_COLORS) */
  colors?: boolean;
  /**
   * Onde vai: 'shelf' = enfeite, só em cima de uma prateleira (uma casa dela cada); 'wall' = pendurado na parede
   * (r 0 = parede do fundo, na fileira y = 0; r 1 = parede da esquerda, na coluna x = 0). Nenhum dos dois ocupa o chão.
   */
  place?: 'shelf' | 'wall';
  /** igual de todos os lados: não tem o que girar */
  still?: boolean;
  /** um só por lugar e não sai (os móveis de sempre do quarto, onde o dono aparece): dá para mudar de lugar e girar */
  unique?: boolean;
  /** a cor original do móvel, no lugar da primeira de ITEM_COLORS (para quem já existia sem cor continuar igual) */
  base?: string;
}

const BOTH: Scene[] = ['lobby', 'inside', 'room'];
const INDOOR: Scene[] = ['inside', 'room'];
export const FURNITURE = {
  plant: { label: 'Planta', w: 1, h: 1, block: true, scenes: BOTH, colors: true, base: '#c0714f', still: true },
  tree: { label: 'Árvore', w: 1, h: 1, block: true, scenes: ['lobby'], still: true },
  flowers: { label: 'Canteiro', w: 1, h: 1, block: true, scenes: BOTH, colors: true, still: true },
  lamp: { label: 'Luminária', w: 1, h: 1, block: true, scenes: BOTH, colors: true, base: '#ffdc96', still: true },
  bench: { label: 'Banco', w: 1, h: 1, block: true, scenes: BOTH, colors: true, base: '#a87454' },
  cafe: { label: 'Mesinha', w: 1, h: 1, block: true, scenes: BOTH, colors: true, base: '#f3f0fb', still: true },
  stool: { label: 'Banquinho', w: 1, h: 1, block: true, scenes: BOTH, colors: true, still: true },
  sofa: { label: 'Sofá', w: 2, h: 1, block: true, scenes: BOTH, colors: true },
  rug: { label: 'Tapete', w: 2, h: 2, block: false, scenes: BOTH, colors: true, still: true },
  shelf: { label: 'Estante', w: 1, h: 1, block: true, scenes: ['inside', 'room'] },
  arcade: { label: 'Fliperama', w: 1, h: 1, block: true, scenes: BOTH, colors: true },
  fountain: { label: 'Fonte', w: 2, h: 2, block: true, scenes: ['lobby'], still: true },
  armchair: { label: 'Poltrona', w: 1, h: 1, block: true, scenes: INDOOR, colors: true },
  aquarium: { label: 'Aquário', w: 2, h: 1, block: true, scenes: INDOOR },
  speaker: { label: 'Caixa de som', w: 1, h: 1, block: true, scenes: INDOOR },
  cactus: { label: 'Cacto', w: 1, h: 1, block: true, scenes: BOTH, still: true },
  palm: { label: 'Palmeira', w: 1, h: 1, block: true, scenes: BOTH, still: true },
  painting: { label: 'Quadro', w: 2, h: 1, block: false, scenes: INDOOR, place: 'wall', colors: true },
  clock: { label: 'Relógio', w: 1, h: 1, block: false, scenes: INDOOR, place: 'wall' },
  neon: { label: 'Neon', w: 2, h: 1, block: false, scenes: INDOOR, place: 'wall', colors: true },
  desk: { label: 'Escrivaninha', w: 2, h: 2, block: true, scenes: ['room'], unique: true },
  tvGame: { label: 'TV e videogame', w: 2, h: 1, block: true, scenes: ['room'], unique: true },
  pouf: { label: 'Pufe', w: 1, h: 1, block: true, scenes: ['room'], unique: true, colors: true, base: '#8b5cf6', still: true },
  bed: { label: 'Cama', w: 2, h: 1, block: true, scenes: ['room'], unique: true, colors: true, base: '#5a7fd9' },
  ledge: { label: 'Prateleira', w: 2, h: 1, block: true, scenes: ['inside', 'room'] },
  trophyGold: { label: 'Troféu dourado', w: 1, h: 1, block: false, scenes: ['room'], place: 'shelf' },
  trophyCup: { label: 'Taça prateada', w: 1, h: 1, block: false, scenes: ['room'], place: 'shelf' },
  poster: { label: 'Pôster', w: 2, h: 1, block: false, scenes: ['room'], place: 'wall' },
} satisfies Record<string, FurnitureDef>;
export type FurnitureKind = keyof typeof FURNITURE;
export const furnitureDef = (k: FurnitureKind): FurnitureDef => FURNITURE[k];
export const isFurniture = (raw: unknown): raw is FurnitureKind => typeof raw === 'string' && Object.prototype.hasOwnProperty.call(FURNITURE, raw);

export const ITEM_COLORS = ['#e8685a', '#2f62e6', '#2e9e6a', '#f5c451', '#8b5cf6', '#f08fb0', '#3fb8c9', '#ececec'];

export interface Furniture {
  k: FurnitureKind;
  x: number;
  y: number;
  /** girado 90° (troca largura e profundidade) */
  r: 0 | 1;
  /** cor (índice em ITEM_COLORS) */
  c: number;
}

export interface PlaceStyle {
  /** chão (índice em FLOORS[lugar]) */
  floor: number;
  /** paredes, só lá dentro (índice em WALLS) */
  wall: number;
  items: Furniture[];
}

const INDOOR_FLOORS = [
  { name: 'Madeira', a: '#9a6a4f', b: '#8c5f46' },
  { name: 'Madeira clara', a: '#c4956b', b: '#b5875f' },
  { name: 'Mármore', a: '#d9d6e6', b: '#c4c0d6' },
  { name: 'Carpete', a: '#7b4fb8', b: '#6e45a8' },
  { name: 'Ladrilho', a: '#3f8f8a', b: '#357a76' },
  { name: 'Escuro', a: '#4a3f6b', b: '#40365e' },
];

export const FLOORS: Record<Scene, { name: string; a: string; b: string }[]> = {
  inside: INDOOR_FLOORS,
  hall: INDOOR_FLOORS,
  room: [...INDOOR_FLOORS, { name: 'Carpete azul', a: '#4a62b8', b: '#4157a6' }, { name: 'Carpete rosa', a: '#c27aa3', b: '#b26b93' }],
  lobby: [
    { name: 'Azulejo', a: '#7c86d6', b: '#6670c4' },
    { name: 'Terracota', a: '#c9805e', b: '#b46e4f' },
    { name: 'Grama', a: '#5fa86f', b: '#4f9660' },
    { name: 'Pedra', a: '#8e8aa3', b: '#7d798f' },
    { name: 'Areia', a: '#d8bf8a', b: '#c8ae79' },
    { name: 'Rosa', a: '#d993b4', b: '#c781a2' },
  ],
};

export const WALLS = [
  { name: 'Lavanda', left: '#5b4a8a', back: '#6a589c' },
  { name: 'Coral', left: '#b9564b', back: '#cc6357' },
  { name: 'Verde', left: '#3f7a5c', back: '#4a8a69' },
  { name: 'Azul', left: '#35539c', back: '#3f60ad' },
  { name: 'Creme', left: '#c9b48f', back: '#d8c4a0' },
  { name: 'Grafite', left: '#3b3a48', back: '#464555' },
];

export const MAX_ITEMS = 60;

/** Casas ocupadas por um móvel. */
export function footprint(it: Pick<Furniture, 'k' | 'x' | 'y' | 'r'>): Point[] {
  const d = furnitureDef(it.k);
  const w = it.r ? d.h : d.w;
  const h = it.r ? d.w : d.h;
  const out: Point[] = [];
  for (let dx = 0; dx < w; dx++) for (let dy = 0; dy < h; dy++) out.push({ x: it.x + dx, y: it.y + dy });
  return out;
}

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
  kind: Scene;
  w: number;
  h: number;
  /** a porta: no lobby, a entrada do prédio; dentro, a saída. Pisar nela troca de lugar. */
  door: Point;
  tables: PlazaTable[];
  /** casa por casa (y * w + x): 1 = não dá para pisar */
  blocked: Uint8Array;
  /** só o que é fixo (prédio, balcão, mesas): móvel nenhum vai em cima */
  fixed: Uint8Array;
  /** casas que precisam ficar livres (porta, chegada, frente das mesas) */
  reserved: Point[];
  spawn: Point;
  /** no lobby, o prédio do servidor; dentro, o balcão (de x0 a x1, nas linhas 0 a 2) */
  building: { x0: number; x1: number };
  floor: number;
  wall: number;
  /** móveis que valeram (os que caíram em lugar proibido ficam de fora) */
  items: Furniture[];
  /** andar do estabelecimento (0 = térreo) */
  level: number;
  /** o elevador (no prédio e no corredor dos quartos): pisar nele abre a escolha do andar */
  elevator: Point | null;
  /** no corredor, a porta de cada quarto (a casa na frente dela, encostada na parede do fundo) */
  doors: Point[];
  /** no quarto, onde ficam a escrivaninha, a TV com o videogame e a cama (e onde o dono aparece em cada uma) */
  nook: RoomNook | null;
  /** no corredor, as escadas para o andar de cima e para o de baixo (pisar nelas troca de andar) */
  stairs?: { up: Point | null; down: Point | null };
}

export interface RoomNook {
  /** escrivaninha com o computador e a cadeira na frente (2×2) */
  desk: Furniture | null;
  /** TV com o videogame, e o pufe onde o dono senta para jogar */
  tv: Furniture | null;
  pouf: Furniture | null;
  /** cama (2 casas ao longo de x, a cabeceira na parede da esquerda) */
  bed: Furniture | null;
}

type Base = Omit<PlazaLayout, 'blocked' | 'floor' | 'wall' | 'items'>;

const OFF_MAP = { x: -10, y: -10 };

function baseLobby(): Base {
  const w = 22;
  const h = 18;
  const fixed = new Uint8Array(w * h);
  const building = { x0: Math.floor(w / 2) - 4, x1: Math.floor(w / 2) + 3 };
  for (let x = building.x0; x <= building.x1; x++) for (let y = 0; y <= 2; y++) fixed[y * w + x] = 1;
  const door = { x: Math.floor(w / 2), y: 3 };
  const spawn = { x: Math.floor(w / 2), y: h - 2 };
  return { kind: 'lobby', w, h, door, tables: [], fixed, reserved: [door, { x: door.x, y: door.y + 1 }, spawn], spawn, building, level: 0, elevator: null, doors: [], nook: null };
}

/**
 * O estabelecimento por dentro. O térreo tem o balcão e a saída; os andares de cima, só as mesas. O elevador (para
 * os outros andares e o corredor dos quartos) fica na parede do fundo, à direita do balcão.
 */
function baseInside(tableCount: number, level = 0): Base {
  const n = Math.max(0, Math.min(level ? FLOOR_TABLES : GROUND_TABLES, Math.floor(tableCount)));
  const rows = Math.max(1, Math.ceil(n / COLS));
  const w = 2 + COLS * CELL + 1;
  const h = TOP + rows * CELL + 4;
  const fixed = new Uint8Array(w * h);
  const block = (x: number, y: number) => {
    if (x >= 0 && y >= 0 && x < w && y < h) fixed[y * w + x] = 1;
  };
  const building = { x0: Math.floor(w / 2) - 4, x1: Math.floor(w / 2) + 3 };
  if (!level) for (let x = building.x0; x <= building.x1; x++) for (let y = 0; y <= 2; y++) block(x, y);
  const elevator = { x: building.x1 + 2, y: 0 };
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
  // lá em cima não tem saída: chega e sai pelo elevador
  const spawn = level ? { x: elevator.x, y: elevator.y + 1 } : { x: Math.floor(w / 2), y: h - 2 };
  const door = level ? OFF_MAP : { x: spawn.x, y: h - 1 };
  const reserved = [door, spawn, ...tables.map((t) => t.front), elevator, { x: elevator.x, y: elevator.y + 1 }];
  return { kind: 'inside', w, h, door, tables, fixed, reserved, spawn, building, level, elevator, doors: [], nook: null };
}

// ---- quartos ----

/** Quartos em cada andar do corredor; com o andar cheio, uma escada no fim leva ao de cima. */
export const HALL_DOORS_PER_FLOOR = 8;
/** Andares do corredor, no máximo. */
export const MAX_HALL_FLOORS = 10;
/** Quartos no corredor, no máximo (somando os andares). */
export const MAX_HALL_DOORS = HALL_DOORS_PER_FLOOR * MAX_HALL_FLOORS;

const hallTotal = (total: number) => Math.max(0, Math.min(MAX_HALL_DOORS, Math.floor(total) || 0));
/** Quantos andares o corredor tem com `total` quartos. */
export const hallFloorCount = (total: number) => Math.max(1, Math.ceil(hallTotal(total) / HALL_DOORS_PER_FLOOR));
/** Sem prédio nem balcão (os quadros da parede vão para onde quiserem). */
const NO_BUILDING = { x0: 1000, x1: 1000 };

/** A casa na frente da porta número `i` de um andar do corredor. */
export const hallDoor = (i: number): Point => ({ x: 4 + i * 3, y: 0 });

/** Onde fica o quarto número `i` (na ordem do corredor, a mesma para todo mundo): o andar e a casa na frente da porta. */
export const hallSpot = (i: number) => ({ level: Math.floor(i / HALL_DOORS_PER_FLOOR), at: hallDoor(i % HALL_DOORS_PER_FLOOR) });

const hallWidth = (doors: number) => Math.max(10, hallDoor(doors - 1).x + 4);

/**
 * Um andar do corredor dos quartos: até HALL_DOORS_PER_FLOOR portas, uma a cada 3 casas na parede do fundo. O
 * elevador fica na ponta da esquerda (nos andares de cima, com a escada para descer do lado). Se tem andar acima,
 * a escada para subir fica no fim. `total` = quartos somando todos os andares.
 */
function baseHall(total: number, level = 0): Base {
  const all = hallTotal(total);
  const floors = hallFloorCount(all);
  const lv = Math.max(0, Math.min(floors - 1, Math.floor(level) || 0));
  const n = Math.max(0, Math.min(HALL_DOORS_PER_FLOOR, all - lv * HALL_DOORS_PER_FLOOR));
  const w = hallWidth(n);
  const h = 5;
  // o elevador existe em todo andar (leva direto a qualquer andar do prédio ou do corredor); nos de cima, do lado
  // da escada de descer
  const elevator = lv === 0 ? { x: 1, y: 0 } : { x: 2, y: 0 };
  const down = lv > 0 ? { x: 1, y: 0 } : null;
  const up = lv < floors - 1 ? { x: w - 2, y: 0 } : null;
  const spawn = { x: 1, y: 1 };
  const doors = Array.from({ length: n }, (_, i) => hallDoor(i));
  const reserved = [spawn, ...doors, ...[elevator, down, up].filter((p): p is Point => !!p)];
  return { kind: 'hall', w, h, door: OFF_MAP, tables: [], fixed: new Uint8Array(w * h), reserved, spawn, building: NO_BUILDING, level: lv, elevator, doors, nook: null, stairs: { up, down } };
}

/** Plantas encostadas na parede da frente do corredor. */
function hallPlants(w: number): Furniture[] {
  // encostado na parede da frente: planta, banco, palmeira... alternando
  const items: Furniture[] = [];
  const kinds: FurnitureKind[] = ['plant', 'bench', 'palm', 'bench'];
  for (let x = 3, i = 0; x < w - 1; x += 3, i++) items.push({ ...item(kinds[i % kinds.length], x, 4), r: kinds[i % kinds.length] === 'bench' ? 1 : 0 });
  return items;
}

/**
 * O quarto de alguém: a porta (de volta ao corredor) na frente. A escrivaninha, a TV com o videogame, o pufe e a
 * cama são móveis como os outros (o dono muda de lugar), mas sempre existem: ver roomBasics.
 */
function baseRoom(): Base {
  const w = 9;
  const h = 8;
  const spawn = { x: w - 2, y: h - 2 };
  const door = { x: w - 2, y: h - 1 };
  return { kind: 'room', w, h, door, tables: [], fixed: new Uint8Array(w * h), reserved: [door, spawn], spawn, building: NO_BUILDING, level: 0, elevator: null, doors: [], nook: null };
}

/** Os móveis de sempre do quarto, onde vinham antes de dar para mexer neles. */
const ROOM_BASICS: Furniture[] = [
  { k: 'desk', x: 1, y: 0, r: 0, c: 0 },
  { k: 'tvGame', x: 5, y: 0, r: 0, c: 0 },
  { k: 'pouf', x: 5, y: 2, r: 0, c: 0 },
  { k: 'bed', x: 0, y: 5, r: 0, c: 0 },
];

/** O quarto sempre tem escrivaninha, TV, pufe e cama: o que faltar (quarto salvo antes) volta para o lugar de sempre. */
function roomBasics(items: Furniture[]): Furniture[] {
  const missing = ROOM_BASICS.filter((b) => !items.some((it) => it.k === b.k));
  return missing.length ? [...missing.map((b) => ({ ...b })), ...items] : items;
}

/** O estilo do quarto com os móveis de sempre (para o editor começar com eles na lista). */
export const withRoomBasics = (style: PlaceStyle): PlaceStyle => ({ ...style, items: roomBasics(style.items) });

/**
 * Um ponto de um móvel (u, v em casas a partir do canto dele, como se não estivesse girado) no mapa. Girado, o
 * móvel é o espelho dele mesmo trocando x por y em volta do meio (é assim que o desenho também gira).
 */
export function itemPoint(it: Pick<Furniture, 'k' | 'x' | 'y' | 'r'>, u: number, v: number): { x: number; y: number } {
  if (!it.r) return { x: it.x + u, y: it.y + v };
  const d = furnitureDef(it.k);
  const cx = it.x + d.h / 2;
  const cy = it.y + d.w / 2;
  const px = cx - d.w / 2 + u;
  const py = cy - d.h / 2 + v;
  return { x: cx + (py - cy), y: cy + (px - cx) };
}

// ---- andares do estabelecimento ----

/** Mesas no térreo (as salas principais). */
export const GROUND_TABLES = 6;
/** Mesas em cada andar de cima. */
export const FLOOR_TABLES = 2;
/** Andares de cima, no máximo. */
export const MAX_FLOORS = 10;

export const floorName = (level: number) => (level === 0 ? 'Térreo' : `${level}º andar`);

/**
 * Em que andar fica cada sala de voz (na ordem da lista de canais). Primeiro as salas que o admin escolheu (se
 * ainda cabe no andar), depois as outras: térreo até GROUND_TABLES, e o resto de FLOOR_TABLES em FLOOR_TABLES.
 */
export function planFloors(channelIds: string[], assign: Record<string, number> = {}): string[][] {
  const floors: string[][] = [[]];
  const cap = (level: number) => (level === 0 ? GROUND_TABLES : FLOOR_TABLES);
  const room = (level: number) => {
    while (floors.length <= level) floors.push([]);
    return floors[level].length < cap(level);
  };
  const rest: string[] = [];
  for (const id of channelIds) {
    const want = assign[id];
    if (Number.isInteger(want) && want >= 0 && want <= MAX_FLOORS && room(want)) floors[want].push(id);
    else rest.push(id);
  }
  for (const id of rest) {
    let level = 0;
    while (level <= MAX_FLOORS && !room(level)) level++;
    if (level > MAX_FLOORS) break; // sem espaço: a sala fica fora do prédio
    floors[level].push(id);
  }
  // sem andares vazios no meio (o admin pode ter escolhido o 3º sem nada no 2º)
  return [floors[0], ...floors.slice(1).filter((f) => f.length)];
}

const item = (k: FurnitureKind, x: number, y: number, c = 0): Furniture => ({ k, x, y, r: 0, c });

/** Como cada lugar vem antes de alguém mexer (os enfeites de sempre). */
export function defaultStyle(scene: Scene, tableCount = 0): PlaceStyle {
  if (scene === 'room') return { floor: 1, wall: 4, items: [...ROOM_BASICS.map((b) => ({ ...b })), item('rug', 2, 3, 1), item('lamp', 0, 3), item('plant', 8, 2), item('shelf', 0, 1)] };
  if (scene === 'hall') return { floor: 0, wall: 0, items: hallPlants(baseHall(tableCount).w) };
  if (scene === 'lobby') {
    const w = 22;
    const h = 18;
    const b = baseLobby().building;
    const items: Furniture[] = [];
    for (const c of [
      { x: 4, y: 7 },
      { x: 16, y: 7 },
      { x: 5, y: 12 },
      { x: 15, y: 12 },
    ]) {
      items.push(item('stool', c.x - 1, c.y), item('cafe', c.x, c.y), item('stool', c.x + 1, c.y));
    }
    for (const p of [
      { x: 1, y: 4 },
      { x: w - 2, y: 4 },
      { x: 1, y: h - 2 },
      { x: w - 2, y: h - 2 },
      { x: Math.floor(w / 2) - 3, y: 9 },
      { x: Math.floor(w / 2) + 3, y: 9 },
    ]) items.push(item('lamp', p.x, p.y));
    for (const p of [
      { x: b.x0 - 1, y: 0 },
      { x: b.x1 + 1, y: 0 },
      { x: 0, y: 9 },
      { x: w - 1, y: 9 },
      { x: b.x0 - 1, y: 3 },
      { x: b.x1 + 1, y: 3 },
    ]) items.push(item('plant', p.x, p.y));
    for (const p of [
      { x: 0, y: 11 },
      { x: w - 1, y: 11 },
      { x: 0, y: 13 },
      { x: w - 1, y: 13 },
    ]) items.push(item('bench', p.x, p.y));
    return { floor: 0, wall: 0, items };
  }
  const base = baseInside(tableCount);
  const { w, h, building: b } = base;
  const items: Furniture[] = [];
  for (const p of [
    { x: 1, y: 3 },
    { x: w - 2, y: 3 },
    { x: 1, y: h - 2 },
    { x: w - 2, y: h - 2 },
  ]) items.push(item('lamp', p.x, p.y));
  for (const p of [
    { x: b.x0 - 1, y: 0 },
    { x: b.x1 + 1, y: 0 },
    { x: 0, y: Math.floor(h / 2) },
    { x: w - 1, y: Math.floor(h / 2) },
  ]) items.push(item('plant', p.x, p.y));
  for (const p of [
    { x: 0, y: Math.floor(h / 2) + 2 },
    { x: w - 1, y: Math.floor(h / 2) + 2 },
  ]) items.push(item('bench', p.x, p.y));
  return { floor: 0, wall: 0, items };
}

/** Põe os móveis no mapa; o que cair em lugar proibido (fora, em cima de algo, na passagem) fica de fora. */
function applyStyle(base: Base, style: PlaceStyle): PlazaLayout {
  const { w, h, fixed } = base;
  const blocked = new Uint8Array(fixed);
  const rug = new Uint8Array(w * h);
  const reserved = new Set(base.reserved.map((p) => p.y * w + p.x));
  const items: Furniture[] = [];
  const list = style.items.slice(0, MAX_ITEMS).filter((it) => isFurniture(it.k) && furnitureDef(it.k).scenes.includes(base.kind));
  // os enfeites vão por último: precisam saber onde estão as prateleiras
  const later = (it: Furniture) => (furnitureDef(it.k).place === 'shelf' ? 1 : 0);
  const shelfTop = new Set<number>();
  const shelfUsed = new Set<number>();
  const wallUsed = new Set<string>();
  const uniques = new Set<FurnitureKind>();
  // na parede: nada em cima do elevador, das portas, das escadas nem do balcão
  const wallBusy = new Set(base.reserved.map((p) => `${p.x}:${p.y}`));
  for (const p of [base.elevator, base.stairs?.up, base.stairs?.down]) if (p) wallBusy.add(`${p.x}:${p.y}`);
  const { x0, x1 } = base.building;
  for (const it of [...list].sort((a, b) => later(a) - later(b))) {
    const def = furnitureDef(it.k);
    if (def.unique) {
      if (uniques.has(it.k)) continue;
      uniques.add(it.k);
    }
    const tiles = footprint(it);
    const inside = (t: Point) => t.x >= 0 && t.y >= 0 && t.x < w && t.y < h;
    if (def.place === 'wall') {
      const keys = tiles.map((t) => `${it.r}:${t.x}:${t.y}`);
      const onWall = tiles.every((t) => inside(t) && (it.r ? t.x === 0 : t.y === 0));
      const busy = tiles.some((t) => (base.kind !== 'room' && wallBusy.has(`${t.x}:${t.y}`)) || (!it.r && base.kind === 'inside' && t.x >= x0 - 1 && t.x <= x1 + 1));
      if (!onWall || busy || keys.some((k) => wallUsed.has(k))) continue;
      for (const k of keys) wallUsed.add(k);
      items.push(it);
      continue;
    }
    if (def.place === 'shelf') {
      const idx = tiles.map((t) => t.y * w + t.x);
      if (!tiles.every(inside) || idx.some((i) => !shelfTop.has(i) || shelfUsed.has(i))) continue;
      for (const i of idx) shelfUsed.add(i);
      items.push(it);
      continue;
    }
    const ok = tiles.every((t) => {
      if (t.x < 0 || t.y < 0 || t.x >= w || t.y >= h) return false;
      const i = t.y * w + t.x;
      if (fixed[i]) return false;
      if (def.block) return !blocked[i] && !reserved.has(i);
      return !rug[i];
    });
    if (!ok) continue;
    // índices numéricos já conferidos acima (dentro do mapa); fill evita escrever por nome de propriedade
    for (const t of tiles) {
      const i = t.y * w + t.x;
      (def.block ? blocked : rug).fill(1, i, i + 1);
      if (it.k === 'ledge') shelfTop.add(i);
    }
    items.push(it);
  }
  const one = (k: FurnitureKind) => items.find((it) => it.k === k) ?? null;
  const nook: RoomNook | null = base.kind === 'room' ? { desk: one('desk'), tv: one('tvGame'), pouf: one('pouf'), bed: one('bed') } : base.nook;
  return { ...base, blocked, floor: style.floor, wall: style.wall, items, nook };
}

/**
 * O mapa de um lugar: o lobby tem tamanho fixo; o estabelecimento tem uma mesa por sala de voz no andar. Os andares
 * de cima usam as cores do térreo e os enfeites de sempre (o editor mexe no térreo). No corredor, `tableCount` é o
 * número de quartos somando os andares, e `level` o andar do corredor.
 */
export function layoutFor(scene: Scene, tableCount: number, style?: PlaceStyle | null, level = 0): PlazaLayout {
  if (scene === 'lobby') return applyStyle(baseLobby(), style ?? defaultStyle('lobby'));
  if (scene === 'hall') {
    const base = baseHall(tableCount, level);
    return applyStyle(base, { floor: 0, wall: 0, items: hallPlants(base.w) });
  }
  if (scene === 'room') {
    const st = style ?? defaultStyle('room');
    return applyStyle(baseRoom(), { ...st, items: roomBasics(st.items) });
  }
  const base = baseInside(tableCount, level);
  if (!level) return applyStyle(base, style ?? defaultStyle('inside', tableCount));
  return applyStyle(base, { floor: style?.floor ?? 0, wall: style?.wall ?? 0, items: defaultStyle('inside', tableCount).items });
}

export const buildLobby = (style?: PlaceStyle | null) => layoutFor('lobby', 0, style);
export const buildLayout = (tableCount: number, style?: PlaceStyle | null) => layoutFor('inside', tableCount, style);

/**
 * Confere o que o editor mandou salvar: índices válidos, móveis do lugar certo, nada em cima de nada, e a
 * passagem livre do portal até a porta e a frente de todas as mesas.
 */
export function validateStyle(raw: unknown, scene: Scene, tableCount: number): { ok: true; style: PlaceStyle } | { ok: false; error: string } {
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'Nada para salvar.' };
  const r = raw as Record<string, unknown>;
  const int = (v: unknown, max: number) => (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < max ? v : -1);
  const floor = int(r.floor, FLOORS[scene].length);
  const wall = int(r.wall, WALLS.length);
  if (floor < 0 || wall < 0) return { ok: false, error: 'Cor inválida.' };
  if (!Array.isArray(r.items)) return { ok: false, error: 'Lista de móveis inválida.' };
  if (r.items.length > MAX_ITEMS) return { ok: false, error: `No máximo ${MAX_ITEMS} móveis por lugar.` };
  const items: Furniture[] = [];
  for (const raw of r.items) {
    const it = raw as Record<string, unknown>;
    if (!it || !isFurniture(it.k)) return { ok: false, error: 'Móvel desconhecido.' };
    const x = int(it.x, 64);
    const y = int(it.y, 128);
    const c = int(it.c ?? 0, ITEM_COLORS.length);
    if (x < 0 || y < 0 || c < 0 || (it.r !== 0 && it.r !== 1)) return { ok: false, error: 'Posição inválida.' };
    items.push({ k: it.k, x, y, r: it.r, c });
  }
  const style = { floor, wall, items: scene === 'room' ? roomBasics(items) : items };
  const layout = layoutFor(scene, tableCount, style, 0);
  if (layout.items.length !== style.items.length) return { ok: false, error: 'Algum móvel ficou fora do mapa, em cima de outro ou na passagem.' };
  const must = [layout.door, ...layout.tables.map((t) => t.front), ...(layout.elevator ? [layout.elevator] : [])];
  for (const p of must) {
    if ((p.x !== layout.spawn.x || p.y !== layout.spawn.y) && !findPath(layout, layout.spawn, p).length) {
      return { ok: false, error: 'Assim fecha a passagem até a porta ou até alguma mesa.' };
    }
  }
  return { ok: true, style };
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
