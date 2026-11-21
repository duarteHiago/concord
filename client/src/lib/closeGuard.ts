// Fechar o app desktop sem querer no meio de uma call ou da Praça: o X da barra de título (TitleBar.tsx) e o Alt+F4 /
// fechar pela barra de tarefas (o app pergunta à página antes, ver desktop/main.cjs) passam por aqui. Fora de call e
// da Praça, fecha direto; dentro, pergunta, com "Não perguntar novamente" (vale neste computador).
import { useApp } from '../store/app';
import { usePlaza } from '../store/plaza';
import { useVoice } from '../store/voice';
import { desktop } from './desktop';

const KEY = 'concord.closeNoAsk';

/** A pessoa marcou "Não perguntar novamente"? */
export function closeAskDisabled(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export function setCloseAsk(ask: boolean) {
  try {
    if (ask) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, '1');
  } catch {
    // sem armazenamento: continua perguntando
  }
}

/** O que a pessoa perderia fechando agora (null = nada, pode fechar direto). */
export function closeBusyReason(): string | null {
  const voice = useVoice.getState();
  if (voice.status !== 'idle') {
    const channel = voice.serverId ? useApp.getState().details[voice.serverId]?.channels.find((c) => c.id === voice.channelId) : undefined;
    return channel ? `Você está na call ${channel.name}.` : 'Você está numa call.';
  }
  if (usePlaza.getState().serverId) return 'Você está na Praça.';
  return null;
}

export const closeNow = () => void desktop?.windowControl?.('close');

/** Pedido de fechar: pergunta só se estiver numa call ou na Praça (e a pessoa não desligou a pergunta). */
export function requestClose() {
  const reason = closeBusyReason();
  if (!reason || closeAskDisabled()) return closeNow();
  useApp.getState().openModal({ type: 'confirmClose', reason });
}

let installed = false;
/** Escuta o Alt+F4 / fechar pela barra de tarefas (o app desktop avisa a página antes de fechar). */
export function installCloseGuard() {
  if (installed || !desktop?.onCloseRequest) return;
  installed = true;
  desktop.onCloseRequest(() => {
    // responde na hora: sem isso, o app fecha sozinho em 1,5 s (proteção contra página travada)
    void desktop?.windowControl?.('close-ack');
    requestClose();
  });
}
