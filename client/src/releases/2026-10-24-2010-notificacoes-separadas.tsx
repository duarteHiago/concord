import { AtSign, Zap } from 'lucide-react';
import { Frame, Tag } from '../components/modals/OnboardingArt';
import { useApp } from '../store/app';
import type { Release } from './index';

function SplitNotifyArt() {
  return (
    <Frame className="flex h-[170px] flex-col justify-center gap-3 px-4">
      <div className="flex items-center justify-between rounded-xl bg-surface-3 px-3 py-2">
        <span className="flex items-center gap-1.5 text-[11px] font-bold">
          <Zap size={12} className="text-accent" /> Chamar atenção
        </span>
        <span className="h-4 w-8 rounded-full bg-fg-subtle/40" />
      </div>
      <div className="flex items-center justify-between rounded-xl bg-surface-3 px-3 py-2">
        <span className="flex items-center gap-1.5 text-[11px] font-bold">
          <AtSign size={12} className="text-accent" /> Menções
        </span>
        <span className="relative h-4 w-8 rounded-full bg-accent">
          <span className="absolute top-0.5 right-0.5 h-3 w-3 rounded-full bg-white" />
        </span>
      </div>
      <Tag className="top-3 right-3">Agora são duas</Tag>
    </Frame>
  );
}

export default {
  id: '2026-10-24-2010',
  title: 'Notificação de menção separada da de chamar atenção',
  highlights: [
    {
      kicker: 'Notificações',
      title: 'Desligue a notificação de tremer a tela sem perder a de menção',
      text: 'Antes, um único interruptor "Notificação do sistema" controlava as duas ao mesmo tempo. Agora Configurações → Notificações tem um para "Chamar atenção" e outro, novo, para "Menções e mensagens diretas" — liga e desliga cada um sem afetar o outro.',
      art: SplitNotifyArt,
      action: { label: 'Abrir notificações', run: () => useApp.getState().openModal({ type: 'userSettings', tab: 'notifications' }) },
    },
  ],
} satisfies Release;
