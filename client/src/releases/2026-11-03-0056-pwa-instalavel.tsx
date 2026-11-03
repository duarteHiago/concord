import { Download, Smartphone } from 'lucide-react';
import { Frame, Tag } from '../components/modals/OnboardingArt';
import type { Release } from './index';

function InstallArt() {
  return (
    <Frame className="flex h-[170px] flex-col items-center justify-center gap-3">
      <div className="flex items-center gap-3">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent/15">
          <Smartphone size={28} className="text-accent" />
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-sm font-bold">Concord</span>
          <span className="text-[11px] text-fg-muted">concord-community.com</span>
        </div>
      </div>
      <div className="flex items-center gap-1.5 rounded-full bg-accent px-3 py-1.5 text-xs font-bold text-on-accent">
        <Download size={13} /> Instalar app
      </div>
      <Tag className="top-3 right-3">Sem app store</Tag>
    </Frame>
  );
}

export default {
  id: '2026-11-03-0056',
  title: 'Concord no celular',
  highlights: [
    {
      kicker: 'App',
      title: 'Instale o Concord no celular, direto do navegador',
      text: 'No Android, o Chrome oferece "Instalar app" na barra de endereço. No iPhone, abra no Safari, toque em Compartilhar e depois em "Adicionar à Tela de Início". O app abre em tela cheia, sem barra do navegador, e as atualizações chegam sozinhas.',
      art: InstallArt,
    },
  ],
  also: [
    'As fontes e a interface ficam no cache do celular: depois de abrir uma vez, o app carrega mais rápido.',
    'Sem internet, uma tela de "Sem conexão" aparece com um botão para tentar de novo.',
  ],
} satisfies Release;
