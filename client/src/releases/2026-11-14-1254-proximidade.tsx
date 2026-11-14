import { Mic } from 'lucide-react';
import { Frame, Tag } from '../components/modals/OnboardingArt';
import { AvatarPreview } from '../components/plaza/AvatarEditor';
import type { Release } from './index';

function ProximidadeArt() {
  return (
    <Frame className="h-[170px] bg-[#231a3a]">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_40%_75%,#6670c4_0,#3d3166_45%,#231a3a_78%)]" />
      {/* círculos de alcance da voz em volta de quem fala */}
      <div className="absolute bottom-3 left-[38%] h-24 w-48 -translate-x-1/2 rounded-[50%] border-2 border-dashed border-[#3ad07a]/50" />
      <div className="absolute bottom-7 left-[38%] h-12 w-24 -translate-x-1/2 rounded-[50%] bg-[#3ad07a]/25" />
      <div className="absolute bottom-6 left-[38%] flex -translate-x-1/2 items-end gap-2">
        <AvatarPreview size={3} spin={false} avatar={{ skin: 1, hair: 1, hairColor: 5, top: 1, topColor: 0, bottomColor: 6, accessory: 3 }} />
        <AvatarPreview size={3} spin={false} avatar={{ skin: 4, hair: 2, hairColor: 0, top: 2, topColor: 1, bottomColor: 9, accessory: 1 }} />
      </div>
      {/* alguém longe, fora do alcance */}
      <div className="absolute right-6 bottom-10 opacity-60">
        <AvatarPreview size={2} spin={false} avatar={{ skin: 0, hair: 4, hairColor: 3, top: 0, topColor: 4, bottomColor: 6, accessory: 5 }} />
      </div>
      <div className="absolute top-3 right-3 flex items-center gap-1 rounded-lg bg-[#2e9e6a] px-2 py-1 text-[11px] font-bold text-white">
        <Mic size={12} /> Falando
      </div>
      <Tag className="top-3 left-3">Quem está perto te ouve</Tag>
    </Frame>
  );
}

export default {
  id: '2026-11-14-1254',
  audience: 'plaza',
  title: 'Conversa por proximidade na Praça',
  highlights: [
    {
      kicker: 'Servidor',
      title: 'Chegue perto para conversar',
      text: 'Na Praça, aperte "Falar" e quem estiver perto do seu boneco te ouve: a voz vai sumindo conforme as pessoas se afastam. Os balões também só chegam a quem está perto. O microfone começa desligado, e a voz da Praça desliga sozinha quando você entra numa call.',
      art: ProximidadeArt,
    },
  ],
  fixes: [],
} satisfies Release;
