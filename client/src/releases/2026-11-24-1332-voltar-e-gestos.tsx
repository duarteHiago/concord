import { ChevronLeft, Hash } from 'lucide-react';
import { Frame, Tag } from '../components/modals/OnboardingArt';
import type { Release } from './index';

/** Um celular com a conversa e a setinha de voltar entrando pela esquerda, acompanhando o dedo. */
function SwipeArt() {
  return (
    <Frame className="relative flex h-[170px] items-center justify-center">
      <div className="relative h-[140px] w-[86px] overflow-hidden rounded-[18px] bg-surface-2 ring-1 ring-line">
        <div className="flex items-center gap-1 border-b border-line px-2 py-1.5 text-[8px] font-bold">
          <Hash size={8} className="opacity-60" /> geral
        </div>
        <div className="space-y-1.5 p-2">
          <div className="h-3 w-12 rounded-md rounded-bl-sm bg-surface-3" />
          <div className="h-3 w-14 rounded-md rounded-bl-sm bg-surface-3" />
          <div className="h-3 w-9 rounded-md rounded-bl-sm bg-surface-3" />
        </div>
        <div className="absolute top-1/2 left-1 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-accent text-on-accent shadow-md">
          <ChevronLeft size={14} strokeWidth={3} />
        </div>
      </div>
      <Tag className="right-3 bottom-3">Deslize para a direita</Tag>
    </Frame>
  );
}

export default {
  id: '2026-11-24-1332',
  title: 'Voltar e gestos no celular',
  highlights: [
    {
      kicker: 'Celular',
      title: 'Volte deslizando o dedo, ou pelo voltar do celular',
      text: 'Deslize da esquerda para a direita para voltar uma tela ou fechar o que está aberto por cima. O botão (ou gesto) voltar do celular faz o mesmo, em vez de sair do Concord. Janelas e menus que sobem de baixo fecham arrastando para baixo.',
      art: SwipeArt,
    },
  ],
  fixes: [
    'Guardar na gaveta o servidor que está aberto não faz mais ele continuar aparecendo no topo',
    'Tocar em alguém na lista de membros fecha a lista e abre o perfil, em vez de deixar a lista por cima',
    'No perfil, o nome não corta mais o "_" e as letras de baixo, e os botões não quebram em duas linhas',
    'O aviso de versão nova aparece no topo no celular, sem cobrir a barra de baixo nem o campo de mensagem',
    'O seletor de cor personalizada ficou do mesmo tamanho dos outros quadradinhos de cor',
  ],
} satisfies Release;
