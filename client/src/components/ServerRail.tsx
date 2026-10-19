import { Download, MessageCircle, Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { desktop } from '../lib/desktop';
import { HOME, useApp } from '../store/app';
import { useVoice } from '../store/voice';
import { useCommunity, usePendingCommunity } from '../store/community';
import { cx, initials } from './ui';

/** Fileira de servidores no topo da barra lateral (design Noturno). */
export function ServerStrip() {
  const servers = useApp((s) => s.servers);
  const activeId = useApp((s) => s.activeServerId);
  const openServer = useApp((s) => s.openServer);
  const openModal = useApp((s) => s.openModal);
  const voiceServer = useVoice((s) => s.serverId);
  const unread = useApp((s) => (s.dms ?? []).reduce((n, d) => n + d.unread, 0));
  const [download, setDownload] = useState<string | null>(null);
  // servidor oficial da comunidade: aparece aqui até a pessoa entrar
  const community = usePendingCommunity();
  const joining = useCommunity((s) => s.joining);
  const joinCommunity = useCommunity((s) => s.join);

  useEffect(() => {
    useCommunity.getState().load();
    if (desktop) return;
    api.get<{ desktopDownload: string | null }>('/config').then((c) => setDownload(c.desktopDownload), () => {});
  }, []);

  const tile = 'relative flex h-12 w-12 shrink-0 items-center justify-center rounded-[18px] font-display text-base font-bold transition-all';

  const home = activeId === HOME;
  return (
    <nav aria-label="Servidores" className="flex flex-wrap gap-2 border-b border-line p-4">
      <button
        title="Mensagens privadas"
        aria-label={`Mensagens privadas${unread ? ` (${unread} não lidas)` : ''}`}
        aria-current={home ? 'true' : undefined}
        onClick={() => openServer(HOME)}
        className={cx(tile, home ? 'bg-accent text-on-accent' : 'bg-surface-3 text-fg-muted hover:bg-surface-4 hover:text-fg')}
      >
        <MessageCircle size={21} />
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full border-[3px] border-surface-2 bg-danger px-1 text-[10px] font-bold text-white">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>
      {servers.map((s) => {
        const active = s.id === activeId;
        return (
          <button
            key={s.id}
            title={s.name}
            aria-label={s.name}
            aria-current={active ? 'true' : undefined}
            onClick={() => openServer(s.id)}
            className={cx(tile, active ? 'bg-accent text-on-accent' : 'bg-surface-3 text-fg-muted hover:bg-surface-4 hover:text-fg')}
          >
            {s.iconUrl ? (
              <img src={s.iconUrl} alt="" className={cx('h-full w-full rounded-[18px] object-cover', active && 'ring-[3px] ring-accent')} />
            ) : (
              initials(s.name)
            )}
            {voiceServer === s.id && (
              <span title="Você está numa sala deste servidor" className="absolute -right-0.5 -bottom-0.5 h-4 w-4 rounded-full border-[3px] border-surface-2 bg-ok" />
            )}
          </button>
        );
      })}
      {community && (
        <button
          title={`Entrar na comunidade: ${community.server.name} (ideias, bugs e ajuda)`}
          aria-label={`Entrar na comunidade ${community.server.name}`}
          onClick={() => void joinCommunity()}
          disabled={joining}
          className={cx(tile, 'bg-surface-3 hover:bg-surface-4 disabled:opacity-60')}
        >
          <img src="/brand/concord-simbolo.svg" alt="" className="h-9 w-9" />
          <span className="absolute -top-1 -right-1 flex h-5 items-center rounded-full border-[3px] border-surface-2 bg-accent px-1 text-[9px] font-extrabold text-on-accent">
            +
          </span>
        </button>
      )}
      <button
        title="Adicionar servidor"
        aria-label="Adicionar servidor"
        onClick={() => openModal({ type: 'addServer' })}
        className={cx(tile, 'border-2 border-dashed border-line-strong text-fg-muted hover:border-accent hover:text-accent')}
      >
        <Plus size={20} />
      </button>
      {!desktop && download && (
        <a
          href={download}
          title="Baixar o app para Windows (transmite áudio sem retorno de voz)"
          aria-label="Baixar o app para Windows"
          className={cx(tile, 'bg-surface-3 text-accent-2 hover:bg-surface-4')}
        >
          <Download size={20} />
        </a>
      )}
    </nav>
  );
}
