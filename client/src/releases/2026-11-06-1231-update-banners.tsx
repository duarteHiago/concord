import { RefreshCw, Sparkles } from 'lucide-react';
import { Frame, Tag } from '../components/modals/OnboardingArt';
import type { Release } from './index';

function Art() {
  return (
    <Frame className="flex h-[170px] items-end justify-end p-4">
      <div className="w-[220px] rounded-2xl bg-surface-2 p-3.5 shadow-xl ring-1 ring-line">
        <div className="mb-1 flex items-center gap-1.5 text-xs font-bold">
          <Sparkles size={12} className="text-accent" />
          Nova versão disponível
        </div>
        <p className="mb-2.5 text-[9px] leading-tight text-fg-muted">Recarregue para receber as novidades e correções.</p>
        <div className="flex gap-1.5">
          <div className="flex items-center gap-1 rounded-full bg-accent px-2.5 py-1 text-[9px] font-bold text-on-accent">
            <RefreshCw size={9} /> Atualizar
          </div>
          <div className="rounded-full px-2 py-1 text-[9px] font-bold text-fg-muted">Forçar recarga</div>
        </div>
      </div>
      <Tag className="top-3 left-3">Mais visível</Tag>
    </Frame>
  );
}

export default {
  id: '2026-11-06-1231',
  title: 'Aviso de atualização',
  highlights: [
    {
      kicker: 'App',
      title: 'Você nunca mais perde uma atualização',
      text: 'O aviso de versão nova agora é um card no canto da tela que volta sozinho se você fechar. Se estiver numa sala de voz, o Concord atualiza automaticamente quando você sair. No navegador, tem um botão "Forçar recarga" que limpa o cache na hora.',
      art: Art,
    },
  ],
  also: [],
  fixes: [],
} satisfies Release;
