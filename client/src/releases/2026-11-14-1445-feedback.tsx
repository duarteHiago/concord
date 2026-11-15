import { ImagePlus, MessageSquareHeart } from 'lucide-react';
import { Frame, Spot, Tag } from '../components/modals/OnboardingArt';
import { useApp } from '../store/app';
import type { Release } from './index';

const KINDS = [
  ['🐞', 'Bug'],
  ['💡', 'Sugestão'],
  ['✨', 'Melhoria'],
  ['💬', 'Outro'],
];

function FeedbackArt() {
  return (
    <Frame className="flex h-[170px] items-center gap-4 px-4">
      <Spot rounded="rounded-2xl" className="h-12 w-12 shrink-0 bg-surface-3 text-accent">
        <MessageSquareHeart size={24} />
      </Spot>
      <div className="min-w-0 flex-1 space-y-2">
        <div className="grid grid-cols-4 gap-1">
          {KINDS.map(([e, l], i) => (
            <div key={l} className={`rounded-lg py-1 text-center text-[10px] font-semibold ${i === 0 ? 'bg-accent text-on-accent' : 'bg-surface-3'}`}>
              {e} {l}
            </div>
          ))}
        </div>
        <div className="h-10 rounded-lg bg-surface-3 p-1.5 text-[10px] text-fg-muted">A tela da call ficou preta quando…</div>
        <div className="flex items-center gap-1.5 rounded-lg border border-dashed border-line-strong p-1.5 text-[10px] text-fg-muted">
          <ImagePlus size={12} /> print colado com Ctrl+V
        </div>
      </div>
      <Tag className="right-3 bottom-3">Toda mensagem é lida</Tag>
    </Frame>
  );
}

export default {
  id: '2026-11-14-1445',
  title: 'Mande feedback para a equipe',
  highlights: [
    {
      kicker: 'Ajuda',
      title: 'Achou um bug ou tem uma ideia? Conta pra gente',
      text: 'O balão com coração, na fileira de servidores, abre o Feedback: escolha bug, sugestão, melhoria ou outro, escreva e anexe prints (cole com Ctrl+V). Em "Meus envios" você acompanha cada um, e recebe um aviso quando a equipe mexer nele.',
      art: FeedbackArt,
      action: { label: 'Mandar um feedback', run: () => useApp.getState().openModal({ type: 'feedback' }) },
      spotlight: {
        target: 'feedback',
        title: 'Feedback',
        tip: 'Bugs, sugestões e melhorias: clique aqui sempre que quiser falar com a equipe.',
        fallback: 'O botão de feedback fica na fileira de servidores, ao lado das Novidades.',
      },
    },
  ],
  also: ['Quando uma parte do app dá erro, o botão "Contar o que aconteceu" já abre o feedback preenchido.'],
  fixes: [],
} satisfies Release;
