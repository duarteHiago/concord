import { CheckCircle2, MessagesSquare } from 'lucide-react';
import { Frame, Tag } from '../components/modals/OnboardingArt';
import { useApp } from '../store/app';
import type { Release } from './index';

/** O alerta no canal com o resumo da thread embaixo, e o painel dela ao lado. */
function ThreadArt() {
  return (
    <Frame className="flex h-[170px] items-stretch gap-2 p-3">
      <div className="flex min-w-0 flex-1 flex-col justify-end gap-1.5 rounded-xl bg-surface-2 p-2.5 ring-1 ring-line">
        <div className="w-fit rounded-[10px] rounded-bl-sm bg-surface-3 px-2 py-1 text-[9px]">ALERTA: API com 40% de erro</div>
        <div className="flex w-fit items-center gap-1 rounded-full bg-surface-3 py-0.5 pr-1.5 pl-0.5 text-[8px] font-bold">
          <span className="flex h-3 w-3 items-center justify-center rounded-full bg-accent/20 text-accent">
            <MessagesSquare size={7} />
          </span>
          <span className="text-accent">3 respostas</span>
          <span className="flex items-center gap-0.5 rounded-full bg-ok/15 px-1 text-ok">
            <CheckCircle2 size={7} /> Resolvida
          </span>
        </div>
        <div className="h-4 w-1/2 rounded-[10px] rounded-bl-sm bg-surface-3" />
      </div>
      <div className="flex w-[44%] flex-col gap-1 rounded-xl bg-surface-2 p-2 ring-1 ring-line">
        <div className="text-[9px] font-bold">Thread</div>
        <div className="h-3.5 w-full rounded-md bg-surface-3" />
        <div className="h-3.5 w-4/5 rounded-md bg-surface-3" />
        <div className="h-3.5 w-3/5 rounded-md bg-surface-3" />
        <div className="mt-auto h-4 rounded-full bg-surface-3" />
      </div>
      <Tag className="bottom-3 left-3">Responder em thread</Tag>
    </Frame>
  );
}

export default {
  id: '2026-11-24-1415',
  title: 'Threads',
  highlights: [
    {
      kicker: 'Canais',
      title: 'Responda numa thread, sem encher o canal',
      text: 'Nas ações de uma mensagem, escolha "Responder em thread": a conversa abre ao lado (no celular, em tela cheia) e o canal mostra só um resumo com as respostas. Bom para tratar um alerta ou um incidente do começo ao fim, e marcar como resolvido quando acabar.',
      art: ThreadArt,
    },
    {
      kicker: 'Threads',
      title: 'As threads que você segue, num lugar só',
      text: 'O botão de Threads, ao lado das Novidades, junta as conversas que você abriu, respondeu ou em que foi mencionado, de todos os servidores. As que têm resposta nova ficam marcadas, e chega um aviso quando alguém responde.',
      art: ThreadArt,
      action: { label: 'Ver minhas threads', run: () => useApp.getState().openThreads() },
    },
  ],
  also: ['Webhooks podem responder na thread de um alerta e marcar como resolvido (veja a documentação dos webhooks)'],
} satisfies Release;
