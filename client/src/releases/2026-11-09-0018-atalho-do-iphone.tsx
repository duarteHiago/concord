import type { Release } from './index';

export default {
  id: '2026-11-09-0018',
  title: 'Atalho do celular abre o Concord',
  highlights: [],
  fixes: [
    'O Concord adicionado à tela de início do iPhone abria a página de instruções de instalação, e não o app. Agora abre o login, ou direto o app para quem já está logado (atalhos antigos também passam a ir para o lugar certo).',
  ],
} satisfies Release;
