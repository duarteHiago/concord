import { RefreshCw, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { desktop } from '../lib/desktop';
import { useApp } from '../store/app';
import { useVoice } from '../store/voice';

/** Avisa no app desktop que uma nova versão foi baixada e pode ser instalada. */
export function UpdateBanner() {
  const [version, setVersion] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const inCall = useVoice((s) => s.status !== 'idle');
  // o app desktop carrega o site, então as Novidades já mostram o que chegou
  const loggedIn = useApp((s) => !!s.me);
  const openReleases = useApp((s) => s.openReleases);

  useEffect(() => {
    if (!desktop?.onUpdateReady) return;
    void desktop.updateStatus?.().then((s) => s && setVersion(s.version));
    return desktop.onUpdateReady((info) => {
      setVersion(info.version);
      setDismissed(false);
    });
  }, []);

  if (!version || dismissed) return null;

  return (
    <div role="status" className="fixed right-6 bottom-6 z-[90] flex animate-slide-up items-center gap-3 rounded-full bg-surface-3 py-2 pr-2 pl-5 shadow-2xl ring-1 ring-line">
      <span className="text-sm">
        <b>Nova versão {version}</b> <span className="text-fg-muted">{inCall ? '· instala quando você fechar o app' : 'pronta para instalar'}</span>
      </span>
      {loggedIn && (
        <button onClick={openReleases} className="h-9 rounded-full px-3 font-display text-sm font-bold text-fg-muted hover:bg-surface-4 hover:text-fg">
          Ver o que mudou
        </button>
      )}
      <button
        onClick={() => void desktop!.installUpdate?.()}
        className="flex h-9 items-center gap-1.5 rounded-full bg-accent px-4 font-display text-sm font-bold text-on-accent hover:bg-accent-hover"
      >
        <RefreshCw size={15} /> Reiniciar agora
      </button>
      <button aria-label="Depois" title="Depois" onClick={() => setDismissed(true)} className="flex h-9 w-9 items-center justify-center rounded-full text-fg-muted hover:bg-surface-4 hover:text-fg">
        <X size={16} />
      </button>
    </div>
  );
}
