import { Gamepad2, Headphones } from 'lucide-react';
import { Frame, Tag } from '../components/modals/OnboardingArt';
import type { Release } from './index';

function TwoActivitiesArt() {
  return (
    <Frame className="flex h-[150px] flex-col justify-center gap-2 px-4">
      <div className="flex items-center gap-2 rounded-xl bg-surface-2 px-2.5 py-2">
        <Gamepad2 size={14} className="text-accent" />
        <span className="text-[11px] font-bold">Jogando Arc Raiders</span>
      </div>
      <div className="flex items-center gap-2 rounded-xl bg-surface-2 px-2.5 py-2">
        <Headphones size={14} className="text-accent-2" />
        <span className="text-[11px] font-bold">Ouvindo Tame Impala</span>
      </div>
      <Tag className="top-3 right-3">Até 2 ao mesmo tempo</Tag>
    </Frame>
  );
}

export default {
  id: '2026-10-24-2200',
  title: 'Jogo e música aparecem juntos',
  highlights: [
    {
      kicker: 'Presença',
      title: 'Jogando e ouvindo Spotify ao mesmo tempo? Agora aparecem os dois',
      text: 'Antes, se você estivesse jogando e ouvindo música ao mesmo tempo, só uma das duas atividades aparecia pros outros. Agora a lista de membros, o perfil e a conversa privada mostram as duas juntas (até 2 por vez).',
      art: TwoActivitiesArt,
    },
  ],
} satisfies Release;
