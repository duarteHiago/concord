// Voz por proximidade no lobby da Praça: uma sala do LiveKit por servidor, separada das calls (store/voice.ts).
// Conecta quando a pessoa está no lobby e não está numa call; o microfone entra desligado. O volume de cada
// pessoa vem da distância entre os bonecos (ver shared/plaza.ts#proximityVolume), ajustado pelo desenho da praça.
import { Room, RoomEvent, Track, type RemoteAudioTrack, type RemoteParticipant, type RemoteTrack } from 'livekit-client';
import { create } from 'zustand';
import { api } from '../lib/api';
import { toast } from './toast';
import { useVoice } from './voice';

interface PlazaVoiceState {
  serverId: string | null;
  status: 'idle' | 'connecting' | 'connected';
  micOn: boolean;
  canSpeak: boolean;
  /** ensurdecido na Praça: não ouve ninguém e o microfone desliga (volta como estava ao ouvir de novo) */
  deafened: boolean;
  /** quem está falando agora no lobby (pelo LiveKit) */
  speaking: Record<string, true>;
  connect: (serverId: string) => Promise<void>;
  disconnect: () => void;
  toggleMic: () => Promise<void>;
  toggleDeafen: () => Promise<void>;
  /** volume (0..1) de cada pessoa, pela distância; quem está longe deixa de ser recebido */
  setVolumes: (volumes: Map<string, number>) => void;
}

let room: Room | null = null;
let micBeforeDeafen = false;
const audioEls = new Map<string, HTMLMediaElement>();
const lastVolume = new Map<string, number>();

function attachAudio(track: RemoteTrack, p: RemoteParticipant) {
  if (track.kind !== Track.Kind.Audio) return;
  const el = track.attach();
  el.dataset.plaza = '1';
  document.body.appendChild(el);
  audioEls.set(p.identity, el);
  (track as RemoteAudioTrack).setVolume(lastVolume.get(p.identity) ?? 0);
}

function detachAll() {
  for (const el of audioEls.values()) el.remove();
  audioEls.clear();
  lastVolume.clear();
}

export const usePlazaVoice = create<PlazaVoiceState>((set, get) => ({
  serverId: null,
  status: 'idle',
  micOn: false,
  canSpeak: false,
  speaking: {},
  deafened: false,

  connect: async (serverId) => {
    if (get().serverId === serverId && get().status !== 'idle') return;
    get().disconnect();
    set({ serverId, status: 'connecting', micOn: false, speaking: {} });
    try {
      const { token, url, canSpeak } = await api.post<{ token: string; url: string | null; canSpeak: boolean }>(`/servers/${serverId}/plaza/voice-token`);
      if (get().serverId !== serverId) return;
      const r = new Room({ adaptiveStream: true, dynacast: true, audioOutput: { deviceId: useVoice.getState().audioSettings.outputId } });
      r.on(RoomEvent.TrackSubscribed, (track, _pub, p) => attachAudio(track, p));
      r.on(RoomEvent.TrackUnsubscribed, (track, _pub, p) => {
        track.detach().forEach((el) => el.remove());
        audioEls.delete(p.identity);
      });
      r.on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
        const speaking: Record<string, true> = {};
        for (const s of speakers) speaking[s.identity] = true;
        set({ speaking });
      });
      r.on(RoomEvent.Disconnected, () => {
        if (room === r) {
          room = null;
          detachAll();
          set({ status: 'idle', micOn: false, speaking: {} });
        }
      });
      const wsUrl = url ?? `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/livekit`;
      // só recebe o áudio de quem está perto (setVolumes liga e desliga a assinatura)
      await r.connect(wsUrl, token, { autoSubscribe: false });
      if (get().serverId !== serverId) {
        void r.disconnect();
        return;
      }
      room = r;
      set({ status: 'connected', canSpeak });
    } catch {
      // sem voz no lobby (LiveKit fora do ar, ou saiu do lobby no meio): a praça continua funcionando sem som
      if (get().serverId === serverId) set({ status: 'idle', serverId: null });
    }
  },

  disconnect: () => {
    const r = room;
    room = null;
    detachAll();
    set({ serverId: null, status: 'idle', micOn: false, speaking: {} });
    if (r) void r.disconnect();
  },

  toggleMic: async () => {
    if (!room) return;
    if (!get().canSpeak) {
      toast.info('Você não pode falar neste servidor agora.');
      return;
    }
    const next = !get().micOn;
    // falar tira o ensurdecer (como nas calls)
    if (next && get().deafened) set({ deafened: false });
    try {
      const { inputId, echoCancellation, autoGain } = useVoice.getState().audioSettings;
      await room.localParticipant.setMicrophoneEnabled(next, { deviceId: inputId, echoCancellation, autoGainControl: autoGain, noiseSuppression: true });
      set({ micOn: next });
    } catch (err) {
      toast.error(err);
    }
  },

  toggleDeafen: async () => {
    const next = !get().deafened;
    set({ deafened: next });
    if (next) {
      micBeforeDeafen = get().micOn;
      if (get().micOn) await get().toggleMic();
      // o volume de cada um vai a zero no próximo setVolumes (umas 10 vezes por segundo, enquanto a Praça está aberta)
    } else {
      if (micBeforeDeafen && !get().micOn) await get().toggleMic();
    }
  },

  setVolumes: (volumes) => {
    if (!room) return;
    const deaf = useVoice.getState().deafened || get().deafened;
    for (const p of room.remoteParticipants.values()) {
      const v = deaf ? 0 : (volumes.get(p.identity) ?? 0);
      const pub = p.getTrackPublication(Track.Source.Microphone);
      if (!pub) continue;
      // longe demais: nem recebe o áudio (economiza banda); perto: recebe e ajusta o volume
      const want = v > 0.001;
      if (pub.isSubscribed !== want) pub.setSubscribed(want);
      const prev = lastVolume.get(p.identity) ?? -1;
      if (Math.abs(prev - v) > 0.02) {
        lastVolume.set(p.identity, v);
        (pub.track as RemoteAudioTrack | undefined)?.setVolume(v);
      }
    }
  },
}));

// trocou o microfone ou a saída de áudio (na Praça ou em qualquer lugar do app): a voz da Praça troca na hora
useVoice.subscribe((s, prev) => {
  if (!room) return;
  const { inputId, outputId } = s.audioSettings;
  if (outputId !== prev.audioSettings.outputId && outputId) void room.switchActiveDevice('audiooutput', outputId).catch(() => {});
  if (inputId !== prev.audioSettings.inputId && inputId && usePlazaVoice.getState().micOn) void room.switchActiveDevice('audioinput', inputId).catch(() => {});
});
