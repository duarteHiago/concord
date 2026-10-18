// Sabe se a página está oculta (minimizada ou em outra aba), pra pausar trabalho decorativo
// e pollings que não servem de nada sem ninguém olhando. No app desktop o Electron desliga
// o throttling padrão do Chromium (pra áudio/vídeo da transmissão seguirem em segundo plano),
// então sem isto nada aqui seria pausado automaticamente ao minimizar a janela.

type Listener = (hidden: boolean) => void;
const listeners = new Set<Listener>();

function sync() {
  const hidden = isPageHidden();
  document.documentElement.dataset.bgHidden = hidden ? 'true' : 'false';
  for (const l of listeners) l(hidden);
}

export function isPageHidden(): boolean {
  return typeof document !== 'undefined' && document.hidden;
}

/** Chama `cb` sempre que a página ficar oculta/visível, e uma vez já com o estado atual. */
export function onVisibilityChange(cb: Listener): () => void {
  listeners.add(cb);
  cb(isPageHidden());
  return () => {
    listeners.delete(cb);
  };
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', sync);
  sync();
}
