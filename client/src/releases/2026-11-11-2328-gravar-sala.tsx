import { Frame, Tag } from '../components/modals/OnboardingArt';
import type { Release } from './index';

function Art() {
  return (
    <Frame className="h-[170px]">
      {/* sala com o selo REC em quem grava e o painel de voz com o cronômetro */}
      <div className="absolute top-4 left-4 w-[46%] space-y-1.5">
        {[
          ['Bia', true],
          ['Léo', false],
          ['Você', false],
        ].map(([name, rec]) => (
          <div key={name as string} className="flex items-center gap-2 rounded-xl bg-surface-3 px-2 py-1.5 text-[11px] font-semibold">
            <span className="h-5 w-5 rounded-full bg-accent/40" />
            <span className="flex-1">{name}</span>
            {rec && <span className="rounded-full bg-danger px-1.5 text-[9px] font-black text-white">REC</span>}
          </div>
        ))}
      </div>
      <div className="absolute right-4 bottom-4 w-[44%] rounded-2xl bg-surface-3 p-2.5">
        <div className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-ok" />
          <span className="flex-1 text-[11px] font-bold">Na sala</span>
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-danger">
            <span className="h-2 w-2 rounded-[2px] bg-white" />
          </span>
        </div>
        <div className="mt-2 flex items-center gap-1.5 rounded-lg bg-danger/15 px-2 py-1 text-[10px] font-semibold text-danger">
          <span className="h-1.5 w-1.5 rounded-full bg-danger" />
          Gravando 12:48
        </div>
      </div>
      <Tag className="top-4 right-4">Fica no seu computador</Tag>
    </Frame>
  );
}

export default {
  id: '2026-11-11-2328',
  title: 'Gravar a sala',
  highlights: [
    {
      kicker: 'Voz',
      title: 'Grave o áudio da call no seu computador',
      text: 'No painel da sala, o botão de gravar salva todas as vozes num arquivo, ou uma faixa para cada pessoa, para editar como podcast. Todo mundo na sala vê o selo REC em quem está gravando, e a gravação fica só com você: nada vai para o Concord.',
      art: Art,
    },
  ],
  also: ['Nova permissão "Gravar a sala", ligada para os moderadores. Quem gerencia o servidor escolhe quais cargos podem gravar e em quais salas.'],
  fixes: [],
} satisfies Release;
