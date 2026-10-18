// Abre uma transmissão numa janela separada (para levar a outro monitor e pôr em tela cheia).
// A janela é do mesmo site (about:blank), então recebe o vídeo direto, sem passar pelo servidor de novo.
import type { Track } from 'livekit-client';

const windows = new Map<string, Window>(); // sid da faixa -> janela

export function popOutVideo(track: Track, title: string): boolean {
  const key = track.sid ?? track.mediaStreamTrack.id;
  const existing = windows.get(key);
  if (existing && !existing.closed) {
    existing.focus();
    return true;
  }

  const w = window.open('', `concord-live-${key}`, 'popup=yes,width=1280,height=760');
  if (!w) return false;
  windows.set(key, w);

  const doc = w.document;
  doc.title = title;
  const style = doc.createElement('style');
  style.textContent = `
    html, body { margin: 0; height: 100%; background: #000; overflow: hidden; font-family: system-ui, sans-serif; }
    video { width: 100%; height: 100%; object-fit: contain; background: #000; }
    .bar { position: fixed; right: 16px; bottom: 16px; display: flex; gap: 8px; opacity: 0; transition: opacity .2s; }
    body:hover .bar, .bar:focus-within { opacity: 1; }
    button { height: 40px; padding: 0 16px; border: 0; border-radius: 999px; background: rgba(23,18,28,.85);
             color: #f3ecf7; font-weight: 700; font-size: 14px; cursor: pointer; }
    button:hover { background: #ff8a6b; color: #2a1410; }
    .ended { position: fixed; inset: 0; display: none; align-items: center; justify-content: center; color: #b3a6c2; font-size: 18px; }
  `;
  const video = doc.createElement('video');
  video.autoplay = true;
  video.playsInline = true;
  video.muted = true; // o som da transmissão continua tocando na janela principal
  video.srcObject = new MediaStream([track.mediaStreamTrack]);

  const toggleFullscreen = () => {
    if (doc.fullscreenElement) void doc.exitFullscreen();
    else void doc.documentElement.requestFullscreen();
  };
  const bar = doc.createElement('div');
  bar.className = 'bar';
  const fsButton = doc.createElement('button');
  fsButton.textContent = 'Tela cheia (F)';
  fsButton.onclick = toggleFullscreen;
  const closeButton = doc.createElement('button');
  closeButton.textContent = 'Fechar';
  closeButton.onclick = () => w.close();
  bar.append(fsButton, closeButton);

  const ended = doc.createElement('div');
  ended.className = 'ended';
  ended.textContent = 'A transmissão terminou.';

  video.ondblclick = toggleFullscreen;
  doc.addEventListener('keydown', (e) => {
    if (e.key === 'f' || e.key === 'F') toggleFullscreen();
  });
  doc.head.appendChild(style);
  doc.body.replaceChildren(video, bar, ended);
  void video.play().catch(() => {});

  const onEnded = () => {
    ended.style.display = 'flex';
    video.remove();
  };
  track.mediaStreamTrack.addEventListener('ended', onEnded, { once: true });
  w.addEventListener('beforeunload', () => {
    windows.delete(key);
    track.mediaStreamTrack.removeEventListener('ended', onEnded);
  });
  return true;
}

export function isPoppedOut(track: Track | undefined) {
  if (!track) return false;
  const w = windows.get(track.sid ?? track.mediaStreamTrack.id);
  return !!w && !w.closed;
}

/** Fecha a janela de uma faixa que saiu (transmissão encerrada ou parou de assistir). */
export function closePopout(sid: string | undefined) {
  if (!sid) return;
  const w = windows.get(sid);
  if (w && !w.closed) w.close();
  windows.delete(sid);
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => windows.forEach((w) => w.close()));
}
