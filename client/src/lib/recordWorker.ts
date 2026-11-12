// Worker do vídeo da sala (gravação local). Fica fora da linha da interface, para o app e os jogos não
// travarem: recebe os quadros de cada tela/câmera direto do navegador (MediaStreamTrackProcessor), monta a cena
// num canvas fora da tela, codifica com o WebCodecs pedindo a placa de vídeo (como o OBS faz) e empacota em MP4
// junto com o áudio. Se o codificador atrasar, descarta o quadro em vez de acumular fila (o vídeo perde um
// quadro, mas o PC não engasga).
import { Muxer, StreamTarget } from 'mp4-muxer';

interface Person {
  identity: string;
  name: string;
  color: string;
  speaking: boolean;
}

interface Source {
  identity: string;
  kind: 'camera' | 'screen';
  frame: VideoFrame | null;
  reader: ReadableStreamDefaultReader<VideoFrame>;
}

type In =
  | { type: 'init'; width: number; height: number; fps: number; bitrate: number; audio: { sampleRate: number; channels: number } | null }
  | { type: 'source'; id: string; identity: string; kind: 'camera' | 'screen'; readable: ReadableStream<VideoFrame> }
  | { type: 'remove'; id: string }
  | { type: 'audio'; readable: ReadableStream<AudioData> }
  | { type: 'scene'; people: Person[]; avatars?: [string, ImageBitmap][] }
  | { type: 'stop' };

const post = (msg: unknown, transfer: Transferable[] = []) => (self as unknown as Worker).postMessage(msg, transfer);

let W = 1280;
let H = 720;
let FPS = 30;
let canvas: OffscreenCanvas;
let g: OffscreenCanvasRenderingContext2D;
let muxer: Muxer<StreamTarget>;
let video: VideoEncoder;
let audio: AudioEncoder | null = null;
let ticker: ReturnType<typeof setInterval> | undefined;
let started = 0;
let frameNo = 0;
let dropped = 0;
let people: Person[] = [];
const sources = new Map<string, Source>();
const avatars = new Map<string, ImageBitmap>();
let audioReader: ReadableStreamDefaultReader<AudioData> | null = null;

async function pickVideoConfig(bitrate: number): Promise<VideoEncoderConfig> {
  // nível do H.264: 4.2 para 1080p60, 4.0 para o resto
  const level = H >= 1080 && FPS > 30 ? '2A' : '28';
  const tries: VideoEncoderConfig[] = [];
  for (const hw of ['prefer-hardware', 'no-preference'] as const) {
    for (const codec of [`avc1.6400${level}`, `avc1.4D40${level}`, 'avc1.42E01F']) {
      tries.push({ codec, width: W, height: H, bitrate, framerate: FPS, hardwareAcceleration: hw, latencyMode: 'realtime', bitrateMode: 'variable', avc: { format: 'avc' } });
    }
  }
  for (const c of tries) {
    try {
      if ((await VideoEncoder.isConfigSupported(c)).supported) return c;
    } catch {
      // tenta o próximo
    }
  }
  throw new Error('Este computador não consegue codificar vídeo H.264 no navegador.');
}

async function pickAudioCodec(sampleRate: number, channels: number): Promise<'aac' | 'opus'> {
  try {
    const aac = await AudioEncoder.isConfigSupported({ codec: 'mp4a.40.2', sampleRate, numberOfChannels: channels, bitrate: 128_000 });
    if (aac.supported) return 'aac';
  } catch {
    // sem AAC: Opus
  }
  return 'opus';
}

async function init(m: Extract<In, { type: 'init' }>) {
  W = m.width;
  H = m.height;
  FPS = m.fps;
  canvas = new OffscreenCanvas(W, H);
  g = canvas.getContext('2d', { alpha: false })!;
  const vconf = await pickVideoConfig(m.bitrate);
  const acodec = m.audio ? await pickAudioCodec(m.audio.sampleRate, m.audio.channels) : null;

  muxer = new Muxer({
    target: new StreamTarget({
      onData: (data: Uint8Array, position: number) => {
        const copy = data.slice();
        post({ type: 'chunk', data: copy.buffer, position }, [copy.buffer]);
      },
    }),
    video: { codec: 'avc', width: W, height: H, frameRate: FPS },
    ...(m.audio && acodec ? { audio: { codec: acodec, sampleRate: m.audio.sampleRate, numberOfChannels: m.audio.channels } } : {}),
    // fragmentado: vai para o disco aos pedaços e, se o app cair, o que já foi gravado toca
    fastStart: 'fragmented',
    firstTimestampBehavior: 'offset',
    minFragmentDuration: 1,
  });

  video = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => post({ type: 'error', message: `Vídeo: ${e.message}` }),
  });
  video.configure(vconf);

  if (m.audio && acodec) {
    audio = new AudioEncoder({
      output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
      error: (e) => post({ type: 'error', message: `Áudio: ${e.message}` }),
    });
    audio.configure(
      acodec === 'aac'
        ? { codec: 'mp4a.40.2', sampleRate: m.audio.sampleRate, numberOfChannels: m.audio.channels, bitrate: 128_000 }
        : { codec: 'opus', sampleRate: m.audio.sampleRate, numberOfChannels: m.audio.channels, bitrate: 128_000 },
    );
  }

  started = performance.now();
  ticker = setInterval(tick, 1000 / FPS);
  post({ type: 'ready', codec: vconf.codec, hardware: vconf.hardwareAcceleration, audio: acodec });
}

async function readSource(id: string, src: Source) {
  try {
    for (;;) {
      const { value, done } = await src.reader.read();
      if (done || !value) break;
      // guarda só o quadro mais novo de cada fonte
      src.frame?.close();
      src.frame = value;
    }
  } catch {
    // a faixa acabou
  }
  if (sources.get(id) === src) {
    src.frame?.close();
    sources.delete(id);
  }
}

async function readAudio(readable: ReadableStream<AudioData>) {
  audioReader = readable.getReader();
  try {
    for (;;) {
      const { value, done } = await audioReader.read();
      if (done || !value) break;
      if (audio && audio.state === 'configured') audio.encode(value);
      value.close();
    }
  } catch {
    // parou
  }
}

function tick() {
  if (!video || video.state !== 'configured') return;
  // o codificador está atrasado: descarta este quadro em vez de acumular fila
  if (video.encodeQueueSize > 3) {
    dropped++;
    return;
  }
  draw();
  const frame = new VideoFrame(canvas, { timestamp: Math.round((performance.now() - started) * 1000), duration: Math.round(1e6 / FPS) });
  video.encode(frame, { keyFrame: frameNo % (FPS * 2) === 0 });
  frame.close();
  frameNo++;
}

async function stop() {
  clearInterval(ticker);
  try {
    await audioReader?.cancel();
  } catch {
    // ok
  }
  for (const s of sources.values()) {
    void s.reader.cancel().catch(() => {});
    s.frame?.close();
  }
  sources.clear();
  try {
    await video?.flush();
    await audio?.flush();
    muxer?.finalize();
  } catch (e) {
    post({ type: 'error', message: (e as Error).message });
  }
  video?.close();
  audio?.close();
  post({ type: 'done', frames: frameNo, dropped });
}

self.onmessage = (e: MessageEvent<In>) => {
  const m = e.data;
  switch (m.type) {
    case 'init':
      init(m).catch((err) => post({ type: 'error', message: (err as Error).message, fatal: true }));
      break;
    case 'source': {
      const src: Source = { identity: m.identity, kind: m.kind, frame: null, reader: m.readable.getReader() };
      sources.get(m.id)?.reader.cancel().catch(() => {});
      sources.set(m.id, src);
      void readSource(m.id, src);
      break;
    }
    case 'remove': {
      const s = sources.get(m.id);
      if (s) {
        void s.reader.cancel().catch(() => {});
        s.frame?.close();
        sources.delete(m.id);
      }
      break;
    }
    case 'audio':
      void readAudio(m.readable);
      break;
    case 'scene':
      people = m.people;
      for (const [id, bmp] of m.avatars ?? []) {
        avatars.get(id)?.close();
        avatars.set(id, bmp);
      }
      break;
    case 'stop':
      void stop();
      break;
  }
};

// ---------------------------------------------------------------- desenho (mesmo layout de callVideo.ts)

function round(x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.roundRect(x, y, w, h, r);
}

function drawFrame(f: VideoFrame, x: number, y: number, w: number, h: number, r: number, fit: 'cover' | 'contain') {
  const vw = f.displayWidth;
  const vh = f.displayHeight;
  g.save();
  round(x, y, w, h, r);
  g.clip();
  g.fillStyle = '#000';
  g.fillRect(x, y, w, h);
  if (vw && vh) {
    const k = fit === 'cover' ? Math.max(w / vw, h / vh) : Math.min(w / vw, h / vh);
    g.drawImage(f, x + (w - vw * k) / 2, y + (h - vh * k) / 2, vw * k, vh * k);
  }
  g.restore();
}

function ring(x: number, y: number, w: number, h: number, r: number, s: number) {
  g.save();
  g.lineWidth = 5 * s;
  g.strokeStyle = '#3ba55c';
  round(x, y, w, h, r);
  g.stroke();
  g.restore();
}

function dot(p: Person, cx: number, cy: number, r: number, s: number, withRing = true) {
  g.save();
  g.beginPath();
  g.arc(cx, cy, r, 0, Math.PI * 2);
  g.fillStyle = p.color;
  g.fill();
  const img = avatars.get(p.identity);
  if (img) {
    g.clip();
    g.drawImage(img, cx - r, cy - r, r * 2, r * 2);
  } else {
    g.fillStyle = '#fff';
    g.font = `800 ${Math.round(r * 0.9)}px "Nunito Sans", system-ui, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText((p.name.trim()[0] ?? '?').toUpperCase(), cx, cy + r * 0.04);
  }
  g.restore();
  if (p.speaking && withRing) {
    g.save();
    g.lineWidth = 4 * s;
    g.strokeStyle = '#3ba55c';
    g.beginPath();
    g.arc(cx, cy, r + 5 * s, 0, Math.PI * 2);
    g.stroke();
    g.restore();
  }
}

function label(text: string, x: number, y: number, s: number, anchor: 'top' | 'bottom') {
  g.save();
  g.font = `700 ${Math.round(24 * s)}px "Nunito Sans", system-ui, sans-serif`;
  const pad = 12 * s;
  const w = Math.min(g.measureText(text).width, 600 * s) + pad * 2;
  const h = 38 * s;
  const top = anchor === 'top' ? y : y - h;
  g.fillStyle = 'rgba(10,12,18,0.72)';
  round(x, top, w, h, h / 2);
  g.fill();
  g.fillStyle = '#fff';
  g.textBaseline = 'middle';
  g.fillText(text, x + pad, top + h / 2, 600 * s);
  g.restore();
}

function draw() {
  const s = H / 1080;
  const bg = g.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#0d1018');
  bg.addColorStop(1, '#151a26');
  g.fillStyle = bg;
  g.fillRect(0, 0, W, H);

  const all = [...sources.values()].filter((x) => x.frame);
  const screens = all.filter((x) => x.kind === 'screen');
  const cams = new Map(all.filter((x) => x.kind === 'camera').map((x) => [x.identity, x]));
  const name = (id: string) => people.find((p) => p.identity === id)?.name ?? 'Alguém';
  const m = 28 * s;

  if (screens.length) {
    const w = (W - m * (screens.length + 1)) / screens.length;
    screens.forEach((src, i) => {
      const x = m + i * (w + m);
      drawFrame(src.frame!, x, m, w, H - 2 * m, 18 * s, 'contain');
      label(`Tela de ${name(src.identity)}`, x + 16 * s, m + 16 * s, s, 'top');
    });
    const bh = Math.round(H * 0.2);
    const bw = Math.round(bh * (16 / 9));
    let x = W - m - 12 * s - bw;
    for (const p of people) {
      const cam = cams.get(p.identity);
      if (!cam) continue;
      const y = H - m - 12 * s - bh;
      g.save();
      g.shadowColor = 'rgba(0,0,0,0.55)';
      g.shadowBlur = 24 * s;
      g.shadowOffsetY = 6 * s;
      drawFrame(cam.frame!, x, y, bw, bh, 16 * s, 'cover');
      g.restore();
      if (p.speaking) ring(x, y, bw, bh, 16 * s, s);
      label(p.name, x + 10 * s, y + bh - 10 * s, s * 0.8, 'bottom');
      x -= bw + 14 * s;
      if (x < W * 0.35) break;
    }
    let cx = m + 22 * s;
    const r = 30 * s;
    for (const p of people) {
      if (cams.has(p.identity)) continue;
      dot(p, cx + r, H - m - 22 * s - r, r, s);
      cx += r * 2 + 14 * s;
      if (cx > W * 0.4) break;
    }
    return;
  }

  const n = Math.max(1, people.length);
  const cols = Math.ceil(Math.sqrt(n * (W / H) * (9 / 16)));
  const rows = Math.ceil(n / cols);
  const gap = 18 * s;
  const tw = (W - m * 2 - gap * (cols - 1)) / cols;
  const th = Math.min((H - m * 2 - gap * (rows - 1)) / rows, (tw * 9) / 16);
  const top = (H - (th * rows + gap * (rows - 1))) / 2;
  people.forEach((p, i) => {
    const r = Math.floor(i / cols);
    const inRow = Math.min(cols, n - r * cols);
    const left = (W - (tw * inRow + gap * (inRow - 1))) / 2;
    const x = left + (i % cols) * (tw + gap);
    const y = top + r * (th + gap);
    const cam = cams.get(p.identity);
    if (cam) drawFrame(cam.frame!, x, y, tw, th, 22 * s, 'cover');
    else {
      round(x, y, tw, th, 22 * s);
      g.fillStyle = '#1c2230';
      g.fill();
      dot(p, x + tw / 2, y + th / 2, Math.min(tw, th) * 0.2, s, false);
    }
    if (p.speaking) ring(x, y, tw, th, 22 * s, s);
    label(p.name, x + 14 * s, y + th - 14 * s, s, 'bottom');
  });
}
