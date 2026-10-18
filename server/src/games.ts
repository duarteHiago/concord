// Minigames no chat: o servidor sorteia o resultado, então todo mundo vê o mesmo.
import { randomInt } from 'node:crypto';
import { fail } from './http.ts';

export type GameData =
  | { type: 'roulette'; items: string[]; result: number; turns: number }
  | { type: 'dice'; sides: number; count: number; rolls: number[] }
  | { type: 'coin'; result: 'cara' | 'coroa' };

/** Valida o pedido, sorteia e devolve o texto da mensagem (para bots e versões antigas) e os dados. */
export function playGame(body: unknown): { content: string; data: GameData } {
  const b = (body ?? {}) as Record<string, unknown>;
  switch (b.type) {
    case 'roulette': {
      const items = Array.isArray(b.items)
        ? b.items.map((i) => String(i ?? '').trim().slice(0, 40)).filter(Boolean)
        : [];
      if (items.length < 2) fail(400, 'A roleta precisa de pelo menos 2 opções');
      if (items.length > 24) fail(400, 'A roleta aceita no máximo 24 opções');
      const result = randomInt(items.length);
      return {
        content: `Roleta: ${items.join(', ')} → ${items[result]}`,
        data: { type: 'roulette', items, result, turns: 4 + randomInt(3) },
      };
    }
    case 'dice': {
      const sides = Math.min(1000, Math.max(2, Number(b.sides) | 0 || 6));
      const count = Math.min(10, Math.max(1, Number(b.count) | 0 || 1));
      const rolls = Array.from({ length: count }, () => 1 + randomInt(sides));
      const total = rolls.reduce((a, c) => a + c, 0);
      return {
        content: `Dado: ${count}d${sides} → ${rolls.join(' + ')}${count > 1 ? ` = ${total}` : ''}`,
        data: { type: 'dice', sides, count, rolls },
      };
    }
    case 'coin': {
      const result = randomInt(2) === 0 ? 'cara' : 'coroa';
      return { content: `Cara ou coroa → ${result}`, data: { type: 'coin', result } };
    }
    default:
      return fail(400, 'Jogo desconhecido');
  }
}
