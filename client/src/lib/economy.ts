// Modo econômico: com a janela sem foco (a pessoa jogando ou trabalhando em outro app, com o Concord aberto
// num segundo monitor), o que é só enfeite para de gastar placa de vídeo.
//
// Uma janela visível com animação infinita (molduras de avatar girando ou "respirando", figurinhas holográficas,
// o loop da Praça) faz o navegador desenhar e compor quadros na taxa do monitor (60–240 por segundo) o tempo todo.
// No Windows, isso disputa a placa com o jogo do outro monitor e pode tirar o jogo do modo de tela cheia direta
// (independent flip) — o FPS cai. Minimizada, a janela não desenha nada; por isso minimizar "resolve".
//
// Sem foco: pausa as animações CSS/Web Animations que repetem para sempre (as de entrada e saída, que acabam
// sozinhas, continuam) e avisa quem tem laço próprio (`isBackground`) para desenhar menos. Voz, transmissões e
// avisos não mudam. Voltando o foco, tudo retoma de onde parou.

type Listener = (background: boolean) => void;

const listeners = new Set<Listener>();
let background = false;
let sweepTimer: ReturnType<typeof setInterval> | undefined;
/** Animações que este módulo pausou (as que já estavam pausadas por outro motivo ficam como estão). */
const paused = new Set<Animation>();

export function isBackground() {
  return background;
}

export function onBackgroundChange(cb: Listener): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

function pauseInfinite() {
  for (const a of document.getAnimations()) {
    if (a.playState !== 'running' || paused.has(a)) continue;
    if (a.effect?.getComputedTiming().iterations !== Infinity) continue;
    a.pause();
    paused.add(a);
  }
}

function resumeAll() {
  for (const a of paused) {
    // a animação de um elemento que saiu da tela vira "idle"; play() a reiniciaria à toa
    if (a.playState === 'paused') a.play();
  }
  paused.clear();
}

function set(next: boolean) {
  if (next === background) return;
  background = next;
  clearInterval(sweepTimer);
  sweepTimer = undefined;
  if (next) {
    pauseInfinite();
    // o que aparecer depois (outra mensagem com uma moldura, um canal aberto) também para; barato: só percorre a lista
    sweepTimer = setInterval(pauseInfinite, 3000);
  } else {
    resumeAll();
  }
  for (const cb of listeners) cb(next);
}

function sync() {
  set(document.hidden || !document.hasFocus());
}

if (typeof window !== 'undefined' && typeof document !== 'undefined' && typeof document.getAnimations === 'function') {
  window.addEventListener('blur', sync);
  window.addEventListener('focus', sync);
  document.addEventListener('visibilitychange', sync);
  // um iframe da página (prévia, vídeo incorporado) tira o foco do documento sem ser outro app: não conta
  window.addEventListener('blur', () => setTimeout(() => document.activeElement?.tagName === 'IFRAME' && set(false), 0));
  sync();
}
