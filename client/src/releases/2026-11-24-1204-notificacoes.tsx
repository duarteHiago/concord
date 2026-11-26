import { Bell, Hash } from 'lucide-react';
import { Frame, Tag } from '../components/modals/OnboardingArt';
import { useApp } from '../store/app';
import type { Release } from './index';

/** O aviso de vidro no canto, com a pilha por trás (o mesmo desenho do NoticeStack). */
function NoticeArt() {
  return (
    <Frame className="relative h-[170px] overflow-hidden">
      <div className="absolute inset-x-4 bottom-3 space-y-2 opacity-60">
        <div className="h-6 w-2/3 rounded-[14px] rounded-bl-md bg-surface-3" />
        <div className="h-6 w-1/2 rounded-[14px] rounded-bl-md bg-surface-3" />
      </div>
      <div className="absolute top-3 right-3 left-3 h-[70px]">
        <div className="absolute inset-x-0 top-0 h-[62px] origin-top translate-y-[9px] scale-[.94] rounded-[18px] bg-surface-2/80 opacity-80 ring-1 ring-line" />
        <div className="absolute inset-x-0 top-0 flex items-start gap-2.5 rounded-[18px] bg-surface-2/80 px-3 py-2.5 shadow-lg ring-1 ring-line backdrop-blur-xl">
          <div className="relative shrink-0">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#3ba55c] text-xs font-extrabold text-white">A</div>
            <img src="/brand/concord-simbolo.svg" alt="" className="absolute -right-1 -bottom-1 h-3.5 w-3.5 rounded bg-surface-2 p-px" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2 text-[11px]">
              <b className="flex-1">Ana</b>
              <span className="text-[9px] text-fg-subtle">agora</span>
            </div>
            <div className="text-[9px] font-semibold text-fg-muted">mencionou você em #incidentes</div>
            <div className="truncate text-[10px]">
              <b className="text-accent">@você</b> consegue olhar o alerta da API?
            </div>
          </div>
        </div>
      </div>
      <Tag className="bottom-3 left-3">Clique para abrir</Tag>
    </Frame>
  );
}

/** A lista de canais com o que ficou por ler: negrito e o contador de menções. */
function UnreadArt() {
  const row = (name: string, opts: { bold?: boolean; count?: number; active?: boolean } = {}) => (
    <div className={`flex h-7 items-center gap-1.5 rounded-xl px-2.5 text-[12px] ${opts.active ? 'bg-surface-3' : ''} ${opts.bold ? 'font-extrabold text-fg' : 'font-semibold text-fg-muted'}`}>
      <Hash size={12} className="opacity-70" />
      <span className="flex-1">{name}</span>
      {opts.count ? <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[9px] font-bold text-white">{opts.count}</span> : null}
    </div>
  );
  return (
    <Frame className="flex h-[170px] items-center justify-center">
      <div className="w-48 space-y-0.5 rounded-2xl bg-surface-2 p-2.5 ring-1 ring-line">
        {row('geral', { active: true })}
        {row('produto', { bold: true })}
        {row('incidentes', { bold: true, count: 2 })}
        {row('alertas')}
      </div>
      <Tag className="right-3 bottom-3">
        <Bell size={9} className="mr-1 inline" />
        Sininho do canal
      </Tag>
    </Frame>
  );
}

export default {
  id: '2026-11-24-1204',
  title: 'Notificações novas',
  highlights: [
    {
      kicker: 'Avisos',
      title: 'Mensagens e menções avisam do jeito certo',
      text: 'Quando alguém menciona você, chega um aviso no canto da tela com um som baixinho. Clique para ir direto à mensagem ou arraste para cima para dispensar. No app do Windows, o aviso aparece mesmo com o Concord minimizado.',
      art: NoticeArt,
      action: { label: 'Ajustar sons e avisos', run: () => useApp.getState().openModal({ type: 'userSettings', tab: 'notifications' }) },
    },
    {
      kicker: 'Canais',
      title: 'Veja o que ficou por ler',
      text: 'Canal com mensagem nova fica em negrito, e as menções aparecem num contador no canal e no servidor. Ler no celular limpa no computador. Cada servidor começa avisando só menções: troque no menu do servidor ou no sininho do canal, e silencie por um tempo quando precisar.',
      art: UnreadArt,
    },
  ],
  also: ['Sons novos para mensagem e menção, com controle de volume em Configurações → Notificações', 'O número de menções aparece no título da aba'],
} satisfies Release;
