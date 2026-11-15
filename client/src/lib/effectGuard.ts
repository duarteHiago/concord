// Rede de proteção para efeitos do React que devolvem algo que não é função.
//
// O React guarda o que o efeito devolve e chama como "limpeza" quando o componente sai da tela. Se não for
// função, ele quebra com "l is not a function" e derruba a tela inteira. Isso apareceu na produção (ao abrir a
// live na Praça) sem dar para achar o culpado pelo código minificado. Aqui o valor errado é descartado, a tela
// segue, e o começo do código do efeito vai para o log do servidor, para acharmos e consertarmos a origem.
import React from 'react';

type EffectHook = (effect: React.EffectCallback, deps?: React.DependencyList) => void;
const reported = new Set<string>();

function report(effect: React.EffectCallback, value: unknown) {
  const source = String(effect).slice(0, 400);
  if (reported.has(source)) return;
  reported.add(source);
  console.error('[efeito] devolveu algo que não é função de limpeza:', typeof value, effect);
  void fetch('/api/client-errors', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    keepalive: true,
    body: JSON.stringify({
      area: 'painel',
      message: `efeito devolveu ${typeof value} (não é função): ${source}`,
      stack: new Error().stack ?? '',
      componentStack: '',
      path: location.pathname,
      commit: __COMMIT__,
    }),
  }).catch(() => {});
}

function guard(hook: EffectHook): EffectHook {
  return (effect, deps) =>
    hook(() => {
      const value = (effect as () => unknown)();
      if (value === undefined || typeof value === 'function') return value as ReturnType<React.EffectCallback>;
      report(effect, value);
      return undefined;
    }, deps);
}

const mutable = React as unknown as { useEffect: EffectHook; useLayoutEffect: EffectHook; __effectGuard?: true };
if (!mutable.__effectGuard) {
  try {
    mutable.useEffect = guard(mutable.useEffect);
    mutable.useLayoutEffect = guard(mutable.useLayoutEffect);
    mutable.__effectGuard = true;
  } catch {
    // objeto do React congelado (não deveria): segue sem a proteção
  }
}
