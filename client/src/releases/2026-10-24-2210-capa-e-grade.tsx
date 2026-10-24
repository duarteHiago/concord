import { Image, LayoutGrid } from 'lucide-react';
import { Frame, Tag } from '../components/modals/OnboardingArt';
import type { Release } from './index';

function CoverPickArt() {
  return (
    <Frame className="flex h-[150px] flex-col justify-center gap-2 px-4">
      <div className="flex items-center gap-2 rounded-xl bg-surface-2 px-2.5 py-2">
        <Image size={14} className="text-accent" />
        <span className="text-[11px] font-bold">Capa: ULTRAKILL</span>
      </div>
      <div className="flex items-center gap-1.5">
        <div className="h-7 w-5 rounded-sm bg-surface-3" />
        <div className="h-7 w-5 rounded-sm ring-2 ring-accent" />
        <div className="h-7 w-5 rounded-sm bg-surface-3" />
      </div>
      <Tag className="top-3 right-3">Qualquer jogo</Tag>
    </Frame>
  );
}

function GridViewArt() {
  return (
    <Frame className="flex h-[150px] items-center justify-center gap-2 px-4">
      <div className="grid grid-cols-3 gap-1.5">
        {['#3b82f6', '#c9a227', '#6b7a99', '#5fb85a', '#d9861c', '#8b5cf6'].map((c) => (
          <div key={c} className="aspect-[2/3] w-10 rounded-md" style={{ background: c }} />
        ))}
      </div>
      <Tag className="top-3 right-3">
        <LayoutGrid size={10} className="mr-1 inline" />
        Nova opção
      </Tag>
    </Frame>
  );
}

export default {
  id: '2026-10-24-2210',
  title: 'Capa com qualquer jogo, e grade nos mais jogados',
  highlights: [
    {
      kicker: 'Perfil',
      title: 'A capa pode ser de qualquer jogo, não só do favorito',
      text: 'Em Personalizar → Capa, agora dá para escolher qual jogo vira a arte de fundo da sua página, sem precisar que ele seja o mesmo jogo em destaque.',
      art: CoverPickArt,
    },
    {
      kicker: 'Perfil',
      title: 'Veja os mais jogados em grade, com as capas',
      text: 'Do lado de "Biblioteca completa", dois botões trocam entre a lista com as horas e uma grade com as capas dos jogos.',
      art: GridViewArt,
    },
  ],
} satisfies Release;
