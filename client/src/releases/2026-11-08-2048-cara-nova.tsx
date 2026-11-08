import { Frame, Tag } from '../components/modals/OnboardingArt';
import { useApp } from '../store/app';
import type { Release } from './index';

// a logo nova e os dois Azulejo, claro e escuro, lado a lado
function CaraNovaArt() {
  return (
    <Frame className="flex h-[170px] items-center justify-center gap-5 px-4">
      <img src="/brand/concord-simbolo.svg" alt="" className="h-20 w-20 -rotate-6" />
      <div className="grid gap-2">
        {[
          ['Azulejo', '#ffffff', '#dde4f2', '#1f4fd1', '#ff7a6a', '#0f1b3d'],
          ['Azulejo escuro', '#131e38', '#0a1122', '#4a76ff', '#ff7a6a', '#e8edf8'],
        ].map(([name, panel, rail, accent, coral, fg]) => (
          <div key={name} className="flex w-44 overflow-hidden rounded-lg border border-line">
            <div className="w-5" style={{ background: rail }} />
            <div className="flex flex-1 flex-col gap-1 p-1.5" style={{ background: panel }}>
              <span className="text-[10px] font-bold" style={{ color: fg }}>{name}</span>
              <div className="flex gap-1">
                <div className="h-2 w-10 rounded-full" style={{ background: accent }} />
                <div className="h-2 w-4 rounded-full" style={{ background: coral }} />
              </div>
            </div>
          </div>
        ))}
      </div>
      <Tag className="right-3 bottom-3">Cara nova</Tag>
    </Frame>
  );
}

export default {
  id: '2026-11-08-2048',
  title: 'Cara nova',
  highlights: [
    {
      kicker: 'Aparência',
      title: 'O Concord agora é branco, azul-cobalto e coral',
      text: 'Depois do teste, o Azulejo com coral ganhou: é a cara nova do app, da logo, do ícone e do site. Prefere o escuro? Escolha o Azulejo escuro em Configurações → Aparência. Os outros temas continuam lá.',
      art: CaraNovaArt,
      action: { label: 'Ver os temas', run: () => useApp.getState().openModal({ type: 'userSettings', tab: 'appearance' }) },
    },
  ],
  also: [
    'O site do Concord foi redesenhado nas cores novas.',
    'Os quatro temas Azulejo de teste saíram. Quem estava com um deles, ou com o antigo Noturno, passou para o Azulejo.',
    'No app para computador, o ícone novo chega com a próxima atualização.',
  ],
  fixes: [],
} satisfies Release;
