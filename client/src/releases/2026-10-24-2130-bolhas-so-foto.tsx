import { Volume2, VolumeX } from 'lucide-react';
import { Frame, Tag } from '../components/modals/OnboardingArt';
import type { Release } from './index';

function BubblesArt() {
  return (
    <Frame className="flex h-[150px] items-center justify-center gap-3">
      <div className="h-11 w-11 rounded-full bg-surface-3" />
      <div className="speaking-ring h-11 w-11 rounded-full bg-accent-2" />
      <div className="h-11 w-11 rounded-full bg-surface-3" />
      <Tag className="top-3 right-3">Sem nome</Tag>
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
  title: 'Bolhas de quem assiste só com a foto',
  highlights: [
    {
      kicker: 'Transmissão de tela',
      title: 'Quem está assistindo com você aparece só com a foto, sem nome',
      text: 'Ao assistir a tela de alguém, as bolhas de quem mais está junto agora mostram só a foto de perfil (se for um GIF animado, fica parada num quadro só). Microfone e fone cortados ainda aparecem, num selinho embaixo da foto.',
      art: BubblesArt,
    },
    {
      kicker: 'Transmissão de tela',
      title: 'Mude o som da transmissão com 1 clique',
      text: 'O ícone de volume ao lado do slider da transmissão agora é um botão: clique para mutar, clique de novo para voltar no mesmo nível de antes — sem precisar arrastar o slider até o 0.',
      art: MuteClickArt,
    },
  ],
} satisfies Release;
