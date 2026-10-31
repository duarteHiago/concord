import { Gem } from 'lucide-react';
import { Frame, Tag } from '../components/modals/OnboardingArt';
import { useApp } from '../store/app';
import type { Release } from './index';

function ScoreArt() {
  return (
    <Frame className="flex h-[160px] flex-col justify-center gap-2 px-4">
      <div className="flex items-center justify-between rounded-xl bg-surface-2 px-3 py-2 text-[11px]">
        <span className="text-fg-muted">Apoio no contrato</span>
        <span className="font-display text-base font-extrabold">R$ 0 × R$ 0</span>
      </div>
      <div className="flex items-center justify-between rounded-xl bg-surface-2 px-3 py-2 text-[11px]">
        <span className="flex items-center gap-1.5 font-bold">
          <Gem size={12} className="text-warn" /> Mecenas agora
        </span>
        <span className="text-fg-muted">Quem apoiar primeiro</span>
      </div>
      <Tag className="top-2.5 right-3">Todo contrato começa do zero</Tag>
    </Frame>
  );
}

export default {
  id: '2026-10-31-0059',
  title: 'Mecenato do zero',
  highlights: [
    {
      kicker: 'Mecenato',
      title: 'Todo contrato começa no 0 a 0',
      text: 'O apoio que cada um deu antes do contrato não conta mais para decidir o Mecenas. Vale só o que vocês apoiarem enquanto o contrato estiver em vigor: quem apoiar primeiro assume, e quem passar à frente vira o Mecenas na hora.',
      art: ScoreArt,
      action: { label: 'Abrir o Mecenato', run: () => useApp.getState().openSettings('mecenato') },
    },
  ],
} satisfies Release;
