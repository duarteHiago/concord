import type { Release } from './index';

export default {
  id: '2026-11-21-1300',
  title: 'Buscar mensagens',
  highlights: [],
  also: [
    'Lupa no topo de cada conversa (ou Ctrl+F): num servidor, procura em todos os canais de texto e nos chats das salas; nas mensagens privadas, em todas as suas conversas.',
    'A lista mostra em qual canal ou conversa está cada mensagem, quem escreveu e quando. Clicando, o Concord abre a conversa e pula até a mensagem, mesmo se for antiga.',
    'O atalho pode ser trocado em Configurações → Atalhos.',
  ],
  fixes: [],
} satisfies Release;
