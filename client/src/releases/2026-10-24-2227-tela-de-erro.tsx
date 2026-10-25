import type { Release } from './index';

export default {
  id: '2026-10-24-2227',
  title: 'Sem tela branca',
  highlights: [],
  fixes: [
    'Quando uma parte do app dava erro, a tela inteira ficava branca. Agora só aquela parte mostra um aviso, com "Tentar de novo", e o resto do app continua funcionando. O erro chega sozinho para a equipe',
  ],
} satisfies Release;
