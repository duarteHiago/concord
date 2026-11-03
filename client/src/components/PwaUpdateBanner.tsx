import { useEffect, useState } from 'react';
import { pwa } from '../lib/pwa';

export function PwaUpdateBanner() {
  const [show, setShow] = useState(pwa.updateAvailable);

  useEffect(() => pwa.onUpdate(setShow), []);

  if (!show) return null;

  return (
    <div className="fixed top-0 right-0 left-0 z-[200] flex items-center justify-center gap-3 bg-accent px-4 py-2 text-sm font-semibold text-white">
      <span>Nova versão disponível!</span>
      <button
        className="rounded-full bg-white/20 px-3 py-1 text-xs font-bold transition-colors hover:bg-white/30"
        onClick={() => pwa.applyUpdate()}
      >
        Atualizar agora
      </button>
      <button className="ml-1 text-white/60 hover:text-white" onClick={() => setShow(false)}>
        ✕
      </button>
    </div>
  );
}
