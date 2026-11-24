import type { Release } from './index';

export default {
  id: '2026-11-24-1229',
  title: 'Bolinha de mensagem nova mais discreta',
  highlights: [],
  fixes: [
    'A bolinha de mensagem nova nos servidores ficou menor e na cor do tema, em vez da bolinha preta',
    'Os servidores não acendem mais com mensagens antigas, de antes das notificações chegarem',
    'No app do Windows, a foto de quem mandou a mensagem não vaza mais do círculo no aviso por cima de tudo',
  ],
} satisfies Release;
