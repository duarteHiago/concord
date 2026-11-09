import { ChevronUp } from 'lucide-react';
import { Frame, Tag } from '../components/modals/OnboardingArt';
import type { Release } from './index';

// o topo, a gaveta aberta na linha e um servidor sendo arrastado para cima
function GavetaArt() {
  const icon = 'flex h-8 w-8 items-center justify-center rounded-xl bg-surface-3 font-display text-[10px] font-bold text-fg-muted';
  return (
    <Frame className="flex h-[170px] flex-col gap-2 px-4 pt-3">
      <div className="flex items-center gap-1.5">
        {['F', 'GS', 'RB'].map((t, i) => (
          <span key={t} className={`server-drawer-jiggle ${i % 2 ? 'server-drawer-jiggle-alt' : ''} ${icon}`}>{t}</span>
        ))}
        <span className="h-8 w-8 rounded-xl border-2 border-dashed border-accent/60" />
      </div>
      <div className="relative rounded-2xl bg-surface-1 p-2 shadow-[inset_0_10px_12px_-10px_rgb(0_0_0/0.35)] ring-1 ring-line">
        <div className="flex gap-1.5">
          {['M3', 'CL', 'FA', 'DN'].map((t) => (
            <span key={t} className={icon}>{t}</span>
          ))}
        </div>
        <span className={`${icon} absolute -top-7 left-[132px] scale-110 -rotate-6 shadow-lg`}>MS</span>
      </div>
      <div className="relative flex h-4 items-center justify-center">
        <span className="absolute inset-x-0 top-1/2 h-px bg-line" />
        <span className="relative flex h-4 w-8 items-center justify-center rounded-full border border-line bg-surface-2 text-fg-subtle">
          <ChevronUp size={11} strokeWidth={2.5} />
        </span>
      </div>
      <Tag className="right-3 bottom-3">Segure e arraste</Tag>
    </Frame>
  );
}

export default {
  id: '2026-11-09-0045',
  title: 'Gaveta mais simples',
  highlights: [
    {
      kicker: 'Servidores',
      title: 'A gaveta abre na linha embaixo dos servidores',
      text: 'Toque na setinha da linha que separa os servidores do servidor aberto. Com a gaveta aberta, segure um servidor e arraste: para o topo, para mudar a ordem ou de volta para a gaveta. Se o topo estiver cheio, eles trocam de lugar.',
      art: GavetaArt,
      spotlight: {
        target: 'server-drawer',
        title: 'A gaveta abre aqui',
        tip: 'Toque na seta para abrir e fechar.',
        fallback: 'Abra a lista de servidores: a seta fica na linha logo abaixo deles.',
      },
    },
  ],
  also: ['Arrastar servidores também funciona com o dedo, no celular.'],
  fixes: [],
} satisfies Release;
