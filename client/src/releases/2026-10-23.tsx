import { ArrowRight, Heart, Radio } from 'lucide-react';
import { SUPPORTER_TIERS } from '../../../shared/supporter.ts';
import { Frame, Tag } from '../components/modals/OnboardingArt';
import { SupporterPatch } from '../components/SupporterPatch';
import { useApp } from '../store/app';
import type { Release } from './index';

function H265Art() {
  return (
    <Frame className="h-[170px]">
      <div className="relative h-full overflow-hidden rounded-xl bg-linear-to-br from-surface-3 via-surface-2 to-surface-4">
        <div className="absolute top-[28%] left-[10%] h-[48%] w-[42%] rounded-lg bg-white/5 ring-1 ring-white/10" />
        <div className="absolute top-[16%] right-[8%] h-[62%] w-[30%] rounded-lg bg-accent/12 ring-1 ring-accent/25" />
        <div className="absolute top-2.5 left-2.5 flex gap-1.5">
          <span className="flex items-center gap-1 rounded-full bg-live px-2 py-0.5 text-[10px] font-bold text-white">
            <Radio size={10} /> AO VIVO
          </span>
          <span className="rounded-full bg-black/50 px-2 py-0.5 font-mono text-[10px]">1080p · 60 fps</span>
        </div>
        <div className="absolute right-2.5 bottom-2.5 w-36 space-y-1 rounded-lg bg-black/55 p-2 font-mono text-[10px] text-fg-muted">
          <div className="flex justify-between">
            <span>H.264</span>
            <span>banda</span>
          </div>
          <div className="h-1.5 rounded-full bg-fg-subtle" />
          <div className="flex justify-between text-fg">
            <span>H.265</span>
            <span>menos</span>
          </div>
          <div className="h-1.5 w-[62%] rounded-full bg-accent" />
        </div>
      </div>
    </Frame>
  );
}

function SupportArt() {
  const tiers = SUPPORTER_TIERS.slice(0, 3);
  return (
    <Frame className="flex h-[170px] items-center justify-center gap-3">
      {tiers.map((t, i) => (
        <div key={t.id} className="flex items-center gap-3">
          {i > 0 && <ArrowRight size={14} className="text-fg-subtle" />}
          <div className="flex flex-col items-center gap-1.5">
            <SupporterPatch tier={t.id} size={40 + i * 10} />
            <span className="font-mono text-[10px] text-fg-muted">{t.name}</span>
          </div>
        </div>
      ))}
      <Tag className="top-3 left-3">
        <Heart size={9} className="mr-1 inline" />
        Patch de apoiador
      </Tag>
    </Frame>
  );
}

export default {
  id: '2026-10-23',
  title: 'Tela mais leve e apoio via Pix',
  highlights: [
    {
      kicker: 'Transmissão',
      title: 'Tela em H.265: mais nítida gastando menos internet',
      text: 'Quando quem transmite e quem assiste suportam, a tela vai em H.265. Se alguém não suporta, volta pro H.264 sozinho, sem ninguém precisar mexer em nada.',
      art: H265Art,
      action: { label: 'Ver se meu PC suporta', run: () => window.open('/compatibilidade', '_blank', 'noopener') },
    },
    {
      kicker: 'Apoio',
      title: 'Apoie o Concord com Pix e ganhe um patch que sobe de nível',
      text: 'É voluntário e não libera nada a mais: tudo continua grátis. O patch aparece no seu perfil e ganha acabamentos mais raros conforme o total apoiado.',
      art: SupportArt,
      action: { label: 'Conhecer o apoio', run: () => useApp.getState().openModal({ type: 'support' }) },
    },
  ],
  also: ['Página de compatibilidade explicando o H.265 navegador por navegador', 'Seção de apoio na página inicial do site'],
  fixes: ['Links longos não escapam mais do balão da mensagem'],
} satisfies Release;
