// Itens visuais do perfil e da sala (iguais no servidor e no cliente).

/** Molduras animadas em volta da foto. */
export const FRAMES = [
  'neon',
  'fire',
  'rainbow',
  'gold',
  'ice',
  'toxic',
  'galaxy',
  'pulse',
  'orbit',
  'glitch',
  'hearts',
  'sakura',
] as const;
export type FrameId = (typeof FRAMES)[number];

/** Patches "costurados" no cartão de perfil. */
export const PATCH_SHAPES = ['circle', 'shield', 'rect', 'hex', 'star', 'banner'] as const;
export type PatchShape = (typeof PATCH_SHAPES)[number];
export const MAX_PATCHES = 6;

export interface Patch {
  id: string;
  shape: PatchShape;
  bg: string;
  border: string;
  fg: string;
  icon: string; // emoji
  text: string;
  image?: string; // imagem enviada (logo do time etc.)
  /** tamanho e posição do desenho (imagem ou emoji) dentro do patch */
  artScale?: number; // 0.4 a 3
  artX?: number; // -40 a 40 (unidades do quadro 100×100)
  artY?: number;
  /** resgatado por um link de presente (id do resgate): não pode virar link de novo */
  drop?: string;
}

export const ART_SCALE = { min: 0.4, max: 3 } as const;
export const ART_OFFSET = 40;

/** Stickers prontos (a arte fica no cliente). */
export const PRESET_STICKERS = [
  'headshot',
  'gg',
  'ace',
  'clutch',
  'sniper',
  'grenade',
  'bomb',
  'rushb',
  'mvp',
  'trophy',
  'sword',
  'pentakill',
  'dragon',
  'bombsite',
  'crosshair',
  'controller',
  'ez',
  'onfire',
  'knife',
  'energy',
  'noob',
  'smoke',
] as const;
export type PresetSticker = (typeof PRESET_STICKERS)[number];

/** Acabamento do sticker, como no CS. */
export const STICKER_FINISHES = ['gloss', 'holo', 'gold', 'glitter'] as const;
export type StickerFinish = (typeof STICKER_FINISHES)[number];

export const MAX_PLACED_STICKERS = 40;
export const MAX_CUSTOM_STICKERS = 60;
