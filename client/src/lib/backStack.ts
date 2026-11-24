// "Voltar" do celular (botão ou gesto do Android, deslizar de lado, voltar do navegador): fecha a última coisa que
// abriu por cima — um modal, um menu, o perfil, as configurações, a conversa aberta no celular — em vez de sair do
// app. Cada camada aberta entra no histórico do navegador; voltar tira a de cima e chama o fechar dela.
//
// Quem fecha pelo próprio botão da tela (X, seta) também tira a camada da pilha, e o histórico acompanha. O histórico
// é ajustado depois, de uma vez: abrir uma tela no lugar de outra (perfil → configurações) troca uma camada por
// outra sem confundir o navegador.
import { useEffect, useRef } from 'react';

interface Entry {
  onBack: () => void;
}

const stack: Entry[] = [];
/** quantas entradas nossas estão no histórico do navegador agora */
let pushed = 0;
/** voltas que nós mesmos pedimos (history.go) e ainda não chegaram */
let pendingPops = 0;
let scheduled = false;

function schedule() {
  if (scheduled) return;
  scheduled = true;
  setTimeout(sync, 0);
}

/** Deixa o histórico com tantas entradas quantas camadas abertas. */
function sync() {
  scheduled = false;
  if (pendingPops > 0) return; // espera a volta pedida chegar antes de mexer de novo
  const want = stack.length;
  if (want > pushed) {
    while (pushed < want) {
      history.pushState({ ...(history.state ?? {}), concordBack: ++pushed }, '');
    }
  } else if (want < pushed) {
    pendingPops = pushed - want;
    history.go(-pendingPops);
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('popstate', () => {
    if (pendingPops > 0) {
      // a volta que nós pedimos para acompanhar uma camada fechada pela tela
      pushed -= pendingPops;
      pendingPops = 0;
      schedule();
      return;
    }
    if (pushed > 0) pushed--;
    const top = stack.pop();
    top?.onBack();
    schedule();
  });
}

/** Tem alguma camada aberta para o "voltar" fechar? */
export const canGoBack = () => stack.length > 0;

/** O mesmo que o botão voltar do celular (usado pelo gesto de deslizar). */
export function goBack() {
  if (stack.length) history.back();
}

/**
 * Enquanto `active`, a camada fica na pilha: o voltar do celular chama `onBack` (que deve fechá-la). Quando ela
 * fecha por outro caminho, sai da pilha sozinha.
 */
export function useBackHandler(active: boolean, onBack: () => void) {
  const latest = useRef(onBack);
  latest.current = onBack;
  useEffect(() => {
    if (!active) return;
    const entry: Entry = { onBack: () => latest.current() };
    stack.push(entry);
    schedule();
    return () => {
      const i = stack.indexOf(entry);
      if (i >= 0) {
        stack.splice(i, 1);
        schedule();
      }
    };
  }, [active]);
}
