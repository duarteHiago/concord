import { Coins, Dices, Disc3, Plus, Trash2, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import type { GameData } from '../lib/types';
import { useApp } from '../store/app';
import { markPlayed, shouldAnimate } from '../lib/liveGames';
import { Coin3D, DiceSet, Wheel, WHEEL_COLORS } from './GameVisuals';
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


/** Cartão do jogo dentro do chat. Anima se o jogo acabou de chegar e o palco não mostrou. */
export function GameCard({ id, data, author }: { id: string; data: GameData; author: string }) {
  const [animate] = useState(() => {
    const yes = shouldAnimate(id);
    if (yes) markPlayed(id);
    return yes;
  });
  const [done, setDone] = useState(!animate);

  const title =
    data.type === 'roulette'
      ? `${author} girou a roleta`
      : data.type === 'dice'
        ? `${author} rolou ${data.count}d${data.sides}`
        : `${author} jogou cara ou coroa`;
  const icon = data.type === 'roulette' ? <Disc3 size={14} /> : data.type === 'dice' ? <Dices size={14} /> : <Coins size={14} />;

  return (
    <div className="relative w-[260px] overflow-hidden rounded-[22px] bg-surface-2 p-4 text-fg">
      <div className="mb-3 flex items-center gap-1.5 text-xs font-bold text-fg-muted">
        <span className="text-accent">{icon}</span> {title}
      </div>
      <div className="flex justify-center">
        {data.type === 'roulette' ? (
          <Wheel data={data} size={200} animate={animate} sound={animate} onDone={() => setDone(true)} />
        ) : data.type === 'dice' ? (
          <div className="py-2">
            <DiceSet data={data} size={data.count > 4 ? 40 : 54} animate={animate} sound={animate} onDone={() => setDone(true)} />
          </div>
        ) : (
          <div className="py-2">
            <Coin3D data={data} size={96} animate={animate} sound={animate} onDone={() => setDone(true)} />
          </div>
        )}
      </div>
      <div className={cx('mt-3 text-center transition-all duration-300', done ? 'opacity-100' : 'translate-y-1 opacity-0')}>
        <GameResult data={data} />
      </div>
    </div>
  );
}

/** Texto do resultado (cartão do chat e palco da tela principal). */
export function GameResult({ data, big }: { data: GameData; big?: boolean }) {
  const size = big ? 'text-3xl' : 'text-lg';
  if (data.type === 'roulette') {
    return (
      <>
        <div className="text-xs text-fg-muted">Resultado</div>
        <div className={cx('font-display font-bold text-accent', size)}>{data.items[data.result]}</div>
      </>
    );
  }
  if (data.type === 'dice') {
    const total = data.rolls.reduce((a, b) => a + b, 0);
    return (
      <>
        <div className="text-xs text-fg-muted">{data.count > 1 ? `${data.rolls.join(' + ')} =` : 'Resultado'}</div>
        <div className={cx('font-display font-bold text-accent', size)}>{total}</div>
      </>
    );
  }
  return (
    <>
      <div className="text-xs text-fg-muted">Resultado</div>
      <div className={cx('font-display font-bold text-accent', size)}>{data.result === 'cara' ? 'Cara' : 'Coroa'}</div>
    </>
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
        <div className="absolute bottom-full left-0 z-30 mb-2 w-64 animate-pop-in rounded-3xl bg-popover p-2 shadow-2xl ring-1 ring-line">
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
            <span className="h-4 w-4 shrink-0 rounded-full" style={{ background: WHEEL_COLORS[i % WHEEL_COLORS.length] }} />
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
