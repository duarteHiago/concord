import { Frame, Tag } from '../components/modals/OnboardingArt';
import type { Release } from './index';

function RoomsArt() {
  const doors = [
    { name: 'Você', icon: '💻', mine: true },
    { name: 'Caio', icon: '🎮' },
    { name: 'Bia', icon: '💤' },
  ];
  return (
    <Frame className="h-[170px] bg-[#231a3a]">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_100%,#9a6a4f_0,#5b4a8a_50%,#231a3a_85%)]" />
      <div className="absolute bottom-7 left-1/2 flex -translate-x-1/2 items-end gap-5">
        {doors.map((d) => (
          <div key={d.name} className="flex flex-col items-center gap-1.5">
            <span className={`flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold text-white ${d.mine ? 'border-[#e8685a] bg-[#1b1430]' : 'border-white/10 bg-[#1b1430]/85'}`}>
              {d.icon} {d.name}
            </span>
            <span className={`relative h-16 w-9 rounded-t-sm border-2 border-[#1b1430] bg-[#8a5a3b] ${d.mine ? 'outline outline-2 outline-[#e8685a]' : ''}`}>
              <span className="absolute top-1/2 right-1.5 h-1 w-1 rounded-full bg-[#f5c451]" />
            </span>
          </div>
        ))}
      </div>
      <Tag className="top-3 right-3">Pelo elevador</Tag>
    </Frame>
  );
}

export default {
  id: '2026-11-14-1621',
  audience: 'plaza',
  title: 'Quartos na Praça',
  highlights: [
    {
      kicker: 'Servidor',
      title: 'Cada pessoa tem o seu quarto',
      text: 'Pegue o elevador do prédio e escolha Quartos: no corredor tem uma porta para cada pessoa do servidor. Lá dentro, o dono aparece no computador, no videogame quando está jogando, ou dormindo na cama quando está longe. Só você monta o seu quarto, em Montar.',
      art: RoomsArt,
    },
  ],
  also: ['O prédio agora sempre tem elevador, mesmo sem andares extras.'],
  fixes: [],
} satisfies Release;
