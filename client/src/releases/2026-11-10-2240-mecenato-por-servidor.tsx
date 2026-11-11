import { Layers } from 'lucide-react';
import { Frame, Tag } from '../components/modals/OnboardingArt';
import { useApp } from '../store/app';
import type { Release } from './index';

function ServersArt() {
  const rows = [
    { name: 'Faculdade', color: 'bg-warn', on: true },
    { name: 'Galera do Fim de Semana', color: 'bg-accent-2', on: true },
    { name: 'Valorant', color: 'bg-danger', on: false },
  ];
  return (
    <Frame className="flex h-[170px] flex-col justify-center gap-1.5 px-4">
      <div className="flex items-center gap-2 rounded-xl bg-surface-2 px-3 py-1.5 text-[11px] font-bold">
        <span className="h-3.5 w-3.5 rounded border-2 border-fg-subtle" />
        <Layers size={12} className="text-accent" /> Todos os servidores
      </div>
      {rows.map((r) => (
        <div key={r.name} className="flex items-center gap-2 rounded-xl bg-surface-2 px-3 py-1.5 text-[11px]">
          <span className={r.on ? 'h-3.5 w-3.5 rounded bg-accent' : 'h-3.5 w-3.5 rounded border-2 border-fg-subtle'} />
          <span className={`h-4 w-4 rounded-md ${r.color}`} />
          <span className="font-semibold">{r.name}</span>
        </div>
      ))}
      <Tag className="top-2.5 right-3">Onde o contrato vale</Tag>
    </Frame>
  );
}

export default {
  id: '2026-11-10-2240',
  title: 'Contratos por servidor',
  highlights: [
    {
      kicker: 'Mecenato',
      title: 'Escolha onde o contrato vale',
      text: 'Ao propor um contrato, marque em quais servidores os poderes do Mecenas valem (ou todos de uma vez). Fora deles, nada muda: nem silenciar, nem apelido, nem a foto, que agora aparece só nesses servidores. Quem recebe o convite vê a lista antes de aceitar.',
      art: ServersArt,
      action: { label: 'Abrir o Mecenato', run: () => useApp.getState().openSettings('mecenato') },
    },
  ],
  also: ['A foto escolhida pelo Mecenas não troca mais a foto da conta: o perfil e as conversas privadas seguem com a sua, e você pode trocá-la quando quiser.'],
} satisfies Release;
