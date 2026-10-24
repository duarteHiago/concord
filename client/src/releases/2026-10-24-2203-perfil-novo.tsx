import { Star } from 'lucide-react';
import { Frame, Tag } from '../components/modals/OnboardingArt';
import { useApp } from '../store/app';
import type { Release } from './index';

/** a capa que se dissolve na página, o nome grande e as capas em pé dos jogos em destaque */
function NewProfileArt() {
  const covers = ['#3b82f6', '#c9a227', '#6b7a99', '#5fb85a'];
  return (
    <Frame className="h-[170px] p-0">
      <div className="absolute inset-x-0 top-0 h-24" style={{ background: 'radial-gradient(ellipse at 70% 10%, #6b3a5a, transparent 70%)' }} />
      <div className="absolute inset-x-0 top-10 h-16 bg-linear-to-b from-transparent to-surface-0" />
      <div className="absolute top-14 left-4 flex items-end gap-2.5">
        <div className="h-11 w-11 rounded-full ring-[3px] ring-surface-0" style={{ background: '#c4a5ff' }} />
        <div className="pb-0.5">
          <div className="font-display text-lg leading-none font-extrabold">yatorin</div>
          <div className="text-[9px] text-fg-muted">@yatoro</div>
        </div>
      </div>
      <div className="absolute right-4 bottom-3 left-4 flex items-end gap-1.5">
        <div className="relative aspect-[2/3] w-14 rounded-lg" style={{ background: '#d9861c' }}>
          <Star size={10} className="absolute top-1 left-1 text-white" />
        </div>
        {covers.map((c) => (
          <div key={c} className="aspect-[2/3] w-9 rounded-md" style={{ background: c }} />
        ))}
      </div>
      <Tag className="top-3 right-3">Seus jogos em destaque</Tag>
    </Frame>
  );
}

export default {
  id: '2026-10-24-2203',
  title: 'Perfil de cara nova',
  highlights: [
    {
      kicker: 'Perfil',
      title: 'Um perfil mais limpo, com os jogos que você escolhe',
      text: 'A capa agora ocupa o topo e se dissolve na página, sem caixas por cima. Escolha até 5 jogos da sua Steam para ficarem em destaque: o primeiro é o favorito e aparece maior, e a arte dele pode virar a capa do seu perfil. Quem visita vê quais jogos vocês dois têm.',
      art: NewProfileArt,
      action: {
        label: 'Abrir meu perfil',
        run: () => {
          const me = useApp.getState().me;
          if (me) useApp.getState().openProfile(me.id);
        },
      },
    },
  ],
} satisfies Release;
