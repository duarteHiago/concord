import type { Release } from './index';

export default {
  id: '2026-11-15-2330',
  title: 'Supressão de ruído de volta',
  highlights: [],
  also: [],
  fixes: [
    'A supressão de ruído, o portão de voz e os efeitos de voz voltaram a funcionar. Uma proteção nova do site estava bloqueando o processamento do microfone, e o som ia cru, com todo o barulho de fundo.',
    'No app desktop, o som do computador na transmissão de tela também voltou.',
  ],
} satisfies Release;
