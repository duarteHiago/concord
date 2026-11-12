// Gravação da sala (ver lib/callRecorder.ts): o estado na tela, o aviso para o servidor (o selo "Gravando"
// que todo mundo na sala vê) e os avisos de quando alguém começa ou para de gravar a sua sala.
import { create } from 'zustand';
import { CallRecorder, canPickFolder, type RecordMode } from '../lib/callRecorder';
import type { VideoQuality } from '../lib/callVideo';
import { getSocket } from '../lib/socket';
import { playSound } from '../lib/sounds';
import { memberName } from '../lib/types';
import { useApp } from './app';
import { toast } from './toast';
import { useVoice } from './voice';

declare global {
  interface Window {
    showDirectoryPicker?: (opts?: { mode?: 'read' | 'readwrite'; id?: string; startIn?: string }) => Promise<FileSystemDirectoryHandle>;
  }
}

interface RecordingStore {
  /** janela de começar aberta */
  dialog: boolean;
  status: 'idle' | 'starting' | 'recording' | 'saving';
  startedAt: number | null;
  tracks: number;
  openDialog: () => void;
  closeDialog: () => void;
  start: (opts: { mode: RecordMode; streamAudio: boolean; dir: FileSystemDirectoryHandle | null; video: VideoQuality | null }) => Promise<void>;
  stop: () => Promise<void>;
}

let recorder: CallRecorder | null = null;
let ticker: ReturnType<typeof setInterval> | undefined;

/** Avisa o servidor (selo para todos). Sem confirmação, não grava: o aviso faz parte do consentimento. */
function announce(recording: boolean): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = getSocket();
    if (!socket) return reject(new Error('Sem conexão com o Concord'));
    const timeout = setTimeout(() => reject(new Error('O Concord não respondeu. Tente de novo.')), 5000);
    socket.emit('voice:recording', { recording }, (r: { ok: boolean; error?: string }) => {
      clearTimeout(timeout);
      if (r?.ok) resolve();
      else reject(new Error(r?.error ?? 'Não foi possível gravar'));
    });
  });
}

export const useRecording = create<RecordingStore>((set, get) => ({
  dialog: false,
  status: 'idle',
  startedAt: null,
  tracks: 0,
  openDialog: () => set({ dialog: true }),
  closeDialog: () => set({ dialog: false }),

  start: async ({ mode, streamAudio, dir, video }) => {
    const voice = useVoice.getState();
    const room = voice.room;
    if (!room || !voice.serverId || !voice.channelId || get().status !== 'idle') return;
    const app = useApp.getState();
    const detail = app.details[voice.serverId];
    const channel = detail?.channels.find((c) => c.id === voice.channelId);
    // ainda dentro do clique: o navegador só libera áudio com um gesto da pessoa
    const ctx = new AudioContext();
    void ctx.resume();
    set({ status: 'starting' });
    try {
      await announce(true);
      recorder = await CallRecorder.start(room, {
        mode,
        streamAudio,
        dir,
        roomName: channel?.name ?? 'sala',
        myIdentity: app.me?.id ?? '',
        nameOf: (id) => {
          const m = detail?.members.find((x) => x.id === id);
          return m ? memberName(m) : (room.remoteParticipants.get(id)?.name ?? id);
        },
        infoOf: (id) => {
          const m = detail?.members.find((x) => x.id === id);
          return { name: m ? memberName(m) : (room.remoteParticipants.get(id)?.name ?? 'Alguém'), color: m?.avatarColor ?? '#5865f2', avatarUrl: m?.avatarUrl ?? null };
        },
        video,
      }, ctx);
      // vídeo: recebe todas as transmissões da sala, não só as que você está assistindo
      if (video) useVoice.getState().setRecordingVideo(true);
      set({ status: 'recording', startedAt: recorder.startedAt, dialog: false, tracks: recorder.trackCount });
      ticker = setInterval(() => recorder && set({ tracks: recorder.trackCount }), 2000);
      playSound('recordStart');
      if (!dir) toast.info('Gravando. Os arquivos vão baixar quando você parar.');
    } catch (err) {
      recorder = null;
      if (ctx.state !== 'closed') void ctx.close();
      set({ status: 'idle' });
      void announce(false).catch(() => {});
      toast.error(err);
    }
  },

  stop: async () => {
    if (!recorder || get().status !== 'recording') return;
    const r = recorder;
    recorder = null;
    clearInterval(ticker);
    set({ status: 'saving' });
    void announce(false).catch(() => {});
    playSound('recordStop');
    try {
      const summary = await r.stop();
      useVoice.getState().setRecordingVideo(false);
      const min = Math.max(1, Math.round(summary.seconds / 60));
      toast.success(
        summary.folder
          ? `Gravação salva na pasta "${summary.folder}" (${summary.files.length} ${summary.files.length === 1 ? 'arquivo' : 'arquivos'}, ${min} min).`
          : `Gravação pronta: ${summary.files.length} ${summary.files.length === 1 ? 'arquivo baixado' : 'arquivos baixados'}.`,
      );
    } catch (err) {
      toast.error(`A gravação não terminou de salvar: ${(err as Error).message}`);
    } finally {
      if (useVoice.getState().recordingVideo) useVoice.getState().setRecordingVideo(false);
      set({ status: 'idle', startedAt: null, tracks: 0 });
    }
  },
}));

/** Escolher a pasta (precisa ser no clique da pessoa). null = sem suporte ou cancelou. */
export async function pickRecordingFolder(): Promise<FileSystemDirectoryHandle | null | 'cancelled'> {
  if (!canPickFolder()) return null;
  try {
    return await window.showDirectoryPicker!({ mode: 'readwrite', id: 'concord-gravacoes', startIn: 'music' });
  } catch {
    return 'cancelled';
  }
}

// ---------------------------------------------------------------- vigias

// saiu da sala, trocou de sala ou caiu a conexão: para e salva o que já gravou
useVoice.subscribe((s, prev) => {
  const left = s.status === 'idle' || s.channelId !== prev.channelId;
  if (left && useRecording.getState().status === 'recording') void useRecording.getState().stop();
  // entrou numa sala onde alguém já está gravando: avisa na hora
  if (s.channelId && s.serverId && s.channelId !== prev.channelId) {
    const app = useApp.getState();
    const rec = (app.voiceStates[s.serverId] ?? []).filter((v) => v.channelId === s.channelId && v.recording && v.userId !== app.me?.id);
    if (rec.length) {
      const names = rec.map((v) => {
        const m = app.details[s.serverId!]?.members.find((x) => x.id === v.userId);
        return m ? memberName(m) : 'Alguém';
      });
      playSound('recordStart');
      toast.info(`${names.join(', ')} ${names.length === 1 ? 'está' : 'estão'} gravando esta sala.`);
    }
  }
});

// alguém da sua sala começou ou parou de gravar: aviso e som (o selo aparece no nome da pessoa)
useApp.subscribe((s, prev) => {
  const { serverId, channelId } = useVoice.getState();
  if (!serverId || !channelId || s.voiceStates === prev.voiceStates) return;
  const me = s.me?.id;
  const now = (s.voiceStates[serverId] ?? []).filter((v) => v.channelId === channelId);
  const before = new Map((prev.voiceStates[serverId] ?? []).filter((v) => v.channelId === channelId).map((v) => [v.userId, v]));
  for (const v of now) {
    if (v.userId === me) continue;
    const was = before.get(v.userId);
    // quem já estava gravando quando você entrou também avisa (o "was" não existe)
    if (!!v.recording === !!was?.recording) continue;
    const m = s.details[serverId]?.members.find((x) => x.id === v.userId);
    const name = m ? memberName(m) : 'Alguém';
    if (v.recording) {
      playSound('recordStart');
      toast.info(`${name} está gravando esta sala.`);
    } else if (was) {
      playSound('recordStop');
      toast.info(`${name} parou de gravar.`);
    }
  }
});

// fechar a aba gravando: avisa o servidor (o que já foi para o disco fica salvo)
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    if (useRecording.getState().status === 'recording') void announce(false).catch(() => {});
  });
}
