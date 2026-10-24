import { Music2 } from 'lucide-react';
import { Frame, Spot, Tag } from '../components/modals/OnboardingArt';
import type { Release } from './index';

/** cabeçalho de uma sala com o botão verde da Jam, e as carinhas de quem está ouvindo junto */
function JamArt() {
  return (
    <Frame className="flex h-[170px] flex-col gap-3">
      <div className="flex items-center gap-2">
        <span className="font-display text-sm font-bold">Sala da resenha</span>
        <span className="text-[10px] text-fg-muted">4 na sala</span>
        <Spot className="ml-auto gap-1.5 px-3 py-1 text-[11px] font-bold text-black" rounded="rounded-full">
          <span className="flex items-center gap-1.5 rounded-full px-0.5" style={{ background: '#1DB954' }}>
            <Music2 size={11} /> Jam da Bea · Entrar
          </span>
        </Spot>
      </div>
      <div className="grid flex-1 grid-cols-4 gap-2">
        {['#ffd37a', '#c4a5ff', '#7cc7ff', '#9be38a'].map((c) => (
          <div key={c} className="flex items-center justify-center rounded-xl bg-surface-2">
            <div className="h-9 w-9 rounded-full" style={{ background: c }} />
          </div>
        ))}
      </div>
      <Tag className="bottom-3 left-3">Todo mundo ouvindo a mesma música</Tag>
    </Frame>
  );
}

export default {
  id: '2026-10-24-1903',
  title: 'Jam do Spotify na sala',
  highlights: [
    {
      kicker: 'Voz',
      title: 'Ouça junto com a sala usando uma Jam do Spotify',
      text: 'Numa sala de voz, toque em Jam, comece uma Jam no Spotify e cole o link (ou cole direto no chat da sala). Aparece "Entrar na Jam" para todo mundo da sala, e cada um ouve a mesma música no seu Spotify, podendo pôr música na fila.',
      art: JamArt,
      spotlight: {
        target: 'jam',
        title: 'A Jam fica aqui',
        tip: 'Com você numa sala de voz, este botão abre o passo a passo. Quando tiver Jam, ele vira "Entrar".',
        fallback: 'Entre numa sala de voz: o botão Jam fica no topo da sala, ao lado do nome dela.',
      },
    },
  ],
} satisfies Release;
