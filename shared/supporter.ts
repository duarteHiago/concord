// Apoio voluntário ao Concord (Pix). Tudo continua grátis: quem apoia ganha o patch de apoiador, e o
// acabamento dele sobe conforme o total apoiado. Valores em centavos. Iguais no servidor e no cliente.

export const SUPPORTER_TIERS = [
  { id: 'aurora', name: 'Apoiador', min: 300 },
  { id: 'gold', name: 'Ouro', min: 2_500 },
  { id: 'holo', name: 'Holográfico', min: 6_000 },
  { id: 'diamond', name: 'Diamante', min: 12_000 },
  { id: 'cosmic', name: 'Cósmico', min: 25_000 },
] as const;

export type SupporterTier = (typeof SUPPORTER_TIERS)[number]['id'];

/** Mínimo por apoio: abaixo disso a taxa do Pix come boa parte do valor. */
export const SUPPORT_MIN_CENTS = 300;
export const SUPPORT_MAX_CENTS = 50_000;
export const SUPPORT_PRESETS = [500, 1_000, 2_000, 5_000] as const;
/** Quanto tempo o QR do Pix vale. */
export const SUPPORT_PIX_TTL_MS = 30 * 60_000;

export const isSupporterTier = (v: unknown): v is SupporterTier => SUPPORTER_TIERS.some((t) => t.id === v);

/** Acabamentos liberados com esse total apoiado (do mais simples ao mais raro). */
export const unlockedTiers = (totalCents: number): SupporterTier[] => SUPPORTER_TIERS.filter((t) => totalCents >= t.min).map((t) => t.id);

/** O acabamento mais raro liberado, ou null se ainda não apoiou. */
export const topTier = (totalCents: number): SupporterTier | null => unlockedTiers(totalCents).at(-1) ?? null;

/** O próximo acabamento a liberar (null quando já tem todos). */
export const nextTier = (totalCents: number) => SUPPORTER_TIERS.find((t) => totalCents < t.min) ?? null;

export const tierInfo = (id: SupporterTier) => SUPPORTER_TIERS.find((t) => t.id === id)!;

export const formatBRL = (cents: number) => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
