// Prova da denúncia de transmissão: o app de quem denuncia já está mostrando o vídeo, então tira algumas
// "fotos" dele (tela ou câmera) e manda junto. Só funciona com o vídeo na tela (quem não está assistindo não
// tem o que mostrar); o servidor confere que quem denuncia está na mesma sala.
import { Track } from 'livekit-client';
import { useVoice } from '../store/voice';

const MAX_WIDTH = 1280;
// o servidor aceita até ~450 KB por imagem: acima disso, a foto sai mais comprimida
const MAX_DATA_URL = 560_000;

function videosOf(identity: string): HTMLVideoElement[] {
  const p = useVoice.getState().room?.remoteParticipants.get(identity);
  if (!p) return [];
  const out: HTMLVideoElement[] = [];
  for (const source of [Track.Source.ScreenShare, Track.Source.Camera]) {
    const el = p.getTrackPublication(source)?.track?.attachedElements.find((e): e is HTMLVideoElement => e instanceof HTMLVideoElement && e.videoWidth > 0);
    if (el) out.push(el);
  }
  return out;
}

/** Tem vídeo dessa pessoa aparecendo agora (tela ou câmera)? */
export const hasVisibleVideo = (identity: string) => videosOf(identity).length > 0;

function grab(video: HTMLVideoElement): string | null {
  const scale = Math.min(1, MAX_WIDTH / video.videoWidth);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(video.videoWidth * scale);
  canvas.height = Math.round(video.videoHeight * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  for (const quality of [0.72, 0.55, 0.4]) {
    const url = canvas.toDataURL('image/jpeg', quality);
    if (url.length <= MAX_DATA_URL) return url;
  }
  return null;
}

/** Algumas fotos seguidas (a tela muda; uma só pode pegar o momento errado). */
export async function captureFrames(identity: string, count = 3, gapMs = 700): Promise<string[]> {
  const frames: string[] = [];
  for (let i = 0; i < count; i++) {
    if (i) await new Promise((r) => setTimeout(r, gapMs));
    const video = videosOf(identity)[0];
    const frame = video ? grab(video) : null;
    if (frame) frames.push(frame);
  }
  return frames;
}
