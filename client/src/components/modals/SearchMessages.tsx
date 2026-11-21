// Buscar mensagens (lupa no topo da conversa ou Ctrl+F): num servidor, varre todos os canais de texto e os chats das
// salas que a pessoa vê; na tela de mensagens privadas, todas as conversas dela. A lista mostra onde está cada
// mensagem e o texto; escolher uma abre a conversa e pula até ela (carregando as mais antigas, se precisar).
import { Hash, MessageCircle, Search, Volume2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { api } from '../../lib/api';
import { HOME, useApp } from '../../store/app';
import { toast } from '../../store/toast';
import { Avatar, cx } from '../ui';

interface SearchResult {
  id: string;
  content: string;
  createdAt: number;
  author: { id: string; name: string; username: string; avatarColor: string; avatarUrl: string | null };
  place: { kind: 'channel'; serverId: string; id: string; name: string; type: 'text' | 'voice' } | { kind: 'dm'; id: string; name: string };
}

const fmt = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });

/**
 * Dobra letra por letra (sem acento e em minúscula), mantendo o mesmo tamanho do texto, para achar onde o termo
 * está no texto original. O servidor busca do mesmo jeito (ver server/src/db.ts#foldText).
 */
const fold = (s: string) => Array.from(s, (c) => c.normalize('NFD').replace(/\p{M}+/gu, '').toLowerCase()[0] ?? c).join('');

/** O texto com o termo buscado destacado (sem diferenciar maiúsculas nem acentos). */
function Highlight({ text, term }: { text: string; term: string }) {
  // Array.from separa por letra (emoji conta como uma): os índices batem com o texto dobrado
  const chars = Array.from(text.replace(/\s+/g, ' '));
  const clean = chars.join('');
  const folded = Array.from(fold(clean));
  const needle = Array.from(fold(term));
  let i = -1;
  for (let k = 0; needle.length && k + needle.length <= folded.length && i < 0; k++) {
    if (needle.every((c, j) => folded[k + j] === c)) i = k;
  }
  if (i >= 0) {
    const start = Math.max(0, i - 60);
    return (
      <>
        {start > 0 && '…'}
        {chars.slice(start, i).join('')}
        <mark className="rounded bg-accent/25 px-0.5 text-fg">{chars.slice(i, i + needle.length).join('')}</mark>
        {chars.slice(i + needle.length).join('')}
      </>
    );
  }
  return <>{clean}</>;
}

/** Abre a conversa do resultado e pula até a mensagem, carregando páginas mais antigas até ela aparecer. */
async function jumpTo(r: SearchResult) {
  const st = useApp.getState();
  const conv = r.place.id;
  if (r.place.kind === 'dm') st.openDmById(conv);
  else {
    st.openServer(r.place.serverId);
    st.openChannel(r.place.serverId, conv);
  }
  const load = (older: boolean) => (r.place.kind === 'dm' ? useApp.getState().loadDmMessages(conv, older) : useApp.getState().loadMessages(conv, older));
  for (let tries = 0; tries < 40; tries++) {
    await new Promise((ok) => setTimeout(ok, tries === 0 ? 150 : 250));
    const el = document.getElementById(`msg-${r.id}`);
    if (el) {
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      el.classList.add('bg-accent/15');
      setTimeout(() => el.classList.remove('bg-accent/15'), 2200);
      return;
    }
    const s = useApp.getState();
    const list = s.messages[conv];
    if (!list) {
      if (tries === 2) await load(false);
      continue;
    }
    // a mensagem já carregou mas não está na tela (ex.: o papo da sala fechado): não adianta carregar mais
    if (list.some((m) => m.id === r.id)) {
      if (tries > 8) break;
      continue;
    }
    if (!s.hasMore[conv] || (list[0] && list[0].createdAt <= r.createdAt)) break;
    await load(true);
  }
  toast.info(r.place.kind === 'channel' && r.place.type === 'voice' ? 'Abri a sala. Abra o papo da sala (balão no topo) para ver a mensagem.' : 'Abri a conversa, mas não achei a mensagem na tela. Role para cima para encontrá-la.');
}

export function SearchMessagesModal() {
  const close = useApp((s) => s.closeModal);
  const serverId = useApp((s) => s.activeServerId);
  const serverName = useApp((s) => (s.activeServerId && s.activeServerId !== HOME ? s.details[s.activeServerId]?.server.name : null));
  const inDms = !serverId || serverId === HOME;
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const seq = useRef(0);
  const term = query.replace(/\s+/g, ' ').trim();

  useEffect(() => input.current?.focus(), []);

  const base = inDms ? '/dms/search' : `/servers/${serverId}/search`;
  const url = (before?: number) => `${base}?q=${encodeURIComponent(term)}${before ? `&before=${before}` : ''}`;

  // busca enquanto digita, 300 ms depois da última tecla
  useEffect(() => {
    if (term.length < 2) {
      setResults(null);
      setHasMore(false);
      return;
    }
    const mine = ++seq.current;
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await api.get<{ results: SearchResult[]; hasMore: boolean }>(`${base}?q=${encodeURIComponent(term)}`);
        if (mine !== seq.current) return;
        setResults(res.results);
        setHasMore(res.hasMore);
        setSelected(0);
      } catch (err) {
        if (mine === seq.current) toast.error(err);
      } finally {
        if (mine === seq.current) setLoading(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [term, base]);

  async function more() {
    if (!results?.length) return;
    setLoading(true);
    try {
      const res = await api.get<{ results: SearchResult[]; hasMore: boolean }>(url(results[results.length - 1].createdAt));
      setResults([...results, ...res.results]);
      setHasMore(res.hasMore);
    } catch (err) {
      toast.error(err);
    }
    setLoading(false);
  }

  const choose = (r: SearchResult | undefined) => {
    if (!r) return;
    close();
    void jumpTo(r);
  };
  const list = results ?? [];
  const active = Math.min(selected, Math.max(0, list.length - 1));

  return (
    <div className="fixed inset-0 z-50 flex animate-fade-in items-start justify-center bg-black/60 p-4 pt-[10vh] backdrop-blur-sm" onMouseDown={close}>
      <div className="flex max-h-[80vh] w-full max-w-2xl animate-pop-in flex-col overflow-hidden rounded-[24px] bg-surface-2 shadow-2xl ring-1 ring-line" onMouseDown={(e) => e.stopPropagation()}>
        <div className="relative shrink-0 border-b border-line">
          <Search size={18} className="pointer-events-none absolute top-1/2 left-5 -translate-y-1/2 text-fg-subtle" />
          <label className="sr-only" htmlFor="search-messages">
            Buscar mensagens
          </label>
          <input
            id="search-messages"
            ref={input}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            maxLength={100}
            onKeyDown={(e) => {
              if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && list.length) {
                e.preventDefault();
                const d = e.key === 'ArrowDown' ? 1 : -1;
                setSelected((active + d + list.length) % list.length);
              } else if (e.key === 'Enter') choose(list[active]);
              else if (e.key === 'Escape') close();
            }}
            placeholder={inDms ? 'Buscar nas mensagens privadas' : `Buscar mensagens em ${serverName ?? 'todo o servidor'}`}
            className="h-14 w-full bg-transparent pr-5 pl-13 text-base outline-none placeholder:text-fg-subtle"
          />
        </div>
        <div role="listbox" className="min-h-0 flex-1 overflow-y-auto p-2">
          {term.length < 2 ? (
            <p className="px-3 py-4 text-sm text-fg-muted">
              {inDms ? 'Procura em todas as suas conversas privadas.' : 'Procura em todos os canais de texto e nos chats das salas deste servidor.'} Digite pelo menos 2 letras.
            </p>
          ) : results === null ? (
            <p className="px-3 py-4 text-sm text-fg-muted">Buscando…</p>
          ) : list.length === 0 ? (
            <p className="px-3 py-4 text-sm text-fg-muted">Nenhuma mensagem com “{term}”.</p>
          ) : (
            list.map((r, i) => (
              <button
                key={r.id}
                role="option"
                aria-selected={i === active}
                onMouseEnter={() => setSelected(i)}
                onClick={() => choose(r)}
                className={cx('flex w-full items-start gap-3 rounded-2xl px-3 py-2.5 text-left', i === active && 'bg-surface-3')}
              >
                {/* onde está a mensagem */}
                <span className="mt-0.5 flex w-32 shrink-0 items-center gap-1 truncate text-xs font-semibold text-fg-muted">
                  {r.place.kind === 'dm' ? <MessageCircle size={13} className="shrink-0" /> : r.place.type === 'voice' ? <Volume2 size={13} className="shrink-0" /> : <Hash size={13} className="shrink-0" />}
                  <span className="truncate">{r.place.name}</span>
                </span>
                <Avatar name={r.author.name} color={r.author.avatarColor} src={r.author.avatarUrl} size={28} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline gap-2">
                    <span className="truncate text-sm font-bold">{r.author.name}</span>
                    <span className="shrink-0 text-[11px] text-fg-subtle">{fmt.format(r.createdAt)}</span>
                  </span>
                  <span className="line-clamp-2 text-sm break-words text-fg-muted">
                    <Highlight text={r.content} term={term} />
                  </span>
                </span>
              </button>
            ))
          )}
          {hasMore && (
            <button onClick={() => void more()} disabled={loading} className="mt-1 w-full rounded-2xl px-3 py-2 text-sm font-semibold text-accent hover:bg-surface-3 disabled:opacity-50">
              {loading ? 'Carregando…' : 'Mostrar mais antigas'}
            </button>
          )}
        </div>
        <div className="shrink-0 border-t border-line px-4 py-2 text-xs text-fg-subtle">↑ ↓ para escolher · Enter para abrir · Esc para fechar</div>
      </div>
    </div>
  );
}

/** A lupa no topo da conversa: abre a busca de mensagens (o mesmo que Ctrl+F). */
export function SearchButton({ className }: { className?: string }) {
  return (
    <button
      type="button"
      onClick={() => useApp.getState().openModal({ type: 'searchMessages' })}
      title="Buscar mensagens (Ctrl+F)"
      aria-label="Buscar mensagens"
      className={cx('flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-fg-muted transition-colors hover:bg-surface-3 hover:text-fg', className)}
    >
      <Search size={19} />
    </button>
  );
}
