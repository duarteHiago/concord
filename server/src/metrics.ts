// Métricas no formato do Prometheus (lidas pelo Grafana do monitoramento).
// Ficam numa porta separada, só dentro da VPS (127.0.0.1:9464): nunca passam pelo Caddy/Cloudflare.
import { statSync } from 'node:fs';
import { createServer } from 'node:http';
import type { NextFunction, Request, Response } from 'express';
import client from 'prom-client';
import { lastOffsite, listBackups } from './backup.ts';
import { config } from './config.ts';
import { get, observeQueries } from './db.ts';
import { cpuProfile } from './profile.ts';

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

/** Erros que derrubaram uma parte do app no navegador de alguém (ver clientErrors.ts). */
export const clientErrors = new client.Counter({
  name: 'concord_client_errors_total',
  help: 'Erros do app pegos pelo ErrorBoundary (app inteiro ou só um painel)',
  labelNames: ['area'] as const,
  registers: [registry],
});

export const socketEvents = new client.Counter({
  name: 'concord_socket_events_total',
  help: 'Eventos recebidos pelo Socket.io',
  labelNames: ['event'] as const,
  registers: [registry],
});

// ---- onde o app gasta o tempo (painel de gargalos) ----
const FAST_BUCKETS = [0.0001, 0.0005, 0.001, 0.0025, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1];

const slowOps = new client.Counter({
  name: 'concord_slow_total',
  help: `Operações acima de SLOW_MS (${config.slowMs} ms)`,
  labelNames: ['kind'] as const,
  registers: [registry],
});

/** Conta e escreve no log o que passou do limite, com o nome exato (rota, evento ou SQL). */
function slow(kind: 'http' | 'socket' | 'db', name: string, seconds: number) {
  const ms = seconds * 1000;
  if (ms < config.slowMs) return;
  slowOps.inc({ kind });
  console.warn(`[lento] ${kind} ${ms.toFixed(0)} ms: ${name}`);
}

const socketDuration = new client.Histogram({
  name: 'concord_socket_handler_duration_seconds',
  help: 'Quanto cada evento do Socket.io segurou o servidor',
  labelNames: ['event'] as const,
  buckets: FAST_BUCKETS,
  registers: [registry],
});

/** Envolve um handler do Socket.io medindo quanto ele segura o servidor. */
export function timedSocket<A extends unknown[]>(event: string, fn: (...args: A) => void) {
  return (...args: A) => {
    const start = performance.now();
    try {
      fn(...args);
    } finally {
      const seconds = (performance.now() - start) / 1000;
      socketDuration.observe({ event }, seconds);
      slow('socket', event, seconds);
    }
  };
}

const queryDuration = new client.Histogram({
  name: 'concord_db_query_duration_seconds',
  help: 'Quanto cada consulta ao banco segurou o servidor (o SQLite é síncrono)',
  labelNames: ['query'] as const,
  buckets: FAST_BUCKETS,
  registers: [registry],
});

// SQL vira o nome da série: espaços colapsados, listas "IN (?, ?, ?)" de tamanho variável juntadas,
// e um teto de nomes diferentes para SQL montado dinamicamente não explodir a quantidade de séries
const queryNames = new Map<string, string>();
function queryName(sql: string): string {
  let name = queryNames.get(sql);
  if (name) return name;
  name = sql.replace(/\s+/g, ' ').replace(/\(\s*\?(?:\s*,\s*\?)+\s*\)/g, '(?…)').trim().slice(0, 160);
  if (queryNames.size >= 400) return 'outras';
  queryNames.set(sql, name);
  return name;
}

observeQueries((sql, seconds) => {
  const name = queryName(sql);
  queryDuration.observe({ query: name }, seconds);
  slow('db', name, seconds);
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
    const seconds = end({ method: req.method, route, status: String(res.statusCode) });
    if (route !== '/uploads' && route !== '/downloads') slow('http', `${req.method} ${route}`, seconds);
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
  // backup diário (ver backup.ts): um alerta olha se o mais novo ficou velho demais
  new client.Gauge({
    name: 'concord_backup_last_timestamp_seconds',
    help: 'Quando foi feito o backup mais novo do banco',
    registers: [registry],
    collect() {
      const last = listBackups().at(-1);
      if (last) this.set(last.mtimeMs / 1000);
    },
  });
  new client.Gauge({
    name: 'concord_backup_last_size_bytes',
    help: 'Tamanho do backup mais novo (compactado)',
    registers: [registry],
    collect() {
      const last = listBackups().at(-1);
      if (last) this.set(last.size);
    },
  });
  new client.Gauge({
    name: 'concord_backup_offsite_timestamp_seconds',
    help: 'Quando o backup mais novo chegou no bucket fora da VPS',
    registers: [registry],
    collect() {
      const last = lastOffsite();
      if (last) this.set(last.mtimeMs / 1000);
    },
  });
}

export function startMetricsServer() {
  if (!config.metricsPort) return;
  createServer(async (req, res) => {
    // perfil de CPU sob demanda (deploy/monitoring/perfil.sh): quais funções do código gastam o tempo
    if (req.url?.startsWith('/debug/perfil')) {
      const seconds = Number(new URL(req.url, 'http://x').searchParams.get('segundos') ?? 30);
      try {
        const report = await cpuProfile(seconds);
        res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' }).end(report);
      } catch (err) {
        res.writeHead(409, { 'Content-Type': 'text/plain; charset=utf-8' }).end(`${(err as Error).message}\n`);
      }
      return;
    }
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
