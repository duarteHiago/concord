// A aba "Threads": as threads que sigo, de todos os servidores, da resposta mais recente para a mais antiga. As que
// têm resposta nova ficam marcadas; tocar abre o canal com a thread no painel.
import { CheckCircle2, Hash, MessagesSquare, X } from 'lucide-react';
import { useEffect } from 'react';
import { useApp } from '../store/app';
import { useThreads, type FollowedThread } from '../store/threads';
import { MobileBackButton } from './MobileNav';
import { Avatar, IconButton, Spinner, cx } from './ui';

function ago(t: number | null) {
  if (!t) return '';
  const min = Math.round((Date.now() - t) / 60_000);
  if (min < 1) return 'agora';
  if (min < 60) return `${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} h`;
  return new Date(t).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}

export function ThreadsView() {
  const followed = useThreads((s) => s.followed);
  const close = useApp((s) => s.closeThreads);

  useEffect(() => {
    void useThreads.getState().loadFollowed();
  }, []);

  function open(t: FollowedThread) {
    const app = useApp.getState();
    app.openServer(t.serverId);
    app.openChannel(t.serverId, t.channelId);
    useThreads.getState().openThread(t.serverId, t.channelId, t.id);
  }

  return (
    <main className="panel flex min-w-0 flex-1 flex-col overflow-hidden">
      <header className="flex shrink-0 items-center gap-3 px-4 pt-4 pb-3 md:px-6 md:pt-5">
        <MobileBackButton />
        <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-accent/15 text-accent">
          <MessagesSquare size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-xl font-bold md:text-2xl">Threads</h1>
          <p className="truncate text-sm text-fg-muted">As conversas que você segue</p>
        </div>
        <IconButton label="Fechar" className="hidden h-10 w-10 md:flex" onClick={close}>
          <X size={20} />
        </IconButton>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-6 md:px-5">
        {followed === null ? (
          <div className="flex justify-center py-12">
            <Spinner />
          </div>
        ) : followed.length === 0 ? (
          <div className="mx-auto flex max-w-sm flex-col items-center gap-3 py-16 text-center">
            <span className="flex h-16 w-16 items-center justify-center rounded-[22px] bg-surface-3 text-fg-subtle">
              <MessagesSquare size={30} />
            </span>
            <p className="font-semibold">Nenhuma thread por aqui</p>
            <p className="text-sm text-fg-muted">
              Para responder uma mensagem sem encher o canal, use "Responder em thread" nas ações da mensagem. Você passa a seguir as threads que abre, responde
              ou em que é mencionado.
            </p>
          </div>
        ) : (
          <ul className="space-y-1.5">
            {followed.map((t) => (
              <li key={t.id}>
                <button
                  onClick={() => open(t)}
                  className={cx(
                    'flex w-full items-start gap-3 rounded-2xl p-3 text-left transition-colors hover:bg-surface-3',
                    t.unread ? 'bg-accent/8' : '',
                  )}
                >
                  <Avatar name={t.root.authorName} color={t.root.avatarColor} src={t.root.avatarUrl} size={40} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <span className={cx('min-w-0 flex-1 truncate text-[15px]', t.unread ? 'font-extrabold' : 'font-bold')}>{t.root.authorName}</span>
                      <span className="shrink-0 text-xs text-fg-subtle">{ago(t.lastReplyAt)}</span>
                      {t.unread && <span aria-label="Resposta nova" className="h-2.5 w-2.5 shrink-0 rounded-full bg-accent" />}
                    </div>
                    <div className="flex items-center gap-1 truncate text-xs font-semibold text-fg-muted">
                      <Hash size={11} className="shrink-0" />
                      <span className="truncate">
                        {t.channelName} · {t.serverName}
                      </span>
                    </div>
                    <p className="mt-0.5 line-clamp-2 text-sm text-fg">{t.root.content || 'Mensagem'}</p>
                    <div className="mt-1.5 flex items-center gap-2 text-xs font-semibold text-fg-muted">
                      <span className="text-accent">{t.replyCount === 1 ? '1 resposta' : `${t.replyCount} respostas`}</span>
                      {t.status === 'resolved' && (
                        <span className="flex items-center gap-1 rounded-full bg-ok/15 px-2 py-0.5 text-[11px] font-bold text-ok">
                          <CheckCircle2 size={11} /> Resolvida
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
