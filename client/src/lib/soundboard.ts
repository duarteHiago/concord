// Mesa de sons: o servidor avisa quem está na sala e cada um toca o arquivo localmente.
import { useApp } from '../store/app';
import { useVoice } from '../store/voice';
import { memberName } from './types';

const VOLUME_KEY = 'concord.soundboardVolume';

export function soundboardVolume(): number {
  try {
    const v = Number(localStorage.getItem(VOLUME_KEY));
    return Number.isFinite(v) && localStorage.getItem(VOLUME_KEY) !== null ? Math.min(1, Math.max(0, v)) : 0.6;
  } catch {
    return 0.6;
  }
}

export function setSoundboardVolume(v: number) {
  try {
    localStorage.setItem(VOLUME_KEY, String(v));
  } catch {
    // ignorado
  }
}

export interface SoundPlayed {
  name: string;
  by: string;
  at: number;
}

export function playSoundboard(e: { url: string; userId: string; channelId: string; name: string }) {
  const voice = useVoice.getState();
  if (voice.status === 'idle' || voice.channelId !== e.channelId) return;
  // ensurdecido ou quem tocou está silenciado para mim: não toca
  if (voice.deafened || voice.localMuted[e.userId]) return;

  const audio = new Audio(e.url);
  audio.volume = soundboardVolume();
  const sink = voice.audioSettings.outputId;
  const withSink = audio as HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> };
  if (sink && sink !== 'default' && withSink.setSinkId) void withSink.setSinkId(sink).catch(() => {});
  void audio.play().catch(() => {});

  // avisa a sala de voz para mostrar "Fulano tocou X"
  const app = useApp.getState();
  const detail = voice.serverId ? app.details[voice.serverId] : undefined;
  const member = detail?.members.find((m) => m.id === e.userId);
  window.dispatchEvent(
    new CustomEvent<SoundPlayed>('concord:sound', { detail: { name: e.name, by: member ? memberName(member) : 'Alguém', at: Date.now() } }),
  );
}
