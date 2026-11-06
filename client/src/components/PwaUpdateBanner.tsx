import { RefreshCw, Sparkles, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { pwa } from '../lib/pwa';
import { useVoice } from '../store/voice';
import { cx } from './ui';

const REMIND_MS = 2 * 60 * 1000;
const MAX_DISMISS = 3;

export function PwaUpdateBanner() {
  const [available, setAvailable] = useState(pwa.updateAvailable);
  const [dismissed, setDismissed] = useState(false);
  const dismissCount = useRef(0);
  const inCall = useVoice((s) => s.status !== 'idle');
  const wasInCall = useRef(inCall);

  useEffect(() => pwa.onUpdate(setAvailable), []);

  // Re-show after dismiss
  useEffect(() => {
    if (!dismissed || !available) return;
    if (dismissCount.current >= MAX_DISMISS) return;
    const t = setTimeout(() => setDismissed(false), REMIND_MS);
    return () => clearTimeout(t);
  }, [dismissed, available]);

  // Auto-apply when leaving a voice room (if user was in call when update arrived)
  useEffect(() => {
    if (wasInCall.current && !inCall && available) {
      pwa.applyUpdate();
    }
    wasInCall.current = inCall;
  }, [inCall, available]);

  if (!available) return null;

  function dismiss() {
    dismissCount.current++;
    setDismissed(true);
  }

  function forceReload() {
    if ('caches' in window) {
      void caches.keys().then((names) => Promise.all(names.map((n) => caches.delete(n)))).then(() => location.reload());
    } else {
      location.reload();
    }
  }

  // After MAX_DISMISS: persistent small badge
  if (dismissed && dismissCount.current >= MAX_DISMISS) {
    return (
      <button
        onClick={() => pwa.applyUpdate()}
        title="Atualização disponível — clique para aplicar"
        className="fixed right-4 bottom-4 z-[200] flex h-11 items-center gap-2 rounded-full bg-accent px-4 font-display text-sm font-bold text-on-accent shadow-xl ring-1 ring-accent/30 animate-slide-up hover:bg-accent-hover"
      >
        <RefreshCw size={15} className="animate-spin [animation-duration:3s]" />
        Atualizar
      </button>
    );
  }

  if (dismissed) return null;

  return (
    <div
      role="status"
      className={cx(
        'fixed z-[200] animate-slide-up shadow-2xl ring-1 ring-line',
        'right-4 bottom-4 w-[min(360px,calc(100vw-2rem))] rounded-[22px] bg-surface-2 p-5',
      )}
    >
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
        Nova versão disponível
      </div>
      <p className="mb-4 text-sm text-fg-muted">
        {inCall
          ? 'Quando você sair da sala, o Concord atualiza sozinho.'
          : 'Recarregue para receber as novidades e correções.'}
      </p>

      <div className="flex items-center gap-2">
        <button
          onClick={() => pwa.applyUpdate()}
          className="flex h-10 items-center gap-2 rounded-full bg-accent px-5 font-display text-sm font-bold text-on-accent transition-colors hover:bg-accent-hover"
        >
          <RefreshCw size={15} />
          Atualizar agora
        </button>
        <button
          onClick={forceReload}
          title="Limpa o cache e recarrega a página"
          className="h-10 rounded-full px-4 font-display text-sm font-bold text-fg-muted hover:bg-surface-3 hover:text-fg"
        >
          Forçar recarga
        </button>
      </div>
    </div>
  );
}
