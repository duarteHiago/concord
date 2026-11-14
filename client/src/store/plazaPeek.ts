// Ouvir uma mesa da Praça sem estar na call: espiando (shared/plaza.ts#PEEK_MS, dá para cochichar segurando um
// botão) ou só chegando perto (NEAR_MS, renovado enquanto continua perto, sem falar). Quem está na call vê o aviso
// enquanto dura (ver PeekNotice). Conexão separada da call de verdade (store/voice.ts); o servidor tira da sala
// quando o tempo acaba.
import { Room, RoomEvent, Track } from 'livekit-client';
import { create } from 'zustand';
import { getSocket } from '../lib/socket';
import { toast } from './toast';
import { useVoice } from './voice';

interface PeekState {
  serverId: string | null;
  channelId: string | null;
  /** só ouvindo de perto (sem cochichar) */
  near: boolean;
  until: number;
  whispering: boolean;
  start: (serverId: string, channelId: string, near?: boolean) => Promise<boolean>;
  renew: () => void;
  stop: () => void;
  setWhisper: (on: boolean) => Promise<void>;
  /** volume da mesa (0..1), pela distância até ela */
  setVolume: (v: number) => void;
}

type PeekAck = { ok: boolean; error?: string; token?: string; url?: string | null; until?: number };

let room: Room | null = null;
let volume = 1;

export const usePlazaPeek = create<PeekState>((set, get) => ({
  serverId: null,
  channelId: null,
  near: false,
  until: 0,
  whispering: false,

  start: async (serverId, channelId, near = false) => {
    get().stop();
    const r = await new Promise<PeekAck>((resolve) => getSocket()?.emit('plaza:peek', { serverId, channelId, near }, resolve));
    if (!r?.ok || !r.token) {
      if (!near) toast.info(r?.error ?? 'Não deu para espiar essa mesa.');
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
      if (!near) toast.info('Não deu para ouvir essa mesa agora.');
      void rm.disconnect();
      getSocket()?.emit('plaza:peek-stop', { serverId, channelId });
      return false;
    }
    room = rm;
    set({ serverId, channelId, near, until: r.until ?? Date.now() + 10_000, whispering: false });
    return true;
  },

  renew: () => {
    const { serverId, channelId, near } = get();
    if (!serverId || !channelId || !near) return;
    getSocket()?.emit('plaza:peek-renew', { serverId, channelId }, (r: { ok: boolean; until?: number }) => {
      if (get().channelId !== channelId) return;
      if (r?.ok && r.until) set({ until: r.until });
      else get().stop();
    });
  },

  stop: () => {
    const { serverId, channelId } = get();
    const r = room;
    room = null;
    document.querySelectorAll('[data-peek="1"]').forEach((el) => el.remove());
    if (channelId) {
      if (serverId) getSocket()?.emit('plaza:peek-stop', { serverId, channelId });
      set({ serverId: null, channelId: null, near: false, until: 0, whispering: false });
    }
    if (r) void r.disconnect();
  },

  setWhisper: async (on) => {
    if (!room || get().near || get().whispering === on) return;
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

// espiada com tempo: acaba sozinha quando o tempo passa (a de perto é renovada pela Praça enquanto continua perto)
setInterval(() => {
  const s = usePlazaPeek.getState();
  if (s.channelId && s.until && Date.now() > s.until + 300) s.stop();
}, 500);
