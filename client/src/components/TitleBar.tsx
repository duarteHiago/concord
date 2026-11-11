// Barra de título do app desktop: a janela vem sem a do sistema (ver desktop/main.cjs, titleBarStyle) e esta
// faz o papel dela, nas cores do tema. Logo no meio, botões de minimizar/maximizar/fechar à direita; no Mac
// os três botões nativos ficam no canto esquerdo. Arrastar e clicar duas vezes funcionam como na barra normal.
// Só aparece com o app desktop novo (que tem `windowControl`); no navegador e em versões antigas, nada muda.
import { useEffect, useState, type ReactNode } from 'react';
import { desktop } from '../lib/desktop';
import { cx } from './ui';

export const TITLE_BAR_HEIGHT = 36;

export function TitleBar() {
  const [state, setState] = useState<{ maximized: boolean; fullscreen: boolean; platform: string } | null>(null);

  useEffect(() => {
    if (!desktop?.windowControl) return;
    void desktop.windowControl('state').then((s) => s && setState(s));
    return desktop.onWindowState?.((s) => setState((prev) => ({ platform: prev?.platform ?? '', ...s })));
  }, []);

  const visible = !!state && !state.fullscreen;
  // o app desce para dar lugar à barra (ver index.css: html.has-titlebar)
  useEffect(() => {
    document.documentElement.classList.toggle('has-titlebar', visible);
    return () => document.documentElement.classList.remove('has-titlebar');
  }, [visible]);

  if (!visible || !state) return null;
  const mac = state.platform === 'darwin';
  const act = (action: 'minimize' | 'maximize' | 'close') => () => void desktop?.windowControl?.(action);

  return (
    <div
      className="fixed inset-x-0 top-0 z-[70] flex items-center justify-center bg-surface-1 select-none [-webkit-app-region:drag]"
      style={{ height: TITLE_BAR_HEIGHT }}
    >
      <span className="flex items-center gap-2 text-xs font-bold tracking-wide text-fg-muted">
        <img src="/brand/concord-simbolo.svg" alt="" width={18} height={18} draggable={false} />
        Concord
      </span>
      {!mac && (
        <div className="absolute top-0 right-1 flex h-full items-center gap-0.5 [-webkit-app-region:no-drag]">
          <WinButton label="Minimizar" onClick={act('minimize')}>
            <path d="M1 5h8" />
          </WinButton>
          <WinButton label={state.maximized ? 'Restaurar' : 'Maximizar'} onClick={act('maximize')}>
            {state.maximized ? (
              <>
                <rect x="1" y="3" width="6" height="6" rx="1.2" />
                <path d="M3.5 3V2.2A1.2 1.2 0 0 1 4.7 1H7.8A1.2 1.2 0 0 1 9 2.2v3.1A1.2 1.2 0 0 1 7.8 6.5H7" />
              </>
            ) : (
              <rect x="1.5" y="1.5" width="7" height="7" rx="1.5" />
            )}
          </WinButton>
          <WinButton label="Fechar" danger onClick={act('close')}>
            <path d="M2 2l6 6M8 2l-6 6" />
          </WinButton>
        </div>
      )}
    </div>
  );
}

function WinButton({ label, danger, onClick, children }: { label: string; danger?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cx(
        'flex h-7 w-9 items-center justify-center rounded-lg text-fg-muted transition-colors',
        danger ? 'hover:bg-danger hover:text-white' : 'hover:bg-surface-3 hover:text-fg',
      )}
    >
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
        {children}
      </svg>
    </button>
  );
}
