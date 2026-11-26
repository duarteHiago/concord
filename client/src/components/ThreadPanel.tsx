// O painel da thread: no PC, uma coluna à direita do chat (no lugar da lista de membros); no celular, tela cheia
// por cima da conversa (o "voltar" fecha). Em cima, a mensagem que abriu a thread; embaixo, as respostas e o campo
// para responder, com "também enviar para o canal".
import { Bell, BellOff, CheckCircle2, Hash, RotateCcw, X } from 'lucide-react';
import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useBackHandler } from '../lib/backStack';
import { useMobile } from '../lib/mobile';
import { useActiveDetail } from '../store/app';
import { readThread, useThreads } from '../store/threads';
import { Bubble, Composer } from './ChatView';
import { IconButton, Spinner, cx } from './ui';

export function ThreadPanel() {
  const open = useThreads((s) => s.open);
  const close = useThreads((s) => s.closeThread);
  const setStatus = useThreads((s) => s.setStatus);
  const setFollowing = useThreads((s) => s.setFollowing);
  const detail = useActiveDetail();
  const mobile = useMobile();
  const [alsoChannel, setAlsoChannel] = useState(false);
  const list = useRef<HTMLDivElement>(null);
  const channel = detail?.channels.find((c) => c.id === open?.channelId);

  useBackHandler(!!open, close);

  // trocou de thread: desmarca o "também enviar para o canal"
  useEffect(() => setAlsoChannel(false), [open?.rootId]);

  // o painel só aparece com a thread à vista: ao voltar para ela (saindo da aba Threads, por exemplo) e a cada
  // resposta que chega, conta como lida
  const replyCount = open?.replies.length ?? 0;
  useEffect(() => {
    if (!open || open.loading) return;
    const read = () => document.hasFocus() && !document.hidden && readThread(open.rootId);
    read();
    window.addEventListener('focus', read);
    return () => window.removeEventListener('focus', read);
  }, [open?.rootId, open?.loading, replyCount]);

  // resposta nova: rola até ela (se já estava perto do fim)
  const count = open?.replies.length ?? 0;
  useLayoutEffect(() => {
    const el = list.current;
    if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 240) el.scrollTop = el.scrollHeight;
  }, [count, open?.loading]);

  if (!open || !detail || !channel || detail.server.id !== open.serverId) return null;
  const resolved = open.root?.thread?.status === 'resolved';
  const replies = open.replies;

  return (
    <aside
      aria-label="Thread"
      className={cx(
        'flex flex-col overflow-hidden bg-surface-2',
        mobile ? 'fixed inset-0 z-40 pt-[env(safe-area-inset-top)]' : 'panel w-[400px] shrink-0',
      )}
    >
      <header className="flex shrink-0 items-center gap-2 border-b border-line px-4 py-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="font-display text-lg font-bold">Thread</h2>
            {resolved && (
              <span className="flex items-center gap-1 rounded-full bg-ok/15 px-2 py-0.5 text-[11px] font-bold text-ok">
                <CheckCircle2 size={11} /> Resolvida
              </span>
            )}
          </div>
          <div className="flex items-center gap-1 truncate text-xs text-fg-muted">
            <Hash size={11} /> {channel.name}
          </div>
        </div>
        <IconButton
          label={open.following ? 'Deixar de seguir (sem avisos das respostas)' : 'Seguir (receber avisos das respostas)'}
          active={open.following}
          className="h-9 w-9"
          onClick={() => void setFollowing(!open.following)}
        >
          {open.following ? <Bell size={17} /> : <BellOff size={17} />}
        </IconButton>
        <IconButton label="Fechar a thread" className="h-9 w-9" onClick={close}>
          <X size={18} />
        </IconButton>
      </header>

      <div ref={list} className="min-h-0 flex-1 overflow-y-auto px-4 pb-3">
        {open.loading || !open.root ? (
          <div className="flex justify-center py-10">
            <Spinner />
          </div>
        ) : (
          <>
            <Bubble detail={detail} channel={channel} message={open.root} grouped={false} compact inThread />
            {/* resolver/reabrir: fica logo abaixo da mensagem do alerta/pergunta */}
            <div className="mt-3 flex items-center gap-3">
              <span className="h-px flex-1 bg-line" />
              <span className="text-xs font-semibold text-fg-subtle">
                {replies.length === 0 ? 'Nenhuma resposta ainda' : replies.length === 1 ? '1 resposta' : `${replies.length} respostas`}
              </span>
              <button
                onClick={() => void setStatus(resolved ? 'open' : 'resolved')}
                className={cx(
                  'flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold transition-colors',
                  resolved ? 'bg-surface-3 text-fg-muted hover:bg-surface-4 hover:text-fg' : 'bg-ok/15 text-ok hover:bg-ok/25',
                )}
              >
                {resolved ? <RotateCcw size={12} /> : <CheckCircle2 size={12} />}
                {resolved ? 'Reabrir' : 'Marcar como resolvida'}
              </button>
              <span className="h-px flex-1 bg-line" />
            </div>
            {replies.map((m, i) => {
              const prev = replies[i - 1];
              const grouped = !!prev && prev.author.id === m.author.id && m.createdAt - prev.createdAt < 5 * 60_000;
              return (
                <Fragment key={m.id}>
                  <Bubble detail={detail} channel={channel} message={m} grouped={grouped} compact inThread />
                </Fragment>
              );
            })}
          </>
        )}
      </div>

      <div className="shrink-0 border-t border-line pt-2">
        <Composer channel={channel} compact thread={{ rootId: open.rootId, alsoChannel }} />
        <label className="-mt-1 flex cursor-pointer items-center gap-2 px-4 pb-3 text-xs text-fg-muted select-none">
          <input type="checkbox" checked={alsoChannel} onChange={(e) => setAlsoChannel(e.target.checked)} className="accent-accent" />
          Também enviar para #{channel.name}
        </label>
      </div>
    </aside>
  );
}
