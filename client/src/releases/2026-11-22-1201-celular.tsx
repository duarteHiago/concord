import { Copy, Flag, Reply, Trash2 } from 'lucide-react';
import { Frame, Tag } from '../components/modals/OnboardingArt';
import type { Release } from './index';

function HoldArt() {
  const items = [
    { icon: Reply, label: 'Responder' },
    { icon: Copy, label: 'Copiar texto' },
    { icon: Flag, label: 'Denunciar' },
    { icon: Trash2, label: 'Apagar', danger: true },
  ];
  return (
    <Frame className="h-[170px]">
      <div className="relative mx-auto flex h-full w-[150px] flex-col overflow-hidden rounded-[18px] bg-surface-0 ring-1 ring-line">
        <div className="space-y-1.5 p-2.5 opacity-50">
          <div className="h-4 w-[70%] rounded-lg bg-surface-3" />
          <div className="h-4 w-[50%] rounded-lg bg-surface-3" />
        </div>
        <div className="absolute inset-x-0 bottom-0 space-y-1 rounded-t-[14px] bg-surface-2 px-2 pt-1.5 pb-2 shadow-xl">
          <div className="mx-auto mb-1 h-0.5 w-6 rounded-full bg-line-strong" />
          {items.map(({ icon: Icon, label, danger }) => (
            <div key={label} className={`flex items-center gap-1.5 text-[9px] font-semibold ${danger ? 'text-danger' : 'text-fg'}`}>
              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-surface-3">
                <Icon size={9} />
              </span>
              {label}
            </div>
          ))}
        </div>
      </div>
      <Tag className="right-3 bottom-3">Segure a mensagem</Tag>
    </Frame>
  );
}

export default {
  id: '2026-11-22-1201',
  title: 'Concord no celular',
  highlights: [
    {
      kicker: 'Celular',
      title: 'Segure uma mensagem para responder, copiar ou apagar',
      text: 'No celular, segure o dedo numa mensagem e as opções sobem da parte de baixo da tela. Funciona nos canais e nas mensagens privadas.',
      art: HoldArt,
    },
  ],
  also: [
    'No celular, a barra de abas some dentro das conversas e sobra mais espaço para as mensagens',
    'Campo de mensagem mais folgado no celular, com botão de enviar',
    'As janelas sobem da parte de baixo da tela no celular, perto do polegar',
    'Os filtros do fórum cabem numa fileira que rola de lado',
    'Na sala de voz, o papo abre no celular e no tablet pelo botão do cabeçalho',
    'Os avisos rápidos aparecem no topo da tela no celular',
  ],
  fixes: [
    'As configurações do servidor abrem inteiras no celular, sem cortar o conteúdo pela metade',
    'No iPhone, tocar num campo de texto não dá mais zoom na página',
    'Os botões de criar e editar canais aparecem no celular (antes só surgiam com o mouse em cima)',
    'Na sala de voz pelo celular, o botão de sair não fica mais escondido no fim da barra',
    'O botão de membros do fórum abre a lista no celular',
  ],
} satisfies Release;
