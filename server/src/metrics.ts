// Métricas no formato do Prometheus (lidas pelo Grafana do monitoramento).
// Ficam numa porta separada, só dentro da VPS (127.0.0.1:9464): nunca passam pelo Caddy/Cloudflare.
import { statSync } from 'node:fs';
import { createServer } from 'node:http';
import type { NextFunction, Request, Response } from 'express';
import client from 'prom-client';
import { config } from './config.ts';
import { get } from './db.ts';

export const registry = new client.Registry();
registry.setDefaultLabels({ app: 'concord' });
// CPU, memória, heap, coleta de lixo, atraso do event loop, handles abertos...
client.collectDefaultMetrics({ register: registry, eventLoopMonitoringPrecision: 20 });

const httpDuration = new client.Histogram({
  name: 'concord_http_request_duration_seconds',
  help: 'Duração das requisições HTTP (por rota)',
  labelNames: ['method', 'route', 'status'] as const,
  buckets: [0.002, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [registry],
});

const httpBytes = new client.Counter({
  name: 'concord_http_response_bytes_total',
  help: 'Bytes enviados nas respostas HTTP',
  labelNames: ['route'] as const,
  registers: [registry],
});

/** Eventos do app: mensagens, uploads, chamadas de atenção, códigos, jogos... */
export const appEvents = new client.Counter({
  name: 'concord_events_total',
  help: 'Eventos do app por tipo',
  labelNames: ['event'] as const,
  registers: [registry],
});

export const socketEvents = new client.Counter({
  name: 'concord_socket_events_total',
  help: 'Eventos recebidos pelo Socket.io',
  labelNames: ['event'] as const,
  registers: [registry],
});

/** Rota sem ids (ex.: /api/channels/:id/messages), para não explodir a quantidade de séries. */
function routeOf(req: Request): string {
  if (req.route?.path) return `${req.baseUrl}${typeof req.route.path === 'string' ? req.route.path : ''}`;
  const p = req.path;
  if (p.startsWith('/uploads/')) return '/uploads';
  if (p.startsWith('/downloads/')) return '/downloads';
  if (p.startsWith('/assets/')) return '/assets';
  if (p.startsWith('/api/')) return '/api/(desconhecida)';
  if (p === '/health') return '/health';
  return '/(app)';
}

/** Requisições bem-sucedidas que viram eventos do app (contados no painel). */
const EVENTS: Record<string, string> = {
  'POST /api/auth/register': 'cadastro',
  'POST /api/auth/login': 'login',
  'POST /api/servers': 'servidor_criado',
  'POST /api/invites/:code': 'entrou_por_convite',
  'POST /api/channels/:id/messages': 'mensagem',
  'POST /api/dms/:id/messages': 'mensagem_privada',
  'POST /api/channels/:id/games': 'minigame',
  'POST /api/dms/:id/games': 'minigame',
  'POST /api/servers/:id/members/:userId/nudge': 'chamar_atencao',
  'POST /api/voice/clip': 'codigo_compartilhado',
  'POST /api/channels/:id/stickers': 'sticker_colado',
  'POST /api/sounds/:id/play': 'som_tocado',
  'POST /api/servers/:id/patches': 'patch_criado',
  'POST /api/me/avatar': 'upload',
  'POST /api/me/banner': 'upload',
  'POST /api/me/card-bg': 'upload',
  'POST /api/me/patch-image': 'upload',
  'POST /api/me/background': 'upload',
  'POST /api/servers/:id/icon': 'upload',
  'POST /api/servers/:id/sounds': 'upload',
  'POST /api/servers/:id/stickers': 'upload',
  'POST /api/bots/:id/avatar': 'upload',
};

export function httpMetrics(req: Request, res: Response, next: NextFunction) {
  const end = httpDuration.startTimer();
  res.on('finish', () => {
    const route = routeOf(req);
    end({ method: req.method, route, status: String(res.statusCode) });
    const event = res.statusCode < 400 ? EVENTS[`${req.method} ${route}`] : undefined;
    if (event) appEvents.inc({ event });
    if (res.statusCode >= 500) appEvents.inc({ event: 'erro_500' });
    const len = Number(res.getHeader('content-length'));
    if (Number.isFinite(len)) httpBytes.inc({ route }, len);
  });
  next();
}

/** Números lidos na hora da coleta (online, sala de voz, banco...). */
export function registerLiveGauges(read: {
  sockets: () => number;
  online: () => number;
  voice: () => { participants: number; rooms: number; streams: number; cameras: number; muted: number };
}) {
  new client.Gauge({ name: 'concord_sockets', help: 'Conexões Socket.io abertas', registers: [registry], collect() { this.set(read.sockets()); } });
  new client.Gauge({ name: 'concord_users_online', help: 'Pessoas online', registers: [registry], collect() { this.set(read.online()); } });
  new client.Gauge({
    name: 'concord_voice',
    help: 'Salas de voz agora',
    labelNames: ['kind'] as const,
    registers: [registry],
    collect() {
      const v = read.voice();
      for (const [kind, value] of Object.entries(v)) this.set({ kind }, value);
    },
  });
  const count = (table: string) => get<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table}`)?.n ?? 0;
  new client.Gauge({
    name: 'concord_db_rows',
    help: 'Registros no banco',
    labelNames: ['table'] as const,
    registers: [registry],
    collect() {
      for (const t of ['users', 'servers', 'channels', 'messages', 'dm_messages', 'sounds', 'placed_stickers']) {
        try {
          this.set({ table: t }, count(t));
        } catch {
          // tabela de versão antiga
        }
      }
    },
  });
  new client.Gauge({
    name: 'concord_db_size_bytes',
    help: 'Tamanho do arquivo do banco',
    registers: [registry],
    collect() {
      try {
        this.set(statSync(config.dbPath).size + (statSync(`${config.dbPath}-wal`, { throwIfNoEntry: false })?.size ?? 0));
      } catch {
        // banco ainda não criado
      }
    },
  });
}

export function startMetricsServer() {
  if (!config.metricsPort) return;
  createServer(async (req, res) => {
    if (req.url !== '/metrics') {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { 'Content-Type': registry.contentType });
    res.end(await registry.metrics());
  }).listen(config.metricsPort, config.metricsHost, () => {
    console.log(`Métricas em http://${config.metricsHost}:${config.metricsPort}/metrics`);
  });
}
