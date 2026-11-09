// Contratos de Mecenato: duas pessoas que apoiam o Concord combinam, por um prazo, que uma delas (o Mecenas)
// pode fazer umas sacanagens com a outra. Quem é o Mecenas muda sozinho: é quem apoiou mais desde que o contrato
// começou (todo contrato começa no 0 a 0).
// Cada pessoa tem um Escudo (o "não perturbe" do contrato) com saldo de 3 h. As contas do Escudo e da
// liderança ficam aqui, sem banco e sem relógio (o `now` vem de fora), iguais no servidor e no cliente.

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export const CONTRACT_MAX_DAYS = 30;
/** Prazos sugeridos na tela (qualquer número inteiro de dias até o máximo vale). */
export const CONTRACT_DAY_PRESETS = [1, 7, 15, 30] as const;
/** Intervalo entre um uso do Escudo e o próximo, combinado na criação. */
export const CONTRACT_COOLDOWN_HOURS = [1, 2, 3] as const;
/** Convite sem resposta cai depois disso (a renovação do contrato antigo espera mais: as duas pessoas precisam entrar). */
export const CONTRACT_INVITE_TTL_MS = 3 * DAY;
export const CONTRACT_RENEWAL_TTL_MS = 30 * DAY;

export const SHIELD_MAX_MS = 3 * HOUR;
/** O saldo só volta (inteiro) 24 h depois de chegar a zero. */
export const SHIELD_RESTORE_MS = DAY;

/** Rescindir antes do prazo: R$ 25 + 10% do que os dois apoiaram desde que o contrato começou. */
export const FINE_FIXED_CENTS = 2_500;
export const FINE_PERCENT = 10;
export const fineCents = (contributedCents: number) => FINE_FIXED_CENTS + Math.ceil((Math.max(0, contributedCents) * FINE_PERCENT) / 100);

/** Efeito de voz surpresa: um dos efeitos que o app já tem, por até 5 s, num momento sorteado em até 3 min. */
export const PRANK_EFFECTS = ['deep', 'chipmunk', 'robot', 'radio', 'megaphone', 'echo', 'cave'] as const;
export type PrankEffect = (typeof PRANK_EFFECTS)[number];
export const VOICE_FX_MAX_MS = 5_000;
export const VOICE_FX_MIN_MS = 1_000;
export const VOICE_FX_WINDOW_MAX_MS = 3 * 60_000;

/** Foto escolhida pelo Mecenas: um easter egg que aparece por um tempo, some, e volta a aparecer, sorteado a cada vez. */
export const AVATAR_SHOW_MS = [60_000, 5 * 60_000] as const;
export const AVATAR_HIDE_MS = [10 * 60_000, 60 * 60_000] as const;

/** Quanto tempo a foto fica no estado em que acabou de entrar (`showing`: aparecendo). `r` é um sorteio em [0, 1). */
export function avatarFlipDelay(showing: boolean, r: number) {
  const [min, max] = showing ? AVATAR_SHOW_MS : AVATAR_HIDE_MS;
  return min + Math.floor(Math.min(Math.max(r, 0), 1) * (max - min));
}

export const isPrankEffect =(v: unknown): v is PrankEffect => (PRANK_EFFECTS as readonly unknown[]).includes(v);

// ------------------------------------------------------------------ Escudo

export interface ShieldState {
  /** saldo guardado (com o Escudo ligado, o que sobrava quando ligou) */
  balanceMs: number;
  /** ligado desde quando (null: desligado) */
  activeSince: number | null;
  /** quando o saldo chegou a zero (null: tem saldo, ou já foi restaurado) */
  depletedAt: number | null;
  /** até quando não pode ligar de novo */
  cooldownUntil: number | null;
}

export const freshShield = (): ShieldState => ({ balanceMs: SHIELD_MAX_MS, activeSince: null, depletedAt: null, cooldownUntil: null });

export type ShieldEvent = { type: 'depleted'; at: number } | { type: 'restored'; at: number };

/**
 * Põe o Escudo em dia: se o saldo acabou com ele ligado, desliga no instante exato em que zerou; se já
 * passaram 24 h desde que zerou, devolve as 3 h. Rodar de novo com o mesmo `now` não muda nada, e cada
 * esgotamento rende uma restauração só (depois dela, depletedAt volta a null).
 */
export function settleShield(s: ShieldState, now: number, cooldownMs: number): { state: ShieldState; events: ShieldEvent[] } {
  const state = { ...s, balanceMs: Math.min(Math.max(0, s.balanceMs), SHIELD_MAX_MS) };
  const events: ShieldEvent[] = [];
  if (state.activeSince !== null) {
    const runsOut = state.activeSince + state.balanceMs;
    if (now >= runsOut) {
      state.balanceMs = 0;
      state.activeSince = null;
      state.depletedAt = runsOut;
      state.cooldownUntil = runsOut + cooldownMs;
      events.push({ type: 'depleted', at: runsOut });
    }
  }
  if (state.activeSince === null && state.depletedAt !== null && now >= state.depletedAt + SHIELD_RESTORE_MS) {
    events.push({ type: 'restored', at: state.depletedAt + SHIELD_RESTORE_MS });
    state.balanceMs = SHIELD_MAX_MS;
    state.depletedAt = null;
  }
  return { state, events };
}

/** Saldo que sobra agora (descontando o tempo ligado). */
export const shieldBalance = (s: ShieldState, now: number) =>
  s.activeSince === null ? s.balanceMs : Math.max(0, s.balanceMs - (now - s.activeSince));

/** Por que não dá para ligar o Escudo agora (null: dá). Espera um estado já posto em dia. */
export function shieldBlocked(s: ShieldState, now: number): 'active' | 'empty' | 'cooldown' | null {
  if (s.activeSince !== null) return 'active';
  if (s.balanceMs <= 0) return 'empty';
  if (s.cooldownUntil !== null && now < s.cooldownUntil) return 'cooldown';
  return null;
}

/** Desliga: desconta o tempo usado e começa o cooldown. Se gastou tudo, conta como esgotado agora. */
export function stopShield(s: ShieldState, now: number, cooldownMs: number): { state: ShieldState; events: ShieldEvent[] } {
  if (s.activeSince === null) return { state: s, events: [] };
  const balanceMs = shieldBalance(s, now);
  const depleted = balanceMs <= 0;
  return {
    state: { balanceMs, activeSince: null, depletedAt: depleted ? now : s.depletedAt, cooldownUntil: now + cooldownMs },
    events: depleted ? [{ type: 'depleted', at: now }] : [],
  };
}

// ------------------------------------------------------------------ liderança

/**
 * Quem manda no contrato: quem tem mais apoio confirmado durante ele. No empate, quem já era o Mecenas
 * continua (`leaderId`); com a cláusula de empate, os dois têm os poderes enquanto o empate durar.
 */
export function decideLeader(o: { a: string; aCents: number; b: string; bCents: number; leaderId: string | null; tieClause: boolean }) {
  const tie = o.aCents === o.bCents;
  const leaderId = tie ? o.leaderId : o.aCents > o.bCents ? o.a : o.b;
  const holders = tie && o.tieClause ? [o.a, o.b] : leaderId ? [leaderId] : [];
  return { leaderId, tie, holders };
}
