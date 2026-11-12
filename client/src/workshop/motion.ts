// Física das animações da Oficina (Motion). Molas em vez de curvas com duração fixa: é o que dá a sensação
// "Apple" (o movimento responde e assenta), e o `bouncy` passa um pouco do ponto, como desenho animado.
import type { Transition } from 'motion/react';
import { reduceMotion } from '../lib/motion';

export const springs = {
  /** interface: rápido e sem sobra (abas, painéis, cards indo para o lugar) */
  snappy: { type: 'spring', stiffness: 520, damping: 38, mass: 0.8 },
  /** entrada com personalidade: passa do ponto e volta (emblema, cards novos, anunciador) */
  bouncy: { type: 'spring', stiffness: 480, damping: 15, mass: 0.9 },
  /** macio, para coisas grandes (fundo da intro, janela da Oficina) */
  soft: { type: 'spring', stiffness: 200, damping: 28 },
  /** gelatina: sobe e balança antes de parar */
  jelly: { type: 'spring', stiffness: 700, damping: 12, mass: 0.6 },
} satisfies Record<string, Transition>;

/** Para o MotionConfig: com "reduzir animações", só opacidade (sem deslocar, girar ou escalar). */
export const motionPref = (): 'always' | 'never' => (reduceMotion() ? 'always' : 'never');

/** Amassa e estica (squash & stretch) ao "pousar": use em scaleX/scaleY com o mesmo `times`. */
export const squash = {
  scaleX: [0.3, 1.22, 0.9, 1.04, 1],
  scaleY: [0.3, 0.82, 1.12, 0.97, 1],
  times: [0, 0.35, 0.6, 0.8, 1],
};
