import { Frame, Tag } from '../components/modals/OnboardingArt';
import type { Release } from './index';

function OuvirArt() {
  return (
    <Frame className="h-[170px] bg-[#231a3a]">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_80%,#9a6a4f_0,#5b4a8a_45%,#231a3a_80%)]" />
      {/* alcance em volta da mesa */}
      <div className="absolute bottom-5 left-1/2 h-24 w-56 -translate-x-1/2 rounded-[50%] border-2 border-dashed border-[#ffe6a0]/45" />
      <div className="absolute bottom-12 left-1/2 h-8 w-24 -translate-x-1/2 rounded-[50%] bg-[#c99069] shadow-[0_4px_0_#6e4834]" />
      <div className="absolute top-4 left-1/2 -translate-x-1/2 rounded-full bg-[#1b1430]/90 px-3 py-1 text-[11px] font-semibold text-white ring-1 ring-white/15">
        👂 ouvindo #jogatina
      </div>
      <Tag className="right-3 bottom-3">A mesa vê quem está ouvindo</Tag>
    </Frame>
  );
}

export default {
  id: '2026-11-14-1319',
  audience: 'plaza',
  title: 'Ouvir de perto na Praça',
  highlights: [
    {
      kicker: 'Servidor',
      title: 'Chegue perto de uma mesa para ouvir a conversa',
      text: 'Dentro do prédio, ao passar perto de uma mesa com gente você ouve a call dela, mais alto quanto mais perto, sem falar. Quem está na mesa vê "ouvindo de perto" e pode fechar a mesa, e aí ninguém ouve nem espia.',
      art: OuvirArt,
    },
  ],
  also: ['Sentar ou espiar uma mesa agora é uma barrinha pequena, e o espiar virou um chip com o tempo, o cochicho e o X.'],
  fixes: [],
} satisfies Release;
