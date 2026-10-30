import { CornerUpLeft, Reply } from 'lucide-react';
import { Frame, Spot, Tag } from '../components/modals/OnboardingArt';
import type { Release } from './index';

function ReplyArt() {
  return (
    <Frame className="flex h-[170px] flex-col justify-center gap-2 px-4">
      <div className="flex items-end gap-2">
        <div className="h-6 w-6 shrink-0 rounded-full bg-warn" />
        <div className="flex flex-col items-start">
          <span className="px-1 text-[10px] font-bold">Ana</span>
          <div className="rounded-2xl rounded-bl-md bg-surface-3 px-3 py-1.5 text-[11px]">bora jogar hoje?</div>
        </div>
        <Spot className="mb-1 ml-auto h-7 w-7 bg-popover">
          <Reply size={13} />
        </Spot>
      </div>
      <div className="flex items-end gap-2">
        <div className="h-6 w-6 shrink-0 rounded-full bg-accent-2" />
        <div className="flex flex-col items-start">
          <span className="flex items-center gap-1 px-1 text-[10px] text-fg-muted">
            <CornerUpLeft size={10} /> <b>Ana</b> bora jogar hoje?
          </span>
          <span className="px-1 text-[10px] font-bold">Bia</span>
          <div className="rounded-2xl rounded-bl-md bg-surface-3 px-3 py-1.5 text-[11px]">bora, 21h!</div>
        </div>
      </div>
      <Tag className="top-2.5 right-3">Passe o mouse e responda</Tag>
    </Frame>
  );
}

export default {
  id: '2026-10-30-2045',
  title: 'Responder mensagens',
  highlights: [
    {
      kicker: 'Chat',
      title: 'Responda uma mensagem específica',
      text: 'Passe o mouse numa mensagem e toque na setinha de responder, nos canais e nas conversas privadas. A sua resposta mostra o trecho original em cima, e clicar nele leva até a mensagem. Quem você respondeu recebe um aviso, como numa menção.',
      art: ReplyArt,
    },
  ],
  also: [
    'O chat ficou como o do Discord: todas as mensagens alinhadas à esquerda, com a mesma cor e o nome de quem escreveu, inclusive as suas.',
  ],
  fixes: ['Os botões que aparecem ao passar o mouse numa mensagem curta não cobrem mais o nome e o horário de quem escreveu.'],
} satisfies Release;
