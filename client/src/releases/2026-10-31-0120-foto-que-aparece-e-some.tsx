import { ImagePlus } from 'lucide-react';
import { Frame, Tag } from '../components/modals/OnboardingArt';
import type { Release } from './index';

function FlickerArt() {
  return (
    <Frame className="flex h-[160px] items-center justify-center gap-4 px-4">
      <div className="flex flex-col items-center gap-1.5 text-[10px] text-fg-muted">
        <div className="h-12 w-12 rounded-full bg-accent-2" />
        agora
      </div>
      <div className="flex flex-col items-center gap-1.5 text-[10px] text-fg-muted">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-warn">
          <ImagePlus size={18} />
        </div>
        daqui a pouco
      </div>
      <div className="flex flex-col items-center gap-1.5 text-[10px] text-fg-muted">
        <div className="h-12 w-12 rounded-full bg-accent-2" />
        sumiu de novo
      </div>
      <Tag className="top-2.5 right-3">Ninguém sabe quando</Tag>
    </Frame>
  );
}

export default {
  id: '2026-10-31-0120',
  title: 'Foto que aparece e some',
  highlights: [
    {
      kicker: 'Mecenato',
      title: 'A foto escolhida pelo Mecenas virou um easter egg',
      text: 'Quando o Mecenas troca a sua foto, ela não fica lá o tempo todo: aparece no perfil por alguns minutos, some, e volta quando ninguém espera. No fim do contrato a sua foto original volta de vez.',
      art: FlickerArt,
    },
  ],
} satisfies Release;
