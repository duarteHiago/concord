import { useSyncExternalStore } from 'react';

const MQ = '(max-width: 767px)';
let mql: MediaQueryList | null = null;

function getSnapshot() {
  if (!mql) mql = window.matchMedia(MQ);
  return mql.matches;
}

function subscribe(cb: () => void) {
  if (!mql) mql = window.matchMedia(MQ);
  mql.addEventListener('change', cb);
  return () => mql!.removeEventListener('change', cb);
}

export function useMobile() {
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
