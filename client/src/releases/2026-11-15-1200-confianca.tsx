import { ShieldCheck } from 'lucide-react';
import { Frame, Spot, Tag } from '../components/modals/OnboardingArt';
import type { Release } from './index';

function TrustArt() {
  return (
    <Frame className="flex h-[170px] items-center justify-center gap-5 px-6">
      {/* a aba Segurança do servidor, com as três exigências */}
      <div className="w-44 space-y-1.5 rounded-2xl bg-surface-3 p-3 ring-1 ring-line">
        <div className="mb-1 flex items-center gap-1.5 text-[10px] font-bold text-fg-muted">
          <ShieldCheck size={11} /> Segurança
        </div>
        {['Entrar', 'Falar', 'Transmitir'].map((label, i) => (
          <div key={label} className="flex items-center justify-between gap-2 rounded-lg bg-surface-1 px-2 py-1">
            <span className="text-[9px] font-semibold">{label}</span>
            {i === 2 ? (
              <Spot className="rounded-full">
                <span className="rounded-full bg-ok/20 px-1.5 text-[8px] font-bold text-ok">Só Alta</span>
              </Spot>
            ) : (
              <span className="rounded-full bg-surface-4 px-1.5 text-[8px] font-bold text-fg-muted">Qualquer</span>
            )}
          </div>
        ))}
      </div>
      {/* a faixa da própria conta */}
      <div className="w-28 rounded-2xl bg-surface-3 p-3 text-center ring-1 ring-line">
        <div className="text-[9px] font-bold text-fg-subtle uppercase">Sua confiança</div>
        <div className="mt-1 font-display text-lg font-bold text-ok">Alta</div>
      </div>
      <Tag className="right-3 bottom-3">Você escolhe o mínimo</Tag>
    </Frame>
  );
}

export default {
  id: '2026-11-15-1200',
  title: 'Fator de Confiança',
  highlights: [
    {
      kicker: 'Segurança',
      title: 'Seu servidor, suas exigências',
      text: 'Na nova aba Segurança das configurações do servidor (e de cada canal), escolha o mínimo que uma conta precisa ter para entrar, falar ou transmitir: e-mail confirmado e uma faixa de confiança. A confiança sobe com o tempo de conta, a verificação em duas etapas e o e-mail confirmado, e só desce quando a equipe do Concord confirma uma denúncia ou quando a conta é banida de servidores. Por padrão ninguém é bloqueado.',
      art: TrustArt,
    },
  ],
  also: [
    'Veja a confiança da sua conta em Configurações → Conta e segurança.',
    'Num canal que pede mais confiança, a caixa de mensagem e a sala de voz explicam o que falta.',
  ],
  fixes: [],
} satisfies Release;
