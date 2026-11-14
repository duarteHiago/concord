// Gravação da sala (ver lib/callRecorder.ts): o estado na tela, o aviso para o servidor (o selo "Gravando"
// que todo mundo na sala vê) e os avisos de quando alguém começa ou para de gravar a sua sala.
import { create } from 'zustand';
import { CallRecorder, canPickFolder, canUseTempStorage, tempRecordingDir, type RecordMode } from '../lib/callRecorder';
import { liveSources } from '../lib/callSources';
import type { VideoQuality } from '../lib/callVideo';
import { canWrite } from '../lib/savedFolder';
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
  /** gravando por fonte: dá para escolher e trocar as telas e câmeras no meio */
  bySource: boolean;
  /** fontes escolhidas ("<id>:screen", "<id>:camera") */
  sources: string[];
  toggleSource: (key: string) => void;
  openDialog: () => void;
  closeDialog: () => void;
  start: (opts: { mode: RecordMode; streamAudio: boolean; dir: FileSystemDirectoryHandle | null; video: VideoQuality | null; sources: string[] | null }) => Promise<void>;
  stop: () => Promise<void>;
}

let recorder: CallRecorder | null = null;
let ticker: ReturnType<typeof setInterval> | undefined;
/** fontes que já apareceram nesta gravação (para avisar só das novas) */
let knownSources = new Set<string>();

/** As telas dos outros que a gravação precisa receber, mesmo sem você assistir. */
const screensOf = (keys: string[], me: string) => keys.filter((k) => k.endsWith(':screen') && !k.startsWith(`${me}:`)).map((k) => k.slice(0, -':screen'.length));

/** Durante a gravação por fonte: avisa quando alguém começa a transmitir ou liga a câmera. */
function watchNewSources() {
  const room = useVoice.getState().room;
  const { bySource, sources } = useRecording.getState();
  if (!room || !bySource) return;
  for (const s of liveSources(room)) {
    if (knownSources.has(s.key)) continue;
    knownSources.add(s.key);
    if (s.mine || sources.includes(s.key)) continue;
    const { serverId } = useVoice.getState();
    const m = serverId ? useApp.getState().details[serverId]?.members.find((x) => x.id === s.identity) : undefined;
    const name = m ? memberName(m) : 'Alguém';
    toast.info(`${name} ${s.kind === 'screen' ? 'começou a transmitir' : 'ligou a câmera'}. Para gravar também, marque em "Fontes" no painel da gravação.`);
  }
}

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
  bySource: false,
  sources: [],
  toggleSource: (key) => {
    if (!recorder?.bySource) return;
    const cur = get().sources;
    const next = cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key];
    set({ sources: next });
    recorder.setSources(next);
    useVoice.getState().setRecordingScreens(screensOf(next, useApp.getState().me?.id ?? ''));
  },
  openDialog: () => set({ dialog: true }),
  closeDialog: () => set({ dialog: false }),

  start: async ({ mode, streamAudio, dir: picked, video, sources }) => {
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
      // pasta lembrada de outra vez: o navegador pode pedir licença de novo; sem licença, baixa ao parar
      const dir = picked && (await canWrite(picked)) ? picked : null;
      if (picked && !dir) toast.info(`Sem acesso à pasta "${picked.name}". Os arquivos baixam quando você parar.`);
      await announce(true);
      // sem pasta escolhida: grava no disco privado do navegador e baixa ao parar
      const temp = !dir && canUseTempStorage();
      const target = dir ?? (temp ? await tempRecordingDir() : null);
      recorder = await CallRecorder.start(room, {
        mode,
        streamAudio,
        dir: target,
        temp,
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
        sources,
      }, ctx);
      // por fonte: recebe só as telas escolhidas; vídeo da sala inteira (reserva): todas as transmissões
      const bySource = recorder.bySource;
      if (bySource) useVoice.getState().setRecordingScreens(screensOf(sources ?? [], app.me?.id ?? ''));
      else if (video) useVoice.getState().setRecordingScreens('all');
      knownSources = new Set(liveSources(room).map((s) => s.key));
      set({ status: 'recording', startedAt: recorder.startedAt, dialog: false, tracks: recorder.trackCount, bySource, sources: bySource ? (sources ?? []) : [] });
      ticker = setInterval(() => {
        if (!recorder) return;
        set({ tracks: recorder.trackCount });
        watchNewSources();
      }, 2000);
      playSound('recordStart');
      if (!picked) toast.info('Gravando. Os arquivos baixam quando você parar.');
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
      useVoice.getState().setRecordingScreens(null);
      const min = Math.max(1, Math.round(summary.seconds / 60));
      toast.success(
        summary.folder
          ? `Gravação salva na pasta "${summary.folder}" (${summary.files.length} ${summary.files.length === 1 ? 'arquivo' : 'arquivos'}, ${min} min).`
          : `Gravação pronta: ${summary.files.length} ${summary.files.length === 1 ? 'arquivo baixado' : 'arquivos baixados'}.`,
      );
    } catch (err) {
      toast.error(`A gravação não terminou de salvar: ${(err as Error).message}`);
    } finally {
      if (useVoice.getState().recordingScreens) useVoice.getState().setRecordingScreens(null);
      set({ status: 'idle', startedAt: null, tracks: 0, bySource: false, sources: [] });
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
