import { registerSW } from 'virtual:pwa-register';

const listeners = new Set<(available: boolean) => void>();
let doUpdate: ((reloadPage?: boolean) => Promise<void>) | null = null;

export const pwa = {
  onUpdate: (fn: (available: boolean) => void) => {
    listeners.add(fn);
    return () => { listeners.delete(fn); };
  },
  applyUpdate: () => void doUpdate?.(true),
  get updateAvailable() {
    return doUpdate !== null;
  },
};

if ('serviceWorker' in navigator) {
  const updateSW = registerSW({
    onNeedRefresh() {
      doUpdate = updateSW;
      listeners.forEach((fn) => fn(true));
    },
    onOfflineReady() {},
  });
}
