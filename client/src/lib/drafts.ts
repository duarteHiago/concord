// Rascunho da mensagem por canal ou conversa privada: o que a pessoa começou a escrever continua lá ao trocar de
// canal ou recarregar a página. Fica só neste aparelho (localStorage), com no máximo MAX rascunhos.
import { useCallback, useState } from 'react';

const KEY = 'concord.drafts';
const MAX = 100;

let cache: Record<string, { t: string; at: number }> | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;

function load() {
  if (cache) return cache;
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    cache = raw && typeof raw === 'object' ? raw : {};
  } catch {
    cache = {};
  }
  return cache!;
}

function persist() {
  clearTimeout(timer);
  timer = setTimeout(() => {
    const all = load();
    const keys = Object.keys(all);
    if (keys.length > MAX) {
      keys
        .sort((a, b) => all[a].at - all[b].at)
        .slice(0, keys.length - MAX)
        .forEach((k) => delete all[k]);
    }
    try {
      localStorage.setItem(KEY, JSON.stringify(all));
    } catch {
      // sem espaço ou modo privado: o rascunho só vale enquanto a página estiver aberta
    }
  }, 400);
}

const read = (key: string) => {
  const t = load()[key]?.t;
  return typeof t === 'string' ? t : '';
};

/** Como um useState de texto, mas guardado por `key` (o id do canal ou da conversa). */
export function useDraft(key: string): [string, (value: string) => void] {
  const [state, setState] = useState(() => ({ key, text: read(key) }));
  let current = state;
  // trocou de canal: mostra o rascunho do canal novo
  if (state.key !== key) {
    current = { key, text: read(key) };
    setState(current);
  }
  const set = useCallback(
    (value: string) => {
      setState({ key, text: value });
      const all = load();
      if (value) all[key] = { t: value, at: Date.now() };
      else delete all[key];
      persist();
    },
    [key],
  );
  return [current.text, set];
}
