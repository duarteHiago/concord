import { Gem, MicOff, PhoneOff, ShieldCheck, Sparkles, Wand2 } from 'lucide-react';
import { Frame, Tag } from '../components/modals/OnboardingArt';
import { useApp } from '../store/app';
import type { Release } from './index';

function ContractArt() {
  return (
    <Frame className="flex h-[160px] flex-col justify-center gap-2 px-4">
      <div className="flex items-center justify-between rounded-xl bg-surface-2 px-3 py-2 text-[11px]">
        <span className="flex items-center gap-1.5 font-bold">
          <Gem size={12} className="text-warn" /> Mecenas agora
        </span>
        <span className="font-bold">Você</span>
      </div>
      <div className="flex items-center justify-between rounded-xl bg-surface-2 px-3 py-2 text-[11px]">
        <span className="text-fg-muted">Apoio total</span>
        <span className="font-bold">R$ 60 × R$ 45</span>
      </div>
      <div className="flex items-center gap-2 rounded-xl bg-surface-2 px-3 py-2 text-[11px]">
        <ShieldCheck size={12} className="text-accent" />
        <span className="min-w-0 flex-1 text-fg-muted">Escudo</span>
        <div className="h-1.5 w-20 overflow-hidden rounded-full bg-surface-4">
          <div className="h-full w-2/3 rounded-full bg-accent" />
        </div>
      </div>
      <Tag className="top-2.5 right-3">Quem apoia mais, manda</Tag>
    </Frame>
  );
}

function PranksArt() {
  const items = [
    { icon: MicOff, label: 'Silenciar' },
    { icon: PhoneOff, label: 'Tirar da sala' },
    { icon: Wand2, label: 'Efeito surpresa' },
  ];
  return (
    <Frame className="flex h-[160px] flex-col justify-center gap-2.5 px-4">
      <span className="flex items-center gap-1.5 text-xs font-bold">
        <Sparkles size={13} className="text-warn" /> Sacanagens e Peripécias
      </span>
      <div className="grid grid-cols-3 gap-2">
        {items.map(({ icon: Icon, label }) => (
          <div key={label} className="flex flex-col items-center gap-1 rounded-xl bg-surface-2 py-2.5 text-[10px] font-bold">
            <Icon size={15} />
            {label}
          </div>
        ))}
      </div>
      <Tag className="top-2.5 right-3">Configurações → Mecenato</Tag>
    </Frame>
  );
}

export default {
  id: '2026-10-30-0516',
  title: 'Contratos de Mecenato',
  highlights: [
    {
      kicker: 'Mecenato',
      title: 'Feche um contrato: quem apoia mais vira o Mecenas',
      text: 'Duas pessoas que apoiam o Concord combinam um prazo de até 30 dias. Quem tem mais apoio no total é o Mecenas, e a liderança vira sozinha se o outro passar. Cada um tem um Escudo de 3 h para se proteger, e dá para sair antes pagando a multa, ou por segurança, sem multa.',
      art: ContractArt,
      action: { label: 'Abrir o Mecenato', run: () => useApp.getState().openSettings('mecenato') },
    },
    {
      kicker: 'Mecenato',
      title: 'Sacanagens e Peripécias',
      text: 'Clique no contrato em vigor para abrir os poderes do Mecenas: silenciar, ensurdecer, tirar da sala, trocar o apelido e a foto, e soltar um efeito de voz surpresa de até 5 segundos. Tudo fica no histórico do contrato.',
      art: PranksArt,
    },
  ],
  also: [
    'O Mecenas que já existia virou um contrato: as duas pessoas recebem um convite de renovação ao entrar no app.',
    'A landing page ganhou uma seção explicando como funcionam os contratos.',
  ],
} satisfies Release;
