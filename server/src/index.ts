import { existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { join } from 'node:path';
import express, { type NextFunction, type Request, type Response } from 'express';
import { api } from './api.ts';
import { config } from './config.ts';
import { HttpError } from './http.ts';
import { setupRealtime } from './realtime.ts';

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', true);
app.use(express.json({ limit: '1mb' }));

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});
app.use('/api', api);
app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'Rota não encontrada' });
});

if (existsSync(config.publicDir)) {
  app.use(express.static(config.publicDir, { maxAge: '1h', index: false }));
  // SPA: qualquer outra rota devolve o index.html
  app.get('/{*path}', (_req, res) => {
    res.sendFile(join(config.publicDir, 'index.html'));
  });
}

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
  if (err instanceof SyntaxError) return res.status(400).json({ error: 'JSON inválido' });
  console.error(err);
  res.status(500).json({ error: 'Erro interno do servidor' });
});

const httpServer = createServer(app);
setupRealtime(httpServer);
httpServer.listen(config.port, config.host, () => {
  console.log(`Concord rodando em http://${config.host}:${config.port}`);
});
