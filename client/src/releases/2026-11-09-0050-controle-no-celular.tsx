import { MicOff, Sparkles, Volume2 } from 'lucide-react';
import { openDeck } from '../components/Deck';
import { Frame, Tag } from '../components/modals/OnboardingArt';
import type { Release } from './index';

// um celular deitado com o deck: sons, reação, chamar atenção e poderes do Mecenato
function DeckArt() {
  const key = 'flex aspect-square flex-col items-center justify-center gap-1 rounded-xl text-[9px] font-bold';
  return (
    <Frame className="flex h-[170px] items-center justify-center px-4">
      <div className="w-[280px] rounded-[22px] border-4 border-fg/80 bg-surface-1 p-2 shadow-xl">
        <div className="mb-1.5 flex gap-1">
          {['Sons', 'Zoeira', 'Mecenato'].map((t, i) => (
            <span key={t} className={`rounded-full px-2 py-0.5 text-[8px] font-bold ${i === 2 ? 'bg-accent text-on-accent' : 'bg-surface-3 text-fg-muted'}`}>
              {t}
            </span>
          ))}
        </div>
        <div className="grid grid-cols-5 gap-1">
          <span className={`${key} bg-surface-3`}><Volume2 size={13} />Risada</span>
          <span className={`${key} bg-surface-3`}><span className="text-base leading-none">🔥</span>Reação</span>
          <span className={`${key} bg-accent-2/15`}><span className="text-base leading-none">📳</span>Tremer</span>
          <span className={`${key} bg-accent text-on-accent`}><MicOff size={13} />Silenciar</span>
          <span className={`${key} bg-accent/12 text-accent`}><Sparkles size={13} />Robô</span>
        </div>
      </div>
      <Tag className="right-3 bottom-3">Celular na horizontal</Tag>
    </Frame>
  );
}

export default {
  id: '2026-11-09-0050',
  title: 'Controle no celular',
  highlights: [
    {
      kicker: 'Voz',
      title: 'Use o celular como um deck enquanto joga no PC',
      text: 'Abra Controle, na barra de baixo do app no celular, ou leia o QR code do raio no topo da sala, no PC. Com o celular deitado, você toca sons, solta reações, chama a atenção de alguém e, se for o Mecenas, troca a voz, a foto, silencia e mais, sem sair da call do PC. Segure um botão para pôr nos favoritos.',
      art: DeckArt,
      action: { label: 'Abrir o controle', run: () => openDeck() },
    },
  ],
  also: ['As reações também valem quando mandadas de outro aparelho da sua conta.'],
  fixes: [],
} satisfies Release;
