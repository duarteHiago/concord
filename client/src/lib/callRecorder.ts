// Gravação da sala no próprio aparelho: nada da gravação vai para o servidor (só o aviso de que alguém está
// gravando, para todos verem o selo). Grava o áudio que já chega até você pelo LiveKit:
// - "Tudo junto": todas as vozes misturadas num arquivo;
// - "Uma faixa por pessoa": um arquivo por participante, todos no mesmo relógio (para editar, como podcast).
// Os arquivos vão sendo gravados no disco aos pedaços (a cada poucos segundos), então uma call longa não
// enche a memória e, se o app fechar no meio, perde no máximo os últimos segundos.
import { Track, type Room } from 'livekit-client';

export type RecordMode = 'mixed' | 'tracks' | 'both';

export interface RecordOptions {
  mode: RecordMode;
  /** incluir o áudio das transmissões de tela (vídeos, jogos) */
  streamAudio: boolean;
  /** pasta escolhida (File System Access); sem ela, os arquivos baixam ao parar */
  dir: FileSystemDirectoryHandle | null;
  roomName: string;
  /** nome de exibição de cada pessoa (identidade do LiveKit = id do usuário) */
  nameOf: (identity: string) => string;
  myIdentity: string;
}

export interface RecordingSummary {
  folder: string | null;
  files: string[];
  seconds: number;
}

/** Dá para gravar neste navegador? (o iOS e navegadores antigos não têm MediaRecorder de áudio) */
export const canRecord = () => typeof window !== 'undefined' && 'MediaRecorder' in window && 'AudioContext' in window;
/** Dá para escolher uma pasta e gravar direto nela? (Chrome, Edge, app desktop) */
export const canPickFolder = () => typeof window !== 'undefined' && 'showDirectoryPicker' in window;

/** Formato: MP4/AAC abre em qualquer editor; WebM/Opus é a reserva. */
function pickFormat(): { mime: string; ext: string } {
  for (const [mime, ext] of [
    ['audio/mp4;codecs=mp4a.40.2', 'm4a'],
    ['audio/mp4', 'm4a'],
    ['audio/webm;codecs=opus', 'webm'],
    ['audio/webm', 'webm'],
  ] as const) {
    if (MediaRecorder.isTypeSupported(mime)) return { mime, ext };
  }
  return { mime: '', ext: 'webm' };
}

const safeName = (s: string) =>
  s
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60) || 'sem-nome';

const pad = (n: number) => String(n).padStart(2, '0');
const stamp = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}h${pad(d.getMinutes())}`;
const clock = (ms: number) => {
  const s = Math.floor(ms / 1000);
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}`;
};

// ---------------------------------------------------------------- destino dos arquivos

interface Sink {
  name: string;
  push(chunk: Blob): void;
  /** grava no disco o que acumulou (a pasta escolhida vai sendo atualizada durante a gravação) */
  flush(): Promise<void>;
  finish(): Promise<void>;
}

/** Arquivo numa pasta: acrescenta no fim e fecha a cada flush (o que foi fechado já está salvo). */
function fileSink(dir: FileSystemDirectoryHandle, name: string): Sink {
  let handle: FileSystemFileHandle | null = null;
  let size = 0;
  let pending: Blob[] = [];
  let writing = Promise.resolve();
  const flush = () => {
    writing = writing.then(async () => {
      if (!pending.length) return;
      const blob = new Blob(pending);
      pending = [];
      handle ??= await dir.getFileHandle(name, { create: true });
      const w = await handle.createWritable({ keepExistingData: true });
      await w.seek(size);
      await w.write(blob);
      await w.close();
      size += blob.size;
    });
    return writing;
  };
  return { name, push: (c) => pending.push(c), flush, finish: flush };
}

/** Sem pasta (Firefox, Safari): junta na memória e baixa ao parar. */
function downloadSink(name: string, mime: string): Sink {
  const chunks: Blob[] = [];
  return {
    name,
    push: (c) => chunks.push(c),
    flush: async () => {},
    finish: async () => {
      if (!chunks.length) return;
      const url = URL.createObjectURL(new Blob(chunks, { type: mime }));
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    },
  };
}

// ---------------------------------------------------------------- gravação

interface Lane {
  dest: MediaStreamAudioDestinationNode;
  recorder: MediaRecorder;
  sink: Sink;
}

interface Person {
  name: string;
  joinedAtMs: number;
  lane: Lane | null;
}

export class CallRecorder {
  private ctx: AudioContext;
  private mix: GainNode;
  private compressor: DynamicsCompressorNode;
  private mixLane: Lane | null = null;
  private people = new Map<string, Person>();
  /** fonte ligada por id da faixa do navegador (MediaStreamTrack): quando a faixa muda, religa */
  private sources = new Map<string, { node: MediaStreamAudioSourceNode; identity: string }>();
  private format = pickFormat();
  private folder: FileSystemDirectoryHandle | null = null;
  private timers: ReturnType<typeof setInterval>[] = [];
  readonly startedAt = Date.now();

  private constructor(
    private room: Room,
    private opts: RecordOptions,
    ctx: AudioContext,
  ) {
    this.ctx = ctx;
    // barramento da mistura com um compressor leve: várias pessoas falando juntas não estouram
    this.mix = this.ctx.createGain();
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -12;
    comp.ratio.value = 3;
    this.mix.connect(comp);
    this.compressor = comp;
  }

  /**
   * Crie o `ctx` direto no clique da pessoa (o navegador só libera áudio com um gesto) e passe para cá.
   */
  static async start(room: Room, opts: RecordOptions, ctx: AudioContext): Promise<CallRecorder> {
    // o navegador pode segurar o áudio para sempre sem gesto: não fica esperando
    if (ctx.state !== 'running') await Promise.race([ctx.resume(), new Promise((r) => setTimeout(r, 2000))]);
    if (ctx.state !== 'running') {
      void ctx.close();
      throw new Error('O navegador não liberou o áudio. Clique em "Começar a gravar" de novo.');
    }
    const r = new CallRecorder(room, opts, ctx);
    if (opts.dir) r.folder = await opts.dir.getDirectoryHandle(safeName(`Concord - ${opts.roomName} - ${stamp()}`), { create: true });
    if (opts.mode !== 'tracks') {
      const dest = r.ctx.createMediaStreamDestination();
      r.compressor.connect(dest);
      r.mixLane = r.lane(dest, `sala-completa.${r.format.ext}`);
    }
    r.sync();
    // a cada 1,5 s: entra gente, sai gente, alguém liga o microfone ou troca de efeito (a faixa muda)
    r.timers.push(setInterval(() => r.sync(), 1500));
    // a cada 4 s: grava no disco o que acumulou
    r.timers.push(setInterval(() => void r.flushAll(), 4000));
    return r;
  }

  private lane(dest: MediaStreamAudioDestinationNode, fileName: string): Lane {
    const sink = this.folder ? fileSink(this.folder, fileName) : downloadSink(fileName, this.format.mime);
    const recorder = new MediaRecorder(dest.stream, { ...(this.format.mime ? { mimeType: this.format.mime } : {}), audioBitsPerSecond: 128_000 });
    recorder.ondataavailable = (e) => e.data.size && sink.push(e.data);
    recorder.start(1000);
    return { dest, recorder, sink };
  }

  /** Faixas de áudio que estão chegando agora (e o seu microfone), por pessoa. */
  private currentTracks(): { identity: string; track: MediaStreamTrack }[] {
    const out: { identity: string; track: MediaStreamTrack }[] = [];
    const wanted = (source: Track.Source) => source === Track.Source.Microphone || (this.opts.streamAudio && source === Track.Source.ScreenShareAudio);
    for (const p of this.room.remoteParticipants.values()) {
      for (const pub of p.audioTrackPublications.values()) {
        const t = pub.track?.mediaStreamTrack;
        if (pub.isSubscribed && t && t.readyState === 'live' && wanted(pub.source)) out.push({ identity: p.identity, track: t });
      }
    }
    const local = this.room.localParticipant;
    for (const pub of local.audioTrackPublications.values()) {
      // a faixa publicada já vem com a redução de ruído e o efeito de voz: grava o que os outros ouvem
      const t = pub.track?.mediaStreamTrack;
      if (t && t.readyState === 'live' && wanted(pub.source)) out.push({ identity: local.identity, track: t });
    }
    return out;
  }

  private person(identity: string): Person {
    let p = this.people.get(identity);
    if (!p) {
      p = { name: this.opts.nameOf(identity), joinedAtMs: Date.now() - this.startedAt, lane: null };
      if (this.opts.mode !== 'mixed') {
        const dest = this.ctx.createMediaStreamDestination();
        // nomes repetidos ganham número, para um arquivo não sobrescrever o outro
        const used = new Set([...this.people.values()].map((x) => x.lane?.sink.name));
        let file = `${safeName(p.name)}.${this.format.ext}`;
        for (let i = 2; used.has(file); i++) file = `${safeName(p.name)} (${i}).${this.format.ext}`;
        p.lane = this.lane(dest, file);
      }
      this.people.set(identity, p);
    }
    return p;
  }

  private sync() {
    const live = this.currentTracks();
    const ids = new Set(live.map((l) => l.track.id));
    for (const [id, s] of this.sources) {
      if (!ids.has(id)) {
        s.node.disconnect();
        this.sources.delete(id);
      }
    }
    for (const { identity, track } of live) {
      if (this.sources.has(track.id)) continue;
      const node = this.ctx.createMediaStreamSource(new MediaStream([track]));
      if (this.mixLane) node.connect(this.mix);
      const lane = this.person(identity).lane;
      if (lane) node.connect(lane.dest);
      this.sources.set(track.id, { node, identity });
    }
  }

  private lanes(): Lane[] {
    return [this.mixLane, ...[...this.people.values()].map((p) => p.lane)].filter((l): l is Lane => !!l);
  }

  private flushAll() {
    return Promise.all(this.lanes().map((l) => l.sink.flush()));
  }

  get trackCount() {
    return this.lanes().length;
  }

  async stop(): Promise<RecordingSummary> {
    this.timers.forEach(clearInterval);
    const lanes = this.lanes();
    // espera o último pedaço de cada gravador antes de fechar os arquivos
    await Promise.all(
      lanes.map(
        (l) =>
          new Promise<void>((resolve) => {
            if (l.recorder.state === 'inactive') return resolve();
            l.recorder.addEventListener('stop', () => resolve(), { once: true });
            l.recorder.stop();
          }),
      ),
    );
    await Promise.all(lanes.map((l) => l.sink.finish()));
    for (const s of this.sources.values()) s.node.disconnect();
    const seconds = Math.round((Date.now() - this.startedAt) / 1000);
    const files = lanes.map((l) => l.sink.name);
    if (this.folder) await this.writeReadme(files, seconds);
    void this.ctx.close();
    return { folder: this.folder?.name ?? null, files, seconds };
  }

  private async writeReadme(files: string[], seconds: number) {
    const lines = [
      `Gravação da sala "${this.opts.roomName}" no Concord`,
      `Começou em ${new Date(this.startedAt).toLocaleString('pt-BR')} · duração ${clock(seconds * 1000)}`,
      '',
      'Arquivos:',
      ...files.map((f) => `- ${f}`),
    ];
    const late = [...this.people.values()].filter((p) => p.lane && p.joinedAtMs > 3000);
    if (late.length) {
      lines.push('', 'Quem entrou depois do começo (a faixa da pessoa começa nesse ponto da gravação):');
      for (const p of late) lines.push(`- ${p.lane!.sink.name} (${p.name}): começa em ${clock(p.joinedAtMs)}`);
    }
    lines.push('', 'A gravação ficou só neste computador: nada dela foi enviado para o Concord.');
    const h = await this.folder!.getFileHandle('LEIA-ME.txt', { create: true });
    const w = await h.createWritable();
    await w.write(lines.join('\n'));
    await w.close();
  }
}
