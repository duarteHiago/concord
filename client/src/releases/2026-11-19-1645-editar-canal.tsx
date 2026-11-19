import type { Release } from './index';

export default {
  id: '2026-11-19-1645',
  title: 'Editar canais sem trocar nomes',
  highlights: [],
  fixes: [
    'Abrir "Editar" de um canal logo depois de salvar outro mostrava o nome do canal anterior, e salvar trocava o nome do canal errado. Agora cada canal abre com os próprios dados.',
  ],
} satisfies Release;
