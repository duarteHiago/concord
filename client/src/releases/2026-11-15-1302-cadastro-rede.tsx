import type { Release } from './index';

export default {
  id: '2026-11-15-1302',
  title: 'Criar conta pelos dados móveis',
  highlights: [],
  also: [],
  fixes: [
    'Criar conta pelos dados móveis não esbarra mais tão fácil em "muitas contas criadas desta rede": no 4G muita gente divide a mesma conexão, e o limite era apertado demais. Errar o e-mail e tentar de novo também não gasta mais esse limite.',
  ],
} satisfies Release;
