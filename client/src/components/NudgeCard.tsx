import { X, Zap } from 'lucide-react';
import { useEffect } from 'react';
import { goToNudge, sendNudge } from '../lib/nudge';
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
          {nudge.message && <p className="mt-1.5 line-clamp-3 break-words text-sm font-bold text-accent">{nudge.message}</p>}
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
