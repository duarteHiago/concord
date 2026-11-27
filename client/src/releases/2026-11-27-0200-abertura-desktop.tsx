import type { Release } from './index';

export default {
  id: '2026-11-27-0200',
  title: 'Abertura do app no computador',
  highlights: [],
  fixes: [
    'O app do computador abre com o símbolo do Concord se montando no meio da tela enquanto carrega, em vez de uma janela vazia. Quem preferir pode desligar em Ajustes → Conta e segurança',
  ],
} satisfies Release;
