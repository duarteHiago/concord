import { Frame, Tag } from '../components/modals/OnboardingArt';
import type { Release } from './index';

function MiniTvArt() {
  return (
    <Frame className="h-[170px] bg-[#231a3a]">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_30%_90%,#9a6a4f_0,#5b4a8a_45%,#231a3a_80%)]" />
      {/* a mesa com a TV acesa, ao fundo */}
      <div className="absolute bottom-5 left-6 h-6 w-20 rounded-[50%] bg-[#c99069] shadow-[0_4px_0_#6e4834]" />
      <div className="absolute bottom-14 left-12 h-8 w-12 rounded-sm border-2 border-[#1b1430] bg-[linear-gradient(180deg,#2f62e6,#8b5cf6,#e8685a)]" />
      {/* a mini TV flutuando por cima */}
      <div className="absolute top-6 right-5 w-[150px] rounded-[14px] border-[3px] border-[#1b1430] bg-[#3d3166] p-1.5 shadow-xl">
        <div className="mb-1 flex items-center gap-1 px-0.5 text-[9px] font-bold text-white">
          <span className="h-1.5 w-1.5 rounded-full bg-[#ff4d5e]" /> ao vivo
        </div>
        <div className="aspect-video rounded-md border-2 border-[#1b1430] bg-[linear-gradient(135deg,#2f62e6,#3fb8c9_60%,#2e9e6a)]" />
        <div className="mt-1 flex justify-end gap-1">
          <span className="h-2 w-2 rounded-full bg-[#e8685a]" />
          <span className="h-2 w-2 rounded-full bg-[#f5c451]" />
        </div>
      </div>
      <Tag className="bottom-3 right-3">Arraste a TV para onde quiser</Tag>
    </Frame>
  );
}

export default {
  id: '2026-11-14-1252',
  title: 'O estabelecimento do servidor',
  highlights: [
    {
      kicker: 'Servidor',
      title: 'As calls agora ficam dentro do prédio',
      text: 'A Praça virou o ponto de encontro do servidor, com mesinhas de café e bancos. Para entrar numa call, entre pela porta do prédio: lá dentro cada sala de voz é uma mesa. Clicar na TV de uma mesa com transmissão abre uma mini TV por cima do mapa, que você arrasta, aumenta e deixa aberta enquanto anda.',
      art: MiniTvArt,
    },
  ],
  also: ['O que se fala em balão na Praça só chega a quem está no mesmo lugar: lá fora ou lá dentro.'],
  fixes: [],
} satisfies Release;
