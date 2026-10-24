import { Mic } from 'lucide-react';
import { Frame, Spot, Tag } from '../components/modals/OnboardingArt';
import { useApp } from '../store/app';
import type { Release } from './index';

function MicTestArt() {
  return (
    <Frame className="flex h-[170px] flex-col justify-center gap-3 px-4">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-[11px] font-bold">
          <Mic size={12} className="text-accent" /> Testar microfone
        </span>
        <Spot rounded="rounded-full" className="bg-danger px-3 py-1 text-[10px] font-bold text-white">
          Parar teste
        </Spot>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-surface-3">
        <div className="h-full w-2/3 rounded-full bg-accent" />
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-fg-muted">Volume do teste</span>
        <div className="h-1 flex-1 rounded-full bg-surface-3">
          <div className="h-full w-1/2 rounded-full bg-fg-subtle" />
        </div>
      </div>
      <Tag className="top-3 right-3">IA máxima</Tag>
    </Frame>
  );
}

export default {
  id: '2026-10-24-1830',
  title: 'Teste de microfone',
  highlights: [
    {
      kicker: 'Voz',
      title: 'Ouça como sua voz chega pros outros antes de entrar numa chamada',
      text: 'Em Configurações → Voz e vídeo, clique em "Testar microfone": você se ouve com a supressão de ruído aplicada, do jeito que os outros ouvem. Dá para trocar de modelo de IA e ajustar a força e a sensibilidade na hora, sem precisar entrar numa sala para testar. Use fones — pela caixa de som pode dar eco.',
      art: MicTestArt,
      action: { label: 'Testar agora', run: () => useApp.getState().openModal({ type: 'userSettings', tab: 'audio' }) },
    },
  ],
  fixes: [
    'A supressão de ruído não fica mais travada na IA leve depois de uma falha passageira (ex.: um programa de mixagem de áudio reiniciando o próprio motor) — ela volta para a IA máxima sozinha depois de alguns minutos, sem precisar trocar de modelo na mão.',
  ],
} satisfies Release;
