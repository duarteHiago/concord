import { RefreshCw, Sparkles, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { desktop } from '../lib/desktop';
import { useApp } from '../store/app';
import { useVoice } from '../store/voice';

const REMIND_MS = 2 * 60 * 1000;
const CHECK_MS = 30 * 60 * 1000;
const MAX_DISMISS = 3;

/** Avisa no app desktop que uma nova versão foi baixada e pode ser instalada. */
export function UpdateBanner() {
  const [version, setVersion] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const dismissCount = useRef(0);
  const inCall = useVoice((s) => s.status !== 'idle');
  const loggedIn = useApp((s) => !!s.me);
  const openReleases = useApp((s) => s.openReleases);

  useEffect(() => {
    if (!desktop) return;

    void desktop.updateStatus?.().then((s) => s && setVersion(s.version));

    const offReady = desktop.onUpdateReady?.((info) => {
      setVersion(info.version);
      setDismissed(false);
      dismissCount.current = 0;
    });

    const offState = desktop.onUpdateState?.((s) => {
      if (s.state === 'ready' && s.version) {
        setVersion(s.version);
        setDismissed(false);
        dismissCount.current = 0;
      }
    });

    // Periodically ask the main process to check for updates
    const timer = setInterval(() => void desktop?.checkForUpdates?.(), CHECK_MS);

    return () => {
      offReady?.();
      offState?.();
      clearInterval(timer);
    };
  }, []);

  // Re-show after dismiss
  useEffect(() => {
    if (!dismissed || !version) return;
    if (dismissCount.current >= MAX_DISMISS) return;
    const t = setTimeout(() => setDismissed(false), REMIND_MS);
    return () => clearTimeout(t);
  }, [dismissed, version]);

  if (!version) return null;

  function dismiss() {
    dismissCount.current++;
    setDismissed(true);
  }

  // After MAX_DISMISS: persistent small badge
  if (dismissed && dismissCount.current >= MAX_DISMISS) {
    return (
      <button
        onClick={() => void desktop!.installUpdate?.()}
        title={`Atualização ${version} disponível — clique para instalar`}
        className="fixed right-4 bottom-4 z-[90] flex h-11 items-center gap-2 rounded-full bg-accent px-4 font-display text-sm font-bold text-on-accent shadow-xl ring-1 ring-accent/30 animate-slide-up hover:bg-accent-hover"
      >
        <RefreshCw size={15} className="animate-spin [animation-duration:3s]" />
        {version}
      </button>
    );
  }

  if (dismissed) return null;

  return (
    <div role="status" className="fixed right-4 bottom-4 z-[90] w-[min(360px,calc(100vw-2rem))] animate-slide-up rounded-[22px] bg-surface-2 p-5 shadow-2xl ring-1 ring-line">
      <button
        aria-label="Depois"
        title="Depois"
        onClick={dismiss}
        className="absolute top-3 right-3 flex h-8 w-8 items-center justify-center rounded-full text-fg-muted hover:bg-surface-3 hover:text-fg"
      >
        <X size={15} />
      </button>

      <div className="mb-1 flex items-center gap-2 font-display text-base font-bold">
        <Sparkles size={18} className="text-accent" />
        Nova versão {version}
      </div>
      <p className="mb-4 text-sm text-fg-muted">
        {inCall ? 'Instala quando você fechar o app.' : 'Pronta para instalar.'}
      </p>

      <div className="flex items-center gap-2">
        <button
          onClick={() => void desktop!.installUpdate?.()}
          className="flex h-10 items-center gap-2 rounded-full bg-accent px-5 font-display text-sm font-bold text-on-accent transition-colors hover:bg-accent-hover"
        >
          <RefreshCw size={15} />
          Reiniciar agora
        </button>
        {loggedIn && (
          <button onClick={openReleases} className="h-10 rounded-full px-4 font-display text-sm font-bold text-fg-muted hover:bg-surface-3 hover:text-fg">
            O que mudou
          </button>
        )}
      </div>
    </div>
  );
}
