import { Frame, Tag } from '../components/modals/OnboardingArt';
import type { Release } from './index';

function FloorsArt() {
  return (
    <Frame className="h-[170px] bg-[#231a3a]">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_90%,#9a6a4f_0,#5b4a8a_45%,#231a3a_80%)]" />
      <div className="absolute top-5 left-1/2 w-[210px] -translate-x-1/2 rounded-xl bg-[#1b1430]/95 p-2 text-white">
        <div className="mb-1.5 text-[11px] font-bold">Elevador</div>
        {[
          ['Térreo', '6 salas'],
          ['1º andar', '#estudos · #música'],
          ['2º andar', '#jogos'],
        ].map(([floor, rooms], i) => (
          <div key={floor} className={`flex items-center justify-between rounded-lg px-2 py-1 text-[11px] ${i === 1 ? 'bg-white/15' : ''}`}>
            <span className="font-semibold">{floor}</span>
            <span className="text-white/55">{rooms}</span>
          </div>
        ))}
      </div>
      <Tag className="right-3 bottom-3">No fundo do salão</Tag>
    </Frame>
  );
}

export default {
  id: '2026-11-14-1539',
  audience: 'plaza',
  title: 'Andares no prédio da Praça',
  highlights: [
    {
      kicker: 'Servidor',
      title: 'Salas a mais ganham andares',
      text: 'O térreo continua com as salas principais. As outras vão para andares de cima, duas por andar, e o elevador no fundo do salão leva você até elas. Quem administra o servidor escolhe em que andar fica cada sala, em Montar.',
      art: FloorsArt,
    },
  ],
  also: [
    'O cardápio do balcão só abre quando o boneco chega lá: clique no balcão e ele vai andando.',
    'Quem senta numa mesa com uma bebida deixa o copo em cima da mesa.',
    'O console na mão de quem está jogando ganhou um joguinho rodando na tela. O nome do jogo agora aparece só no cartão da pessoa, quando você clica nela.',
  ],
  fixes: ['Ao entrar no prédio ou trocar de andar, o boneco aparece na entrada, sem atravessar a sala andando.'],
} satisfies Release;
