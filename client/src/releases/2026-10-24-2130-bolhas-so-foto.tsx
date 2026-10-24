import { Volume2, VolumeX } from 'lucide-react';
import { Frame, Tag } from '../components/modals/OnboardingArt';
import type { Release } from './index';

function WatchersArt() {
  return (
    <Frame className="flex h-[150px] flex-col justify-start gap-2 p-3">
      <div className="flex items-center gap-2">
        <span className="rounded-full bg-accent px-2.5 py-1 text-[10px] font-bold text-on-accent">ao vivo</span>
        <span className="rounded-full bg-surface-3 px-2 py-1 text-[10px] font-bold">H.265</span>
        <div className="flex items-center rounded-full bg-surface-1 py-1 pr-2 pl-1">
          <div className="h-5 w-5 rounded-full bg-surface-4 ring-2 ring-surface-1" />
          <div className="-ml-1.5 h-5 w-5 rounded-full bg-accent-2 ring-2 ring-surface-1" />
        </div>
      </div>
      <Tag className="top-3 right-3">Passe o mouse</Tag>
    </Frame>
  );
}

function MuteClickArt() {
  return (
    <Frame className="flex h-[150px] flex-col items-center justify-center gap-3">
      <div className="flex items-center gap-2 rounded-full bg-surface-2 px-3 py-2">
        <VolumeX size={16} className="text-danger" />
        <div className="h-1.5 w-24 rounded-full bg-surface-4" />
      </div>
      <div className="flex items-center gap-1 text-[10px] font-semibold text-fg-muted">
        <Volume2 size={11} /> clique de novo pra voltar o som
      </div>
      <Tag className="top-3 right-3">1 clique</Tag>
    </Frame>
  );
}

export default {
  id: '2026-10-24-2130',
  title: 'Quem está assistindo aparece do lado da qualidade',
  highlights: [
    {
      kicker: 'Transmissão de tela',
      title: 'Veja quem mais está assistindo, do lado do selo "ao vivo"',
      text: 'Ao assistir a tela de alguém, um grupinho de fotos aparece no canto superior esquerdo, do lado do selo "ao vivo" e do codec: são as outras pessoas vendo aquela transmissão com você. Recolhido, mostra só uma lasca de cada foto (parada, mesmo se for GIF); passe o mouse por cima para elas se separarem em ordem alfabética, cada uma com o nome do lado. As bolhas dos participantes, embaixo, continuam do jeito que sempre foram.',
      art: WatchersArt,
    },
    {
      kicker: 'Transmissão de tela',
      title: 'Mude o som da transmissão com 1 clique',
      text: 'O ícone de volume ao lado do slider da transmissão agora é um botão: clique para mutar, clique de novo para voltar no mesmo nível de antes — sem precisar arrastar o slider até o 0.',
      art: MuteClickArt,
    },
  ],
} satisfies Release;
