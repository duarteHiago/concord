import { useLayoutEffect, type RefObject } from 'react';

/** Caixa de texto que cresce com o que se digita, até o `max-height` do CSS; daí em diante, rola. */
export function useAutoGrow(ref: RefObject<HTMLTextAreaElement | null>, value: string) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    // scrollHeight não conta a borda: soma para não aparecer barra de rolagem à toa
    el.style.height = `${el.scrollHeight + el.offsetHeight - el.clientHeight}px`;
  }, [ref, value]);
}
