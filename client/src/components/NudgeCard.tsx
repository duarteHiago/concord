import { X, Zap } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { goToNudge, NUDGE_MESSAGE_EVENT, sendNudge, type NudgeMessage } from '../lib/nudge';
import { useApp } from '../store/app';
import { Avatar } from './ui';

/** Cartão "Fulano chamou sua atenção!" no topo da tela. */
export function NudgeCard() {
  const nudge = useApp((s) => s.nudge);

  useEffect(() => {
    if (!nudge) return;
    const t = setTimeout(() => useApp.setState({ nudge: null }), 10_000);
    return () => clearTimeout(t);
  }, [nudge]);

  if (!nudge) return null;
  const name = nudge.from.nickname || nudge.from.displayName;
  const close = () => useApp.setState({ nudge: null });

  return (
    <div role="alert" className="fixed top-6 left-1/2 z-[95] w-[min(440px,calc(100vw-32px))] -translate-x-1/2 animate-pop-in">
      <div className="flex items-center gap-3.5 rounded-[24px] bg-surface-3 p-3.5 shadow-2xl ring-2 ring-accent">
        <div className="nudge-shake">
          <Avatar name={name} color={nudge.from.avatarColor} src={nudge.from.avatarUrl} frame={nudge.from.frame} size={52} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 font-display text-[15px] font-bold">
            <Zap size={15} className="shrink-0 text-accent" />
            <span className="truncate">{name} chamou sua atenção!</span>
          </div>
          <div className="truncate text-xs text-fg-muted">em {nudge.serverName}</div>
          <div className="mt-2 flex gap-2">
            <button
              onClick={() => goToNudge(nudge)}
              className="h-8 rounded-full bg-accent px-3.5 font-display text-xs font-bold text-on-accent hover:bg-accent-hover"
            >
              {nudge.channelId ? 'Ir até a sala' : 'Ir até lá'}
            </button>
            <button
              onClick={() => {
                close();
                void sendNudge(nudge.serverId, nudge.from.id, name);
              }}
              className="h-8 rounded-full bg-surface-4 px-3.5 font-display text-xs font-bold hover:brightness-110"
            >
              Chamar de volta
            </button>
          </div>
        </div>
        <button onClick={close} aria-label="Fechar" className="flex h-8 w-8 shrink-0 items-center justify-center self-start rounded-full text-fg-muted hover:bg-surface-4 hover:text-fg">
          <X size={16} />
        </button>
      </div>
    </div>
  );
}

const NUDGE_MESSAGE_SHOW_MS = 10_000;

/** Mensagem opcional junto da tremida (navegador, ou app desktop antigo sem a janelinha nativa): passa e some sozinha, sem copiar. */
export function NudgeMessageToast() {
  const [msg, setMsg] = useState<NudgeMessage | null>(null);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    const onMsg = (e: Event) => {
      setMsg((e as CustomEvent<NudgeMessage>).detail);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setMsg(null), NUDGE_MESSAGE_SHOW_MS);
    };
    window.addEventListener(NUDGE_MESSAGE_EVENT, onMsg);
    return () => window.removeEventListener(NUDGE_MESSAGE_EVENT, onMsg);
  }, []);

  if (!msg) return null;
  return (
    <div role="alert" className="fixed top-5 left-1/2 z-[90] w-[min(440px,92vw)] -translate-x-1/2 animate-pop-in">
      <div className="relative overflow-hidden rounded-[22px] bg-popover p-4 pr-12 shadow-2xl ring-1 ring-line">
        <div className="text-xs text-fg-muted">
          <Zap size={12} className="-mt-0.5 mr-1 inline text-accent" />
          <b className="text-fg">{msg.from}</b> chamou sua atenção!
        </div>
        <p className="mt-1 line-clamp-3 max-w-full break-words font-display text-xl font-bold text-accent">{msg.text}</p>
        <button aria-label="Fechar" onClick={() => setMsg(null)} className="absolute top-3 right-3 flex h-8 w-8 items-center justify-center rounded-full text-fg-muted hover:bg-surface-3 hover:text-fg">
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
