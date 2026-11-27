// Push no celular (e no navegador do computador): liga/desliga neste aparelho, conta ao servidor quando o Concord
// está à vista (aí o push não vai, aparece o aviso de dentro do app) e abre a conversa ao tocar na notificação.
// O desenho da notificação é do sistema; o service worker que a mostra está em public/push-sw.js.
import { api } from './api';
import { desktop } from './desktop';
import { getSocket } from './socket';
import type { NoticeTarget } from '../store/notices';

export const isIOS = typeof navigator !== 'undefined' && (/iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));
export const isStandalone =
  typeof window !== 'undefined' && (window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true);

/** Este aparelho pode receber push? (No iPhone, só com o Concord adicionado à Tela de Início.) */
export function pushSupported() {
  return !desktop && typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

/** No iPhone pelo Safari normal: precisa adicionar à Tela de Início antes. */
export const needsInstallForPush = () => isIOS && !isStandalone && !desktop;

function base64ToBytes(b64: string) {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

async function registration() {
  return navigator.serviceWorker.ready;
}

export async function currentSubscription() {
  if (!pushSupported()) return null;
  return (await registration()).pushManager.getSubscription();
}

/** Liga: pede a permissão (precisa vir de um toque), assina no serviço de push e conta ao servidor. */
export async function enablePush(): Promise<'ok' | 'denied' | 'unsupported'> {
  if (!pushSupported()) return 'unsupported';
  const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
  if (permission !== 'granted') return 'denied';
  const { publicKey } = await api.get<{ publicKey: string }>('/push/key');
  const reg = await registration();
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64ToBytes(publicKey) }));
  await api.post('/push/subscribe', { subscription: sub.toJSON() });
  return 'ok';
}

export async function disablePush() {
  const sub = await currentSubscription();
  if (!sub) return;
  await api.post('/push/unsubscribe', { endpoint: sub.endpoint }).catch(() => {});
  await sub.unsubscribe().catch(() => {});
}

/** Ao entrar: se este aparelho já tinha ligado, confirma a assinatura no servidor (ela pode ter sido trocada). */
export async function syncPush() {
  try {
    if (!pushSupported() || Notification.permission !== 'granted') return;
    const sub = await currentSubscription();
    if (sub) await api.post('/push/subscribe', { subscription: sub.toJSON() });
  } catch {
    // sem problema: tenta de novo na próxima vez que o app abrir
  }
}

/** Conta ao servidor se o Concord está à vista neste aparelho (chamado ao conectar e quando muda). */
export function reportVisibility() {
  getSocket()?.emit('app:visible', !document.hidden);
}

let wired = false;
/** Liga os ouvintes uma vez: visibilidade e o toque na notificação com o app já aberto. */
export function wirePush(open: (target: NoticeTarget) => void) {
  if (wired || typeof window === 'undefined') return;
  wired = true;
  document.addEventListener('visibilitychange', reportVisibility);
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', (e: MessageEvent) => {
      const d = e.data as { type?: string; target?: NoticeTarget } | null;
      if (d?.type === 'concord:open' && d.target) open(d.target);
    });
  }
}

/** Abriu pelo toque na notificação com o app fechado: o alvo vem no endereço (?abrir=...). Lê e limpa. */
export function takeOpenFromUrl(): NoticeTarget | null {
  const url = new URL(location.href);
  const raw = url.searchParams.get('abrir');
  if (!raw) return null;
  url.searchParams.delete('abrir');
  history.replaceState(history.state, '', url.pathname + (url.search ? url.search : '') + url.hash);
  try {
    const t = JSON.parse(raw) as NoticeTarget;
    return t && typeof t === 'object' && ('dmId' in t || 'channelId' in t) ? t : null;
  } catch {
    return null;
  }
}
