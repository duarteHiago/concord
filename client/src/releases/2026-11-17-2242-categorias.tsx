import { ChevronDown, ChevronRight, Hash, Volume2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { Frame, Tag } from '../components/modals/OnboardingArt';
import type { Release } from './index';

function CategoriesArt() {
  const row = (icon: ReactNode, name: string, active = false) => (
    <div className={`flex h-6 items-center gap-1.5 rounded-lg px-2 text-[11px] font-semibold ${active ? 'bg-surface-4 text-fg' : 'text-fg-muted'}`}>
      {icon}
      {name}
    </div>
  );
  const header = (open: boolean, name: string) => (
    <div className="flex items-center gap-1 px-1 text-[10px] font-bold text-fg-subtle">
      {open ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
      {name}
    </div>
  );
  return (
    <Frame className="flex h-[170px] items-center justify-center">
      <div className="w-48 space-y-1.5 rounded-2xl bg-surface-2 p-2.5 ring-1 ring-line">
        {header(true, 'Incidentes')}
        {row(<Hash size={11} />, 'alertas', true)}
        {row(<Volume2 size={11} />, 'Sala de guerra')}
        {header(true, 'Produto')}
        {row(<Hash size={11} />, 'roadmap')}
        {header(false, 'Arquivo')}
      </div>
      <Tag className="right-3 bottom-3">Clique no nome para recolher</Tag>
    </Frame>
  );
}

export default {
  id: '2026-11-17-2242',
  title: 'Categorias de canais',
  highlights: [
    {
      kicker: 'Servidor',
      title: 'Organize canais e salas em categorias',
      text: 'Junte canais de texto e salas de voz por assunto, como "Incidentes" ou "Produto". Quem modera cria a categoria no menu do nome do servidor e escolhe a categoria de cada canal nas configurações dele. Clique no nome de uma categoria para recolher.',
      art: CategoriesArt,
    },
  ],
  also: ['Categoria recolhida continua mostrando o canal aberto e as salas com gente dentro'],
} satisfies Release;
