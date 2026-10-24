import { Zap } from 'lucide-react';
import { Frame, Tag } from '../components/modals/OnboardingArt';
import { useApp } from '../store/app';
import type { Release } from './index';

/** uma "área de trabalho" com janelas e um rastro deslocado, como se tudo estivesse tremendo */
function ShakeArt() {
  const desk = (
    <>
      <div className="absolute top-4 left-5 h-20 w-32 rounded-lg bg-surface-3 ring-1 ring-line-strong">
        <div className="h-3 rounded-t-lg bg-surface-4" />
      </div>
      <div className="absolute top-10 right-6 h-24 w-36 rounded-lg bg-surface-2 ring-1 ring-line-strong">
        <div className="h-3 rounded-t-lg bg-accent/40" />
      </div>
      <div className="absolute inset-x-0 bottom-0 h-5 bg-surface-3/80" />
    </>
  );
  return (
    <Frame className="h-[170px] p-0">
      <div className="absolute inset-0 translate-x-[-7px] translate-y-[3px] opacity-35">{desk}</div>
      <div className="absolute inset-0 translate-x-[6px] translate-y-[-3px] opacity-35">{desk}</div>
      <div className="absolute inset-0">{desk}</div>
      <Tag className="top-3 left-1/2 -translate-x-1/2">
        <Zap size={10} className="mr-1 inline" />
        A tela inteira treme
      </Tag>
    </Frame>
  );
}

export default {
  id: '2026-10-24-1831',
  title: 'Chamar atenção treme a tela inteira',
  highlights: [
    {
      kicker: 'Chamar atenção',
      title: 'Agora a tela inteira treme, não só o Concord',
      text: 'No app para Windows, quando alguém chama sua atenção, a tela toda treme, mesmo com o Concord minimizado ou atrás de outra janela. Não curtiu? Desligue em Configurações → Notificações, ou fique em "Não perturbe".',
      art: ShakeArt,
      action: { label: 'Ajustar a tremida', run: () => useApp.getState().openModal({ type: 'userSettings', tab: 'notifications' }) },
    },
  ],
} satisfies Release;
