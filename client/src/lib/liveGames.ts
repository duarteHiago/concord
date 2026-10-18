// Jogos "ao vivo": a animação depende de a mensagem ter chegado agora pelo tempo real,
// e não do horário dela (o relógio do PC e o do servidor podem estar dessincronizados).
import type { Message } from './types';

export interface GameWhere {
  kind: 'channel' | 'dm';
  id: string;
}

export interface LiveGameEvent {
  message: Message;
  where: GameWhere;
}

const live = new Set<string>();
const played = new Set<string>();

/** Chamado quando uma mensagem de jogo chega pelo socket. */
export function announceGame(message: Message, where: GameWhere) {
  live.add(message.id);
  // o palco da tela principal decide na hora se vai mostrar (e marca como já animado)
  window.dispatchEvent(new CustomEvent<LiveGameEvent>('concord:game', { detail: { message, where } }));
}

/** O cartão no chat deve animar? (chegou agora e ninguém animou ainda) */
export const shouldAnimate = (id: string) => live.has(id) && !played.has(id);

export const markPlayed = (id: string) => {
  played.add(id);
};
