import { Mic } from 'lucide-react';
import { Frame, Spot, Tag } from '../components/modals/OnboardingArt';
import { useApp } from '../store/app';
import type { Release } from './index';

function ActiveNoiseArt() {
  return (
    <Frame className="flex h-[170px] flex-col justify-center gap-2 px-4">
      <span className="flex items-center gap-1.5 text-[11px] font-bold">
        <Mic size={12} className="text-accent" /> Supressão de ruído
      </span>
      <div className="grid grid-cols-2 gap-1.5">
        <Spot rounded="rounded-xl" className="border-2 border-accent bg-accent/10 px-2 py-1.5 text-[10px] font-bold">
          IA máxima
        </Spot>
        <div className="rounded-xl bg-surface-3 px-2 py-1.5 text-[10px] font-bold text-fg-muted">IA natural</div>
        <div className="rounded-xl bg-surface-3 px-2 py-1.5 text-[10px] font-bold text-fg-muted">IA básica</div>
        <div className="rounded-xl bg-surface-3 px-2 py-1.5 text-[10px] font-bold text-fg-muted">Do navegador</div>
      </div>
      <div className="rounded-lg bg-warn/15 px-2 py-1 text-[10px]">
        <b>Valendo agora: IA natural.</b> A "IA máxima" não carregou nesta chamada.
      </div>
      <Tag className="top-3 right-3">Sem surpresa</Tag>
    </Frame>
  );
}

export default {
  id: '2026-11-13-1520',
  title: 'Supressão de ruído mais confiável',
  highlights: [
    {
      kicker: 'Voz',
      title: 'Você sempre sabe qual supressão de ruído está valendo',
      text: 'Se o modelo que você escolheu não carregar numa chamada (rede ruim, computador ocupado), o Concord usa o seguinte e avisa, em Configurações e no menu do microfone, qual está valendo de verdade. Antes a troca era silenciosa e parecia que a supressão mudava sozinha de um dia para o outro. Sua escolha continua guardada e volta a valer na próxima chamada.',
      art: ActiveNoiseArt,
      action: { label: 'Ver em Configurações', run: () => useApp.getState().openModal({ type: 'userSettings', tab: 'audio' }) },
    },
  ],
  also: [
    'Os modelos de supressão ficam guardados no seu navegador depois do primeiro uso: entrar numa sala não depende mais de baixar 24 MB de novo.',
    'O teste de microfone diz qual supressão você está ouvindo quando a escolhida não carregou.',
  ],
  fixes: [
    'O microfone não fica mais mudo até você sair da sala quando a supressão de ruído trava no meio da chamada: o Concord percebe que entra som e não sai nada, remonta o processamento sozinho e avisa.',
    'Fones e placas de som USB que se apresentam em estéreo com um lado invertido não somem mais a sua voz: a mistura para mono agora reconhece o caso e usa o canal certo.',
    'Mexer rápido nas configurações de voz (trocar modelo, sensibilidade, dispositivo) não deixa mais o microfone num estado pela metade.',
    'Trocar de modelo várias vezes, ou mexer no teste de microfone, não deixa mais modelos antigos rodando por trás consumindo processador e memória.',
  ],
} satisfies Release;
