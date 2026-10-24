import { ChevronDown, Music2 } from 'lucide-react';
import { SpotifyLogo } from '../components/Jam';
import { Frame, Tag } from '../components/modals/OnboardingArt';
import type { Release } from './index';

/** o botão da Jam com a setinha aberta, listando as Jams de cada um na sala */
function JamsArt() {
  const jams = [
    { name: 'Jam da Bea', color: '#ffd37a' },
    { name: 'Jam do Caio', color: '#9be38a' },
    { name: 'Sua Jam', color: '#c4a5ff' },
  ];
  return (
    <Frame className="h-[170px]">
      <div className="absolute top-3 right-3 flex flex-col items-end gap-2">
        <div className="flex items-center overflow-hidden rounded-full text-[11px] font-bold text-black" style={{ background: '#1DB954' }}>
          <span className="flex items-center gap-1.5 px-3 py-1.5">
            <Music2 size={11} /> Jam da Bea · Entrar
          </span>
          <span className="flex items-center gap-0.5 border-l border-black/15 px-2 py-1.5">
            +2 <ChevronDown size={11} />
          </span>
        </div>
        <div className="w-44 space-y-1 rounded-2xl bg-surface-3 p-1.5 ring-1 ring-line">
          {jams.map((j) => (
            <div key={j.name} className="flex items-center gap-2 rounded-xl px-2 py-1">
              <span className="h-4 w-4 rounded-full" style={{ background: j.color }} />
              <span className="flex-1 text-[10.5px] font-semibold">{j.name}</span>
              <span className="rounded-full px-1.5 text-[9px] font-bold text-black" style={{ background: '#1DB954' }}>
                Entrar
              </span>
            </div>
          ))}
        </div>
      </div>
      <div className="absolute bottom-3 left-3 flex w-40 items-center gap-2 rounded-2xl bg-[#121212] p-2 ring-1 ring-white/10">
        <SpotifyLogo size={22} />
        <span className="flex-1 text-[10px] font-bold text-white">Jam do Caio</span>
        <span className="rounded-full px-1.5 text-[9px] font-bold text-black" style={{ background: '#1DB954' }}>
          Entrar
        </span>
      </div>
      <Tag className="top-3 left-3">Cada um com a sua</Tag>
    </Frame>
  );
}

export default {
  id: '2026-10-24-2011',
  title: 'Várias Jams na mesma sala',
  highlights: [
    {
      kicker: 'Voz',
      title: 'Cada um com a sua Jam, e você escolhe em qual entrar',
      text: 'Agora cada pessoa da sala pode ter a própria Jam do Spotify. A setinha ao lado do botão da Jam lista todas, e o link de Jam colado no chat vira um cartão com o botão de entrar. Só quem criou a Jam pode tirar ela.',
      art: JamsArt,
      spotlight: {
        target: 'jam',
        title: 'As Jams da sala ficam aqui',
        tip: 'Clique para entrar na Jam do botão, ou na setinha para escolher outra.',
        fallback: 'Entre numa sala de voz: as Jams ficam no topo da sala, ao lado do nome dela.',
      },
    },
  ],
} satisfies Release;
