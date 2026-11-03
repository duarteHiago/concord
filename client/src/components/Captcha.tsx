// Captcha do cadastro e do "esqueci a senha" (Cloudflare Turnstile). Quase sempre invisível: só aparece uma caixinha
// quando a Cloudflare desconfia. Gera um token de uso único que o servidor confere (server/src/signupGuard.ts);
// depois de cada tentativa, quem usa troca o `resetKey` para pedir um token novo.
import { useEffect, useRef, useState } from 'react';

interface Turnstile {
  render(el: HTMLElement, options: Record<string, unknown>): string;
  remove(id: string): void;
}

let script: Promise<Turnstile> | null = null;
const loadTurnstile = () =>
  (script ??= new Promise<Turnstile>((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    s.async = true;
    s.onload = () => {
      const t = (window as unknown as { turnstile?: Turnstile }).turnstile;
      if (t) resolve(t);
      else reject(new Error('captcha'));
    };
    s.onerror = () => {
      script = null;
      reject(new Error('captcha'));
    };
    document.head.appendChild(s);
  }));

export function Captcha({ siteKey, onToken, resetKey = 0 }: { siteKey: string; onToken: (token: string) => void; resetKey?: number }) {
  const box = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    let id: string | null = null;
    let turnstile: Turnstile | null = null;
    onToken('');
    loadTurnstile().then(
      (t) => {
        if (!alive || !box.current) return;
        turnstile = t;
        id = t.render(box.current, {
          sitekey: siteKey,
          theme: 'auto',
          language: 'pt-br',
          appearance: 'interaction-only',
          callback: (token: string) => onToken(token),
          'expired-callback': () => onToken(''),
          'error-callback': () => onToken(''),
        });
      },
      () => alive && setFailed(true),
    );
    return () => {
      alive = false;
      if (id) turnstile?.remove(id);
    };
  }, [siteKey, resetKey, onToken]);

  return (
    <div>
      <div ref={box} />
      {failed && <p className="text-xs text-warn">Não deu para carregar a verificação anti-robô. Recarregue a página (ou desative o bloqueador de anúncios aqui).</p>}
    </div>
  );
}
