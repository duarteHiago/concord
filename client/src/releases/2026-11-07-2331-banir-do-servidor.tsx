import { Ban } from 'lucide-react';
import { Frame, Spot, Tag } from '../components/modals/OnboardingArt';
import type { Release } from './index';

function BanArt() {
  return (
    <Frame className="flex h-[170px] items-center justify-center gap-5 px-6">
      {/* cartão do membro com o botão de banir */}
      <div className="w-36 rounded-xl bg-surface-3 p-3 ring-1 ring-line">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-full bg-fg-subtle/40" />
          <div className="flex-1 space-y-1">
            <div className="h-2 w-16 rounded bg-fg-subtle/40" />
            <div className="h-1.5 w-10 rounded bg-fg-subtle/20" />
          </div>
        </div>
        <div className="mt-3 space-y-1">
          <div className="h-5 rounded-md bg-surface-4" />
          <Spot rounded="rounded-md">
            <div className="flex h-5 items-center gap-1 rounded-md bg-danger/15 px-1.5 text-[9px] font-bold text-danger">
              <Ban size={10} /> Banir
            </div>
          </Spot>
        </div>
      </div>
      {/* a aba Banidos */}
      <div className="w-40 rounded-xl bg-surface-3 p-3 ring-1 ring-line">
        <div className="mb-2 flex items-center gap-1 text-[10px] font-bold text-fg">
          <Ban size={11} /> Banidos
        </div>
        {[0, 1].map((i) => (
          <div key={i} className="mb-1.5 flex items-center gap-1.5">
            <div className="h-5 w-5 rounded-full bg-fg-subtle/30" />
            <div className="h-1.5 flex-1 rounded bg-fg-subtle/25" />
            <div className="rounded bg-surface-4 px-1 text-[8px] text-fg-muted">Desbanir</div>
          </div>
        ))}
      </div>
      <Tag className="right-3 bottom-3">Não volta nem com convite</Tag>
    </Frame>
  );
}

export default {
  id: '2026-11-07-2331',
  title: 'Banir do servidor',
  highlights: [
    {
      kicker: 'Moderação',
      title: 'Quem atrapalha sai e não volta',
      text: 'Expulsar deixava a pessoa voltar com qualquer convite. Agora dá para banir: ela sai do servidor, cai da sala de voz e não consegue entrar de novo. O botão fica no cartão da pessoa, e quem está banido aparece em Configurações do servidor → Banidos, onde dá para desbanir.',
      art: BanArt,
    },
  ],
  also: [
    'Comando /ban @pessoa no chat, para quem modera pelo teclado.',
    'Permissão nova, "Banir membros". Os donos e admins já têm. Para dar a outro cargo, ligue a permissão em Configurações do servidor → Cargos.',
  ],
  fixes: [],
} satisfies Release;
