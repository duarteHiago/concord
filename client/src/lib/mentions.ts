// Menções (@usuario e @todos): som e notificação para quem foi mencionado.
import { useApp } from '../store/app';
import { desktop } from './desktop';
import { notifySettings } from './nudge';
import { playSound } from './sounds';
import type { DirectChannel, Message } from './types';

export interface MentionEvent {
  message: Message;
  serverId: string;
  serverName: string;
  channelName: string;
  everyone: boolean;
}

/** A mensagem menciona este usuário? (para destacar o balão) */
export function mentionsMe(content: string, username: string): boolean {
  if (/(^|\s)@(todos|everyone|all)\b/i.test(content)) return true;
  return new RegExp(`(^|\\s)@${username.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(content);
}

/** Nova mensagem privada: som e notificação (o clique abre a conversa). */
export function receiveDirectMessage(dm: DirectChannel, message: Message) {
  const me = useApp.getState().me;
  if (!me || me.settings.status === 'dnd') return;
  const prefs = notifySettings(me);
  if (!prefs.mentions) return;
  if (prefs.sound) playSound('mention');
  if (!prefs.desktop) return;
  const title = `${dm.user.displayName} (mensagem privada)`;
  const body =
    !message.content && message.attachments?.length
      ? `📎 ${message.attachments.length > 1 ? `${message.attachments.length} arquivos` : message.attachments[0].name}`
      : message.kind === 'game'
        ? message.content
        : message.content.length > 140
          ? `${message.content.slice(0, 140)}…`
          : message.content;
  if (desktop?.notify) {
    void desktop.notify({ title, body, data: { dmId: dm.id } });
    return;
  }
  if (!document.hidden || !('Notification' in window) || Notification.permission !== 'granted') return;
  const n = new Notification(title, { body, icon: dm.user.avatarUrl ?? '/icon-192.png', tag: `dm-${dm.id}` });
  n.onclick = () => {
    window.focus();
    useApp.getState().openDmById(dm.id);
    n.close();
  };
}

export function receiveMention(m: MentionEvent) {
  const app = useApp.getState();
  const me = app.me;
  if (!me || me.settings.status === 'dnd') return;
  const prefs = notifySettings(me);
  if (!prefs.mentions) return;

  // já está olhando esse canal com a janela em foco: não precisa avisar
  const viewing =
    app.activeServerId === m.serverId && app.activeChannels[m.serverId] === m.message.channelId && document.hasFocus();
  if (viewing) return;

  if (prefs.sound) playSound('mention');
  if (!prefs.desktop) return;

  const author = m.message.author.displayName;
  const title = `${author} em ${m.channelName.startsWith('#') ? '' : '#'}${m.channelName} · ${m.serverName}`;
  const body = m.message.content.length > 140 ? `${m.message.content.slice(0, 140)}…` : m.message.content;
  const target = { serverId: m.serverId, channelId: m.message.channelId };

  if (desktop?.notify) {
    void desktop.notify({ title, body, data: target });
    return;
  }
  if (!document.hidden || !('Notification' in window) || Notification.permission !== 'granted') return;
  const n = new Notification(title, { body, icon: m.message.author.avatarUrl ?? '/icon-192.png', tag: `mention-${m.message.channelId}` });
  n.onclick = () => {
    window.focus();
    const st = useApp.getState();
    st.openServer(target.serverId);
    st.openChannel(target.serverId, target.channelId);
    n.close();
  };
}
