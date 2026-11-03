import { Mail } from 'lucide-react';
import { Frame, Tag } from '../components/modals/OnboardingArt';
import { useApp } from '../store/app';
import type { Release } from './index';

function CodeArt() {
  return (
    <Frame className="flex h-[150px] flex-col items-center justify-center gap-3">
      <span className="flex items-center gap-1.5 text-xs font-bold">
        <Mail size={13} className="text-accent" /> Confira seu e-mail
      </span>
      <div className="flex gap-1.5">
        {['4', '8', '1', '5', '0', '9'].map((d, i) => (
          <span key={i} className="flex h-9 w-7 items-center justify-center rounded-lg bg-surface-2 font-mono text-lg font-bold">
            {d}
          </span>
        ))}
      </div>
      <Tag className="top-3 right-3">Código de 6 dígitos</Tag>
    </Frame>
  );
}

export default {
  id: '2026-11-03-0055',
  title: 'Conta confirmada por e-mail',
  highlights: [
    {
      kicker: 'Conta',
      title: 'Toda conta com senha agora tem um e-mail confirmado',
      text: 'Para segurar contas falsas criadas em massa, o cadastro pede um e-mail do Gmail, Outlook/Hotmail, Yahoo ou iCloud e manda um código de 6 dígitos para confirmar. Quem já tem conta sem e-mail vai cadastrar um na próxima vez que entrar. Quem entra pelo Google não precisa fazer nada.',
      art: CodeArt,
      action: { label: 'Ver meu e-mail', run: () => useApp.getState().openSettings('account') },
    },
  ],
  also: [
    'O cadastro e o "Esqueci minha senha" ganharam uma verificação anti-robô, quase sempre invisível.',
    'Mensagens mandadas rápido demais, em sequência, agora são seguradas por alguns segundos (contra flood e bots).',
  ],
} satisfies Release;
