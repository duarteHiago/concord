import type { Release } from './index';

export default {
  id: '2026-11-15-0618',
  audience: 'plaza',
  title: 'Quarto vazio quando o dono está na call',
  highlights: [],
  also: [],
  fixes: ['Quem está numa call do servidor não aparece mais no computador do quarto ao mesmo tempo que na mesa: o quarto fica vazio, e a plaquinha da porta mostra "na call".'],
} satisfies Release;
