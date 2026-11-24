// Entrega de um aviso de mensagem/menção, decidindo onde ele aparece:
// - Concord em foco: o cartão de vidro dentro do app (NoticeStack);
// - app do Windows minimizado ou atrás de outra janela: o mesmo cartão por cima de tudo (escolha do usuário,
//   pode desligar em Configurações → Notificações); em versão antiga do app, a notificação do Windows;
// - navegador com a aba escondida: a notificação do navegador.
// O som (Gota para mensagem, Acorde para menção) toca nos três casos, se estiver ligado.
import { useApp } from '../store/app';
import { useNotices, type Notice, type NoticeTarget } from '../store/notices';
import { useThreads } from '../store/threads';
import { desktop } from './desktop';
import { notifySettings } from './nudge';
import { playNotify } from './sounds';

export type NoticeInput = Omit<Notice, 'id'>;

/** Endereço completo (a janela por cima e a notificação do sistema não sabem resolver "/uploads/..."). */
const absolute = (url: string | null) => (url && url.startsWith('/') ? `${location.origin}${url}` : url);

/** Cores do tema atual, para a janela por cima de tudo (que fica fora do app) sair igual ao app. */
function themeColors() {
  const css = getComputedStyle(document.documentElement);
  const v = (name: string) => css.getPropertyValue(name).trim();
  const bg = v('--color-surface-2');
  // claro ou escuro pelo brilho do fundo
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i.exec(bg);
  const dark = m ? (parseInt(m[1], 16) * 299 + parseInt(m[2], 16) * 587 + parseInt(m[3], 16) * 114) / 1000 < 128 : false;
  return { card: bg, fg: v('--color-fg'), muted: v('--color-fg-muted'), subtle: v('--color-fg-subtle'), accent: v('--color-accent'), dark };
}

export function deliverNotice(n: NoticeInput, sound: 'message' | 'mention' | null) {
  const me = useApp.getState().me;
  if (!me || me.settings.status === 'dnd') return;
  const prefs = notifySettings(me);
  if (sound && prefs.chatSound) playNotify(sound, prefs.volume);

  const focused = document.hasFocus() && !document.hidden;
  if (focused || !prefs.mentionDesktop) {
    // em foco (ou com a notificação do sistema desligada): só o cartão dentro do app
    useNotices.getState().push(n);
    return;
  }
  if (desktop?.showNotice && prefs.overlay) {
    void desktop.showNotice({ ...n, avatar: { ...n.avatar, url: absolute(n.avatar.url) }, theme: themeColors() });
    return;
  }
  const title = `${n.who} · ${n.where}`;
  const body = n.text.length > 140 ? `${n.text.slice(0, 140)}…` : n.text;
  if (desktop?.notify) {
    void desktop.notify({ title, body, data: n.target });
    return;
  }
  // navegador: a notificação do sistema só com a aba escondida; com ela à vista (outra janela na frente), o cartão
  if (!document.hidden || !('Notification' in window) || Notification.permission !== 'granted') {
    useNotices.getState().push(n);
    return;
  }
  const native = new Notification(title, { body, icon: absolute(n.avatar.url) ?? '/icon-192.png', tag: JSON.stringify(n.target) });
  native.onclick = () => {
    window.focus();
    openNoticeTarget(n.target);
    native.close();
  };
}

/** Abre a conversa de um aviso (clique no cartão, na janela por cima ou na notificação do sistema). */
export function openNoticeTarget(target: NoticeTarget | null | undefined) {
  if (!target) return;
  const app = useApp.getState();
  if ('dmId' in target) app.openDmById(target.dmId);
  else if ('friends' in target) app.openFriends();
  else {
    app.openServer(target.serverId);
    app.openChannel(target.serverId, target.channelId);
    if (target.threadId) useThreads.getState().openThread(target.serverId, target.channelId, target.threadId);
  }
}
