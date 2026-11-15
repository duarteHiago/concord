import { Hammer } from 'lucide-react';
import { Frame, Tag } from '../components/modals/OnboardingArt';
import type { Release } from './index';

const SWATCHES = ['#7c86d6', '#c9805e', '#5fa86f', '#8e8aa3', '#d8bf8a', '#d993b4'];
const ITEMS = ['Planta', 'Sofá', 'Tapete', 'Fonte', 'Fliperama', 'Árvore'];

function MontarArt() {
  return (
    <Frame className="h-[170px] bg-[#231a3a]">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_70%_80%,#5fa86f_0,#3d3166_50%,#231a3a_80%)]" />
      {/* o painel do editor */}
      <div className="absolute top-3 bottom-3 left-3 w-[150px] rounded-xl border border-white/10 bg-[#1b1430]/95 p-2 text-white">
        <div className="mb-1.5 text-[10px] font-bold">Montando a praça</div>
        <div className="grid grid-cols-3 gap-1">
          {ITEMS.map((n, i) => (
            <div key={n} className={`rounded-md px-1 py-1.5 text-center text-[8px] font-semibold ${i === 1 ? 'bg-[#e8685a]' : 'bg-white/10'}`}>
              {n}
            </div>
          ))}
        </div>
        <div className="mt-2 mb-1 text-[8px] font-bold text-white/50 uppercase">Chão</div>
        <div className="flex gap-1">
          {SWATCHES.map((c, i) => (
            <span key={c} className={`h-3.5 w-3.5 rounded ${i === 2 ? 'ring-2 ring-white' : ''}`} style={{ background: c }} />
          ))}
        </div>
      </div>
      {/* o sofá sendo posto (prévia verde) */}
      <div className="absolute right-10 bottom-10 h-6 w-16 -skew-x-12 rounded-sm bg-[#3ad07a]/40 ring-2 ring-[#3ad07a]" />
      <div className="absolute right-11 bottom-12 h-5 w-14 -skew-x-12 rounded-md bg-[#2f62e6] shadow-[0_3px_0_#1f3f9a]" />
      <div className="absolute top-3 right-3 flex items-center gap-1 rounded-lg bg-[#1b1430] px-2 py-1 text-[11px] font-bold text-white ring-1 ring-white/20">
        <Hammer size={12} /> Montar
      </div>
      <Tag className="bottom-3 right-3">Verde: cabe aqui</Tag>
    </Frame>
  );
}

export default {
  id: '2026-11-14-1255',
  title: 'Monte a Praça do seu jeito',
  highlights: [
    {
      kicker: 'Servidor',
      title: 'Móveis e cores na Praça e no prédio',
      text: 'Quem gerencia o servidor ganhou o botão "Montar" na Praça. Escolha móveis (sofá, tapete, fonte, fliperama, árvores e mais), clique no chão para pôr, gire, troque a cor e mude o chão e as paredes. Vale para a praça e para o interior do prédio, e todo mundo vê a mudança na hora.',
      art: MontarArt,
      spotlight: {
        target: 'plaza',
        title: 'A Praça',
        tip: 'Entre na Praça e use o botão "Montar", no canto de cima.',
        fallback: 'Abra o servidor Founders: o botão da Praça fica embaixo, à direita.',
      },
    },
  ],
  fixes: ['O globo da Praça não cobre mais os botões da call: ele ganhou uma faixa própria embaixo da tela do servidor.'],
} satisfies Release;
