import { Monitor, Smartphone } from 'lucide-react';
import { Frame, Tag } from '../components/modals/OnboardingArt';
import { useApp } from '../store/app';
import type { Release } from './index';

function DevicesArt() {
  const rows = [
    { icon: Monitor, label: 'App do Concord · Windows', sub: 'Este aparelho', current: true },
    { icon: Smartphone, label: 'Safari · iPhone', sub: 'Ativo há 2 h', current: false },
  ];
  return (
    <Frame className="flex h-[170px] flex-col justify-center gap-2 px-4">
      <span className="text-[11px] font-bold">Aparelhos conectados</span>
      {rows.map(({ icon: Icon, label, sub, current }) => (
        <div key={label} className="flex items-center gap-2 rounded-xl bg-surface-2 px-3 py-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-surface-4">
            <Icon size={12} className={current ? 'text-accent' : undefined} />
          </span>
          <div className="min-w-0 flex-1 text-[11px]">
            <div className="font-bold">{label}</div>
            <div className={current ? 'text-[10px] text-accent' : 'text-[10px] text-fg-muted'}>{sub}</div>
          </div>
          {!current && <span className="rounded-full bg-surface-4 px-2.5 py-1 text-[10px] font-bold">Sair</span>}
        </div>
      ))}
      <Tag className="top-2.5 right-3">Conta e segurança</Tag>
    </Frame>
  );
}

export default {
  id: '2026-11-09-2303',
  title: 'Aparelhos conectados',
  highlights: [
    {
      kicker: 'Conta',
      title: 'Veja onde a sua conta está aberta',
      text: 'Em Configurações, na parte de Conta e segurança, aparecem os aparelhos e navegadores conectados na sua conta. Não reconheceu algum? Tire ele da conta na hora, ou saia de todos os outros de uma vez.',
      art: DevicesArt,
      action: { label: 'Ver meus aparelhos', run: () => useApp.getState().openSettings('account') },
    },
  ],
  also: [
    'Sair da conta agora encerra a sessão de verdade: mesmo que alguém tenha copiado o acesso daquele aparelho, ele para de valer.',
    'Os links dos arquivos enviados nas conversas expiram em alguns dias. Quem está na conversa continua abrindo normalmente; um link que vazou para de funcionar.',
  ],
  fixes: ['Quem você bloqueou também não consegue mais chamar a sua atenção (e você também não chama a dela).'],
} satisfies Release;
