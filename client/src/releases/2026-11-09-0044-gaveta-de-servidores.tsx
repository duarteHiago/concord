import { Archive, Minus, Plus } from 'lucide-react';
import { Frame, Spot, Tag } from '../components/modals/OnboardingArt';
import type { Release } from './index';

// a fileira do topo com o botão da gaveta e a gaveta aberta, no modo organizar
function GavetaArt() {
  const top = ['F', 'GS', 'RB', 'MS'];
  const rest = ['M3', 'CL', 'FA', 'DN'];
  const icon = 'flex h-8 w-8 items-center justify-center rounded-xl bg-surface-3 font-display text-[10px] font-bold text-fg-muted';
  return (
    <Frame className="flex h-[170px] flex-col gap-2 px-4 pt-3">
      <div className="flex items-center gap-1.5">
        {top.map((t) => (
          <span key={t} className={icon}>{t}</span>
        ))}
        <Spot rounded="rounded-xl" className="relative h-8 w-8 bg-fg text-surface-1">
          <Archive size={14} />
        </Spot>
      </div>
      <div className="flex-1 rounded-t-2xl border border-b-0 border-line-strong bg-surface-1 p-2 shadow-[inset_0_10px_12px_-10px_rgb(0_0_0/0.35)]">
        <div className="mb-1.5 flex gap-1.5 rounded-xl bg-surface-0/70 p-1.5">
          {top.map((t, i) => (
            <span key={t} className={`server-drawer-jiggle relative ${icon} ${i % 2 ? 'server-drawer-jiggle-alt' : ''}`}>
              {t}
              <span className="absolute -top-1 -left-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-fg text-surface-1">
                <Minus size={9} strokeWidth={3} />
              </span>
            </span>
          ))}
        </div>
        <div className="flex gap-1.5 px-1.5">
          {rest.map((t, i) => (
            <span key={t} className={`server-drawer-jiggle relative ${icon} ${i % 2 ? '' : 'server-drawer-jiggle-alt'}`}>
              {t}
              <span className="absolute -top-1 -left-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-surface-4 text-fg-subtle">
                <Plus size={9} strokeWidth={3} />
              </span>
            </span>
          ))}
        </div>
      </div>
      <Tag className="right-3 bottom-3">Segure para organizar</Tag>
    </Frame>
  );
}

export default {
  id: '2026-11-09-0044',
  title: 'Gaveta de servidores',
  highlights: [
    {
      kicker: 'Servidores',
      title: 'Seus servidores numa gaveta, e só os favoritos no topo',
      text: 'O topo agora mostra até 4 servidores. Os outros ficam na gaveta, ao lado do +. Segure um ícone (ou toque em Organizar) para escolher quem fica no topo e em que ordem. No computador, dá para arrastar.',
      art: GavetaArt,
      spotlight: {
        target: 'server-drawer',
        title: 'A gaveta fica aqui',
        tip: 'O número mostra quantos servidores estão guardados nela.',
        fallback: 'Abra a lista de servidores: a gaveta fica ao lado do botão +.',
      },
    },
  ],
  also: ['O servidor que você abrir pela gaveta aparece no topo enquanto estiver aberto.'],
  fixes: [],
} satisfies Release;
