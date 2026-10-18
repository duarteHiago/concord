import { Coins, Dices, Disc3, Plus, Trash2, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import type { GameData } from '../lib/types';
import { useApp } from '../store/app';
import { toast } from '../store/toast';
import { Button, Modal, cx } from './ui';

/** Onde o jogo é publicado: canal de servidor ou conversa privada. */
export type GameTarget = { kind: 'channel' | 'dm'; id: string };

export const gameEndpoint = (t: GameTarget) => (t.kind === 'channel' ? `/channels/${t.id}/games` : `/dms/${t.id}/games`);

export async function playGame(target: GameTarget, body: Record<string, unknown>) {
  try {
    await api.post(gameEndpoint(target), body);
  } catch (err) {
    toast.error(err);
  }
}

const COLORS = ['#ff8a6b', '#c4a5ff', '#5eead4', '#f5c451', '#7c9cff', '#ff6b9a', '#8fd4b8', '#ffb547'];

/** Cartão do jogo dentro do chat. "fresh" = acabou de acontecer, então anima. */
export function GameCard({ data, fresh, author }: { data: GameData; fresh: boolean; author: string }) {
  if (data.type === 'roulette') return <Roulette data={data} fresh={fresh} author={author} />;
  if (data.type === 'dice') return <Dice data={data} fresh={fresh} author={author} />;
  return <Coin data={data} fresh={fresh} author={author} />;
}

function Roulette({ data, fresh, author }: { data: Extract<GameData, { type: 'roulette' }>; fresh: boolean; author: string }) {
  const n = data.items.length;
  const seg = 360 / n;
  // gira algumas voltas e para com o meio da fatia sorteada embaixo do ponteiro (no topo)
  const final = data.turns * 360 + (360 - (data.result + 0.5) * seg);
  const [angle, setAngle] = useState(fresh ? 0 : final);
  const [done, setDone] = useState(!fresh);

  useEffect(() => {
    if (!fresh) return;
    const t1 = requestAnimationFrame(() => setAngle(final));
    const t2 = setTimeout(() => setDone(true), 4600);
    return () => {
      cancelAnimationFrame(t1);
      clearTimeout(t2);
    };
  }, [fresh, final]);

  const r = 90;
  const slice = (i: number) => {
    const a0 = ((i * seg - 90) * Math.PI) / 180;
    const a1 = (((i + 1) * seg - 90) * Math.PI) / 180;
    const large = seg > 180 ? 1 : 0;
    return `M100 100 L${100 + r * Math.cos(a0)} ${100 + r * Math.sin(a0)} A${r} ${r} 0 ${large} 1 ${100 + r * Math.cos(a1)} ${100 + r * Math.sin(a1)} Z`;
  };

  return (
    <div className="w-[260px] rounded-[22px] bg-surface-2 p-4 text-fg">
      <div className="mb-2 flex items-center gap-1.5 text-xs font-bold text-fg-muted">
        <Disc3 size={14} className="text-accent" /> {author} girou a roleta
      </div>
      <div className="relative mx-auto h-[200px] w-[200px]">
        <svg viewBox="0 0 200 200" className="h-full w-full" role="img" aria-label={`Roleta com ${n} opções`}>
          <g
            style={{
              transform: `rotate(${angle}deg)`,
              transformOrigin: '100px 100px',
              transition: fresh ? 'transform 4.5s cubic-bezier(0.15, 0.7, 0.1, 1)' : 'none',
            }}
          >
            {data.items.map((item, i) => {
              const mid = (((i + 0.5) * seg - 90) * Math.PI) / 180;
              return (
                <g key={i}>
                  <path d={slice(i)} fill={COLORS[i % COLORS.length]} stroke="#17121c" strokeWidth="1.5" />
                  <text
                    x={100 + 58 * Math.cos(mid)}
                    y={100 + 58 * Math.sin(mid)}
                    fill="#1a1014"
                    fontSize={n > 10 ? 8 : 11}
                    fontWeight="700"
                    textAnchor="middle"
                    dominantBaseline="middle"
                    transform={`rotate(${(i + 0.5) * seg} ${100 + 58 * Math.cos(mid)} ${100 + 58 * Math.sin(mid)})`}
                  >
                    {item.length > 12 ? `${item.slice(0, 11)}…` : item}
                  </text>
                </g>
              );
            })}
          </g>
          <circle cx="100" cy="100" r="14" fill="#17121c" stroke="#f3ecf7" strokeWidth="3" />
          <path d="M100 4 L92 22 L108 22 Z" fill="#f3ecf7" stroke="#17121c" strokeWidth="1.5" />
        </svg>
      </div>
      <div className={cx('mt-3 text-center transition-opacity duration-300', done ? 'opacity-100' : 'opacity-0')}>
        <div className="text-xs text-fg-muted">Resultado</div>
        <div className="font-display text-lg font-bold text-accent">{data.items[data.result]}</div>
      </div>
    </div>
  );
}

function Dice({ data, fresh, author }: { data: Extract<GameData, { type: 'dice' }>; fresh: boolean; author: string }) {
  const [shown, setShown] = useState(fresh ? data.rolls.map(() => 1) : data.rolls);
  const [done, setDone] = useState(!fresh);
  useEffect(() => {
    if (!fresh) return;
    const id = setInterval(() => setShown(data.rolls.map(() => 1 + Math.floor(Math.random() * data.sides))), 70);
    const stop = setTimeout(() => {
      clearInterval(id);
      setShown(data.rolls);
      setDone(true);
    }, 1200);
    return () => {
      clearInterval(id);
      clearTimeout(stop);
    };
  }, [fresh, data]);
  const total = data.rolls.reduce((a, b) => a + b, 0);
  return (
    <div className="min-w-[200px] rounded-[22px] bg-surface-2 p-4 text-fg">
      <div className="mb-3 flex items-center gap-1.5 text-xs font-bold text-fg-muted">
        <Dices size={14} className="text-accent" /> {author} rolou {data.count}d{data.sides}
      </div>
      <div className="flex flex-wrap gap-2">
        {shown.map((v, i) => (
          <span key={i} className={cx('flex h-12 min-w-12 items-center justify-center rounded-2xl bg-accent px-2 font-display text-xl font-bold text-on-accent', !done && 'animate-pulse')}>
            {v}
          </span>
        ))}
      </div>
      {data.count > 1 && done && <div className="mt-2 text-sm text-fg-muted">Total: <b className="text-fg">{total}</b></div>}
    </div>
  );
}

function Coin({ data, fresh, author }: { data: Extract<GameData, { type: 'coin' }>; fresh: boolean; author: string }) {
  const [done, setDone] = useState(!fresh);
  useEffect(() => {
    if (!fresh) return;
    const t = setTimeout(() => setDone(true), 1300);
    return () => clearTimeout(t);
  }, [fresh]);
  return (
    <div className="min-w-[200px] rounded-[22px] bg-surface-2 p-4 text-center text-fg">
      <div className="mb-3 flex items-center justify-center gap-1.5 text-xs font-bold text-fg-muted">
        <Coins size={14} className="text-accent" /> {author} jogou cara ou coroa
      </div>
      <div
        className={cx('mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-warn font-display text-lg font-bold text-surface-1 shadow-lg', !done && 'coin-flip')}
      >
        {done ? (data.result === 'cara' ? 'Cara' : 'Coroa') : ''}
      </div>
    </div>
  );
}

/** Botão "+" do campo de mensagem com os minigames. */
export function GameMenuButton({ target }: { target: GameTarget }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const openModal = useApp((s) => s.openModal);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [open]);

  const item = (icon: React.ReactNode, label: string, hint: string, onClick: () => void) => (
    <button
      onClick={() => {
        setOpen(false);
        onClick();
      }}
      className="flex w-full items-center gap-3 rounded-2xl px-3 py-2 text-left hover:bg-surface-4"
    >
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent/15 text-accent">{icon}</span>
      <span>
        <span className="block text-sm font-bold">{label}</span>
        <span className="block text-xs text-fg-muted">{hint}</span>
      </span>
    </button>
  );

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        aria-label="Minigames"
        title="Minigames"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className={cx('flex h-[50px] w-[50px] items-center justify-center rounded-full transition-colors', open ? 'bg-accent text-on-accent' : 'bg-surface-3 text-fg-muted hover:text-fg')}
      >
        <Plus size={20} className={cx('transition-transform', open && 'rotate-45')} />
      </button>
      {open && (
        <div className="absolute bottom-full left-0 z-30 mb-2 w-64 animate-pop-in rounded-3xl bg-surface-3 p-2 shadow-2xl ring-1 ring-line">
          <div className="px-3 pt-1 pb-1.5 text-xs font-bold text-fg-subtle">Minigames</div>
          {item(<Disc3 size={18} />, 'Roleta', 'Monte as opções e gire', () => openModal({ type: 'roulette', target }))}
          {item(<Dices size={18} />, 'Rolar dado', '1d6 (ou /dado 2d20)', () => void playGame(target, { type: 'dice', sides: 6, count: 1 }))}
          {item(<Coins size={18} />, 'Cara ou coroa', 'Para decidir na sorte', () => void playGame(target, { type: 'coin' }))}
        </div>
      )}
    </div>
  );
}

const ROULETTE_KEY = 'concord.rouletteItems';

/** Janela para montar a roleta (as últimas opções ficam salvas). */
export function RouletteModal({ target }: { target: GameTarget }) {
  const close = useApp((s) => s.closeModal);
  const [items, setItems] = useState<string[]>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(ROULETTE_KEY) ?? '[]');
      return Array.isArray(saved) && saved.length >= 2 ? saved : ['Pizza', 'Hambúrguer', 'Japonês'];
    } catch {
      return ['Pizza', 'Hambúrguer', 'Japonês'];
    }
  });
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(false);
  const valid = items.filter((i) => i.trim()).length >= 2;

  const add = () => {
    const v = draft.trim();
    if (!v || items.length >= 24) return;
    setItems([...items, v.slice(0, 40)]);
    setDraft('');
  };

  async function spin() {
    const clean = items.map((i) => i.trim()).filter(Boolean);
    try {
      localStorage.setItem(ROULETTE_KEY, JSON.stringify(clean));
    } catch {
      // ignorado
    }
    setLoading(true);
    await playGame(target, { type: 'roulette', items: clean });
    setLoading(false);
    close();
  }

  return (
    <Modal
      title="Roleta"
      subtitle="Adicione as opções e gire. O resultado é sorteado pelo servidor e todo mundo vê a mesma roleta girando."
      onClose={close}
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            Cancelar
          </Button>
          <Button onClick={spin} loading={loading} disabled={!valid}>
            <Disc3 size={16} /> Girar!
          </Button>
        </>
      }
    >
      <div className="space-y-2">
        {items.map((it, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="h-4 w-4 shrink-0 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
            <label className="sr-only" htmlFor={`opt-${i}`}>
              Opção {i + 1}
            </label>
            <input
              id={`opt-${i}`}
              value={it}
              maxLength={40}
              onChange={(e) => setItems(items.map((x, j) => (j === i ? e.target.value : x)))}
              className="h-10 min-w-0 flex-1 rounded-2xl bg-surface-3 px-4 text-sm outline-none focus:ring-2 focus:ring-accent/60"
            />
            <button aria-label={`Remover ${it}`} onClick={() => setItems(items.filter((_, j) => j !== i))} className="flex h-9 w-9 items-center justify-center rounded-full text-fg-muted hover:bg-danger hover:text-white">
              <Trash2 size={15} />
            </button>
          </div>
        ))}
        {items.length < 24 && (
          <div className="flex gap-2 pt-1">
            <label className="sr-only" htmlFor="opt-new">
              Nova opção
            </label>
            <input
              id="opt-new"
              value={draft}
              maxLength={40}
              placeholder="Nova opção"
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && add()}
              className="h-10 min-w-0 flex-1 rounded-2xl bg-surface-0 px-4 text-sm outline-none focus:ring-2 focus:ring-accent/60"
            />
            <Button variant="secondary" className="h-10" onClick={add} disabled={!draft.trim()}>
              <Plus size={16} /> Adicionar
            </Button>
          </div>
        )}
        {items.length > 0 && (
          <button onClick={() => setItems([])} className="flex items-center gap-1 pt-1 text-xs text-fg-muted hover:text-danger">
            <X size={12} /> limpar tudo
          </button>
        )}
      </div>
    </Modal>
  );
}
