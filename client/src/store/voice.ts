import {
  AudioPresets,
  ConnectionState,
  DisconnectReason,
  Room,
  RoomEvent,
  Track,
  VideoPreset,
  VideoPresets,
  type LocalAudioTrack,
  type RemoteTrack,
  type VideoCodec,
} from 'livekit-client';
import type { Socket } from 'socket.io-client';
import { create } from 'zustand';
import { P, has } from '../../../shared/permissions.ts';
import { api } from '../lib/api';
import { desktop, desktopInfo, startDesktopAudio, type DesktopAudio } from '../lib/desktop';
import { closePopout } from '../lib/popout';
import { applyVoiceProcessing, EFFECTS, type EffectId, type NoiseMode } from '../lib/voiceEffects';
import { playSound } from '../lib/sounds';
import { getSocket } from '../lib/socket';
import { toast } from './toast';

export interface SharePreset {
  id: string;
  label: string;
  hint: string;
  width: number;
  height: number;
  /** bitrate de referência, calibrado para 60 fps (outras taxas escalam a partir dele) */
  bitrate: number;
}

export const SHARE_PRESETS: SharePreset[] = [
  { id: '720p', label: '720p', hint: 'Leve, ótimo para conexões modestas', width: 1280, height: 720, bitrate: 4_500_000 },
  { id: '1080p', label: '1080p', hint: 'Recomendado para jogos e vídeos', width: 1920, height: 1080, bitrate: 9_000_000 },
  { id: '1440p', label: '1440p', hint: 'Alta definição, exige bom upload', width: 2560, height: 1440, bitrate: 15_000_000 },
  { id: 'source', label: 'Nativa', hint: 'Resolução da tela/janela, até 4K', width: 3840, height: 2160, bitrate: 22_000_000 },
];

/** Taxas de quadro disponíveis; acima de 60 só faz sentido com monitor e GPU compatíveis. */
export const FPS_OPTIONS = [30, 60, 120, 144, 240] as const;
export type FpsOption = (typeof FPS_OPTIONS)[number];

/** Estima o bitrate necessário para uma taxa de quadros diferente da referência (60 fps), com retorno decrescente. */
export function estimateBitrate(preset: SharePreset, fps: number): number {
  return Math.round(preset.bitrate * Math.sqrt(fps / 60));
}

export interface ShareSettings {
  presetId: string;
  fps: FpsOption;
  audio: boolean;
  mode: 'motion' | 'detail';
  codec: VideoCodec;
}

export interface AudioSettings {
  inputId: string;
  outputId: string;
  noiseMode: NoiseMode;
  echoCancellation: boolean;
  videoInputId: string;
  cameraQuality: '720p' | '1080p';
}

type Status = 'idle' | 'connecting' | 'connected' | 'reconnecting';

interface VoiceStore {
  room: Room | null;
  serverId: string | null;
  channelId: string | null;
  status: Status;
  permissions: number;
  micOn: boolean;
  deafened: boolean;
  cameraOn: boolean;
  sharing: boolean;
  serverMuted: boolean;
  speaking: Record<string, true>;
  watching: Record<string, true>;
  focus: string | null;
  volumes: Record<string, number>;
  /** pessoas silenciadas só para mim (o áudio delas não toca aqui) */
  localMuted: Record<string, true>;
  streamVolumes: Record<string, number>;
  shareSettings: ShareSettings;
  audioSettings: AudioSettings;
  tick: number;

  join: (serverId: string, channelId: string) => Promise<void>;
  leave: () => Promise<void>;
  toggleMic: () => Promise<void>;
  toggleDeafen: () => Promise<void>;
  toggleCamera: () => Promise<void>;
  /** sourceId: fonte escolhida no seletor do app desktop (no navegador, o próprio navegador pergunta). */
  startShare: (settings: ShareSettings, sourceId?: string) => Promise<void>;
  stopShare: () => Promise<void>;
  setWatching: (identity: string, on: boolean) => void;
  setFocus: (key: string | null) => void;
  setVolume: (identity: string, volume: number, stream?: boolean) => void;
  toggleLocalMute: (identity: string) => void;
  effect: EffectId;
  setEffect: (effect: EffectId) => Promise<void>;
  setAudioSettings: (patch: Partial<AudioSettings>) => Promise<void>;
  bindSocket: (socket: Socket) => void;
  resync: () => void;
}

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch {
    return fallback;
  }
}
function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignorado
  }
}

const DEFAULT_SHARE: ShareSettings = { presetId: '1080p', fps: 60, audio: true, mode: 'motion', codec: 'h264' };

/** Carrega as preferências salvas, migrando o formato antigo (fps embutido no id do preset, ex.: "1080p60"). */
function loadShareSettings(): ShareSettings {
  const raw = load<Partial<ShareSettings> & { presetId?: string }>('concord.share', {});
  let presetId = raw.presetId ?? DEFAULT_SHARE.presetId;
  let fps = FPS_OPTIONS.includes(raw.fps as FpsOption) ? (raw.fps as FpsOption) : undefined;
  const legacy = /^(.*?)(30|60)$/.exec(presetId);
  if (legacy) {
    presetId = legacy[1] || DEFAULT_SHARE.presetId;
    fps = fps ?? (Number(legacy[2]) as FpsOption);
  }
  if (!SHARE_PRESETS.some((p) => p.id === presetId)) presetId = DEFAULT_SHARE.presetId;
  return {
    presetId,
    fps: fps ?? DEFAULT_SHARE.fps,
    audio: raw.audio ?? DEFAULT_SHARE.audio,
    mode: raw.mode ?? DEFAULT_SHARE.mode,
    codec: raw.codec ?? DEFAULT_SHARE.codec,
  };
}
const DEFAULT_AUDIO: AudioSettings = {
  inputId: 'default',
  outputId: 'default',
  noiseMode: 'rnnoise',
  echoCancellation: true,
  videoInputId: '',
  cameraQuality: '720p',
};

let audioContainer: HTMLDivElement | null = null;
function audioHost() {
  if (!audioContainer) {
    audioContainer = document.createElement('div');
    audioContainer.style.display = 'none';
    document.body.appendChild(audioContainer);
  }
  return audioContainer;
}

/** Retorna uma mensagem se este navegador não consegue abrir o seletor de tela/janela. */
export function screenShareSupport(): string | null {
  if (!window.isSecureContext) {
    return 'A captura de tela só funciona em HTTPS ou em http://localhost. Acesse o app por um desses endereços.';
  }
  // no Concord Desktop o seletor é o nosso; em outros apps Electron (ex.: VS Code) não há seletor
  if (!desktop && /Electron|Code\//.test(navigator.userAgent)) {
    return 'Este navegador embutido (ex.: navegador do VS Code) não tem seletor de tela. Abra o app no Chrome ou Edge.';
  }
  if (!navigator.mediaDevices?.getDisplayMedia) {
    return 'Este navegador não suporta transmissão de tela. Use o Chrome ou Edge no computador.';
  }
  return null;
}

let intentionalLeave = false;
let micBeforeDeafen = false;

export const useVoice = create<VoiceStore>((set, get) => {
  const bump = () => set({ tick: get().tick + 1 });

  function publishState() {
    const s = get();
    if (s.status === 'idle') return;
    getSocket()?.emit('voice:update', { muted: !s.micOn, deafened: s.deafened, streaming: s.sharing, camera: s.cameraOn });
  }

  function syncLocalFlags() {
    const lp = get().room?.localParticipant;
    if (!lp) return;
    set({ micOn: lp.isMicrophoneEnabled, cameraOn: lp.isCameraEnabled, sharing: lp.isScreenShareEnabled });
    publishState();
  }

  function applyVolumes() {
    const { room, deafened, volumes, streamVolumes, localMuted } = get();
    if (!room) return;
    for (const p of room.remoteParticipants.values()) {
      p.setVolume(deafened || localMuted[p.identity] ? 0 : (volumes[p.identity] ?? 1), Track.Source.Microphone);
      p.setVolume(deafened ? 0 : (streamVolumes[p.identity] ?? 1), Track.Source.ScreenShareAudio);
    }
  }

  /** Assina sempre microfone e câmera; tela somente de quem a pessoa escolheu assistir. */
  function syncSubscriptions() {
    const { room, watching } = get();
    if (!room) return;
    for (const p of room.remoteParticipants.values()) {
      for (const pub of p.trackPublications.values()) {
        const isScreen = pub.source === Track.Source.ScreenShare || pub.source === Track.Source.ScreenShareAudio;
        const want = isScreen ? !!watching[p.identity] : true;
        if (pub.isSubscribed !== want) pub.setSubscribed(want);
      }
    }
  }

  // ---- áudio da transmissão no app desktop (capturador por processo, sem retorno) ----
  let desktopAudio: DesktopAudio | null = null;

  async function startDesktopShareAudio(sourceId: string) {
    const room = get().room;
    if (!room) return;
    try {
      desktopAudio = await startDesktopAudio(sourceId, (message) => {
        toast.error(`O áudio da transmissão parou: ${message}`);
        void stopDesktopShareAudio();
      });
      await room.localParticipant.publishTrack(desktopAudio.track, {
        source: Track.Source.ScreenShareAudio,
        name: 'screen-share-audio',
        audioPreset: AudioPresets.musicHighQualityStereo,
        forceStereo: true,
        dtx: false,
        red: false,
      });
    } catch (err) {
      toast.error(`Não foi possível capturar o áudio: ${(err as Error).message}`);
      await stopDesktopShareAudio();
    }
  }

  async function stopDesktopShareAudio() {
    const audio = desktopAudio;
    desktopAudio = null;
    if (!audio) return;
    const pub = get().room?.localParticipant.getTrackPublication(Track.Source.ScreenShareAudio);
    if (pub?.track) await get().room?.localParticipant.unpublishTrack(pub.track).catch(() => {});
    audio.track.stop();
    await audio.stop();
  }

  function cleanup() {
    void stopDesktopShareAudio();
    audioContainer?.replaceChildren();
    set({
      room: null,
      serverId: null,
      channelId: null,
      status: 'idle',
      micOn: false,
      cameraOn: false,
      sharing: false,
      serverMuted: false,
      speaking: {},
      watching: {},
      focus: null,
    });
  }

  function wireRoom(room: Room) {
    room
      .on(RoomEvent.ParticipantConnected, () => {
        playSound('peerJoin');
        syncSubscriptions();
        bump();
      })
      .on(RoomEvent.ParticipantDisconnected, (p) => {
        playSound('peerLeave');
        const { [p.identity]: _w, ...watching } = get().watching;
        const focus = get().focus?.startsWith(`${p.identity}:`) ? null : get().focus;
        set({ watching, focus });
        bump();
      })
      .on(RoomEvent.TrackPublished, (pub) => {
        if (pub.source === Track.Source.ScreenShare) playSound('stream');
        syncSubscriptions();
        bump();
      })
      .on(RoomEvent.TrackUnpublished, (pub, p) => {
        if (pub.source === Track.Source.ScreenShare) {
          const { [p.identity]: _w, ...watching } = get().watching;
          set({ watching, focus: get().focus === `${p.identity}:screen` ? null : get().focus });
        }
        bump();
      })
      .on(RoomEvent.TrackSubscribed, (track: RemoteTrack) => {
        if (track.kind === Track.Kind.Audio) {
          audioHost().appendChild(track.attach());
          applyVolumes();
        }
        bump();
      })
      .on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => {
        if (track.kind === Track.Kind.Video) closePopout(track.sid);
        if (track.kind === Track.Kind.Audio) track.detach().forEach((el) => el.remove());
        bump();
      })
      .on(RoomEvent.TrackMuted, bump)
      .on(RoomEvent.TrackUnmuted, bump)
      .on(RoomEvent.LocalTrackPublished, () => {
        syncLocalFlags();
        bump();
      })
      .on(RoomEvent.LocalTrackUnpublished, (pub) => {
        closePopout(pub.trackSid);
        // transmissão encerrada por fora (ex.: janela capturada fechou): para o áudio junto
        if (pub.source === Track.Source.ScreenShare) void stopDesktopShareAudio();
        if (pub.source === Track.Source.ScreenShare && get().focus === `${room.localParticipant.identity}:screen`) set({ focus: null });
        syncLocalFlags();
        bump();
      })
      .on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
        set({ speaking: Object.fromEntries(speakers.map((p) => [p.identity, true as const])) });
      })
      .on(RoomEvent.ConnectionStateChanged, (state) => {
        if (state === ConnectionState.Reconnecting || state === ConnectionState.SignalReconnecting) set({ status: 'reconnecting' });
        else if (state === ConnectionState.Connected && get().status !== 'idle') set({ status: 'connected' });
      })
      .on(RoomEvent.MediaDevicesError, (err) => toast.error(`Dispositivo de mídia: ${err.message}`))
      .on(RoomEvent.Disconnected, (reason) => {
        if (get().room !== room) return;
        getSocket()?.emit('voice:leave');
        cleanup();
        if (!intentionalLeave && reason !== DisconnectReason.CLIENT_INITIATED) {
          playSound('leave');
          toast.info(reason === DisconnectReason.PARTICIPANT_REMOVED ? 'Você foi removido da sala.' : 'Conexão com a sala perdida.');
        }
      });
  }

  async function applyCurrentEffect() {
    const pub = get().room?.localParticipant.getTrackPublication(Track.Source.Microphone);
    const track = pub?.track as LocalAudioTrack | undefined;
    if (!track) return;
    try {
      await applyVoiceProcessing(track, get().audioSettings.noiseMode, get().effect);
    } catch (err) {
      toast.error(`Não foi possível aplicar o efeito: ${(err as Error).message}`);
    }
  }

  async function enableMic(on: boolean) {
    const room = get().room;
    if (!room) return;
    const { inputId, noiseMode, echoCancellation } = get().audioSettings;
    await room.localParticipant.setMicrophoneEnabled(
      on,
      {
        deviceId: inputId,
        // voz é sempre mono: alguns fones/placas se apresentam como estéreo com um lado vazio
        channelCount: 1,
        // com a IA ligada, o filtro do navegador fica desligado (senão a voz é processada duas vezes)
        noiseSuppression: noiseMode === 'browser',
        echoCancellation,
        autoGainControl: true,
      },
      // sem isso o LiveKit publica em estéreo quando o microfone diz ter 2 canais, e quem ouve
      // pode receber a voz só num lado do fone
      { forceStereo: false },
    );
    syncLocalFlags();
    if (on) await applyCurrentEffect();
  }

  return {
    room: null,
    serverId: null,
    channelId: null,
    status: 'idle',
    permissions: 0,
    micOn: false,
    deafened: false,
    cameraOn: false,
    sharing: false,
    serverMuted: false,
    speaking: {},
    watching: {},
    focus: null,
    volumes: load('concord.volumes', {} as Record<string, number>),
    localMuted: load('concord.localMuted', {} as Record<string, true>),
    effect: loadEffect(),

    setEffect: async (effect) => {
      set({ effect });
      try {
        localStorage.setItem('concord.effect', effect);
      } catch {
        // ignorado
      }
      if (get().micOn) await applyCurrentEffect();
    },
    streamVolumes: load('concord.streamVolumes', {} as Record<string, number>),
    shareSettings: loadShareSettings(),
    audioSettings: loadAudioSettings(),
    tick: 0,

    join: async (serverId, channelId) => {
      if (get().channelId === channelId && get().status !== 'idle') return;
      if (get().room) await get().leave();

      set({ status: 'connecting', serverId, channelId });
      try {
        const { token, url, permissions } = await api.post<{ token: string; url: string | null; permissions: number }>(
          `/channels/${channelId}/voice-token`,
        );
        if (get().channelId !== channelId) return; // trocou de sala durante a conexão

        const room = new Room({
          // não pausa o vídeo com a janela minimizada: a live pode estar aberta em outra janela
          adaptiveStream: { pauseVideoInBackground: false },
          dynacast: true,
          audioOutput: { deviceId: get().audioSettings.outputId },
          videoCaptureDefaults: { resolution: VideoPresets.h720.resolution },
          publishDefaults: { red: true, dtx: true },
        });
        wireRoom(room);
        set({ room, permissions });

        const wsUrl = url ?? `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/livekit`;
        intentionalLeave = false;
        await room.connect(wsUrl, token, { autoSubscribe: false });

        await new Promise<void>((resolve, reject) => {
          getSocket()?.emit('voice:join', { channelId }, (r: { ok: boolean; error?: string }) =>
            r.ok ? resolve() : reject(new Error(r.error)),
          );
        });

        set({ status: 'connected' });
        playSound('join');
        await room.startAudio().catch(() => {});
        syncSubscriptions();
        applyVolumes();

        if (has(permissions, P.SPEAK) && !get().deafened) {
          try {
            await enableMic(true);
          } catch (err) {
            toast.error(`Não foi possível acessar o microfone: ${(err as Error).message}`);
          }
        }
        publishState();
        bump();
      } catch (err) {
        if (get().channelId === channelId) {
          intentionalLeave = true;
          await get().room?.disconnect();
          cleanup();
          toast.error(err);
        }
      }
    },

    leave: async () => {
      const room = get().room;
      if (!room && get().status === 'idle') return;
      intentionalLeave = true;
      getSocket()?.emit('voice:leave');
      cleanup();
      await room?.disconnect();
      playSound('leave');
    },

    toggleMic: async () => {
      const s = get();
      if (!s.room) return;
      if (s.serverMuted) return toast.info('Você foi silenciado por um moderador.');
      if (!has(s.permissions, P.SPEAK)) return toast.info('Você não tem permissão para falar nesta sala.');
      const next = !s.micOn;
      try {
        if (next && s.deafened) {
          set({ deafened: false });
          applyVolumes();
        }
        await enableMic(next);
        playSound(next ? 'unmute' : 'mute');
      } catch (err) {
        toast.error(err);
      }
    },

    toggleDeafen: async () => {
      const s = get();
      const next = !s.deafened;
      set({ deafened: next });
      applyVolumes();
      playSound(next ? 'mute' : 'unmute');
      if (s.room) {
        if (next) {
          micBeforeDeafen = s.micOn;
          if (s.micOn) await enableMic(false).catch(() => {});
        } else if (micBeforeDeafen && !s.serverMuted) {
          await enableMic(true).catch(() => {});
        }
      }
      publishState();
    },

    toggleCamera: async () => {
      const s = get();
      if (!s.room) return;
      if (!has(s.permissions, P.STREAM)) return toast.info('Você não tem permissão para transmitir nesta sala.');
      try {
        const { videoInputId, cameraQuality } = s.audioSettings;
        const hd = cameraQuality === '1080p';
        await s.room.localParticipant.setCameraEnabled(!s.cameraOn, {
          deviceId: videoInputId || undefined,
          resolution: hd ? VideoPresets.h1080.resolution : VideoPresets.h720.resolution,
        }, {
          videoEncoding: { maxBitrate: hd ? 3_500_000 : 1_800_000, maxFramerate: 30 },
          simulcast: true,
        });
        syncLocalFlags();
      } catch (err) {
        toast.error(err);
      }
    },

    startShare: async (settings, sourceId) => {
      const s = get();
      if (!s.room) return;
      if (!has(s.permissions, P.STREAM)) return toast.info('Você não tem permissão para transmitir nesta sala.');
      set({ shareSettings: settings });
      save('concord.share', settings);
      const support = screenShareSupport();
      if (support) return toast.error(support);
      const preset = SHARE_PRESETS.find((p) => p.id === settings.presetId) ?? SHARE_PRESETS[1];
      const fps = settings.fps;
      const bitrate = estimateBitrate(preset, fps);
      const lp = s.room.localParticipant;
      const startedAt = performance.now();
      // No app desktop o áudio vem do capturador por processo (sem as vozes da sala),
      // então o getDisplayMedia pede só o vídeo da fonte escolhida no seletor do Concord.
      const desktopShare = !!desktop && !!sourceId;
      try {
        if (lp.isScreenShareEnabled) await get().stopShare();
        if (desktopShare) await desktop!.selectSource(sourceId!);
        await lp.setScreenShareEnabled(
          true,
          {
            audio: settings.audio && !desktopShare ? { echoCancellation: false, noiseSuppression: false, autoGainControl: false } : false,
            resolution: { width: preset.width, height: preset.height, frameRate: fps },
            contentHint: settings.mode === 'motion' ? 'motion' : 'detail',
            selfBrowserSurface: 'exclude',
            surfaceSwitching: 'include',
            systemAudio: 'include',
            suppressLocalAudioPlayback: true,
          },
          {
            videoCodec: settings.codec,
            screenShareEncoding: { maxBitrate: bitrate, maxFramerate: fps, priority: 'high' },
            screenShareSimulcastLayers: preset.height > 720 ? [new VideoPreset(1280, 720, 2_000_000, 30)] : [],
            simulcast: true,
            degradationPreference: settings.mode === 'motion' ? 'maintain-framerate' : 'maintain-resolution',
            audioPreset: AudioPresets.musicHighQualityStereo,
            dtx: false,
            red: false,
          },
        );
        syncLocalFlags();
        set({ focus: `${lp.identity}:screen` });
        bump();
        if (desktopShare && settings.audio && (await desktopInfo()).processAudio) {
          await startDesktopShareAudio(sourceId!);
        }
      } catch (err) {
        const name = (err as Error).name;
        // recusa instantânea = o navegador nem mostrou o seletor (bloqueado), não foi a pessoa que cancelou
        const instant = performance.now() - startedAt < 400;
        if (name === 'NotAllowedError' && instant) {
          toast.error('O navegador bloqueou a captura de tela. Verifique a permissão de "Compartilhar tela" do site ou use o Chrome/Edge.');
        } else if (name !== 'NotAllowedError' && name !== 'AbortError') {
          toast.error(err);
        }
      }
    },

    stopShare: async () => {
      const room = get().room;
      if (!room) return;
      await stopDesktopShareAudio();
      await room.localParticipant.setScreenShareEnabled(false);
      syncLocalFlags();
    },

    setWatching: (identity, on) => {
      const watching = { ...get().watching };
      if (on) watching[identity] = true;
      else delete watching[identity];
      set({ watching, focus: on ? `${identity}:screen` : get().focus === `${identity}:screen` ? null : get().focus });
      syncSubscriptions();
      bump();
    },

    setFocus: (focus) => set({ focus }),

    toggleLocalMute: (identity) => {
      const localMuted = { ...get().localMuted };
      if (localMuted[identity]) delete localMuted[identity];
      else localMuted[identity] = true;
      set({ localMuted });
      save('concord.localMuted', localMuted);
      applyVolumes();
    },

    setVolume: (identity, volume, stream = false) => {
      if (stream) {
        const streamVolumes = { ...get().streamVolumes, [identity]: volume };
        set({ streamVolumes });
        save('concord.streamVolumes', streamVolumes);
      } else {
        const volumes = { ...get().volumes, [identity]: volume };
        set({ volumes });
        save('concord.volumes', volumes);
      }
      applyVolumes();
    },

    setAudioSettings: async (patch) => {
      const audioSettings = { ...get().audioSettings, ...patch };
      set({ audioSettings });
      save('concord.audio', audioSettings);
      const room = get().room;
      if (!room) return;
      try {
        if (patch.outputId) await room.switchActiveDevice('audiooutput', patch.outputId);
        if (patch.inputId && get().micOn) await room.switchActiveDevice('audioinput', patch.inputId);
        if (patch.videoInputId && get().cameraOn) await room.switchActiveDevice('videoinput', patch.videoInputId);
        if ((patch.noiseMode !== undefined || patch.echoCancellation !== undefined) && get().micOn) {
          await enableMic(false);
          await enableMic(true);
        }
      } catch (err) {
        toast.error(err);
      }
    },

    bindSocket: (socket) => {
      socket.on('voice:force-disconnect', ({ reason }: { reason: string }) => {
        void get().leave();
        toast.info(reason);
      });
      socket.on('voice:server-mute', async ({ muted }: { muted: boolean }) => {
        set({ serverMuted: muted });
        if (muted) {
          await enableMic(false).catch(() => {});
          toast.info('Você foi silenciado por um moderador.');
        } else {
          toast.info('Um moderador removeu seu silenciamento.');
        }
        publishState();
      });
      socket.on('voice:stop-stream', ({ reason }: { reason: string }) => {
        void get().stopShare();
        toast.info(reason);
      });
    },

    resync: () => {
      const { status, channelId } = get();
      if (status === 'idle' || !channelId) return;
      getSocket()?.emit('voice:join', { channelId }, () => publishState());
    },
  };
});

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    void useVoice.getState().room?.disconnect();
  });
}

function loadEffect(): EffectId {
  try {
    const v = localStorage.getItem('concord.effect');
    return EFFECTS.some((e) => e.id === v) ? (v as EffectId) : 'none';
  } catch {
    return 'none';
  }
}

/** Preferências de áudio salvas; converte o antigo "noiseSuppression" (liga/desliga) no modo novo. */
function loadAudioSettings(): AudioSettings {
  const saved = load('concord.audio', DEFAULT_AUDIO) as AudioSettings & { noiseSuppression?: boolean };
  let hadMode = false;
  try {
    hadMode = 'noiseMode' in JSON.parse(localStorage.getItem('concord.audio') ?? '{}');
  } catch {
    // ignorado
  }
  if (!hadMode && saved.noiseSuppression === false) saved.noiseMode = 'off';
  delete saved.noiseSuppression;
  return saved;
}
