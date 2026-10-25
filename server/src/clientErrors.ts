// Erros do app que o ErrorBoundary do cliente pegou (a tela que diz "algo deu errado"). Vão só para o log
// e para um contador no Grafana: a mensagem, a pilha, a parte do app, a página e a versão. Sem usuário e
// sem IP (ver client/public/privacidade/). Pública porque o app também pode quebrar antes do login.
import type { Router } from 'express';
import { clientErrors } from './metrics.ts';
import { limiter } from './recovery.ts';

// por IP só para segurar um loop de erros; o IP não vai para o log
const allow = limiter(20, 10 * 60_000);

const text = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max).replace(/[\u0000-\u0008\u000b-\u001f]/g, '') : '');

export function registerClientErrorRoutes(api: Router) {
  api.post('/client-errors', (req, res) => {
    if (!allow(req.ip ?? '')) return res.status(204).end();
    const area = req.body?.area === 'painel' ? 'painel' : 'app';
    clientErrors.inc({ area });
    console.warn(
      `[erro no app] ${area} ${text(req.body?.commit, 12) || '?'} ${text(req.body?.path, 120)}: ${text(req.body?.message, 500)}\n` +
        `${text(req.body?.stack, 4000)}\n${text(req.body?.componentStack, 2000)}`,
    );
    res.status(204).end();
  });
}
