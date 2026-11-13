// Gravação por fonte (ver recordSourceWorker.ts): a pessoa escolhe quais telas e câmeras gravar, e cada uma
// vira um arquivo MP4 com o vídeo dela + todas as vozes. Aqui fica o lado do app: quais fontes existem na sala,
// quais foram escolhidas (dá para mudar no meio) e entregar os quadros de cada uma direto para o worker.
import { Track, type Participant, type Room, type TrackPublication } from 'livekit-client';

declare class MediaStreamTrackProcessor<T> {
  constructor(init: { track: MediaStreamTrack; maxBufferSize?: number });
  readonly readable: ReadableStream<T>;
}

/** O navegador grava por fonte? (Chrome, Edge, Brave, app desktop) */
export const canRecordSources = () =>
  typeof window !== 'undefined' && 'MediaStreamTrackProcessor' in window && 'VideoEncoder' in window && 'AudioEncoder' in window;

export interface LiveSource {
  /** "<id da pessoa>:screen" ou "<id da pessoa>:camera" */
  key: string;
  identity: string;
  kind: 'screen' | 'camera';
  mine: boolean;
}

const SOURCES = [
  [Track.Source.ScreenShare, 'screen'],
  [Track.Source.Camera, 'camera'],
] as const;

/** Telas e câmeras ligadas na sala agora (as telas contam mesmo sem você estar assistindo). */
export function liveSources(room: Room): LiveSource[] {
  const out: LiveSource[] = [];
  const people: Participant[] = [room.localParticipant, ...room.remoteParticipants.values()];
  for (const p of people) {
    for (const [source, kind] of SOURCES) {
      const pub = p.getTrackPublication(source);
      if (pub && !pub.isMuted) out.push({ key: `${p.identity}:${kind}`, identity: p.identity, kind, mine: p === room.localParticipant });
    }
  }
  return out;
}

export interface SourceSink {
  pushAt(chunk: Blob, position: number): void;
}

export interface SourceFile {
  key: string;
  name: string;
  sink: SourceSink;
  /** quando o arquivo começou, em ms desde o início da gravação (null: nunca chegou vídeo) */
  startMs: number | null;
  width: number;
  height: number;
  /** "prefer-hardware" quando a placa de vídeo codifica */
  hardware: string;
  dropped: number;
}

interface Feed {
  id: number;
  key: string;
  trackId: string;
  detach: () => void;
  file: SourceFile;
}

export class SourceRecorder {
  private worker = new Worker(new URL('./recordSourceWorker.ts', import.meta.url), { type: 'module' });
  private stage = document.createElement('div');
  private feeds = new Map<string, Feed>();
  private closing = new Map<number, () => void>();
  private byId = new Map<number, SourceFile>();
  private wanted = new Set<string>();
  private seq = 0;
  private timer: ReturnType<typeof setInterval> | undefined;
  private done!: () => void;
  private donePromise = new Promise<void>((r) => (this.done = r));
  readonly files: SourceFile[] = [];
  audioCodec: string | null = null;

  private constructor(
    private room: Room,
    /** início da gravação (Date.now), para dizer quando cada arquivo começou */
    private startedAt: number,
    private makeSink: (name: string) => SourceSink,
    private fileLabel: (source: LiveSource) => string,
    private onError: (message: string) => void,
  ) {
    this.stage.setAttribute('aria-hidden', 'true');
    this.stage.style.cssText = 'position:fixed;left:0;top:0;width:100vw;height:100vh;overflow:hidden;opacity:0;pointer-events:none;z-index:-1';
    document.body.appendChild(this.stage);
    this.worker.onmessage = (e) => {
      const m = e.data;
      const file = this.byId.get(m.id);
      if (m.type === 'chunk') file?.sink.pushAt(new Blob([m.data]), m.position);
      else if (m.type === 'started' && file) {
        file.startMs = Math.max(0, m.startAt - this.startedAt);
        file.width = m.width;
        file.height = m.height;
        file.hardware = m.hardware;
      } else if (m.type === 'closed') {
        if (file) file.dropped = m.dropped;
        this.closing.get(m.id)?.();
        this.closing.delete(m.id);
      } else if (m.type === 'done') this.done();
      else if (m.type === 'error' && !m.fatal) this.onError(m.message);
    };
  }

  static async start(
    room: Room,
    startedAt: number,
    audioTrack: MediaStreamTrack,
    wanted: string[],
    makeSink: (name: string) => SourceSink,
    fileLabel: (source: LiveSource) => string,
    onError: (message: string) => void,
  ): Promise<SourceRecorder> {
    const r = new SourceRecorder(room, startedAt, makeSink, fileLabel, onError);
    const settings = audioTrack.getSettings();
    await new Promise<void>((resolve, reject) => {
      const onReady = (e: MessageEvent) => {
        if (e.data.type === 'ready') {
          r.audioCodec = e.data.audio;
          resolve();
        } else if (e.data.type === 'error' && e.data.fatal) reject(new Error(e.data.message));
        else return;
        r.worker.removeEventListener('message', onReady);
      };
      r.worker.addEventListener('message', onReady);
      r.worker.postMessage({ type: 'init', audio: { sampleRate: settings.sampleRate ?? 48000, channels: settings.channelCount ?? 2 } });
    }).catch((err) => {
      r.dispose();
      throw err;
    });
    const audio = new MediaStreamTrackProcessor<AudioData>({ track: audioTrack });
    r.worker.postMessage({ type: 'audio', readable: audio.readable }, [audio.readable as unknown as Transferable]);
    r.setWanted(wanted);
    r.timer = setInterval(() => r.sync(), 500);
    return r;
  }

  /** Fontes que a pessoa quer gravar (pode mudar no meio da gravação). */
  setWanted(keys: string[]) {
    this.wanted = new Set(keys);
    this.sync();
  }

  /** Fontes sendo gravadas agora. */
  get recording(): string[] {
    return [...this.feeds.keys()];
  }

  private publication(key: string): { p: Participant; pub: TrackPublication | undefined; kind: 'screen' | 'camera' } | null {
    const cut = key.lastIndexOf(':');
    const identity = key.slice(0, cut);
    const kind = key.slice(cut + 1) as 'screen' | 'camera';
    const p = identity === this.room.localParticipant.identity ? this.room.localParticipant : this.room.remoteParticipants.get(identity);
    if (!p) return null;
    return { p, pub: p.getTrackPublication(kind === 'screen' ? Track.Source.ScreenShare : Track.Source.Camera), kind };
  }

  private sync() {
    for (const [key, feed] of this.feeds) {
      const found = this.publication(key);
      const id = found?.pub && !found.pub.isMuted ? found.pub.track?.mediaStreamTrack?.id : undefined;
      // a pessoa desmarcou, a transmissão acabou ou a faixa foi trocada (reconexão): fecha este arquivo
      if (!this.wanted.has(key) || id !== feed.trackId) void this.close(feed);
    }
    for (const key of this.wanted) {
      if (this.feeds.has(key)) continue;
      const found = this.publication(key);
      const track = found?.pub?.track;
      const mst = track?.mediaStreamTrack;
      // tela que você não assiste ainda está chegando (o app pede a inscrição): tenta de novo na próxima volta
      if (!found || !track || !mst || found.pub!.isMuted || mst.readyState !== 'live') continue;
      this.open({ key, identity: found.p.identity, kind: found.kind, mine: found.p === this.room.localParticipant }, track, mst);
    }
  }

  private open(source: LiveSource, track: NonNullable<TrackPublication['track']>, mst: MediaStreamTrack) {
    const id = ++this.seq;
    // a mesma fonte gravada de novo (parou e voltou a transmitir) ganha número
    const base = this.fileLabel(source);
    let name = `${base}.mp4`;
    for (let i = 2; this.files.some((f) => f.name === name); i++) name = `${base} (${i}).mp4`;
    const file: SourceFile = { key: source.key, name, sink: this.makeSink(name), startMs: null, width: 0, height: 0, hardware: '', dropped: 0 };
    this.files.push(file);
    this.byId.set(id, file);
    // os quadros vão direto para o worker, sem passar pela página (guarda no máximo 2: nunca acumula)
    const proc = new MediaStreamTrackProcessor<VideoFrame>({ track: mst, maxBufferSize: 2 });
    this.worker.postMessage({ type: 'open', id, kind: source.kind, readable: proc.readable }, [proc.readable as unknown as Transferable]);
    let detach = () => {};
    if (!source.mine) {
      // um vídeo invisível e grande: assim o LiveKit (adaptiveStream) manda a qualidade máxima,
      // mesmo que você não esteja assistindo ou esteja vendo pequeno
      const el = document.createElement('video');
      el.muted = true;
      el.style.cssText = `position:absolute;left:0;top:0;width:${source.kind === 'screen' ? 1920 : 640}px;height:auto`;
      this.stage.appendChild(el);
      track.attach(el);
      detach = () => {
        track.detach(el);
        el.remove();
      };
    }
    this.feeds.set(source.key, { id, key: source.key, trackId: mst.id, detach, file });
  }

  private close(feed: Feed): Promise<void> {
    this.feeds.delete(feed.key);
    feed.detach();
    return new Promise<void>((resolve) => {
      this.closing.set(feed.id, resolve);
      this.worker.postMessage({ type: 'close', id: feed.id });
      setTimeout(resolve, 10_000); // não fica preso se o worker não responder
    });
  }

  /** Fecha todos os arquivos. Depois disso os `files` podem ser finalizados por quem chamou. */
  async stop(): Promise<void> {
    clearInterval(this.timer);
    this.wanted.clear();
    await Promise.all([...this.feeds.values()].map((f) => this.close(f)));
    this.worker.postMessage({ type: 'stop' });
    await Promise.race([this.donePromise, new Promise((r) => setTimeout(r, 10_000))]);
    this.dispose();
  }

  private dispose() {
    clearInterval(this.timer);
    for (const feed of this.feeds.values()) feed.detach();
    this.feeds.clear();
    this.stage.remove();
    this.worker.terminate();
  }
}
