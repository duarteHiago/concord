import { reduceMotion } from './motion';
// "Chamar atenção" (inspirado no MSN): tremida, som, notificação do sistema e cartão no app.
import { useApp } from '../store/app';
import { toast } from '../store/toast';
import { api } from './api';
import { desktop } from './desktop';
import { playSound } from './sounds';
import { DEFAULT_NOTIFY, type Me, type NotifySettings, type NudgeEvent } from './types';

export function notifySettings(me: Me | null): NotifySettings {
  const raw = me?.settings?.notifications as (Partial<NotifySettings> & { desktop?: boolean }) | undefined;
  // migração: o "desktop" antigo virava as duas opções de uma vez (tremida e menção); quem já
  // tinha desligado continua desligado nas duas até escolher separado nas configurações
  const legacy = raw?.desktop !== undefined && raw.nudgeDesktop === undefined && raw.mentionDesktop === undefined ? raw.desktop : undefined;
  return { ...DEFAULT_NOTIFY, ...(legacy !== undefined ? { nudgeDesktop: legacy, mentionDesktop: legacy } : {}), ...raw };
}

let lastReceived = 0;

export function receiveNudge(n: NudgeEvent) {
  const me = useApp.getState().me;
  if (!me) return;
  const prefs = notifySettings(me);
  // o servidor já filtra, mas as preferências podem ter mudado em outro dispositivo há instantes
  if (me.settings.status === 'dnd' || !prefs.nudges || me.settings.mutedNudges?.includes(n.from.id)) return;
  if (Date.now() - lastReceived < 2500) return;
  lastReceived = Date.now();

  useApp.setState({ nudge: n });
  if (prefs.sound) playSound('nudge');
  if (prefs.shake) {
    shakeScreen();
    desktop?.shakeWindow?.();
  }
  if (prefs.nudgeDesktop) showSystemNotification(n);
  if (n.message) showNudgeMessage(n);
}

export interface NudgeMessage {
  text: string;
  from: string;
}

/** Evento (navegador) da mensagem opcional: ver NudgeMessageToast, no NudgeCard.tsx. */
export const NUDGE_MESSAGE_EVENT = 'concord:nudge-message';

/** Mensagem opcional junto da tremida: passa e some, igual ao código compartilhado (sem copiar). */
function showNudgeMessage(n: NudgeEvent) {
  const from = n.from.nickname || n.from.displayName;
  const text = n.message!;
  if (desktop?.showNudgeMessage) {
    void desktop.showNudgeMessage({ text, from });
    return;
  }
  window.dispatchEvent(new CustomEvent<NudgeMessage>(NUDGE_MESSAGE_EVENT, { detail: { text, from } }));
}

function shakeScreen() {
  if (reduceMotion()) return;
  const root = document.getElementById('root');
  if (!root) return;
  root.classList.remove('nudge-shake');
  void root.offsetWidth; // reinicia a animação
  root.classList.add('nudge-shake');
  setTimeout(() => root.classList.remove('nudge-shake'), 900);
}

function showSystemNotification(n: NudgeEvent) {
  const name = n.from.nickname || n.from.displayName;
  const body = `${name} chamou sua atenção em ${n.serverName}!`;
  if (desktop?.notify) {
    void desktop.notify({ title: 'Chamar atenção', body, data: n });
    return;
  }
  // no navegador, só quando a aba não está visível (com ela aberta, o cartão já aparece)
  if (!document.hidden || !('Notification' in window) || Notification.permission !== 'granted') return;
  const notification = new Notification('Chamar atenção', {
    body,
    icon: n.from.avatarUrl ?? '/icon-192.png',
    tag: `nudge-${n.from.id}`,
  });
  notification.onclick = () => {
    window.focus();
    goToNudge(n);
    notification.close();
  };
}

/** Leva até onde quem chamou está: a sala de voz dele, ou o servidor. */
export function goToNudge(n: NudgeEvent) {
  const st = useApp.getState();
  if (st.servers.some((s) => s.id === n.serverId)) {
    st.openServer(n.serverId);
    if (n.channelId) st.openChannel(n.serverId, n.channelId);
  }
  useApp.setState({ nudge: null });
}

export async function sendNudge(serverId: string, userId: string, name: string, message?: string) {
  try {
    const trimmed = message?.trim();
    await api.post(`/servers/${serverId}/members/${userId}/nudge`, trimmed ? { message: trimmed } : {});
    playSound('nudgeSent');
    toast.success(`Você chamou a atenção de ${name}!`);
  } catch (err) {
    toast.error(err);
  }
}

if (typeof window !== 'undefined' && desktop?.onNotificationClick) {
  desktop.onNotificationClick((data) => {
    const d = data as { dmId?: string } & NudgeEvent;
    if (d?.dmId) useApp.getState().openDmById(d.dmId);
    else goToNudge(d);
  });
}
