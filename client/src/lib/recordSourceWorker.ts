// Worker da gravação por fonte: cada tela ou câmera escolhida vira um arquivo MP4 próprio, com o vídeo dela +
// uma faixa com todas as vozes misturadas. Fica fora da linha da interface. Por fonte, o trabalho é só uma
// codificação H.264 na placa de vídeo (WebCodecs): nada de montar cena, redimensionar ou desenhar em canvas.
// Se o codificador atrasar, o quadro é descartado em vez de acumular fila.
//
// Tentamos antes gravar sem codificar nada (copiando os quadros já comprimidos do WebRTC, com
// RTCRtpScriptTransform). No Chromium isso só funciona se a escuta for ligada no instante em que a faixa é
// criada, o que exigiria um worker permanente no caminho de todo vídeo de toda call. Ficou de fora por risco.
import { EncodedAudioPacketSource, EncodedPacket, EncodedVideoPacketSource, Mp4OutputFormat, Output, StreamTarget } from 'mediabunny';

type In =
  | { type: 'init'; audio: { sampleRate: number; channels: number } }
  | { type: 'audio'; readable: ReadableStream<AudioData> }
  | { type: 'open'; id: number; kind: 'screen' | 'camera'; readable: ReadableStream<VideoFrame> }
  | { type: 'close'; id: number }
  | { type: 'stop' };

interface Source {
  id: number;
  kind: 'screen' | 'camera';
  reader: ReadableStreamDefaultReader<VideoFrame>;
  closed: boolean;
  failed: boolean;
  encoder: VideoEncoder | null;
  output: Output | null;
  video: EncodedVideoPacketSource | null;
  audio: EncodedAudioPacketSource | null;
  audioStarted: boolean;
  /** escritas em fila, uma de cada vez (respeita o ritmo do disco) */
  chain: Promise<void>;
  /** relógio da gravação (s) em que o arquivo começou */
  t0: number;
  /** primeiros instantes: espera a qualidade da transmissão assentar antes de fixar o tamanho do vídeo */
  firstSeen: number;
  maxW: number;
  maxH: number;
  lastKey: number;
  lastTs: number;
  frames: number;
  dropped: number;
  hardware: string;
}

const post = (msg: unknown, transfer: Transferable[] = []) => (self as unknown as Worker).postMessage(msg, transfer);
/** relógio comum a todas as faixas, em segundos */
const now = () => performance.now() / 1000;

const sources = new Map<number, Source>();
let audioEncoder: AudioEncoder | null = null;
let audioCodec: 'aac' | 'opus' = 'aac';
let audioConfig: AudioDecoderConfig | null = null;
let audioReader: ReadableStreamDefaultReader<AudioData> | null = null;
let audioAnchor: { wall: number; first: number } | null = null;

/** Quanto esperar a transmissão subir de qualidade antes de fixar a resolução do arquivo. */
const SETTLE = 1.2;
const KEY_EVERY = 4;

// ---------------------------------------------------------------- áudio (mistura de todas as vozes)

async function init(m: Extract<In, { type: 'init' }>) {
  const base = { sampleRate: m.audio.sampleRate, numberOfChannels: m.audio.channels, bitrate: 128_000 };
  try {
    audioCodec = (await AudioEncoder.isConfigSupported({ codec: 'mp4a.40.2', ...base })).supported ? 'aac' : 'opus';
  } catch {
    audioCodec = 'opus';
  }
  audioEncoder = new AudioEncoder({
    output: (chunk, meta) => {
      if (meta?.decoderConfig) audioConfig = meta.decoderConfig;
      const data = new Uint8Array(chunk.byteLength);
      chunk.copyTo(data);
      audioAnchor ??= { wall: now(), first: chunk.timestamp };
      const wall = audioAnchor.wall + (chunk.timestamp - audioAnchor.first) / 1e6;
      const dur = (chunk.duration ?? 21_333) / 1e6;
      // o mesmo pacote vai para o arquivo de cada fonte que já começou
      for (const s of sources.values()) {
        if (!s.output || !s.audio || s.closed || s.failed) continue;
        const ts = wall - s.t0;
        if (ts < 0) continue;
        const first = !s.audioStarted;
        s.audioStarted = true;
        enqueue(s, () => s.audio!.add(new EncodedPacket(data, 'key', ts, dur), first && audioConfig ? { decoderConfig: audioConfig } : undefined));
      }
    },
    error: (e) => post({ type: 'error', message: `Áudio: ${e.message}` }),
  });
  audioEncoder.configure({ codec: audioCodec === 'aac' ? 'mp4a.40.2' : 'opus', ...base });
  post({ type: 'ready', audio: audioCodec });
}

async function readAudio(readable: ReadableStream<AudioData>) {
  audioReader = readable.getReader();
  try {
    for (;;) {
      const { value, done } = await audioReader.read();
      if (done || !value) break;
      if (audioEncoder?.state === 'configured') audioEncoder.encode(value);
      value.close();
    }
  } catch {
    // parou
  }
}

// ---------------------------------------------------------------- vídeo de cada fonte

function enqueue(s: Source, fn: () => Promise<void>) {
  s.chain = s.chain.then(fn).catch((err) => fail(s, (err as Error).message));
}

function fail(s: Source, message: string) {
  if (s.failed) return;
  s.failed = true;
  post({ type: 'error', id: s.id, message });
}

/** H.264 na placa de vídeo, se der; senão no processador. O nível acompanha o tamanho e a taxa de quadros. */
async function pickConfig(width: number, height: number, fps: number): Promise<VideoEncoderConfig> {
  const area = width * height;
  // 1080p: 8 Mbps a 30 qps, 12 Mbps a 60 qps; o resto proporcional à área
  const bitrate = Math.round(Math.max(1_500_000, (fps > 30 ? 12_000_000 : 8_000_000) * (area / (1920 * 1080))));
  const level = area > 1920 * 1088 ? '33' : fps > 30 && area > 1280 * 720 ? '2A' : '28';
  for (const hardwareAcceleration of ['prefer-hardware', 'no-preference'] as const) {
    for (const codec of [`avc1.6400${level}`, `avc1.4D40${level}`, `avc1.42E0${level}`]) {
      const c: VideoEncoderConfig = { codec, width, height, bitrate, framerate: fps, hardwareAcceleration, latencyMode: 'realtime', bitrateMode: 'variable', avc: { format: 'avc' } };
      try {
        if ((await VideoEncoder.isConfigSupported(c)).supported) return c;
      } catch {
        // tenta o próximo
      }
    }
  }
  throw new Error('Este computador não consegue codificar vídeo H.264 no navegador.');
}

async function startFile(s: Source) {
  // dimensões pares (exigência do H.264) e no máximo 4K
  const scale = Math.min(1, 3840 / s.maxW, 2160 / s.maxH);
  const width = Math.max(2, Math.round((s.maxW * scale) / 2) * 2);
  const height = Math.max(2, Math.round((s.maxH * scale) / 2) * 2);
  const config = await pickConfig(width, height, s.kind === 'screen' ? 60 : 30);
  if (s.closed) return;
  const target = new StreamTarget(
    new WritableStream({
      write: (c) => {
        const copy = c.data.slice();
        post({ type: 'chunk', id: s.id, data: copy.buffer, position: c.position }, [copy.buffer]);
      },
    }),
  );
  // fragmentado: vai para o disco aos pedaços e, se o app cair, o que já foi gravado toca
  const output = new Output({ format: new Mp4OutputFormat({ fastStart: 'fragmented', minimumFragmentDuration: 1 }), target });
  s.video = new EncodedVideoPacketSource('avc');
  s.audio = new EncodedAudioPacketSource(audioCodec);
  output.addVideoTrack(s.video);
  output.addAudioTrack(s.audio);
  s.encoder = new VideoEncoder({
    output: (chunk, meta) => {
      const data = new Uint8Array(chunk.byteLength);
      chunk.copyTo(data);
      const packet = new EncodedPacket(data, chunk.type, chunk.timestamp / 1e6, (chunk.duration ?? 16_666) / 1e6);
      enqueue(s, () => s.video!.add(packet, meta));
    },
    error: (e) => fail(s, `Vídeo: ${e.message}`),
  });
  s.encoder.configure(config);
  s.hardware = String(config.hardwareAcceleration);
  s.t0 = now();
  s.output = output;
  enqueue(s, () => output.start());
  post({ type: 'started', id: s.id, width, height, hardware: s.hardware, startAt: Math.round(performance.timeOrigin + s.t0 * 1000) });
}

async function readVideo(s: Source) {
  let starting: Promise<void> | null = null;
  try {
    for (;;) {
      const { value: frame, done } = await s.reader.read();
      if (done || !frame) break;
      try {
        if (s.closed || s.failed) continue;
        const t = now();
        if (!s.output) {
          // ainda escolhendo o tamanho: fica com o maior que aparecer nos primeiros instantes
          s.firstSeen ||= t;
          s.maxW = Math.max(s.maxW, frame.displayWidth);
          s.maxH = Math.max(s.maxH, frame.displayHeight);
          if (!starting && audioConfig && t - s.firstSeen >= SETTLE) starting = startFile(s).catch((err) => fail(s, (err as Error).message));
          continue;
        }
        const enc = s.encoder!;
        // o codificador está atrasado: descarta este quadro em vez de acumular fila
        if (enc.state !== 'configured' || enc.encodeQueueSize > 2) {
          s.dropped++;
          continue;
        }
        let ts = t - s.t0;
        if (ts <= s.lastTs) ts = s.lastTs + 0.001;
        s.lastTs = ts;
        const key = ts - s.lastKey >= KEY_EVERY || s.frames === 0;
        if (key) s.lastKey = ts;
        // o relógio do quadro vira o da gravação (o mesmo do áudio), para imagem e som andarem juntos
        const stamped = new VideoFrame(frame, { timestamp: Math.round(ts * 1e6) });
        enc.encode(stamped, { keyFrame: key });
        stamped.close();
        s.frames++;
      } finally {
        frame.close();
      }
    }
  } catch {
    // a faixa acabou
  }
}

async function closeSource(s: Source) {
  if (s.closed) return;
  s.closed = true;
  void s.reader.cancel().catch(() => {});
  try {
    if (s.encoder?.state === 'configured') await s.encoder.flush();
  } catch {
    // ok
  }
  const output = s.output;
  await s.chain;
  if (output && !s.failed) {
    try {
      await output.finalize();
    } catch (err) {
      post({ type: 'error', id: s.id, message: (err as Error).message });
    }
  }
  if (s.encoder && s.encoder.state !== 'closed') s.encoder.close();
  post({ type: 'closed', id: s.id, frames: s.frames, dropped: s.dropped, started: !!output });
  sources.delete(s.id);
}

self.onmessage = (e: MessageEvent<In>) => {
  const m = e.data;
  switch (m.type) {
    case 'init':
      init(m).catch((err) => post({ type: 'error', message: (err as Error).message, fatal: true }));
      break;
    case 'audio':
      void readAudio(m.readable);
      break;
    case 'open': {
      const s: Source = {
        id: m.id,
        kind: m.kind,
        reader: m.readable.getReader(),
        closed: false,
        failed: false,
        encoder: null,
        output: null,
        video: null,
        audio: null,
        audioStarted: false,
        chain: Promise.resolve(),
        t0: 0,
        firstSeen: 0,
        maxW: 0,
        maxH: 0,
        lastKey: 0,
        lastTs: -1,
        frames: 0,
        dropped: 0,
        hardware: '',
      };
      sources.set(m.id, s);
      void readVideo(s);
      break;
    }
    case 'close': {
      const s = sources.get(m.id);
      if (s) void closeSource(s);
      else post({ type: 'closed', id: m.id, frames: 0, dropped: 0, started: false });
      break;
    }
    case 'stop':
      void (async () => {
        await Promise.all([...sources.values()].map(closeSource));
        try {
          await audioReader?.cancel();
          await audioEncoder?.flush();
        } catch {
          // ok
        }
        audioEncoder?.close();
        post({ type: 'done' });
      })();
      break;
  }
};
