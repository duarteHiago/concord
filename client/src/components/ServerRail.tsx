import { Download, Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { desktop } from '../lib/desktop';
import { useApp } from '../store/app';
import { useVoice } from '../store/voice';
import { cx, initials } from './ui';

/** Fileira de servidores no topo da barra lateral (design Noturno). */
export function ServerStrip() {
  const servers = useApp((s) => s.servers);
  const activeId = useApp((s) => s.activeServerId);
  const openServer = useApp((s) => s.openServer);
  const openModal = useApp((s) => s.openModal);
  const voiceServer = useVoice((s) => s.serverId);
  const [download, setDownload] = useState<string | null>(null);

  useEffect(() => {
    if (desktop) return;
    api.get<{ desktopDownload: string | null }>('/config').then((c) => setDownload(c.desktopDownload), () => {});
  }, []);

  const tile = 'relative flex h-12 w-12 shrink-0 items-center justify-center rounded-[18px] font-display text-base font-bold transition-all';

  return (
    <nav aria-label="Servidores" className="flex flex-wrap gap-2 border-b border-line p-4">
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
