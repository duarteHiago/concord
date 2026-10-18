// Repassa ao servidor a atividade detectada pelo app desktop (jogo da Steam, música do Spotify).
import type { Socket } from 'socket.io-client';
import { useApp } from '../store/app';
import { desktop } from './desktop';
import type { Activity } from './types';

let current: Activity | null = null;
let socketRef: Socket | null = null;
let started = false;

const sharing = () => useApp.getState().me?.settings.shareActivity !== false;

function publish() {
  socketRef?.emit('activity:set', sharing() ? current : null);
}

export function startActivityReporter(socket: Socket) {
  socketRef = socket;
  if (!desktop?.onActivity) return;
  socket.on('connect', publish);
  if (started) return;
  started = true;
  void desktop.setActivitySharing?.(sharing());
  void desktop.getActivity?.().then((a) => {
    current = (a as Activity | null) ?? null;
    publish();
  });
  desktop.onActivity((a) => {
    current = (a as Activity | null) ?? null;
    publish();
  });
  // ligou/desligou "Mostrar o que estou jogando": reenvia na hora e liga/desliga a varredura no processo principal
  let lastSharing = sharing();
  useApp.subscribe(() => {
    const now = sharing();
    if (now !== lastSharing) {
      lastSharing = now;
      void desktop?.setActivitySharing?.(now);
      publish();
    }
  });
}
