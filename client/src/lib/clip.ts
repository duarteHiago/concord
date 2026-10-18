// Código compartilhado ("clipboard da sala"): alguém manda um texto (ex.: código da sala do jogo)
// e ele aparece por cima da tela de quem está na mesma sala de voz, pronto para copiar.
import { useApp } from '../store/app';
import { toast } from '../store/toast';
import { api } from './api';
import { desktop } from './desktop';
import { playSound } from './sounds';
import type { Me, User } from './types';

export interface ClipEvent {
  messageId: string;
  text: string;
  channelId: string;
  serverId: string;
  from: User & { nickname: string | null };
}

export interface ClipSettings {
  receive: boolean; // mostrar o pop-up quando alguém da sala mandar
  autoCopy: boolean; // copiar sozinho ao chegar (sem precisar do Ctrl+C)
}

export const clipSettings = (me: Me | null): ClipSettings => ({
  receive: me?.settings.clips?.receive !== false,
  autoCopy: me?.settings.clips?.autoCopy === true,
});

export async function shareClip(text: string) {
  const trimmed = text.trim();
  if (!trimmed) return false;
  try {
    const { delivered } = await api.post<{ delivered: number }>('/voice/clip', { text: trimmed });
    toast.success(delivered ? `Código enviado para ${delivered} ${delivered === 1 ? 'pessoa' : 'pessoas'} da sala` : 'Código enviado (só você está na sala agora)');
    return true;
  } catch (err) {
    toast.error(err);
    return false;
  }
}

/** Pop-up dentro do app (navegador ou app desktop antigo). */
export const CLIP_EVENT = 'concord:clip';

export function receiveClip(e: ClipEvent) {
  const me = useApp.getState().me;
  const prefs = clipSettings(me);
  // "Não perturbe" ou pop-up desligado: o código continua no papo da sala
  if (!prefs.receive || me?.settings.status === 'dnd') return;
  const from = e.from.nickname || e.from.displayName;
  playSound('clip');

  if (desktop?.showClip) {
    void desktop.showClip({ text: e.text, from, autoCopy: prefs.autoCopy });
    return;
  }
  window.dispatchEvent(new CustomEvent<ClipEvent>(CLIP_EVENT, { detail: e }));
  if (document.hidden && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
    new Notification(`${from} compartilhou um código`, { body: e.text, tag: `clip-${e.messageId}` });
  }
}

export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
