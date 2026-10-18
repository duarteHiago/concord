// Atalhos de teclado configuráveis. No app desktop, alguns também funcionam com o app em segundo plano.
import { HOME, useApp } from '../store/app';
import { useVoice } from '../store/voice';
import { desktop } from './desktop';
import { toast } from '../store/toast';

export type ShortcutAction = 'toggleMute' | 'toggleDeafen' | 'toggleCamera' | 'toggleShare' | 'leaveRoom' | 'quickSwitch' | 'openMessages';

export const SHORTCUTS: { id: ShortcutAction; label: string; global: boolean }[] = [
  { id: 'toggleMute', label: 'Silenciar / ativar microfone', global: true },
  { id: 'toggleDeafen', label: 'Ensurdecer / ativar áudio', global: true },
  { id: 'toggleCamera', label: 'Ligar / desligar câmera', global: false },
  { id: 'toggleShare', label: 'Transmitir tela / parar', global: false },
  { id: 'leaveRoom', label: 'Sair da sala de voz', global: false },
  { id: 'quickSwitch', label: 'Busca rápida (canais, servidores e conversas)', global: false },
  { id: 'openMessages', label: 'Abrir mensagens privadas', global: false },
];

export const DEFAULT_SHORTCUTS: Record<ShortcutAction, string> = {
  toggleMute: 'Ctrl+Shift+M',
  toggleDeafen: 'Ctrl+Shift+D',
  toggleCamera: 'Ctrl+Shift+V',
  toggleShare: 'Ctrl+Shift+S',
  leaveRoom: 'Ctrl+Shift+E',
  quickSwitch: 'Ctrl+K',
  openMessages: 'Ctrl+Shift+H',
};

export function currentShortcuts(): Record<ShortcutAction, string> {
  const saved = (useApp.getState().me?.settings.shortcuts ?? {}) as Partial<Record<ShortcutAction, string>>;
  return { ...DEFAULT_SHORTCUTS, ...saved };
}

export const globalEnabled = () => useApp.getState().me?.settings.globalShortcuts !== false;

/** "Ctrl+Shift+M" a partir de um evento de teclado (ou null se for só um modificador). */
export function comboFromEvent(e: KeyboardEvent): string | null {
  const key = e.key;
  if (['Control', 'Shift', 'Alt', 'Meta'].includes(key)) return null;
  let name: string;
  if (/^F\d{1,2}$/.test(key)) name = key;
  else if (key === ' ') name = 'Space';
  else if (key.length === 1) name = e.code.startsWith('Key') ? e.code.slice(3) : e.code.startsWith('Digit') ? e.code.slice(5) : key.toUpperCase();
  else name = key;
  const parts = [e.ctrlKey && 'Ctrl', e.altKey && 'Alt', e.shiftKey && 'Shift', e.metaKey && 'Meta'].filter(Boolean) as string[];
  return [...parts, name].join('+');
}

/** Converte para o formato de acelerador do Electron. */
export const toAccelerator = (combo: string) => combo.replace(/^Ctrl\+|\+Ctrl\+/g, (m) => m.replace('Ctrl', 'CommandOrControl'));

export function runShortcut(action: ShortcutAction) {
  const voice = useVoice.getState();
  const app = useApp.getState();
  const inCall = voice.status !== 'idle';
  switch (action) {
    case 'toggleMute':
      if (inCall) void voice.toggleMic();
      break;
    case 'toggleDeafen':
      void voice.toggleDeafen();
      break;
    case 'toggleCamera':
      if (inCall) void voice.toggleCamera();
      break;
    case 'toggleShare':
      if (!inCall) toast.info('Entre numa sala para transmitir.');
      else if (voice.sharing) void voice.stopShare();
      else app.openModal({ type: 'shareScreen' });
      break;
    case 'leaveRoom':
      if (inCall) void voice.leave();
      break;
    case 'quickSwitch':
      app.openModal({ type: 'quickSwitch' });
      break;
    case 'openMessages':
      app.openServer(HOME);
      break;
  }
}

/** Registra no app desktop os atalhos que funcionam com o app em segundo plano. */
export function syncGlobalShortcuts() {
  if (!desktop?.setGlobalShortcuts) return;
  const map = currentShortcuts();
  const wanted = globalEnabled()
    ? Object.fromEntries(SHORTCUTS.filter((s) => s.global && map[s.id]).map((s) => [s.id, toAccelerator(map[s.id])]))
    : {};
  void desktop.setGlobalShortcuts(wanted);
}

let installed = false;

/** Escuta o teclado na janela (e os atalhos globais do app desktop). */
export function installShortcuts() {
  if (installed) return;
  installed = true;
  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    const combo = comboFromEvent(e);
    if (!combo) return;
    // sem modificador, não atrapalha quem está digitando
    const target = e.target as HTMLElement | null;
    const typing = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
    if (typing && !e.ctrlKey && !e.altKey && !e.metaKey) return;
    if (document.body.dataset.recordingShortcut) return;
    const map = currentShortcuts();
    const action = (Object.keys(map) as ShortcutAction[]).find((a) => map[a] === combo);
    if (!action) return;
    // registrado como global no app desktop: o sistema já entrega o atalho por lá
    if (desktop?.setGlobalShortcuts && globalEnabled() && SHORTCUTS.find((s) => s.id === action)?.global) return;
    e.preventDefault();
    runShortcut(action);
  });
  desktop?.onShortcut?.((action) => runShortcut(action as ShortcutAction));
  syncGlobalShortcuts();
}
