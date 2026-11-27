import { Bell } from 'lucide-react';
import { Frame, Tag } from '../components/modals/OnboardingArt';
import { useApp } from '../store/app';
import type { Release } from './index';

/** A tela bloqueada do celular com a notificação do Concord, no jeito do iPhone. */
function LockScreenArt() {
  return (
    <Frame className="relative flex h-[170px] items-center justify-center overflow-hidden bg-linear-to-b from-[#1f2a44] to-[#0f1b3d]">
      <div className="absolute top-3 text-center text-white">
        <div className="font-display text-2xl leading-none font-bold">14:02</div>
        <div className="text-[9px] opacity-70">terça-feira, 25 de novembro</div>
      </div>
      <div className="mt-10 flex w-[86%] items-start gap-2 rounded-[16px] bg-white/80 px-2.5 py-2 text-[#0f1b3d] shadow-lg backdrop-blur-xl">
        <img src="/icon-192.png" alt="" className="h-7 w-7 shrink-0 rounded-[8px]" />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-1">
            <b className="flex-1 truncate text-[10px]">Ana · #incidentes</b>
            <span className="text-[8px] opacity-60">agora</span>
          </div>
          <div className="truncate text-[10px]">@você consegue olhar o alerta da API?</div>
        </div>
      </div>
      <Tag className="right-3 bottom-3">
        <Bell size={9} className="mr-1 inline" />
        Com o Concord fechado
      </Tag>
    </Frame>
  );
}

export default {
  id: '2026-11-25-1315',
  title: 'Notificações no celular',
  highlights: [
    {
      kicker: 'Celular',
      title: 'Notificações como de qualquer app, mesmo com o Concord fechado',
      text: 'Menções, mensagens diretas e respostas nas suas threads chegam na tela bloqueada do celular. Toque para ir direto à conversa. No iPhone, adicione o Concord à Tela de Início (Compartilhar → Adicionar à Tela de Início) e ligue em Ajustes → Notificações.',
      art: LockScreenArt,
      action: { label: 'Ligar neste aparelho', run: () => useApp.getState().openModal({ type: 'userSettings', tab: 'notifications' }) },
    },
  ],
  fixes: ['A notificação do navegador no Android não falha mais ao aparecer'],
} satisfies Release;
