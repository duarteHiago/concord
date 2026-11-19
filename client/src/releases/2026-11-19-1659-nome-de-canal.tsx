import type { Release } from './index';

export default {
  id: '2026-11-19-1659',
  title: 'Nomes de canais mais longos',
  highlights: [],
  fixes: [
    'Nomes de canal, sala ou categoria com mais de 50 caracteres eram cortados no meio, sem aviso. Agora cabem até 100, e um contador embaixo do campo mostra quanto falta.',
  ],
} satisfies Release;
