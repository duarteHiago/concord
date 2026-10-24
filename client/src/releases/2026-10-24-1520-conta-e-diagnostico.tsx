import { ShieldCheck } from 'lucide-react';
import { Frame, Spot, Tag } from '../components/modals/OnboardingArt';
import { useApp } from '../store/app';
import type { Release } from './index';

function TwoFactorArt() {
  return (
    <Frame className="flex h-[170px] items-center justify-center gap-6">
      {/* celular com o app autenticador */}
      <div className="flex h-[130px] w-[78px] flex-col items-center gap-2 rounded-[18px] bg-surface-2 p-2 ring-1 ring-line-strong">
        <div className="h-1 w-6 rounded-full bg-surface-4" />
        <span className="mt-2 text-[9px] font-bold text-fg-muted">Concord</span>
        <span className="font-mono text-[15px] font-bold tracking-wider text-accent">482 913</span>
        <div className="h-1 w-12 overflow-hidden rounded-full bg-surface-4">
          <div className="h-full w-2/3 rounded-full bg-accent" />
        </div>
      </div>
      {/* campo do código no Concord */}
      <div className="flex flex-col gap-2">
        <span className="text-[10px] font-bold text-fg-muted">Código do app</span>
        <div className="flex gap-1">
          {'482913'.split('').map((d, i) => (
            <span key={i} className="flex h-7 w-5 items-center justify-center rounded-md bg-surface-3 font-mono text-xs font-bold">
              {d}
            </span>
          ))}
        </div>
        <Spot rounded="rounded-full" className="h-6 w-24 bg-accent text-[10px] font-bold text-on-accent">
          Entrar
        </Spot>
      </div>
      <Tag className="top-3 left-3">
        <ShieldCheck size={10} className="mr-1 inline" />
        Duas etapas
      </Tag>
    </Frame>
  );
}

function SendDiagnosticArt() {
  return (
    <Frame className="flex h-[170px] flex-col justify-center gap-2">
      <div className="flex items-center gap-2 text-[11px]">
        <b>Gravação pronta</b>
        <span className="text-fg-muted">12 min · 2 marcações</span>
      </div>
      <div className="rounded-xl bg-surface-3 px-3 py-2 text-[11px] text-fg-muted">a voz picotava quando a Bea transmitia a tela</div>
      <div className="flex gap-1.5">
        <Spot rounded="rounded-full" className="bg-accent px-3 py-1 text-[10px] font-bold text-on-accent">
          Enviar para a equipe
        </Spot>
        <span className="rounded-full bg-surface-3 px-3 py-1 text-[10px] font-bold">Baixar .json</span>
      </div>
      <Tag className="top-3 right-3">Chega direto pra equipe</Tag>
    </Frame>
  );
}

export default {
  id: '2026-10-24-1520',
  title: 'Verificação em duas etapas e diagnóstico',
  highlights: [
    {
      kicker: 'Conta',
      title: 'Proteja sua conta com um código do celular',
      text: 'Ligue a verificação em duas etapas em Configurações → Conta. Para entrar, além da senha, vai o código de 6 números de um app autenticador, como o Google ou o Microsoft Authenticator. Você também recebe códigos de backup para o caso de perder o celular.',
      art: TwoFactorArt,
      action: { label: 'Ligar agora', run: () => useApp.getState().openModal({ type: 'userSettings', tab: 'account' }) },
    },
    {
      kicker: 'Ajuda',
      title: 'Travou? Mande o diagnóstico direto pra gente',
      text: 'Grave em Configurações → Desenvolvedor, marque o momento em que deu problema e, ao parar, clique em "Enviar para a equipe" com uma frase sobre o que aconteceu. A gente vê a gravação com os gráficos e consegue achar a causa.',
      art: SendDiagnosticArt,
      action: { label: 'Abrir a gravação', run: () => useApp.getState().openModal({ type: 'userSettings', tab: 'dev' }) },
    },
  ],
  also: [
    'Botão de mostrar a senha enquanto você digita',
    'Patch de apoiador bordado, que dá para girar e ver de perto em 3D',
    'Tudo que chega ao Concord fica em Novidades, no ícone de jornal da fileira de servidores',
  ],
  fixes: [
    'O código da verificação em duas etapas passa mesmo com o relógio do celular adiantado ou atrasado',
    'Abrir a configuração da verificação em outra janela não troca mais o QR que você já escaneou',
  ],
} satisfies Release;
