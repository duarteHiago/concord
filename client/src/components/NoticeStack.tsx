// Aviso de mensagem/menção dentro do app, à moda do iPhone/Mac (escolha do usuário, nov/2026): vidro fosco, foto
// da pessoa com o símbolo do Concord no canto, "agora" à direita e sem botões. Clicar abre a conversa, arrastar
// para cima dispensa, o X aparece com o mouse em cima. Vários avisos empilham: os mais antigos ficam por trás.
import { X } from 'lucide-react';
import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { desktop } from '../lib/desktop';
import { openNoticeTarget } from '../lib/notify';
import { useMobile } from '../lib/mobile';
import { useNotices, type Notice } from '../store/notices';
import { TITLE_BAR_HEIGHT } from './TitleBar';
import { Avatar, cx } from './ui';

const SHOW_MS = 5000;

export function NoticeStack() {
  const list = useNotices((s) => s.list);
  const mobile = useMobile();
  if (!list.length) return null;
  return (
    <div
      aria-live="polite"
      className={cx('pointer-events-none fixed z-[150] h-[124px]', mobile ? 'left-1/2 w-[min(380px,calc(100vw-24px))] -translate-x-1/2' : 'right-4 w-[360px]')}
      style={{ top: (desktop?.windowControl ? TITLE_BAR_HEIGHT : 0) + 12 }}
    >
      {list.map((n, i) => (
        <NoticeCard key={n.id} notice={n} depth={i} />
      ))}
    </div>
  );
}

function NoticeCard({ notice, depth }: { notice: Notice; depth: number }) {
  const dismiss = useNotices((s) => s.dismiss);
  const clear = useNotices((s) => s.clear);
  const [phase, setPhase] = useState<'in' | 'shown' | 'out'>('in');
  const [drag, setDrag] = useState(0);
  const start = useRef<number | null>(null);
  const timer = useRef<number>(0);

  const leave = () => {
    window.clearTimeout(timer.current);
    setPhase('out');
    window.setTimeout(() => dismiss(notice.id), 350);
  };
  const arm = () => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(leave, SHOW_MS);
  };

  useEffect(() => {
    // um quadro na posição de entrada (acima da tela) e solta: a transição faz a mola
    const raf = requestAnimationFrame(() => setPhase('shown'));
    arm();
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    if ((e.target as HTMLElement).closest('button')) return;
    start.current = e.clientY;
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
    window.clearTimeout(timer.current);
  }
  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    if (start.current === null) return;
    setDrag(Math.min(0, e.clientY - start.current));
  }
  function onPointerUp() {
    if (start.current === null) return;
    start.current = null;
    if (drag < -30) return leave();
    if (drag > -4) {
      // toque simples: abre a conversa e some com a pilha toda
      openNoticeTarget(notice.target);
      clear();
      return;
    }
    setDrag(0);
    arm();
  }

  // os de trás: menores, mais baixos e sem conteúdo, como no iPhone
  const behind = depth > 0;
  const transform =
    phase === 'in' || phase === 'out'
      ? 'translateY(-130%)'
      : drag
        ? `translateY(${drag}px)`
        : depth === 0
          ? 'none'
          : `translateY(${depth === 1 ? 10 : 19}px) scale(${depth === 1 ? 0.94 : 0.88})`;
  const opacity = phase === 'shown' ? (depth === 0 ? 1 : depth === 1 ? 0.85 : depth === 2 ? 0.6 : 0) : 0;

  return (
    <div
      role="status"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onMouseEnter={() => window.clearTimeout(timer.current)}
      onMouseLeave={() => start.current === null && phase === 'shown' && arm()}
      className={cx(
        'group pointer-events-auto absolute inset-x-0 top-0 flex origin-top cursor-pointer touch-none items-start gap-3 rounded-[22px] px-3.5 py-3 select-none',
        'bg-surface-2/75 shadow-[0_10px_30px_rgb(15_27_61/0.18)] ring-1 ring-line backdrop-blur-2xl backdrop-saturate-150',
        drag ? '' : 'transition-[transform,opacity] duration-[450ms] ease-[cubic-bezier(.2,.9,.25,1.12)] motion-reduce:transition-opacity',
      )}
      style={{ transform, opacity, zIndex: 10 - depth }}
    >
      <div className={cx('contents', behind && '[&>*]:invisible')}>
        <button
          aria-label="Fechar aviso"
          onClick={(e) => {
            e.stopPropagation();
            leave();
          }}
          className="absolute -top-1.5 -left-1.5 flex h-[22px] w-[22px] items-center justify-center rounded-full bg-surface-2/90 text-fg-muted opacity-0 shadow ring-1 ring-line backdrop-blur-xl transition-opacity group-hover:opacity-100 hover:text-fg focus-visible:opacity-100"
        >
          <X size={11} strokeWidth={3} />
        </button>
        <div className="relative shrink-0">
          <Avatar name={notice.who} color={notice.avatar.color} src={notice.avatar.url} size={40} />
          <img src="/brand/concord-simbolo.svg" alt="" className="absolute -right-1 -bottom-1 h-[18px] w-[18px] rounded-md bg-surface-2 p-px ring-[1.5px] ring-surface-2" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="min-w-0 flex-1 truncate text-[15px] font-extrabold text-fg">{notice.who}</span>
            <span className="shrink-0 text-xs text-fg-subtle">agora</span>
          </div>
          <div className="truncate text-[13px] font-semibold text-fg-muted">{notice.where}</div>
          <div className="mt-px line-clamp-2 text-sm leading-snug wrap-anywhere text-fg">
            <NoticeText text={notice.text} mention={notice.mention} />
          </div>
        </div>
      </div>
    </div>
  );
}

/** Texto com o @ na cor do tema (só nas menções). */
function NoticeText({ text, mention }: { text: string; mention: boolean }) {
  if (!mention) return <>{text}</>;
  return (
    <>
      {text.split(/(@[a-zA-Z0-9_.]{3,32})/g).map((part, i) =>
        i % 2 === 1 ? (
          <span key={i} className="font-bold text-accent">
            {part}
          </span>
        ) : (
          part
        ),
      )}
    </>
  );
}
