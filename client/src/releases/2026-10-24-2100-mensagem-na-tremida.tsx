import { Zap } from 'lucide-react';
import { Frame, Tag } from '../components/modals/OnboardingArt';
import type { Release } from './index';

function NudgeMessageArt() {
  return (
    <Frame className="flex h-[150px] flex-col justify-center gap-1.5 px-4">
      <div className="flex items-center gap-1.5 text-[11px] text-fg-muted">
        <Zap size={12} className="text-accent" /> <b className="text-fg">yatorin</b> chamou sua atenção!
      </div>
      <div className="truncate font-display text-xl font-bold text-accent">bora, o grupo já tá te esperando</div>
      <Tag className="top-3 right-3">Some sozinha</Tag>
    </Frame>
  );
}

export default {
  id: '2026-10-24-2100',
  title: 'Mensagem junto da tremida de tela',
  highlights: [
    {
      kicker: 'Chamar atenção',
      title: 'Mande uma mensagem junto da tremida',
      text: 'No perfil de alguém, ao lado do botão "Chamar atenção" tem um novo ícone de mensagem: escreva algo rápido e ele aparece na tela de quem você chamou, igual ao pop-up do código compartilhado — só que sem botão de copiar. A mensagem passa e some sozinha.',
      art: NudgeMessageArt,
    },
  ],
} satisfies Release;
