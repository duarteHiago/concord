import { useEffect, useState, type ComponentType } from 'react';
import { useApp } from '../../store/app';
import { Button, cx } from '../ui';
import {
  AppearanceArt,
  ChannelsArt,
  ExtrasArt,
  OverviewArt,
  RolesArt,
  ScreenShareArt,
  ServersArt,
  ShortcutsArt,
  VoiceArt,
} from './OnboardingArt';

interface Slide {
  art: ComponentType;
  title: string;
  text: string;
}

const SLIDES: Slide[] = [
  {
    art: OverviewArt,
    title: 'Bem-vindo ao Concord!',
    text: 'Um tour rápido pelas principais funções, pra você não se perder. Pode fechar quando quiser — ele reaparece no ícone de "?" ao lado das configurações, lá na barra de baixo.',
  },
  {
    art: ServersArt,
    title: 'Servidores e convites',
    text: 'Crie um servidor para você e seus amigos, ou entre em um com um link de convite. Convites podem ter validade e limite de usos, e dá para criar canais privados dentro do servidor.',
  },
  {
    art: ChannelsArt,
    title: 'Canais de texto',
    text: 'Mensagens em tempo real, com edição, exclusão, indicador de "digitando…" e prévia de imagens. Digite "/" no campo de mensagem para ver a lista de comandos, ou "@" para mencionar alguém.',
  },
  {
    art: VoiceArt,
    title: 'Salas de voz',
    text: 'Microfone, câmera, ensurdecer, indicador de quem está falando e volume por pessoa. Tem supressão de ruído por IA e efeitos de voz (grossa, esquilo, robô, rádio...), tudo pelas setinhas na barra de baixo.',
  },
  {
    art: ScreenShareArt,
    title: 'Transmissão de tela a 60 fps',
    text: 'Compartilhe a tela, uma janela ou uma aba em até 4K a 60 fps. Quem assiste clica em "Assistir" para baixar só o vídeo de quem quiser, com modo foco, tela cheia e estatísticas ao vivo.',
  },
  {
    art: ExtrasArt,
    title: 'Mesa de sons, reações e minigames',
    text: 'Toque um som para a sala inteira com "/sound nome" ou pelo botão "+" do chat. Solte reações flutuantes no botão de coração, e jogue roleta, dado ou cara-ou-coroa com "/roleta", "/dado" e "/moeda".',
  },
  {
    art: RolesArt,
    title: 'Cargos, permissões e moderação',
    text: 'Crie cargos com cor e hierarquia, e defina permissões por servidor ou por canal (permitir / herdar / negar). Para moderar, dá para silenciar na sala, encerrar transmissão, desconectar e expulsar.',
  },
  {
    art: AppearanceArt,
    title: 'Deixe com a sua cara',
    text: 'Em Configurações → Aparência: 7 temas, cor de destaque, imagem de fundo e até CSS personalizado. Você também pode ter um apelido diferente em cada servidor.',
  },
  {
    art: ShortcutsArt,
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
  const Art = slide.art;

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
        className="flex max-h-[90vh] w-full max-w-[460px] animate-pop-in flex-col overflow-hidden rounded-[28px] bg-surface-2 shadow-2xl ring-1 ring-line"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex flex-col gap-4 px-6 pt-6 pb-2 text-center">
          <Art />
          <div>
            <h2 className="text-lg font-bold">{slide.title}</h2>
            <p className="mt-1.5 text-sm text-fg-muted">{slide.text}</p>
          </div>
        </div>
        <div className="flex items-center justify-center gap-1.5 py-5" role="tablist" aria-label="Passos do tutorial">
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
