import { Hash, MessageCircle, MessagesSquare, Search, Server, Volume2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { HOME, useApp } from '../../store/app';
import { cx } from '../ui';

interface Item {
  key: string;
  label: string;
  hint: string;
  icon: React.ReactNode;
  go: () => void;
}

/** Ctrl+K: pular para qualquer canal, sala, servidor ou conversa. */
export function QuickSwitch() {
  const close = useApp((s) => s.closeModal);
  const servers = useApp((s) => s.servers);
  const details = useApp((s) => s.details);
  const dms = useApp((s) => s.dms);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => input.current?.focus(), []);

  const items = useMemo(() => {
    const st = useApp.getState();
    const all: Item[] = [];
    for (const d of dms ?? []) {
      all.push({
        key: `dm-${d.id}`,
        label: d.user.displayName,
        hint: `Mensagem privada · @${d.user.username}`,
        icon: <MessageCircle size={16} />,
        go: () => st.openDmById(d.id),
      });
    }
    for (const s of servers) {
      const detail = details[s.id];
      for (const c of detail?.channels ?? []) {
        all.push({
          key: c.id,
          label: c.type !== 'voice' ? `#${c.name}` : c.name,
          hint: s.name,
          icon: c.type === 'voice' ? <Volume2 size={16} /> : c.type === 'forum' ? <MessagesSquare size={16} /> : <Hash size={16} />,
          go: () => {
            st.openServer(s.id);
            st.openChannel(s.id, c.id);
          },
        });
      }
      all.push({ key: `server-${s.id}`, label: s.name, hint: 'Servidor', icon: <Server size={16} />, go: () => st.openServer(s.id) });
    }
    all.push({ key: 'home', label: 'Mensagens', hint: 'Todas as conversas privadas', icon: <MessageCircle size={16} />, go: () => st.openServer(HOME) });
    return all;
  }, [servers, details, dms]);

  const q = query.trim().toLowerCase().replace(/^#/, '');
  const filtered = (q ? items.filter((i) => `${i.label} ${i.hint}`.toLowerCase().replace(/#/g, '').includes(q)) : items).slice(0, 12);
  const active = Math.min(selected, Math.max(0, filtered.length - 1));

  const choose = (item: Item | undefined) => {
    if (!item) return;
    close();
    item.go();
  };

  return (
    <div className="fixed inset-0 z-50 flex animate-fade-in items-start justify-center bg-black/60 p-4 pt-[14vh] backdrop-blur-sm" onMouseDown={close}>
      <div className="w-full max-w-lg animate-pop-in overflow-hidden rounded-[24px] bg-surface-2 shadow-2xl ring-1 ring-line" onMouseDown={(e) => e.stopPropagation()}>
        <div className="relative border-b border-line">
          <Search size={18} className="pointer-events-none absolute top-1/2 left-5 -translate-y-1/2 text-fg-subtle" />
          <label className="sr-only" htmlFor="quick-switch">
            Para onde você quer ir?
          </label>
          <input
            id="quick-switch"
            ref={input}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelected(0);
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault();
                const d = e.key === 'ArrowDown' ? 1 : -1;
                setSelected((active + d + filtered.length) % Math.max(1, filtered.length));
              } else if (e.key === 'Enter') choose(filtered[active]);
              else if (e.key === 'Escape') close();
            }}
            placeholder="Para onde você quer ir?"
            className="h-14 w-full bg-transparent pr-5 pl-13 text-base outline-none placeholder:text-fg-subtle"
          />
        </div>
        <div role="listbox" className="max-h-96 overflow-y-auto p-2">
          {filtered.length === 0 && <p className="px-3 py-4 text-sm text-fg-muted">Nada encontrado.</p>}
          {filtered.map((it, i) => (
            <button
              key={it.key}
              role="option"
              aria-selected={i === active}
              onMouseEnter={() => setSelected(i)}
              onClick={() => choose(it)}
              className={cx('flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left', i === active && 'bg-surface-3')}
            >
              <span className="text-fg-muted">{it.icon}</span>
              <span className="truncate text-sm font-semibold">{it.label}</span>
              <span className="ml-auto truncate text-xs text-fg-subtle">{it.hint}</span>
            </button>
          ))}
        </div>
        <div className="border-t border-line px-4 py-2 text-xs text-fg-subtle">↑ ↓ para escolher · Enter para abrir · Esc para fechar</div>
      </div>
    </div>
  );
}
