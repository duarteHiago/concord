import { registerSW } from 'virtual:pwa-register';

let updateReady: (() => void) | null = null;
const listeners = new Set<(available: boolean) => void>();

export const pwa = {
  onUpdate: (fn: (available: boolean) => void) => {
    listeners.add(fn);
    return () => { listeners.delete(fn); };
  },
  applyUpdate: () => updateReady?.(),
  get updateAvailable() {
    return updateReady !== null;
  },
};

if ('serviceWorker' in navigator) {
  registerSW({
    onNeedRefresh() {
      updateReady = () => {
        updateReady = null;
        listeners.forEach((fn) => fn(false));
        window.location.reload();
      };
      listeners.forEach((fn) => fn(true));
    },
    onOfflineReady() {},
  });
}
