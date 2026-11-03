import { ArrowLeftRight } from 'lucide-react';
import { Frame, Tag } from '../components/modals/OnboardingArt';
import type { Release } from './index';

function MobileArt() {
  return (
    <Frame className="flex h-[170px] items-center justify-center gap-6">
      <div className="flex h-28 w-16 flex-col overflow-hidden rounded-xl bg-surface-3 ring-1 ring-line">
        <div className="flex items-center gap-1 bg-surface-4 px-2 py-1">
          <div className="h-1.5 w-1.5 rounded-full bg-accent" />
          <div className="h-1.5 flex-1 rounded bg-fg-subtle/30" />
        </div>
        <div className="flex-1 space-y-1 px-1.5 py-1.5">
          <div className="h-1.5 w-full rounded bg-fg-subtle/20" />
          <div className="h-1.5 w-3/4 rounded bg-fg-subtle/20" />
          <div className="h-1.5 w-full rounded bg-fg-subtle/20" />
        </div>
        <div className="flex justify-around border-t border-line py-1">
          <div className="h-2 w-2 rounded bg-accent" />
          <div className="h-2 w-2 rounded bg-fg-subtle/30" />
          <div className="h-2 w-2 rounded bg-fg-subtle/30" />
        </div>
      </div>
      <ArrowLeftRight size={20} className="text-fg-subtle" />
      <div className="flex h-28 w-16 flex-col overflow-hidden rounded-xl bg-surface-3 ring-1 ring-line">
        <div className="flex items-center gap-1 bg-surface-4 px-2 py-1">
          <div className="h-1.5 w-1.5 rounded-full bg-fg-subtle/40" />
          <div className="h-1.5 flex-1 rounded bg-fg-subtle/30" />
        </div>
        <div className="flex-1 space-y-1 px-1.5 py-1.5">
          <div className="h-2.5 w-10 rounded-lg bg-surface-4" />
          <div className="h-2.5 w-8 rounded-lg bg-accent/20" />
          <div className="h-2.5 w-11 rounded-lg bg-surface-4" />
        </div>
        <div className="h-3 bg-surface-4" />
      </div>
      <Tag className="right-3 bottom-3">Tela por tela</Tag>
    </Frame>
  );
}

export default {
  id: '2026-11-03-0057',
  title: 'Concord cabe no bolso',
  highlights: [
    {
      kicker: 'App',
      title: 'Toda a interface funciona em telas pequenas',
      text: 'No celular, o Concord mostra uma tela por vez com uma barra de navegação embaixo. Toque em um canal para abrir a conversa e use a seta para voltar. Servidores, mensagens e configurações ficam a um toque.',
      art: MobileArt,
    },
  ],
  also: [
    'As conversas e perfis usam melhor o espaço em telas estreitas: balões mais largos, menos margem.',
    'A lista de servidores rola na horizontal quando não cabe na tela.',
  ],
} satisfies Release;
