import { existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { join } from 'node:path';
import express, { type NextFunction, type Request, type Response } from 'express';
import { api } from './api.ts';
import { config } from './config.ts';
import { HttpError } from './http.ts';
import { httpMetrics, registerLiveGauges, startMetricsServer } from './metrics.ts';
import { liveStats, setupRealtime } from './realtime.ts';

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', true);
app.use(httpMetrics);
app.use(express.json({ limit: '1mb' }));

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});
// arquivos enviados têm nome aleatório, então podem ficar em cache por bastante tempo
app.use(
  '/uploads',
  express.static(config.uploadsDir, {
    maxAge: '30d',
    immutable: true,
    index: false,
    fallthrough: false,
    setHeaders: (res) => res.setHeader('X-Content-Type-Options', 'nosniff'),
  }),
);
// instalador do app desktop (enviado pelo CI)
app.use('/downloads', express.static(config.downloadsDir, { maxAge: 0, index: false, fallthrough: false }));
app.use('/api', api);
app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'Rota não encontrada' });
});

if (existsSync(config.publicDir)) {
  // modelos de IA e outros arquivos de terceiros: o caminho tem a versão, então podem ficar no cache para sempre
  app.use('/vendor', express.static(join(config.publicDir, 'vendor'), { maxAge: '365d', immutable: true, index: false, fallthrough: false }));
  app.use(express.static(config.publicDir, { maxAge: '1h', index: false }));
  // SPA: qualquer outra rota devolve o index.html
  app.get('/{*path}', (_req, res) => {
    res.sendFile(join(config.publicDir, 'index.html'));
  });
}

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
  if (err instanceof SyntaxError) return res.status(400).json({ error: 'JSON inválido' });
  const status = (err as { status?: number }).status;
  if (status && status >= 400 && status < 500) {
    return res.status(status).json({ error: status === 413 ? 'Arquivo muito grande' : 'Não encontrado' });
  }
  console.error(err);
  res.status(500).json({ error: 'Erro interno do servidor' });
});

const httpServer = createServer(app);
setupRealtime(httpServer);
registerLiveGauges({ sockets: () => liveStats().sockets, online: () => liveStats().online, voice: () => liveStats().voice });
startMetricsServer();
httpServer.listen(config.port, config.host, () => {
  console.log(`Concord rodando em http://${config.host}:${config.port}`);
});
