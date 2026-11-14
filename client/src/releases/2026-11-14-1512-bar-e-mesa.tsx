import { Frame, Tag } from '../components/modals/OnboardingArt';
import type { Release } from './index';

function BarArt() {
  return (
    <Frame className="h-[170px] bg-[#231a3a]">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_90%,#9a6a4f_0,#5b4a8a_45%,#231a3a_80%)]" />
      <div className="absolute top-6 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-xl bg-[#1b1430]/95 p-1 pl-2.5 text-white">
        <span className="mr-1 text-[11px] font-bold">Balcão</span>
        {['🥤', '🧃', '🍺', '☕', '🥛', '💧'].map((e) => (
          <span key={e} className="grid h-7 w-7 place-items-center rounded-lg text-base">
            {e}
          </span>
        ))}
      </div>
      <div className="absolute bottom-6 left-6 rounded-full bg-[#1b1430]/90 px-2.5 py-1 text-[10px] font-semibold text-[#bfc7ff]">💤 mutado = dormindo na mesa</div>
      <div className="absolute right-6 bottom-6 rounded-full bg-[#1b1430]/90 px-2.5 py-1 text-[10px] font-semibold text-[#9fe7b5]">🎮 jogando = console na mão</div>
      <Tag className="top-3 right-3">Clique no balcão</Tag>
    </Frame>
  );
}

export default {
  id: '2026-11-14-1512',
  audience: 'plaza',
  title: 'Balcão, cochilo e jogatina na Praça',
  highlights: [
    {
      kicker: 'Servidor',
      title: 'Pegue uma bebida no balcão',
      text: 'Dentro do prédio, clique no balcão e escolha refri, suco, chopp, café, milkshake ou água: o boneco vai até lá e pega. A bebida fica na mão e vai junto para a mesa quando você senta.',
      art: BarArt,
    },
  ],
  also: [
    'Sentado numa mesa e mutado, o boneco cochila com a cabeça na mesa e solta uns "zzz".',
    'Sentado numa mesa e jogando (o app desktop mostra o que você joga), o boneco aparece com um console portátil na mão e o nome do jogo.',
  ],
  fixes: [],
} satisfies Release;
