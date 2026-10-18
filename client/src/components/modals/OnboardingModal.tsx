import { useEffect, useState, type ReactNode } from 'react';
import { Gamepad2, Hash, Keyboard, Link2, Mic, MonitorUp, Palette, Shield, Sparkles } from 'lucide-react';
import { useApp } from '../../store/app';
import { Button, cx } from '../ui';

interface Slide {
  icon: ReactNode;
  title: string;
  text: string;
}

const SLIDES: Slide[] = [
  {
    icon: <Sparkles size={28} />,
    title: 'Bem-vindo ao Concord!',
    text: 'Um tour rápido pelas principais funções, pra você não se perder. Pode fechar quando quiser — ele reaparece no ícone de "?" ao lado das configurações, lá na barra de baixo.',
  },
  {
    icon: <Link2 size={28} />,
    title: 'Servidores e convites',
    text: 'Crie um servidor para você e seus amigos, ou entre em um com um link de convite. Convites podem ter validade e limite de usos, e dá para criar canais privados dentro do servidor.',
  },
  {
    icon: <Hash size={28} />,
    title: 'Canais de texto',
    text: 'Mensagens em tempo real, com edição, exclusão, indicador de "digitando…" e prévia de imagens. Digite "/" no campo de mensagem para ver a lista de comandos, ou "@" para mencionar alguém.',
  },
  {
    icon: <Mic size={28} />,
    title: 'Salas de voz',
    text: 'Microfone, câmera, ensurdecer, indicador de quem está falando e volume por pessoa. Tem supressão de ruído por IA e efeitos de voz (grossa, esquilo, robô, rádio...), tudo pelas setinhas na barra de baixo.',
  },
  {
    icon: <MonitorUp size={28} />,
    title: 'Transmissão de tela a 60 fps',
    text: 'Compartilhe a tela, uma janela ou uma aba em até 4K a 60 fps. Quem assiste clica em "Assistir" para baixar só o vídeo de quem quiser, com modo foco, tela cheia e estatísticas ao vivo.',
  },
  {
    icon: <Gamepad2 size={28} />,
    title: 'Mesa de sons, reações e minigames',
    text: 'Toque um som para a sala inteira com "/sound nome" ou pelo botão "+" do chat. Solte reações flutuantes no botão de coração, e jogue roleta, dado ou cara-ou-coroa com "/roleta", "/dado" e "/moeda".',
  },
  {
    icon: <Shield size={28} />,
    title: 'Cargos, permissões e moderação',
    text: 'Crie cargos com cor e hierarquia, e defina permissões por servidor ou por canal (permitir / herdar / negar). Para moderar, dá para silenciar na sala, encerrar transmissão, desconectar e expulsar.',
  },
  {
    icon: <Palette size={28} />,
    title: 'Deixe com a sua cara',
    text: 'Em Configurações → Aparência: 7 temas, cor de destaque, imagem de fundo e até CSS personalizado. Você também pode ter um apelido diferente em cada servidor.',
  },
  {
    icon: <Keyboard size={28} />,
    title: 'Atalhos, bots e mais',
    text: 'Ctrl+K abre a busca rápida entre servidores e conversas. Configure atalhos em Configurações → Atalhos, e crie bots controlados por API em Configurações → Bots.',
  },
];

export function OnboardingModal() {
  const saveSettings = useApp((s) => s.saveSettings);
  const closeModal = useApp((s) => s.closeModal);
  const [step, setStep] = useState(0);
  const last = step === SLIDES.length - 1;
  const slide = SLIDES[step];

  function finish() {
    void saveSettings({ onboarded: true });
    closeModal();
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') finish();
      else if (e.key === 'ArrowRight') setStep((s) => Math.min(s + 1, SLIDES.length - 1));
      else if (e.key === 'ArrowLeft') setStep((s) => Math.max(s - 1, 0));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      role="dialog"
      aria-label="Tutorial do Concord"
      className="fixed inset-0 z-50 flex animate-fade-in items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onMouseDown={finish}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-[480px] animate-pop-in flex-col overflow-hidden rounded-[28px] bg-surface-2 shadow-2xl ring-1 ring-line"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex flex-col items-center gap-4 px-8 pt-10 pb-6 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-accent/15 text-accent">{slide.icon}</div>
          <h2 className="text-xl font-bold">{slide.title}</h2>
          <p className="text-sm text-fg-muted">{slide.text}</p>
        </div>
        <div className="flex items-center justify-center gap-1.5 pb-6" role="tablist" aria-label="Passos do tutorial">
          {SLIDES.map((_, i) => (
            <button
              key={i}
              role="tab"
              aria-selected={i === step}
              aria-label={`Ir para o passo ${i + 1} de ${SLIDES.length}`}
              onClick={() => setStep(i)}
              className={cx('h-1.5 rounded-full transition-all', i === step ? 'w-6 bg-accent' : 'w-1.5 bg-surface-4 hover:bg-surface-4/80')}
            />
          ))}
        </div>
        <div className="flex items-center justify-between gap-2 border-t border-line px-6 py-4">
          <Button variant="ghost" onClick={finish}>
            {last ? 'Fechar' : 'Pular'}
          </Button>
          <div className="flex gap-2">
            {step > 0 && (
              <Button variant="secondary" onClick={() => setStep(step - 1)}>
                Voltar
              </Button>
            )}
            <Button onClick={() => (last ? finish() : setStep(step + 1))}>{last ? 'Começar a usar!' : 'Próximo'}</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
