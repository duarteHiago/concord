// Concord de testes (homologação): o build sai com VITE_STAGING=true (ver Dockerfile e deploy/STAGING.md).
export const STAGING = import.meta.env.VITE_STAGING === 'true';

const PREFIX = '[TESTE] ';

/** Marca a aba do navegador ("[TESTE] Concord"), mesmo quando alguma tela troca o título. */
export function markStagingTitle() {
  const mark = () => {
    if (!document.title.startsWith(PREFIX)) document.title = PREFIX + document.title;
  };
  mark();
  const title = document.querySelector('title');
  if (title) new MutationObserver(mark).observe(title, { childList: true, characterData: true, subtree: true });
}
