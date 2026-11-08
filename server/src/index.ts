import { existsSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import express, { type NextFunction, type Request, type Response } from 'express';
import { api } from './api.ts';
import { scheduleBackups } from './backup.ts';
import { config } from './config.ts';
import { HttpError } from './http.ts';
import { httpMetrics, registerLiveGauges, startMetricsServer } from './metrics.ts';
import { liveStats, setupRealtime } from './realtime.ts';
import { securityHeaders } from './security.ts';

const app = express();
app.disable('x-powered-by');
// só o proxy da própria máquina (Caddy) diz o IP de quem chamou: um X-Forwarded-For vindo de fora não vale
app.set('trust proxy', 'loopback');
app.use(httpMetrics);
app.use(securityHeaders());
if (config.staging) {
  // Concord de testes: fora dos buscadores (o cabeçalho vale até para as páginas que o robots.txt não cobre)
  app.use((_req, res, next) => {
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    next();
  });
  app.get('/robots.txt', (_req, res) => {
    res.type('text/plain').send('User-agent: *\nDisallow: /\n');
  });
}
// login, cadastro e senha têm poucos bytes: pedido grande ali é teste de limite ou ataque, e é recusado na porta
app.use('/api/auth', express.json({ limit: '16kb' }));
// denúncia de transmissão leva até 3 imagens da tela (cada uma conferida em reports.ts)
app.use('/api/reports', express.json({ limit: '2mb' }));
app.use(express.json({ limit: '1mb' }));

const pkg = JSON.parse(readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8')) as { version: string };
const startedAt = Date.now();

app.get('/health', (_req, res) => {
  res.json({ ok: true, version: pkg.version, nodeVersion: process.version, uptimeSec: Math.round((Date.now() - startedAt) / 1000) });
});
// arquivos enviados têm nome aleatório, então podem ficar em cache por bastante tempo
app.use(
  '/uploads',
  express.static(config.uploadsDir, {
    maxAge: '30d',
    immutable: true,
    index: false,
    fallthrough: false,
    setHeaders: (res, path) => {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      // anexos que não são imagem são sempre baixados, nunca abertos como página do site
      if (/[\\/]files[\\/]/.test(path) && !/\.(png|jpe?g|gif|webp)$/i.test(path)) res.setHeader('Content-Disposition', 'attachment');
    },
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
  // landing page (quem chega sem login em / é mandado para cá pelo index.html)
  app.get('/inicio/', (_req, res) => {
    res.sendFile(join(config.publicDir, 'inicio', 'index.html'));
  });
  // páginas do site: política de privacidade, termos de serviço, como contribuir e como instalar no celular
  for (const page of ['privacidade', 'termos', 'contribuir', 'instalar']) {
    app.get(`/${page}/`, (_req, res) => res.sendFile(join(config.publicDir, page, 'index.html')));
  }
  // SPA: qualquer outra rota devolve o index.html
  app.get('/{*path}', (_req, res) => {
    res.sendFile(join(config.publicDir, 'index.html'));
  });
}

app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
  if (err instanceof SyntaxError) return res.status(400).json({ error: 'JSON inválido' });
  const status = (err as { status?: number }).status;
  if (status && status >= 400 && status < 500) {
    const tooBig = req.path.startsWith('/api/auth') ? 'Pedido grande demais' : 'Arquivo muito grande';
    return res.status(status).json({ error: status === 413 ? tooBig : 'Não encontrado' });
  }
  console.error(err);
  res.status(500).json({ error: 'Erro interno do servidor' });
});

const httpServer = createServer(app);
setupRealtime(httpServer);
registerLiveGauges({ sockets: () => liveStats().sockets, online: () => liveStats().online, voice: () => liveStats().voice });
startMetricsServer();
scheduleBackups();
httpServer.listen(config.port, config.host, () => {
  console.log(`Concord rodando em http://${config.host}:${config.port}`);
});
