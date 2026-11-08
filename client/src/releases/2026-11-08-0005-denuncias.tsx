import { Flag } from 'lucide-react';
import { Frame, Spot, Tag } from '../components/modals/OnboardingArt';
import type { Release } from './index';

function ReportArt() {
  return (
    <Frame className="flex h-[170px] items-center justify-center gap-5 px-6">
      {/* uma mensagem com a barrinha de ações e a bandeira */}
      <div className="relative w-40 rounded-2xl bg-surface-3 p-3 ring-1 ring-line">
        <div className="absolute -top-3 right-2 flex gap-1 rounded-full bg-popover p-1 ring-1 ring-line">
          <div className="h-4 w-4 rounded-full bg-fg-subtle/25" />
          <Spot className="h-4 w-4">
            <div className="flex h-4 w-4 items-center justify-center rounded-full bg-danger/20 text-danger">
              <Flag size={9} />
            </div>
          </Spot>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-6 w-6 rounded-full bg-fg-subtle/40" />
          <div className="h-1.5 w-14 rounded bg-fg-subtle/40" />
        </div>
        <div className="mt-2 space-y-1">
          <div className="h-1.5 w-full rounded bg-fg-subtle/25" />
          <div className="h-1.5 w-2/3 rounded bg-fg-subtle/25" />
        </div>
      </div>
      {/* os motivos */}
      <div className="w-40 space-y-1 rounded-2xl bg-surface-3 p-3 ring-1 ring-line">
        {[true, false, false].map((on, i) => (
          <div key={i} className={on ? 'flex items-center gap-1.5 rounded-lg bg-danger/10 px-1.5 py-1 ring-1 ring-danger' : 'flex items-center gap-1.5 px-1.5 py-1'}>
            <div className={on ? 'h-2 w-2 rounded-full bg-danger' : 'h-2 w-2 rounded-full ring-1 ring-fg-subtle'} />
            <div className="h-1.5 flex-1 rounded bg-fg-subtle/30" />
          </div>
        ))}
      </div>
      <Tag className="right-3 bottom-3">Só a equipe vê</Tag>
    </Frame>
  );
}

export default {
  id: '2026-11-08-0005',
  title: 'Denúncias',
  highlights: [
    {
      kicker: 'Segurança',
      title: 'Viu algo errado? Denuncie para a equipe',
      text: 'Passe o mouse numa mensagem e toque na bandeira, ou abra o cartão de alguém e escolha Denunciar. Numa transmissão, a bandeira fica no canto do vídeo e algumas imagens da tela vão junto como prova. Só a equipe do Concord vê, e quem foi denunciado não fica sabendo quem denunciou.',
      art: ReportArt,
    },
  ],
  also: ['Também dá para denunciar mensagens diretas.'],
  fixes: [],
} satisfies Release;
