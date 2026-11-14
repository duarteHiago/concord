// Espiar uma mesa da Praça: ouvir a call dela por alguns segundos (shared/plaza.ts#PEEK_MS) e cochichar baixinho
// segurando um botão. Quem está na call vê o aviso "fulano está espiando" enquanto dura (ver PeekNotice).
// Conexão separada da call de verdade (store/voice.ts); o servidor tira da sala quando o tempo acaba.
import { Room, RoomEvent, Track } from 'livekit-client';
import { create } from 'zustand';
import { getSocket } from '../lib/socket';
import { toast } from './toast';
import { useVoice } from './voice';

interface PeekState {
  channelId: string | null;
  until: number;
  whispering: boolean;
  start: (serverId: string, channelId: string) => Promise<boolean>;
  stop: () => void;
  setWhisper: (on: boolean) => Promise<void>;
  /** volume da mesa (0..1), pela distância até ela */
  setVolume: (v: number) => void;
}

let room: Room | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;
let volume = 1;

export const usePlazaPeek = create<PeekState>((set, get) => ({
  channelId: null,
  until: 0,
  whispering: false,

  start: async (serverId, channelId) => {
    get().stop();
    const r = await new Promise<{ ok: boolean; error?: string; token?: string; url?: string | null; until?: number }>((resolve) =>
      getSocket()?.emit('plaza:peek', { serverId, channelId }, resolve),
    );
    if (!r?.ok || !r.token) {
      toast.info(r?.error ?? 'Não deu para espiar essa mesa.');
      return false;
    }
    const rm = new Room({ adaptiveStream: true, audioOutput: { deviceId: useVoice.getState().audioSettings.outputId } });
    rm.on(RoomEvent.TrackSubscribed, (track, _pub, p) => {
      if (track.kind !== Track.Kind.Audio) return;
      const el = track.attach();
      el.dataset.peek = '1';
      document.body.appendChild(el);
      p.setVolume(volume);
    });
    rm.on(RoomEvent.TrackUnsubscribed, (track) => track.detach().forEach((el) => el.remove()));
    rm.on(RoomEvent.Disconnected, () => {
      if (room === rm) get().stop();
    });
    try {
      const wsUrl = r.url ?? `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/livekit`;
      await rm.connect(wsUrl, r.token, { autoSubscribe: true });
    } catch {
      toast.info('Não deu para ouvir essa mesa agora.');
      void rm.disconnect();
      return false;
    }
    room = rm;
    set({ channelId, until: r.until ?? Date.now() + 10_000, whispering: false });
    timer = setTimeout(() => get().stop(), Math.max(0, (r.until ?? Date.now() + 10_000) - Date.now()));
    return true;
  },

  stop: () => {
    clearTimeout(timer);
    const r = room;
    room = null;
    document.querySelectorAll('[data-peek="1"]').forEach((el) => el.remove());
    if (get().channelId) set({ channelId: null, until: 0, whispering: false });
    if (r) void r.disconnect();
  },

  setWhisper: async (on) => {
    if (!room || get().whispering === on) return;
    try {
      const { inputId, echoCancellation, autoGain } = useVoice.getState().audioSettings;
      await room.localParticipant.setMicrophoneEnabled(on, { deviceId: inputId, echoCancellation, autoGainControl: autoGain, noiseSuppression: true });
      set({ whispering: on });
    } catch (err) {
      toast.error(err);
    }
  },

  setVolume: (v) => {
    if (!room || Math.abs(v - volume) < 0.02) return;
    volume = v;
    for (const p of room.remoteParticipants.values()) p.setVolume(v);
  },
}));
