import { useEffect, useState } from 'react';
import { markPlayed, type LiveGameEvent } from '../lib/liveGames';
import { playWin } from '../lib/sounds';
import { HOME, useApp } from '../store/app';
import { Coin3D, Confetti, DiceSet, Wheel } from './GameVisuals';
import { GameResult } from './Games';
import { Avatar, cx } from './ui';

/** O jogo aconteceu num lugar que a pessoa está olhando agora? */
function isWatching(e: LiveGameEvent): boolean {
  if (document.hidden) return false;
  const st = useApp.getState();
  if (e.where.kind === 'dm') return st.activeServerId === HOME && st.activeDmId === e.where.id;
  return !!st.activeServerId && st.activeServerId !== HOME && st.activeChannels[st.activeServerId] === e.where.id;
}

/** Palco grande dos minigames por cima da tela; depois o resultado fica no chat. */
export function GameOverlay() {
  const [queue, setQueue] = useState<LiveGameEvent[]>([]);
  const [phase, setPhase] = useState<'playing' | 'result'>('playing');
  const current = queue[0];

  useEffect(() => {
    const onGame = (e: Event) => {
      const ev = (e as CustomEvent<LiveGameEvent>).detail;
      if (!isWatching(ev)) return;
      markPlayed(ev.message.id); // o cartão do chat já aparece com o resultado
      setQueue((q) => [...q, ev]);
    };
    window.addEventListener('concord:game', onGame);
    return () => window.removeEventListener('concord:game', onGame);
  }, []);

  useEffect(() => setPhase('playing'), [current?.message.id]);

  useEffect(() => {
    if (phase !== 'result') return;
    playWin();
    const t = setTimeout(() => setQueue((q) => q.slice(1)), 2600);
    return () => clearTimeout(t);
  }, [phase]);

  useEffect(() => {
    if (!current) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setQueue((q) => q.slice(1));
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [current]);

  if (!current) return null;
  const { message } = current;
  const data = message.data!;
  const me = useApp.getState().me;
  const who = message.author.id === me?.id ? 'Você' : message.author.displayName;
  const action = data.type === 'roulette' ? 'girou a roleta' : data.type === 'dice' ? `rolou ${data.count}d${data.sides}` : 'jogou cara ou coroa';
  const finish = () => setPhase('result');

  return (
    <div
      role="dialog"
      aria-label={`${who} ${action}`}
      onClick={() => setQueue((q) => q.slice(1))}
      className="fixed inset-0 z-[85] flex animate-fade-in items-center justify-center bg-black/55 p-6 backdrop-blur-sm"
    >
      <div className="relative flex w-[min(460px,92vw)] animate-pop-in flex-col items-center rounded-[32px] bg-popover px-8 pt-7 pb-8 shadow-2xl ring-1 ring-line-strong">
        <div className="mb-6 flex items-center gap-2.5">
          <Avatar name={message.author.displayName} color={message.author.avatarColor} src={message.author.avatarUrl} size={32} />
          <span className="font-display text-lg font-bold">
            {who} <span className="font-normal text-fg-muted">{action}</span>
          </span>
        </div>

        <div className="flex min-h-[200px] items-center justify-center">
          {data.type === 'roulette' ? (
            <Wheel key={message.id} data={data} size={320} animate sound onDone={finish} />
          ) : data.type === 'dice' ? (
            <div className="pt-24">
              <DiceSet key={message.id} data={data} size={data.count > 4 ? 64 : 92} animate sound onDone={finish} />
            </div>
          ) : (
            <div className="pt-28">
              <Coin3D key={message.id} data={data} size={150} animate sound onDone={finish} />
            </div>
          )}
        </div>

        <div className={cx('mt-6 text-center transition-all duration-300', phase === 'result' ? 'scale-100 opacity-100' : 'scale-90 opacity-0')}>
          <GameResult data={data} big />
        </div>
        {phase === 'result' && <Confetti key={`c-${message.id}`} />}
        <p className="absolute bottom-2.5 text-[11px] text-fg-subtle">clique para fechar</p>
      </div>
    </div>
  );
}
