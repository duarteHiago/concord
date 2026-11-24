import type { Release } from './index';

export default {
  id: '2026-11-24-1300',
  title: 'Tirar o silêncio na sala de voz',
  highlights: [],
  fixes: [
    'Quando um moderador tira o seu silêncio na sala de voz, o seu microfone volta como você tinha deixado (antes você continuava mudo até clicar no microfone)',
    'Quem entra numa sala já silenciado por um moderador vê o aviso certo, em vez de um erro de microfone',
  ],
} satisfies Release;
