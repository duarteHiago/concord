// Animações do app (tremida, minigames, reações, molduras, stickers).
//
// O Windows desliga "Efeitos de animação" em muitos PCs (modo de melhor desempenho, área de trabalho
// remota, máquinas virtuais...) e o navegador repassa isso como "reduzir movimento". Por isso o padrão
// é manter as animações ligadas; quem preferir pode seguir o sistema ou reduzir em Configurações › Aparência.

export type MotionPref = 'full' | 'system' | 'reduce';

let pref: MotionPref = 'full';
const systemQuery = typeof window !== 'undefined' ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;

/** O sistema pede menos movimento? (só para mostrar na tela de configurações) */
export const systemReducesMotion = () => !!systemQuery?.matches;

export function reduceMotion(): boolean {
  return pref === 'reduce' || (pref === 'system' && systemReducesMotion());
}

function apply() {
  document.documentElement.dataset.motion = reduceMotion() ? 'reduce' : 'full';
}

export function setMotionPref(next: MotionPref | undefined) {
  pref = next === 'system' || next === 'reduce' ? next : 'full';
  apply();
}

systemQuery?.addEventListener('change', apply);
if (typeof document !== 'undefined') apply();
