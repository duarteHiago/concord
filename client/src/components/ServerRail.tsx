import { Plus } from 'lucide-react';
import { useApp } from '../store/app';
import { useVoice } from '../store/voice';
import { cx, initials } from './ui';

export function ServerRail() {
  const servers = useApp((s) => s.servers);
  const activeId = useApp((s) => s.activeServerId);
  const openServer = useApp((s) => s.openServer);
  const openModal = useApp((s) => s.openModal);
  const voiceServer = useVoice((s) => s.serverId);

  return (
    <nav className="flex w-[72px] shrink-0 flex-col items-center gap-2 overflow-y-auto bg-surface-0 py-3">
      <div className="mb-1 flex h-12 w-12 items-center justify-center">
        <img src="/icon.svg" alt="Concord" className="h-11 w-11" />
      </div>
      <div className="mb-1 h-0.5 w-8 rounded-full bg-line-strong" />

      {servers.map((s) => {
        const active = s.id === activeId;
        return (
          <div key={s.id} className="group relative flex w-full justify-center">
            <span
              className={cx(
                'absolute top-1/2 left-0 w-1 -translate-y-1/2 rounded-r-full bg-white transition-all',
                active ? 'h-10' : 'h-0 group-hover:h-5',
              )}
            />
            <button
              title={s.name}
              onClick={() => openServer(s.id)}
              className={cx(
                'relative flex h-12 w-12 items-center justify-center text-sm font-bold text-white transition-all duration-200',
                active ? 'rounded-2xl' : 'rounded-3xl hover:rounded-2xl',
              )}
              style={{ background: active ? `linear-gradient(135deg, ${s.iconColor}, ${s.iconColor}aa)` : '#1c1f28' }}
            >
              <span className={cx(!active && 'text-fg-muted group-hover:text-white')}>{initials(s.name)}</span>
              {voiceServer === s.id && (
                <span className="absolute -right-0.5 -bottom-0.5 h-4 w-4 rounded-full border-[3px] border-surface-0 bg-ok" />
              )}
            </button>
          </div>
        );
      })}

      <button
        title="Adicionar servidor"
        onClick={() => openModal({ type: 'addServer' })}
        className="flex h-12 w-12 items-center justify-center rounded-3xl bg-surface-3 text-ok transition-all duration-200 hover:rounded-2xl hover:bg-ok hover:text-white"
      >
        <Plus size={24} />
      </button>
    </nav>
  );
}
