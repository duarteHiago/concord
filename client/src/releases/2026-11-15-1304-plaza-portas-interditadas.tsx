import type { Release } from './index';

export default {
  id: '2026-11-15-1304',
  audience: 'plaza',
  title: 'Portas fixas no corredor dos quartos',
  highlights: [],
  also: [
    'Cada pessoa agora tem a sua porta fixa no corredor dos quartos da Praça. Quem sai do servidor deixa a porta interditada, com faixa de perigo, e ninguém entra nela. As outras portas não mudam mais de lugar, e quem volta para o servidor recupera a mesma porta.',
  ],
  fixes: [
    'Quem estava no quarto de alguém que saiu do servidor volta para o corredor, em vez de ficar preso lá dentro.',
    'Para entrar num quarto agora é preciso estar na porta dele, e quem você bloqueou não entra no seu.',
    'A mesa fechada para espiadas volta a abrir sozinha quando a call fica vazia.',
    'A Praça fica mais leve com muita gente andando ao mesmo tempo.',
  ],
} satisfies Release;
