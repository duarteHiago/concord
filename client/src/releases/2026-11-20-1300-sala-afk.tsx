import type { Release } from './index';

export default {
  id: '2026-11-20-1300',
  title: 'Sala AFK',
  highlights: [],
  also: [
    'Donos e quem gerencia o servidor podem escolher uma sala AFK (Configurações do servidor → Visão geral). Quem fica parado numa call, sem falar nem usar o app, vai sozinho para ela depois do tempo escolhido: de 10 minutos a 2 horas.',
    'Na sala AFK o microfone fica desligado para todo mundo. Quem está transmitindo ou com a câmera ligada não é movido.',
  ],
  fixes: [],
} satisfies Release;
