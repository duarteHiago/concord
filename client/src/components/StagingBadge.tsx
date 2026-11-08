import { STAGING } from '../lib/staging';

/**
 * Faixa do Concord de testes: uma borda verde em volta da tela e a etiqueta "Ambiente de testes" no topo,
 * em todas as telas (login, app, portal). Não pega clique: o que está embaixo continua funcionando.
 */
export function StagingBadge() {
  if (!STAGING) return null;
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-[9999] shadow-[inset_0_0_0_3px_#6BFFD4]">
      <div
        className="absolute left-1/2 -translate-x-1/2 rounded-b-lg bg-[#6BFFD4] px-3 pb-0.5 text-[11px] font-extrabold tracking-wide text-[#140F19] uppercase"
        style={{ top: 'env(safe-area-inset-top, 0px)' }}
      >
        Ambiente de testes
      </div>
    </div>
  );
}
