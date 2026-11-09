import { Gamepad2, MessageCircle, Server, Settings, ArrowLeft } from 'lucide-react';
import { deckAvailable, openDeck } from './Deck';
import { useMobile } from '../lib/mobile';
import { HOME, useApp } from '../store/app';
import { cx } from './ui';

export function MobileBackButton({ onClick }: { onClick?: () => void }) {
  const mobile = useMobile();
  if (!mobile) return null;
  return (
    <button
      onClick={onClick ?? (() => useApp.getState().setMobileView('sidebar'))}
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full hover:bg-surface-3"
      aria-label="Voltar"
    >
      <ArrowLeft size={20} />
    </button>
  );
}

export function MobileBottomNav() {
  const mobile = useMobile();
  const activeServerId = useApp((s) => s.activeServerId);
  const settingsOpen = useApp((s) => !!s.settings);
  const openServer = useApp((s) => s.openServer);
  const openSettings = useApp((s) => s.openSettings);
  const setMobileView = useApp((s) => s.setMobileView);
  const unread = useApp((s) => (s.dms ?? []).reduce((n, d) => n + d.unread, 0));

  if (!mobile) return null;

  const tab = settingsOpen ? 'settings' : activeServerId === HOME ? 'dms' : 'servers';

  const item = (id: string, label: string, icon: typeof MessageCircle, badge?: number) => {
    const Icon = icon;
    const active = tab === id;
    return (
      <button
        onClick={() => {
          if (id === 'dms') {
            openServer(HOME);
            setMobileView('sidebar');
          } else if (id === 'servers') {
            const state = useApp.getState();
            const current = state.activeServerId;
            if (!current || current === HOME) {
              const first = state.servers[0];
              if (first) openServer(first.id);
            }
            setMobileView('sidebar');
          } else if (id === 'settings') {
            openSettings();
          } else if (id === 'deck') {
            openDeck();
          }
        }}
        className={cx(
          'relative flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-semibold transition-colors',
          active ? 'text-accent' : 'text-fg-muted',
        )}
      >
        <Icon size={22} />
        {label}
        {!!badge && badge > 0 && (
          <span className="absolute top-1 left-1/2 ml-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-white">
            {badge > 99 ? '99+' : badge}
          </span>
        )}
      </button>
    );
  };

  return (
    <nav className="flex shrink-0 border-t border-line bg-surface-2 pb-[env(safe-area-inset-bottom,0px)]">
      {item('dms', 'Mensagens', MessageCircle, unread)}
      {item('servers', 'Servidores', Server)}
      {deckAvailable() && item('deck', 'Controle', Gamepad2)}
      {item('settings', 'Ajustes', Settings)}
    </nav>
  );
}
