import type { Release } from './index';

export default {
  id: '2026-11-15-1301',
  audience: 'plaza',
  title: 'A Praça lembra onde você estava',
  highlights: [],
  also: [],
  fixes: [
    'Se a conexão cair por um instante, você volta para o mesmo lugar da Praça, em vez de aparecer lá fora na praça. Quem estava montando o quarto continua com o editor aberto e tudo o que já tinha posto.',
    'Pegar o elevador, a escada ou uma porta estando sentado numa mesa agora levanta da mesa e sai da call. Antes a pessoa chegava no outro lugar ainda na call, sem ouvir quem estava perto.',
  ],
} satisfies Release;
