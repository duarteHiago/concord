import {
  AudioPresets,
  BackupCodecPolicy,
  ConnectionState,
  DisconnectReason,
  Room,
  RoomEvent,
  Track,
  VideoPreset,
  VideoPresets,
  type LocalAudioTrack,
  type LocalTrack,
  type LocalVideoTrack,
  type RemoteParticipant,
  type RemoteTrack,
  type RemoteTrackPublication,
  type TrackPublishOptions,
  type VideoCodec,
} from 'livekit-client';
import type { Socket } from 'socket.io-client';
import { create } from 'zustand';
import { P, has } from '../../../shared/permissions.ts';
import { api } from '../lib/api';
import { desktop, desktopInfo, startDesktopAudio, type DesktopAudio } from '../lib/desktop';
import { closePopout } from '../lib/popout';
import { applyVoiceProcessing, DEFAULT_GATE, DEFAULT_NOISE_STRENGTH, updateNoiseStrength, EFFECTS, updateGate, micLevels, voiceNotices, type EffectId, type GateSettings, type MicLevel, type NoiseMode } from '../lib/voiceEffects';
import { playSound } from '../lib/sounds';
import { getSocket } from '../lib/socket';
import { diagnoseH265, h265Support, type H265Diagnosis } from '../lib/h265';
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

// Taxas acima de 60 chegaram a ser oferecidas (até 240), mas o feedback ao vivo raramente
// mostrava a transmissão passando de 60 fps de verdade — o ganho não compensava a instabilidade
// que causavam. Foco agora é 60 fps estáveis, com o máximo de qualidade e nitidez de imagem.
export const FPS_OPTIONS = [30, 60] as const;
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
  /** 'auto' = o codec que a placa de vídeo codifica (escolhido na hora de transmitir) */
  codec: VideoCodec | 'auto';
  /** H.265: se alguém não conseguir assistir, a transmissão inteira passa para H.264 (senão, essa pessoa vê o tutorial) */
  allowFallback: boolean;
  /** versão das preferências (para migrações) */
  v?: number;
}

/** Quem pediu ao host para liberar o H.264 (o host recusou a troca automática). */
export interface CodecRequest {
  identity: string;
  name: string;
}

export interface AudioSettings {
  inputId: string;
  outputId: string;
  noiseMode: NoiseMode;
  echoCancellation: boolean;
  /** ganho automático do navegador (sobe o volume quando você fala baixo) */
  autoGain: boolean;
  /** portão de voz: fecha o microfone quando você não está falando */
  gate: GateSettings;
  /** força da supressão do DeepFilterNet3 (limite de atenuação em dB) */
  noiseStrength: number;
  /** versão das preferências (para migrações) */
  v?: number;
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
  /** codec em que a minha tela está saindo agora ('h264-backup': era H.265 e o servidor passou todos para H.264) */
  shareCodec: VideoCodec | 'h264-backup' | null;
  /** pedidos de "liberar H.264" para a minha transmissão em H.265 */
  codecRequests: CodecRequest[];
  /** transmissões que eu não consigo assistir (H.265 sem troca para H.264), com o motivo provável */
  h265Blocked: Record<string, H265Diagnosis>;

  join: (serverId: string, channelId: string) => Promise<void>;
  leave: () => Promise<void>;
  toggleMic: () => Promise<void>;
  toggleDeafen: () => Promise<void>;
  toggleCamera: () => Promise<void>;
  /** sourceId: fonte escolhida no seletor do app desktop (no navegador, o próprio navegador pergunta). */
  startShare: (settings: ShareSettings, sourceId?: string) => Promise<void>;
  stopShare: () => Promise<void>;
  /** passa a minha transmissão H.265 para H.264 sem parar a captura */
  fallbackToH264: () => Promise<void>;
  /** espectador: pede ao host para liberar o H.264 */
  requestH264: (identity: string) => void;
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

// a IA máxima não carregou (rede, navegador antigo, ou um reinício do microfone no meio de uma
// falha passageira — ver o "cooldown" em voiceEffects.ts): o processamento já caiu para a IA leve
// sozinho. Só avisa; não grava isso como preferência (a pessoa continua com a IA máxima escolhida
// em Configurações, e o próprio voiceEffects.ts volta a tentar de novo sozinho depois de um tempo —
// gravar a troca aqui fazia a pessoa ter que voltar em Configurações toda vez pra "destravar").
voiceNotices.addEventListener('fallback', () => {
  toast.info('A supressão máxima (DeepFilterNet 3) não carregou agora; usando a IA leve (GTCRN) por alguns minutos.');
});

const DEFAULT_SHARE: ShareSettings = { presetId: '1080p', fps: 60, audio: true, mode: 'motion', codec: 'auto', allowFallback: true, v: 2 };

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
    // v2: codec automático (quem ficou em VP8 codificava a tela pelo processador e travava o PC)
    codec: raw.v === 2 ? (raw.codec ?? DEFAULT_SHARE.codec) : 'auto',
    allowFallback: raw.allowFallback ?? DEFAULT_SHARE.allowFallback,
    v: 2,
  };
}

/**
 * Codec automático: H.264. Com o servidor aceitando o perfil 42001f (deploy/livekit.yaml), o Chromium codifica
 * H.264 pela placa de vídeo (NVENC/AMF/QuickSync) quando ela existe, e cai para o processador (OpenH264) só
 * quando não existe. AV1/VP9 ficam no processador no Chromium mesmo com placa que suporte (testado).
 */
const AUTO_CODEC: VideoCodec = 'h264';

/** Nome da faixa de tela em H.265 sem troca para H.264: quem assiste sabe que não vai ter reserva. */
const H265_ONLY_TRACK = 'screen:h265-only';

const isH265 = (mime: string | undefined) => !!mime && /h265/i.test(mime);

/** Opções de publicação da tela (usadas ao começar e ao trocar o codec no meio da transmissão). */
function screenPublishOptions(settings: ShareSettings, preset: SharePreset, codec: VideoCodec): TrackPublishOptions {
  const fps = settings.fps;
  return {
    videoCodec: codec,
    screenShareEncoding: { maxBitrate: estimateBitrate(preset, fps), maxFramerate: fps, priority: 'high' },
    screenShareSimulcastLayers: preset.height > 720 ? [new VideoPreset(1280, 720, 2_000_000, 30)] : [],
    simulcast: true,
    degradationPreference: settings.mode === 'motion' ? 'maintain-framerate' : 'maintain-resolution',
    audioPreset: AudioPresets.musicHighQualityStereo,
    dtx: false,
    red: false,
    // H.265: quem não decodifica faz o servidor pedir H.264, e a transmissão inteira passa para H.264
    // (REGRESSION: o host codifica uma vez só; SIMULCAST dobraria o trabalho da placa de quem já está jogando).
    // Sem a troca, quem não decodifica não recebe vídeo e vê o tutorial (o nome da faixa avisa).
    ...(codec === 'h265' && {
      backupCodec: settings.allowFallback ? { codec: 'h264' as const } : false,
      backupCodecPolicy: BackupCodecPolicy.REGRESSION,
      name: settings.allowFallback ? undefined : H265_ONLY_TRACK,
    }),
  };
}

/** Alguns segundos depois de começar: avisa se a tela está sendo codificada pelo processador. */
async function warnIfSoftwareEncoding(track: LocalTrack | undefined, heavy: boolean) {
  if (!track) return;
  await new Promise((r) => setTimeout(r, 4000));
  const report = await track.getRTCStatsReport?.().catch(() => undefined);
  let software = false;
  report?.forEach((s: Record<string, unknown>) => {
    if (s.type === 'outbound-rtp' && s.kind === 'video' && s.powerEfficientEncoder === false) software = true;
  });
  if (software) {
    toast.info(
      heavy
        ? 'Sua tela está sendo codificada pelo processador (sem aceleração da placa de vídeo), o que pesa no PC. Se travar ou picotar, transmita em 720p ou 30 fps.'
        : 'Sua tela está sendo codificada pelo processador (sem aceleração da placa de vídeo).',
    );
  }
}
const DEFAULT_AUDIO: AudioSettings = {
  inputId: 'default',
  outputId: 'default',
  // GTCRN: com voz real foi o que melhor preservou a voz (a DFN3 no máximo deixava abafado)
  noiseMode: 'gtcrn',
  echoCancellation: true,
  autoGain: true,
  gate: DEFAULT_GATE,
  noiseStrength: DEFAULT_NOISE_STRENGTH,
  v: 2,
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

  // ---- quem está falando
  // Os outros: o servidor (ActiveSpeakersChanged). Eu: o nível do meu microfone, medido aqui mesmo a
  // cada 50 ms, sem esperar a ida e volta até o servidor. Acender é imediato; apagar espera um
  // pouco, para o destaque não piscar entre uma palavra e outra.
  const SPEAK_RELEASE_MS = 350;
  const offTimers = new Map<string, ReturnType<typeof setTimeout>>();
  let selfLevelAt = 0;
  let selfWatchdog: ReturnType<typeof setTimeout> | undefined;

  function setSpeaking(id: string, on: boolean) {
    const timer = offTimers.get(id);
    if (on) {
      if (timer) {
        clearTimeout(timer);
        offTimers.delete(id);
      }
      if (!get().speaking[id]) set({ speaking: { ...get().speaking, [id]: true } });
      return;
    }
    if (!get().speaking[id] || timer) return;
    offTimers.set(
      id,
      setTimeout(() => {
        offTimers.delete(id);
        const { [id]: _gone, ...rest } = get().speaking;
        set({ speaking: rest });
      }, SPEAK_RELEASE_MS),
    );
  }

  // nível acima do limite do portão = falando. Não dá para usar o "aberto" do portão: com ele
  // desligado, fica aberto o tempo todo
  micLevels.addEventListener('level', (e) => {
    const room = get().room;
    if (!room) return;
    const { level, threshold } = (e as CustomEvent<MicLevel>).detail;
    const self = room.localParticipant.identity;
    selfLevelAt = Date.now();
    setSpeaking(self, get().micOn && level > threshold);
    // o microfone parou de mandar nível (mutou, saiu da sala): apaga
    clearTimeout(selfWatchdog);
    selfWatchdog = setTimeout(() => setSpeaking(self, false), 300);
  });

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

  // ---- H.265 ----
  // Host: troca o codec da tela sem parar a captura. Enquanto isso, despublicar a faixa não pode
  // parecer "parou de transmitir" (áudio, foco, aviso de transmissão para a sala).
  let republishing = false;
  let codecPoll: ReturnType<typeof setInterval> | undefined;

  /** Host em H.265 com troca permitida: o servidor pode ter passado todos para H.264 (alguém sem suporte entrou). */
  function watchShareCodec() {
    clearInterval(codecPoll);
    if (get().shareCodec !== 'h265' || !get().shareSettings.allowFallback) return;
    codecPoll = setInterval(async () => {
      const track = get().room?.localParticipant.getTrackPublication(Track.Source.ScreenShare)?.track as LocalVideoTrack | undefined;
      if (!track || !get().sharing) return clearInterval(codecPoll);
      const sender = track.simulcastCodecs.get('h264')?.sender;
      const backupActive = !!sender?.getParameters().encodings?.some((e) => e.active);
      const next = backupActive ? 'h264-backup' : 'h265';
      if (get().shareCodec !== next) set({ shareCodec: next });
    }, 4000);
  }

  // Espectador: algumas placas/drivers dizem que decodificam H.265 e não decodificam. Nos primeiros
  // segundos de cada transmissão H.265 assistida, confere se algum quadro saiu do decodificador.
  const decodeChecks = new Set<string>();

  async function watchScreenDecode(track: RemoteTrack, pub: RemoteTrackPublication, p: RemoteParticipant) {
    if (!isH265(pub.mimeType) || decodeChecks.has(pub.trackSid)) return;
    decodeChecks.add(pub.trackSid);
    try {
      for (let i = 0; i < 10; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        if (pub.track !== track || !get().watching[p.identity]) return;
        const report = await track.getRTCStatsReport?.().catch(() => undefined);
        let inbound: Record<string, unknown> | undefined;
        report?.forEach((s: Record<string, unknown>) => {
          if (s.type === 'inbound-rtp' && s.kind === 'video') inbound = s;
        });
        if (!inbound) continue;
        const mime = (report?.get(String(inbound.codecId)) as { mimeType?: string } | undefined)?.mimeType;
        // recebendo a reserva em H.264: está tudo certo
        if (mime && !isH265(mime)) return;
        if (Number(inbound.framesDecoded ?? 0) > 0) return;
        // chegou vídeo (não é só a transmissão pausada por ninguém estar olhando) e nada decodificou
        if (i >= 2 && Number(inbound.packetsReceived ?? 0) > 50) return h265Failed(pub, p);
      }
    } finally {
      decodeChecks.delete(pub.trackSid);
    }
  }

  function h265Failed(pub: RemoteTrackPublication, p: RemoteParticipant) {
    if (pub.trackName === H265_ONLY_TRACK) return markBlocked(p.identity, true);
    // o host aceita a troca: pede o H.264. Se em alguns segundos a faixa não mudou (app do host
    // antigo, por exemplo), mostra o tutorial mesmo assim
    getSocket()?.emit('voice:codec-fail', { streamerId: p.identity });
    setTimeout(() => {
      if (p.getTrackPublication(Track.Source.ScreenShare) === pub && get().watching[p.identity]) markBlocked(p.identity, true);
    }, 10_000);
  }

  function markBlocked(identity: string, failed: boolean) {
    set({ h265Blocked: { ...get().h265Blocked, [identity]: diagnoseH265(failed) } });
  }

  function clearBlocked(identity: string) {
    if (!get().h265Blocked[identity]) return;
    const { [identity]: _b, ...rest } = get().h265Blocked;
    set({ h265Blocked: rest });
  }

  /** Ao começar a assistir: H.265 sem reserva num navegador que nem anuncia H.265 → tutorial direto. */
  function checkScreenCodec(identity: string) {
    const pub = get().room?.remoteParticipants.get(identity)?.getTrackPublication(Track.Source.ScreenShare);
    if (pub && isH265(pub.mimeType) && pub.trackName === H265_ONLY_TRACK && !h265Support().decode) markBlocked(identity, false);
  }

  // Quem assiste continua assistindo quando a tela é republicada (troca de codec, troca de janela):
  // a faixa some e volta em seguida. Só para de assistir se ela não voltar.
  const pendingUnwatch = new Map<string, ReturnType<typeof setTimeout>>();

  function cleanup() {
    void stopDesktopShareAudio();
    clearInterval(codecPoll);
    for (const t of pendingUnwatch.values()) clearTimeout(t);
    pendingUnwatch.clear();
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
      shareCodec: null,
      codecRequests: [],
      h265Blocked: {},
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
        clearTimeout(pendingUnwatch.get(p.identity));
        pendingUnwatch.delete(p.identity);
        clearBlocked(p.identity);
        const { [p.identity]: _w, ...watching } = get().watching;
        const focus = get().focus?.startsWith(`${p.identity}:`) ? null : get().focus;
        set({ watching, focus });
        bump();
      })
      .on(RoomEvent.TrackPublished, (pub, p) => {
        if (pub.source === Track.Source.ScreenShare) {
          // a tela voltou logo depois de sumir (troca de codec ou de janela): segue assistindo, sem tocar o aviso de novo
          const pending = pendingUnwatch.get(p.identity);
          if (pending) {
            clearTimeout(pending);
            pendingUnwatch.delete(p.identity);
            checkScreenCodec(p.identity);
          } else {
            playSound('stream');
          }
        }
        syncSubscriptions();
        bump();
      })
      .on(RoomEvent.TrackUnpublished, (pub, p) => {
        if (pub.source === Track.Source.ScreenShare) {
          clearBlocked(p.identity);
          clearTimeout(pendingUnwatch.get(p.identity));
          pendingUnwatch.set(
            p.identity,
            setTimeout(() => {
              pendingUnwatch.delete(p.identity);
              const { [p.identity]: _w, ...watching } = get().watching;
              set({ watching, focus: get().focus === `${p.identity}:screen` ? null : get().focus });
            }, 5000),
          );
        }
        bump();
      })
      .on(RoomEvent.TrackSubscribed, (track: RemoteTrack, pub: RemoteTrackPublication, p: RemoteParticipant) => {
        if (track.kind === Track.Kind.Audio) {
          audioHost().appendChild(track.attach());
          applyVolumes();
        }
        if (pub.source === Track.Source.ScreenShare) void watchScreenDecode(track, pub, p);
        bump();
      })
      .on(RoomEvent.TrackSubscriptionFailed, (trackSid: string, p: RemoteParticipant) => {
        // H.265 sem reserva e o servidor não tem como entregar para este navegador
        const pub = p.getTrackPublication(Track.Source.ScreenShare);
        if (pub?.trackSid === trackSid && isH265(pub.mimeType)) markBlocked(p.identity, false);
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
        // trocando o codec: a mesma captura volta a ser publicada em seguida
        if (republishing && pub.source === Track.Source.ScreenShare) return bump();
        // transmissão encerrada por fora (ex.: janela capturada fechou): para o áudio junto
        if (pub.source === Track.Source.ScreenShare) {
          void stopDesktopShareAudio();
          clearInterval(codecPoll);
          set({ shareCodec: null, codecRequests: [] });
        }
        if (pub.source === Track.Source.ScreenShare && get().focus === `${room.localParticipant.identity}:screen`) set({ focus: null });
        syncLocalFlags();
        bump();
      })
      .on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
        const self = room.localParticipant.identity;
        // o meu destaque vem do microfone local; o do servidor só vale se o local não estiver medindo
        const localActive = Date.now() - selfLevelAt < 1000;
        const counts = (id: string) => id !== self || !localActive;
        const now = new Set(speakers.map((p) => p.identity).filter(counts));
        for (const id of now) setSpeaking(id, true);
        for (const id of Object.keys(get().speaking)) if (!now.has(id) && counts(id)) setSpeaking(id, false);
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
      const { noiseMode, gate, autoGain, noiseStrength } = get().audioSettings;
      await applyVoiceProcessing(track, noiseMode, get().effect, gate, autoGain, noiseStrength);
    } catch (err) {
      toast.error(`Não foi possível aplicar o efeito: ${(err as Error).message}`);
    }
  }

  async function enableMic(on: boolean) {
    const room = get().room;
    if (!room) return;
    const { inputId, noiseMode, echoCancellation, autoGain } = get().audioSettings;
    await room.localParticipant.setMicrophoneEnabled(
      on,
      {
        deviceId: inputId,
        // voz é sempre mono: alguns fones/placas se apresentam como estéreo com um lado vazio
        channelCount: 1,
        // com a IA ligada, o filtro do navegador fica desligado (senão a voz é processada duas vezes)
        noiseSuppression: noiseMode === 'browser',
        echoCancellation,
        // com IA, o volume é nivelado depois da limpeza (ver voiceEffects); o do navegador aumentava o ruído
        autoGainControl: autoGain && !['dfn', 'gtcrn', 'rnnoise'].includes(noiseMode),
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
    shareCodec: null,
    codecRequests: [],
    h265Blocked: {},

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
          // mixa o áudio remoto por um GainNode (em vez do volume nativo do <audio>, que trava em 100%):
          // é isso que permite o volume por usuário passar de 100% (até 200%, como no Discord)
          webAudioMix: true,
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
      const lp = s.room.localParticipant;
      const startedAt = performance.now();
      // No app desktop o áudio vem do capturador por processo (sem as vozes da sala),
      // então o getDisplayMedia pede só o vídeo da fonte escolhida no seletor do Concord.
      const desktopShare = !!desktop && !!sourceId;
      let codec: VideoCodec = settings.codec === 'auto' ? AUTO_CODEC : settings.codec;
      // preferência salva de outro PC, ou a placa/driver mudou
      if (codec === 'h265' && !h265Support().encode) {
        toast.info('Este computador não codifica H.265 pela placa de vídeo. Transmitindo em H.264.');
        codec = 'h264';
      }
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
          screenPublishOptions(settings, preset, codec),
        );
        set({ shareCodec: codec, codecRequests: [] });
        watchShareCodec();
        syncLocalFlags();
        void warnIfSoftwareEncoding(lp.getTrackPublication(Track.Source.ScreenShare)?.track, preset.height > 720 || fps > 30);
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
      clearInterval(codecPoll);
      set({ shareCodec: null, codecRequests: [] });
      syncLocalFlags();
    },

    fallbackToH264: async () => {
      const { room, shareSettings, shareCodec } = get();
      const lp = room?.localParticipant;
      const pub = lp?.getTrackPublication(Track.Source.ScreenShare);
      const track = pub?.track as LocalVideoTrack | undefined;
      if (!lp || !track || shareCodec === 'h264' || republishing) return;
      const preset = SHARE_PRESETS.find((p) => p.id === shareSettings.presetId) ?? SHARE_PRESETS[1];
      // republica a mesma captura em H.264: não pede a tela de novo (no navegador abriria o seletor)
      republishing = true;
      try {
        await lp.unpublishTrack(track, false);
        await lp.publishTrack(track, { ...screenPublishOptions(shareSettings, preset, 'h264'), source: Track.Source.ScreenShare });
        clearInterval(codecPoll);
        set({ shareCodec: 'h264', codecRequests: [] });
      } catch (err) {
        toast.error(err);
      } finally {
        republishing = false;
        syncLocalFlags();
        bump();
      }
    },

    requestH264: (identity) => {
      getSocket()?.emit('voice:codec-request', { streamerId: identity });
      toast.info('Pedido enviado. Quando o host liberar, a transmissão aparece aqui.');
    },

    setWatching: (identity, on) => {
      const watching = { ...get().watching };
      if (on) watching[identity] = true;
      else delete watching[identity];
      set({ watching, focus: on ? `${identity}:screen` : get().focus === `${identity}:screen` ? null : get().focus });
      if (on) checkScreenCodec(identity);
      else clearBlocked(identity);
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
        if (patch.gate && get().micOn) {
          // ligar/desligar o portão muda o processamento; só o limiar muda na hora
          if (patch.gate.mode === 'off' || !get().room?.localParticipant.getTrackPublication(Track.Source.Microphone)?.track?.getProcessor()) {
            await applyCurrentEffect();
          }
          updateGate(audioSettings.gate);
        }
        if (patch.noiseStrength !== undefined) updateNoiseStrength(patch.noiseStrength);
        if ((patch.noiseMode !== undefined || patch.echoCancellation !== undefined || patch.autoGain !== undefined) && get().micOn) {
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
      const viewerName = (id: string) => get().room?.remoteParticipants.get(id)?.name || 'Alguém';
      // alguém diz que recebe H.265 e não decodificou: com a troca permitida, passa todos para H.264
      socket.on('voice:codec-fail', ({ viewerId }: { viewerId: string }) => {
        const { shareCodec, shareSettings } = get();
        if (shareCodec !== 'h265' || !shareSettings.allowFallback) return;
        toast.info(`Sua transmissão passou para H.264: ${viewerName(viewerId)} não conseguia assistir em H.265.`);
        void get().fallbackToH264();
      });
      socket.on('voice:codec-request', ({ viewerId }: { viewerId: string }) => {
        if (get().shareCodec !== 'h265') return;
        if (get().codecRequests.some((r) => r.identity === viewerId)) return;
        set({ codecRequests: [...get().codecRequests, { identity: viewerId, name: viewerName(viewerId) }] });
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
// no app desktop, os processos de captura ganham prioridade enquanto a pessoa transmite (vale para qualquer
// jeito de parar: botão, Windows cortando a captura, sair da sala...)
useVoice.subscribe((state, prev) => {
  if (state.sharing !== prev.sharing) void desktop?.setStreaming?.(state.sharing);
});

function loadAudioSettings(): AudioSettings {
  const saved = load('concord.audio', DEFAULT_AUDIO) as AudioSettings & { noiseSuppression?: boolean };
  let hadMode = false;
  try {
    hadMode = 'noiseMode' in JSON.parse(localStorage.getItem('concord.audio') ?? '{}');
  } catch {
    // ignorado
  }
  if (!hadMode && saved.noiseSuppression === false) saved.noiseMode = 'off';
  // versão 2: o portão automático (padrão da versão anterior) cortava a fala; volta para desligado uma vez
  try {
    const raw = JSON.parse(localStorage.getItem('concord.audio') ?? '{}');
    if (raw.v !== 2) {
      // a versão anterior colocou todo mundo na DFN3 no máximo + portão: abafava e picotava a voz
      if (raw.gate?.mode === 'auto') saved.gate = { ...saved.gate, mode: 'off' };
      if (saved.noiseMode === 'dfn' || saved.noiseMode === 'rnnoise') saved.noiseMode = 'gtcrn';
      saved.noiseStrength = DEFAULT_NOISE_STRENGTH;
      saved.v = 2;
    }
  } catch {
    // ignorado
  }
  // configurações de antes do portão de voz: quem estava no padrão antigo (RNNoise) passa para o novo
  // padrão (DeepFilterNet3), que mediu ~30 dB a mais de redução de ruído
  try {
    if (!('gate' in JSON.parse(localStorage.getItem('concord.audio') ?? '{}')) && saved.noiseMode === 'rnnoise') saved.noiseMode = 'gtcrn';
  } catch {
    // ignorado
  }
  delete saved.noiseSuppression;
  return saved;
}
