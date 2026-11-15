import { Power } from 'lucide-react';
import { Frame, Tag } from '../components/modals/OnboardingArt';
import type { Release } from './index';

function TvArt() {
  return (
    <Frame className="h-[170px] bg-[#231a3a]">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_90%,#9a6a4f_0,#5b4a8a_45%,#231a3a_80%)]" />
      <div className="absolute top-5 left-1/2 w-[190px] -translate-x-1/2 rounded-[16px] border-[3px] border-[#1b1430] bg-[#3d3166] p-1.5 text-white shadow-xl">
        <div className="mb-1 px-0.5 text-[10px] font-bold">Ligar a TV da mesa</div>
        <div className="grid grid-cols-2 gap-1 rounded-lg border-2 border-[#1b1430] bg-[#141127] p-1.5">
          <div className="aspect-video rounded bg-[linear-gradient(135deg,#2f62e6,#3fb8c9)] ring-2 ring-[#e8685a]" />
          <div className="aspect-video rounded bg-[linear-gradient(135deg,#8b5cf6,#f08fb0)]" />
        </div>
        <div className="mt-1.5 flex items-center gap-1 text-[9px] font-bold">
          <span className="rounded bg-white/20 px-1">1080p</span>
          <span className="rounded px-1 text-white/60">Som</span>
          <span className="ml-auto flex items-center gap-0.5 rounded-md bg-[#e8685a] px-1.5 py-0.5">
            <Power size={9} /> Ligar a TV
          </span>
        </div>
      </div>
      <Tag className="right-3 bottom-3">Clique na TV da sua mesa</Tag>
    </Frame>
  );
}

function EspiarArt() {
  return (
    <Frame className="h-[170px] bg-[#231a3a]">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_90%,#9a6a4f_0,#5b4a8a_45%,#231a3a_80%)]" />
      <div className="absolute top-4 left-1/2 -translate-x-1/2 rounded-full bg-[#1b1430] px-3 py-1.5 text-[11px] font-semibold text-white ring-1 ring-white/20">
        👀 Ana está espiando a sua mesa
      </div>
      <div className="absolute bottom-6 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-xl bg-[#1b1430] p-1 pl-2.5 text-[11px] font-semibold text-white">
        👀 Espiando #jogatina · 7s
        <span className="rounded-lg bg-[#2e9e6a] px-2 py-1">Segure para cochichar</span>
      </div>
      <Tag className="right-3 bottom-3">Todo mundo da mesa vê</Tag>
    </Frame>
  );
}

export default {
  id: '2026-11-14-1256',
  audience: 'plaza',
  title: 'TV da mesa, espiar e voz em toda a Praça',
  highlights: [
    {
      kicker: 'Servidor',
      title: 'Transmita pela TV da mesa',
      text: 'Sentado numa mesa, clique na TV dela (ou no botão da TV, embaixo) para mostrar a sua tela para quem está na call. O menu é curto: escolha a tela ou janela, a qualidade e se vai com som.',
      art: TvArt,
    },
    {
      kicker: 'Servidor',
      title: 'Espie uma mesa por alguns segundos',
      text: 'Dentro do prédio, clique numa mesa e escolha "Espiar": você ouve a conversa por 10 segundos (mais baixo quanto mais longe da mesa) e pode cochichar segurando um botão. Quem está na mesa vê que você está espiando, e pode fechar a mesa para espiadas.',
      art: EspiarArt,
    },
  ],
  also: [
    'A voz por proximidade também vale dentro do prédio. Quem está sentado numa mesa está na call e não ouve a Praça.',
    'Quem já está numa call e abre a Praça aparece direto na mesa dela, dentro do prédio.',
  ],
  fixes: [],
} satisfies Release;
