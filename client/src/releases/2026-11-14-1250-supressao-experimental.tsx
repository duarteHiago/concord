import { FlaskConical } from 'lucide-react';
import { Frame, Spot, Tag } from '../components/modals/OnboardingArt';
import { useApp } from '../store/app';
import type { Release } from './index';

function LabArt() {
  return (
    <Frame className="flex h-[170px] flex-col justify-center gap-2 px-4">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-[11px] font-bold">
          <FlaskConical size={12} className="text-accent" /> Modos experimentais
        </span>
        <Spot rounded="rounded-full" className="h-4 w-8 bg-accent p-0.5">
          <span className="ml-auto block h-3 w-3 rounded-full bg-white" />
        </Spot>
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        <Spot rounded="rounded-xl" className="border-2 border-accent bg-accent/10 px-2 py-1.5 text-[10px] font-bold">
          IA máxima automática
          <span className="ml-1 rounded-full bg-warn/25 px-1 text-[8px] font-extrabold uppercase">exp</span>
        </Spot>
        <div className="rounded-xl bg-surface-3 px-2 py-1.5 text-[10px] font-bold text-fg-muted">IA natural</div>
        <div className="rounded-xl bg-surface-3 px-2 py-1.5 text-[10px] font-bold text-fg-muted">IA máxima</div>
        <div className="rounded-xl bg-surface-3 px-2 py-1.5 text-[10px] font-bold text-fg-muted">IA básica</div>
      </div>
      <div className="flex items-center gap-2 text-[10px] text-fg-muted">
        <span>Força agora:</span>
        <div className="h-1.5 flex-1 rounded-full bg-surface-3">
          <div className="h-full w-1/3 rounded-full bg-accent" />
        </div>
        <span>20 dB (sala com barulho)</span>
      </div>
      <Tag className="top-3 right-14">Ligue e teste</Tag>
    </Frame>
  );
}

export default {
  id: '2026-11-14-1250',
  title: 'Supressão de ruído: modos experimentais',
  highlights: [
    {
      kicker: 'Voz',
      title: 'Teste com a gente as supressões de ruído novas',
      text: 'Em Configurações → Voz e vídeo, ligue "Modos experimentais". Aparece a "IA máxima automática", que mede o barulho da sua sala e ajusta a força sozinha: em sala silenciosa aperta e deixa as pausas limpas; com ventilador ou rua, alivia para não comer o começo das palavras (nos nossos testes, a força fixa cortava até 13% da fala em ambiente barulhento; a automática, de 1 a 6%). Também entra o portão de voz "Guiado pela IA" e, em navegadores que oferecem, o isolamento de voz nativo. Use o teste de microfone para comparar e conte para a gente o que achou.',
      art: LabArt,
      action: { label: 'Abrir as configurações de voz', run: () => useApp.getState().openModal({ type: 'userSettings', tab: 'audio' }) },
    },
  ],
  also: [
    'O modo desenvolvedor mostra a força que a "IA máxima automática" está usando a cada momento.',
  ],
} satisfies Release;
