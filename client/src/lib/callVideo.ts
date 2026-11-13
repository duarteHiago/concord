// Vídeo da sala para a gravação local: desenha num canvas, quadro a quadro, o que está acontecendo na sala.
// - Com transmissão: a tela em destaque, as câmeras em balões no canto e quem está sem câmera em bolinhas
//   com a inicial (anel verde em quem está falando).
// - Sem transmissão: uma grade com a câmera ou o avatar de cada pessoa, com o nome.
//
// Dois cuidados para o vídeo sair bom:
// - O LiveKit (adaptiveStream) baixa ou pausa o vídeo que não está aparecendo. Por isso cada vídeo fica preso
//   num "palco" invisível (opacidade 0, por trás do app) do tamanho que a gravação precisa.
// - O ritmo dos quadros vem de um worker: o navegador não pausa o timer dele como pausa as animações da página.
import { Track, type Participant, type Room } from 'livekit-client';

export type VideoQuality = '720p30' | '1080p30' | '1080p60';

export const VIDEO_QUALITY: Record<VideoQuality, { w: number; h: number; fps: number; bps: number; label: string }> = {
  '720p30': { w: 1280, h: 720, fps: 30, bps: 4_000_000, label: '720p · 30 qps (leve)' },
  '1080p30': { w: 1920, h: 1080, fps: 30, bps: 7_000_000, label: '1080p · 30 qps' },
  '1080p60': { w: 1920, h: 1080, fps: 60, bps: 11_000_000, label: '1080p · 60 qps (pesa em quem joga)' },
};

/** Dá para gravar vídeo neste navegador? */
export const canRecordVideo = () => typeof HTMLCanvasElement !== 'undefined' && 'captureStream' in HTMLCanvasElement.prototype && 'MediaRecorder' in window;

export interface PersonInfo {
  name: string;
  color: string;
  avatarUrl: string | null;
}

interface Feed {
  el: HTMLVideoElement;
  identity: string;
  kind: 'camera' | 'screen';
  detach: () => void;
}

const TICKER = `let t; onmessage = (e) => { clearInterval(t); if (e.data > 0) t = setInterval(() => postMessage(0), e.data); };`;

export class RoomVideo {
  readonly canvas = document.createElement('canvas');
  private g: CanvasRenderingContext2D;
  private stage = document.createElement('div');
  private feeds = new Map<string, Feed>();
  private avatars = new Map<string, HTMLImageElement>();
  private ticker: Worker;
  private syncTimer: ReturnType<typeof setInterval>;
  private q: (typeof VIDEO_QUALITY)[VideoQuality];

  constructor(
    private room: Room,
    quality: VideoQuality,
    private info: (identity: string) => PersonInfo,
  ) {
    this.q = VIDEO_QUALITY[quality];
    this.canvas.width = this.q.w;
    this.canvas.height = this.q.h;
    this.g = this.canvas.getContext('2d', { alpha: false })!;
    this.stage.setAttribute('aria-hidden', 'true');
    this.stage.style.cssText = 'position:fixed;left:0;top:0;width:100vw;height:100vh;overflow:hidden;opacity:0;pointer-events:none;z-index:-1';
    document.body.appendChild(this.stage);
    this.sync();
    this.syncTimer = setInterval(() => this.sync(), 1000);
    this.ticker = new Worker(URL.createObjectURL(new Blob([TICKER], { type: 'text/javascript' })));
    this.ticker.onmessage = () => this.draw();
    this.ticker.postMessage(Math.round(1000 / this.q.fps));
  }

  /** A faixa de vídeo para o gravador. */
  stream(): MediaStreamTrack {
    return this.canvas.captureStream(this.q.fps).getVideoTracks()[0];
  }

  get bitrate() {
    return this.q.bps;
  }

  stop() {
    this.ticker.postMessage(0);
    this.ticker.terminate();
    clearInterval(this.syncTimer);
    for (const f of this.feeds.values()) f.detach();
    this.feeds.clear();
    this.stage.remove();
  }

  // ---------------------------------------------------------------- quem tem vídeo agora

  private participants(): Participant[] {
    return [this.room.localParticipant, ...this.room.remoteParticipants.values()];
  }

  private sync() {
    const live = new Set<string>();
    for (const p of this.participants()) {
      for (const source of [Track.Source.Camera, Track.Source.ScreenShare]) {
        const pub = p.getTrackPublication(source);
        const track = pub?.track;
        if (!track || pub.isMuted || track.mediaStreamTrack?.readyState !== 'live') continue;
        const key = track.mediaStreamTrack.id;
        live.add(key);
        if (this.feeds.has(key)) continue;
        const el = document.createElement('video');
        el.muted = true;
        el.playsInline = true;
        el.autoplay = true;
        // tamanho de "tela grande" no palco: o LiveKit manda a camada de qualidade mais alta
        el.style.cssText = `position:absolute;left:0;top:0;width:${source === Track.Source.ScreenShare ? this.q.w : Math.round(this.q.w / 3)}px;height:auto`;
        this.stage.appendChild(el);
        let detach: () => void;
        if (p === this.room.localParticipant) {
          el.srcObject = new MediaStream([track.mediaStreamTrack]);
          detach = () => {
            el.srcObject = null;
            el.remove();
          };
        } else {
          track.attach(el); // passa pelo LiveKit: ele vê o vídeo "na tela" e não pausa
          detach = () => {
            track.detach(el);
            el.remove();
          };
        }
        void el.play().catch(() => {});
        this.feeds.set(key, { el, identity: p.identity, kind: source === Track.Source.ScreenShare ? 'screen' : 'camera', detach });
      }
    }
    for (const [key, f] of this.feeds) {
      if (!live.has(key)) {
        f.detach();
        this.feeds.delete(key);
      }
    }
  }

  // ---------------------------------------------------------------- desenho

  private avatar(url: string | null): HTMLImageElement | null {
    if (!url) return null;
    let img = this.avatars.get(url);
    if (!img) {
      img = new Image();
      img.src = url;
      this.avatars.set(url, img);
    }
    return img.complete && img.naturalWidth ? img : null;
  }

  private draw() {
    const { g } = this;
    const W = this.canvas.width;
    const H = this.canvas.height;
    const s = H / 1080; // escala dos detalhes (texto, margens)
    const bg = g.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, '#0d1018');
    bg.addColorStop(1, '#151a26');
    g.fillStyle = bg;
    g.fillRect(0, 0, W, H);

    const feeds = [...this.feeds.values()];
    const screens = feeds.filter((f) => f.kind === 'screen' && f.el.videoWidth);
    const cams = new Map(feeds.filter((f) => f.kind === 'camera' && f.el.videoWidth).map((f) => [f.identity, f]));
    const people = this.participants();
    const m = 28 * s;

    if (screens.length) {
      // telas lado a lado ocupando a área
      const w = (W - m * (screens.length + 1)) / screens.length;
      screens.forEach((f, i) => {
        const x = m + i * (w + m);
        this.video(f.el, x, m, w, H - 2 * m, 18 * s, 'contain');
        this.label(`Tela de ${this.info(f.identity).name}`, x + 16 * s, m + 16 * s, s, 'top');
      });
      // câmeras em balões no canto de baixo à direita
      const bh = Math.round(H * 0.2);
      const bw = Math.round(bh * (16 / 9));
      let x = W - m - 12 * s - bw;
      for (const p of people) {
        const cam = cams.get(p.identity);
        if (!cam) continue;
        const y = H - m - 12 * s - bh;
        this.shadow(() => this.video(cam.el, x, y, bw, bh, 16 * s, 'cover'), s);
        if (p.isSpeaking) this.ring(x, y, bw, bh, 16 * s, s);
        this.label(this.info(p.identity).name, x + 10 * s, y + bh - 10 * s, s * 0.8, 'bottom');
        x -= bw + 14 * s;
        if (x < W * 0.35) break;
      }
      // quem está sem câmera: bolinhas com a inicial, embaixo à esquerda
      let cx = m + 22 * s;
      const r = 30 * s;
      for (const p of people) {
        if (cams.has(p.identity)) continue;
        this.dot(p, cx + r, H - m - 22 * s - r, r, s);
        cx += r * 2 + 14 * s;
        if (cx > W * 0.4) break;
      }
      return;
    }

    // sem transmissão: grade de pessoas
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
      if (cam) this.video(cam.el, x, y, tw, th, 22 * s, 'cover');
      else {
        this.round(x, y, tw, th, 22 * s);
        g.fillStyle = '#1c2230';
        g.fill();
        this.dot(p, x + tw / 2, y + th / 2, Math.min(tw, th) * 0.2, s, false);
      }
      if (p.isSpeaking) this.ring(x, y, tw, th, 22 * s, s);
      this.label(this.info(p.identity).name, x + 14 * s, y + th - 14 * s, s, 'bottom');
    });
  }

  private round(x: number, y: number, w: number, h: number, r: number) {
    const g = this.g;
    g.beginPath();
    g.roundRect(x, y, w, h, r);
  }

  private video(el: HTMLVideoElement, x: number, y: number, w: number, h: number, r: number, fit: 'cover' | 'contain') {
    const g = this.g;
    const vw = el.videoWidth;
    const vh = el.videoHeight;
    g.save();
    this.round(x, y, w, h, r);
    g.clip();
    g.fillStyle = '#000';
    g.fillRect(x, y, w, h);
    if (vw && vh) {
      const k = fit === 'cover' ? Math.max(w / vw, h / vh) : Math.min(w / vw, h / vh);
      const dw = vw * k;
      const dh = vh * k;
      g.drawImage(el, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
    }
    g.restore();
  }

  private shadow(fn: () => void, s: number) {
    const g = this.g;
    g.save();
    g.shadowColor = 'rgba(0,0,0,0.55)';
    g.shadowBlur = 24 * s;
    g.shadowOffsetY = 6 * s;
    fn();
    g.restore();
  }

  private ring(x: number, y: number, w: number, h: number, r: number, s: number) {
    const g = this.g;
    g.save();
    g.lineWidth = 5 * s;
    g.strokeStyle = '#3ba55c';
    this.round(x, y, w, h, r);
    g.stroke();
    g.restore();
  }

  /** Bolinha com a foto (ou a inicial na cor da pessoa); anel verde quando fala. */
  private dot(p: Participant, cx: number, cy: number, r: number, s: number, withRing = true) {
    const g = this.g;
    const info = this.info(p.identity);
    g.save();
    g.beginPath();
    g.arc(cx, cy, r, 0, Math.PI * 2);
    g.fillStyle = info.color;
    g.fill();
    const img = this.avatar(info.avatarUrl);
    if (img) {
      g.clip();
      g.drawImage(img, cx - r, cy - r, r * 2, r * 2);
    } else {
      g.fillStyle = '#fff';
      g.font = `800 ${Math.round(r * 0.9)}px "Nunito Sans", system-ui, sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText((info.name.trim()[0] ?? '?').toUpperCase(), cx, cy + r * 0.04);
    }
    g.restore();
    if (p.isSpeaking && withRing) {
      g.save();
      g.lineWidth = 4 * s;
      g.strokeStyle = '#3ba55c';
      g.beginPath();
      g.arc(cx, cy, r + 5 * s, 0, Math.PI * 2);
      g.stroke();
      g.restore();
    }
  }

  private label(text: string, x: number, y: number, s: number, anchor: 'top' | 'bottom') {
    const g = this.g;
    g.save();
    g.font = `700 ${Math.round(24 * s)}px "Nunito Sans", system-ui, sans-serif`;
    const pad = 12 * s;
    const w = Math.min(g.measureText(text).width, 600 * s) + pad * 2;
    const h = 38 * s;
    const top = anchor === 'top' ? y : y - h;
    g.fillStyle = 'rgba(10,12,18,0.72)';
    this.round(x, top, w, h, h / 2);
    g.fill();
    g.fillStyle = '#fff';
    g.textBaseline = 'middle';
    g.fillText(text, x + pad, top + h / 2, 600 * s);
    g.restore();
  }
}

// ---------------------------------------------------------------- caminho leve (worker + placa de vídeo)

declare class MediaStreamTrackProcessor<T> {
  constructor(init: { track: MediaStreamTrack; maxBufferSize?: number });
  readonly readable: ReadableStream<T>;
}

/**
 * O navegador tem o caminho leve? (Chrome, Edge, app desktop). Ele tira o vídeo da linha da interface e codifica
 * na placa de vídeo; sem ele, fica o `RoomVideo` (canvas + MediaRecorder), mais pesado.
 */
export const canRecordVideoFast = () =>
  typeof window !== 'undefined' && 'MediaStreamTrackProcessor' in window && 'VideoEncoder' in window && 'AudioEncoder' in window && 'OffscreenCanvas' in window;

/**
 * Vídeo da sala pelo worker (ver recordWorker.ts). O app só entrega os quadros de cada tela/câmera e o áudio
 * misturado; montar, codificar e empacotar acontece fora da interface. `onChunk` recebe o MP4 aos pedaços.
 */
export class FastRoomVideo {
  private worker = new Worker(new URL('./recordWorker.ts', import.meta.url), { type: 'module' });
  private stage = document.createElement('div');
  private feeds = new Map<string, { detach: () => void }>();
  private avatarsSent = new Set<string>();
  private timers: ReturnType<typeof setInterval>[] = [];
  private done: Promise<{ frames: number; dropped: number }>;
  private q: (typeof VIDEO_QUALITY)[VideoQuality];
  /** codificador escolhido (para mostrar e diagnosticar) */
  info: { codec: string; hardware: string; audio: string | null } | null = null;

  private constructor(
    private room: Room,
    quality: VideoQuality,
    private personInfo: (identity: string) => PersonInfo,
    onChunk: (data: Uint8Array, position: number) => void,
    onError: (message: string) => void,
  ) {
    this.q = VIDEO_QUALITY[quality];
    this.stage.setAttribute('aria-hidden', 'true');
    this.stage.style.cssText = 'position:fixed;left:0;top:0;width:100vw;height:100vh;overflow:hidden;opacity:0;pointer-events:none;z-index:-1';
    document.body.appendChild(this.stage);
    let resolveDone!: (v: { frames: number; dropped: number }) => void;
    this.done = new Promise((r) => (resolveDone = r));
    this.worker.onmessage = (e) => {
      const m = e.data;
      if (m.type === 'chunk') onChunk(new Uint8Array(m.data), m.position);
      else if (m.type === 'done') resolveDone({ frames: m.frames, dropped: m.dropped });
      else if (m.type === 'error' && !m.fatal) onError(m.message);
    };
  }

  /** Liga o worker e espera o codificador ficar pronto (falha: o caminho leve não serve neste PC). */
  static async start(
    room: Room,
    quality: VideoQuality,
    personInfo: (identity: string) => PersonInfo,
    audioTrack: MediaStreamTrack,
    onChunk: (data: Uint8Array, position: number) => void,
    onError: (message: string) => void,
  ): Promise<FastRoomVideo> {
    const v = new FastRoomVideo(room, quality, personInfo, onChunk, onError);
    const settings = audioTrack.getSettings();
    await new Promise<void>((resolve, reject) => {
      const onReady = (e: MessageEvent) => {
        if (e.data.type === 'ready') {
          v.info = { codec: e.data.codec, hardware: e.data.hardware, audio: e.data.audio };
          v.worker.removeEventListener('message', onReady);
          resolve();
        } else if (e.data.type === 'error' && e.data.fatal) {
          v.worker.removeEventListener('message', onReady);
          reject(new Error(e.data.message));
        }
      };
      v.worker.addEventListener('message', onReady);
      v.worker.postMessage({
        type: 'init',
        width: v.q.w,
        height: v.q.h,
        fps: v.q.fps,
        bitrate: v.q.bps,
        audio: { sampleRate: settings.sampleRate ?? 48000, channels: settings.channelCount ?? 2 },
      });
    }).catch((err) => {
      v.dispose();
      throw err;
    });
    const audio = new MediaStreamTrackProcessor<AudioData>({ track: audioTrack });
    v.worker.postMessage({ type: 'audio', readable: audio.readable }, [audio.readable as unknown as Transferable]);
    v.sync();
    v.scene();
    v.timers.push(setInterval(() => v.sync(), 1000));
    v.timers.push(setInterval(() => v.scene(), 250));
    return v;
  }

  private participants(): Participant[] {
    return [this.room.localParticipant, ...this.room.remoteParticipants.values()];
  }

  private sync() {
    const live = new Set<string>();
    for (const p of this.participants()) {
      for (const source of [Track.Source.Camera, Track.Source.ScreenShare]) {
        const pub = p.getTrackPublication(source);
        const track = pub?.track;
        const mst = track?.mediaStreamTrack;
        if (!track || !mst || pub.isMuted || mst.readyState !== 'live') continue;
        live.add(mst.id);
        if (this.feeds.has(mst.id)) continue;
        // os quadros vão direto para o worker, sem passar pela página
        const proc = new MediaStreamTrackProcessor<VideoFrame>({ track: mst, maxBufferSize: 2 });
        this.worker.postMessage(
          { type: 'source', id: mst.id, identity: p.identity, kind: source === Track.Source.ScreenShare ? 'screen' : 'camera', readable: proc.readable },
          [proc.readable as unknown as Transferable],
        );
        let detach = () => {};
        if (p !== this.room.localParticipant) {
          // só para o LiveKit (adaptiveStream) ver o vídeo "na tela" e mandar a qualidade alta
          const el = document.createElement('video');
          el.muted = true;
          el.style.cssText = `position:absolute;left:0;top:0;width:${source === Track.Source.ScreenShare ? this.q.w : Math.round(this.q.w / 3)}px;height:auto`;
          this.stage.appendChild(el);
          track.attach(el);
          detach = () => {
            track.detach(el);
            el.remove();
          };
        }
        this.feeds.set(mst.id, { detach });
      }
    }
    for (const [id, f] of this.feeds) {
      if (live.has(id)) continue;
      this.worker.postMessage({ type: 'remove', id });
      f.detach();
      this.feeds.delete(id);
    }
  }

  private scene() {
    const people = this.participants().map((p) => {
      const i = this.personInfo(p.identity);
      return { identity: p.identity, name: i.name, color: i.color, speaking: p.isSpeaking };
    });
    this.worker.postMessage({ type: 'scene', people });
    // fotos: uma vez por pessoa, como ImageBitmap (o worker não carrega imagens sozinho)
    for (const p of this.participants()) {
      const url = this.personInfo(p.identity).avatarUrl;
      if (!url || this.avatarsSent.has(p.identity)) continue;
      this.avatarsSent.add(p.identity);
      fetch(url)
        .then((r) => r.blob())
        .then((b) => createImageBitmap(b, { resizeWidth: 128, resizeHeight: 128 }))
        .then((bmp) => this.worker.postMessage({ type: 'scene', people, avatars: [[p.identity, bmp]] }, [bmp]))
        .catch(() => {});
    }
  }

  async stop(): Promise<{ frames: number; dropped: number }> {
    this.timers.forEach(clearInterval);
    this.worker.postMessage({ type: 'stop' });
    const result = await Promise.race([this.done, new Promise<{ frames: number; dropped: number }>((r) => setTimeout(() => r({ frames: 0, dropped: 0 }), 15_000))]);
    this.dispose();
    return result;
  }

  private dispose() {
    this.timers.forEach(clearInterval);
    for (const f of this.feeds.values()) f.detach();
    this.feeds.clear();
    this.stage.remove();
    this.worker.terminate();
  }
}
