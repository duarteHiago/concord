import type { Server as HttpServer } from 'node:http';
import { Server, type Socket } from 'socket.io';
import { P, has } from '../../shared/permissions.ts';
import { channelPermissions, getChannel } from './access.ts';
import { all, get, type ChannelRow } from './db.ts';
import { botUserId, verifyToken } from './http.ts';
import { socketEvents, timedSocket } from './metrics.ts';

export interface VoiceState {
  userId: string;
  serverId: string;
  channelId: string;
  socketId: string;
  muted: boolean;
  deafened: boolean;
  streaming: boolean;
  camera: boolean;
  serverMuted: boolean;
}

let io: Server;

/** Emojis aceitos nas reações da sala (o cliente mostra os mesmos). */
export const REACTIONS = ['❤️', '😂', '🔥', '👏', '😮', '🎉', '💀', '👀', '💯', '😍', '🤣', '😭'];
const online = new Map<string, number>(); // userId -> nº de sockets
const voice = new Map<string, VoiceState>(); // userId -> estado
const serverMutes = new Set<string>(); // `${serverId}:${userId}`

// Jam do Spotify fixada numa sala de voz: o link que alguém colou, para todo mundo da sala entrar com um
// clique. O Spotify não deixa criar Jam por API, então a pessoa cria no app dele e cola aqui. Fica só na
// memória e some quando quem colou sai da sala (ver broadcastVoice).
export interface Jam {
  channelId: string;
  url: string;
  hostId: string;
  startedAt: number;
}
const jams = new Map<string, Jam & { serverId: string }>(); // channelId -> Jam

export function jamsFor(serverId: string): Jam[] {
  return [...jams.values()].filter((j) => j.serverId === serverId).map(({ serverId: _s, ...j }) => j);
}

function broadcastJams(serverId: string) {
  io.to(`server:${serverId}`).emit('voice:jams', { serverId, jams: jamsFor(serverId) });
}

/** Fixa (ou tira, com url null) a Jam de uma sala. */
export function setJam(serverId: string, channelId: string, hostId: string, url: string | null) {
  if (url) jams.set(channelId, { serverId, channelId, url, hostId, startedAt: Date.now() });
  else jams.delete(channelId);
  broadcastJams(serverId);
}

export const getJam = (channelId: string) => jams.get(channelId);

const publicState = ({ socketId: _s, ...rest }: VoiceState) => rest;

export function voiceStatesFor(serverId: string) {
  return [...voice.values()].filter((v) => v.serverId === serverId).map(publicState);
}

export function getVoiceState(userId: string) {
  return voice.get(userId);
}

export function isServerMuted(serverId: string, userId: string) {
  return serverMutes.has(`${serverId}:${userId}`);
}

function broadcastVoice(serverId: string) {
  io.to(`server:${serverId}`).emit('voice:states', { serverId, states: voiceStatesFor(serverId) });
  // quem colou a Jam saiu da sala (ou foi para outra): a Jam sai junto
  let changed = false;
  for (const j of jams.values()) {
    if (j.serverId === serverId && voice.get(j.hostId)?.channelId !== j.channelId) {
      jams.delete(j.channelId);
      changed = true;
    }
  }
  if (changed) broadcastJams(serverId);
}

export function emitToUser(userId: string, event: string, payload: unknown) {
  io.to(`user:${userId}`).emit(event, payload);
}

/** Senha trocada: derruba as conexões em tempo real da pessoa (menos a do aparelho que trocou). */
export async function revokeSockets(userId: string, keepSocketId?: string) {
  if (!io) return;
  for (const s of await io.in(`user:${userId}`).fetchSockets()) if (s.id !== keepSocketId) s.disconnect(true);
}

export function emitToServer(serverId: string, event: string, payload: unknown) {
  io.to(`server:${serverId}`).emit(event, payload);
}

/** Avisa os membros que a estrutura do servidor mudou (canais, cargos, membros). */
export function serverChanged(serverId: string) {
  emitToServer(serverId, 'server:changed', { serverId });
}

/** Envia somente para quem pode ver o canal. */
export async function emitToChannel(channel: ChannelRow, event: string, payload: unknown) {
  const sockets = await io.in(`server:${channel.server_id}`).fetchSockets();
  const allowed = new Map<string, boolean>();
  for (const s of sockets) {
    const userId = s.data.userId as string;
    if (!allowed.has(userId)) allowed.set(userId, has(channelPermissions(channel, userId), P.VIEW_CHANNEL));
    if (allowed.get(userId)) s.emit(event, payload);
  }
}

export function joinServerRoom(userId: string, serverId: string) {
  io.in(`user:${userId}`).socketsJoin(`server:${serverId}`);
  socketsOf(userId).forEach((s) => {
    s.emit('voice:states', { serverId, states: voiceStatesFor(serverId) });
    s.emit('voice:jams', { serverId, jams: jamsFor(serverId) });
  });
}

export function leaveServerRoom(userId: string, serverId: string) {
  io.in(`user:${userId}`).socketsLeave(`server:${serverId}`);
  const v = voice.get(userId);
  if (v?.serverId === serverId) {
    voice.delete(userId);
    broadcastVoice(serverId);
  }
}

function socketsOf(userId: string): Socket[] {
  return [...io.sockets.sockets.values()].filter((s) => s.data.userId === userId);
}

export function dropVoice(userId: string, reason: string) {
  const v = voice.get(userId);
  if (!v) return;
  voice.delete(userId);
  io.to(v.socketId).emit('voice:force-disconnect', { reason });
  broadcastVoice(v.serverId);
}

export function setServerMute(serverId: string, userId: string, muted: boolean) {
  const key = `${serverId}:${userId}`;
  if (muted) serverMutes.add(key);
  else serverMutes.delete(key);
  const v = voice.get(userId);
  if (v && v.serverId === serverId) {
    v.serverMuted = muted;
    if (muted) v.muted = true;
    io.to(v.socketId).emit('voice:server-mute', { muted });
    broadcastVoice(serverId);
  }
}

export type PresenceStatus = 'online' | 'dnd';

/** Status escolhido pelo usuário (fica nas preferências do perfil). */
export function statusOf(userId: string): PresenceStatus {
  const row = get<{ settings: string }>('SELECT settings FROM users WHERE id = ?', userId);
  try {
    return JSON.parse(row?.settings || '{}').status === 'dnd' ? 'dnd' : 'online';
  } catch {
    return 'online';
  }
}

// ---- atividades ("Jogando…", "Ouvindo…"): só em memória, enviadas pelo app desktop ----

export interface Activity {
  type: 'playing' | 'listening';
  name: string;
  details?: string;
  since: number;
}

const activities = new Map<string, Activity>();

function sanitizeActivity(raw: unknown): Activity | null {
  if (!raw || typeof raw !== 'object') return null;
  const a = raw as Record<string, unknown>;
  if (a.type !== 'playing' && a.type !== 'listening') return null;
  const name = typeof a.name === 'string' ? a.name.trim().slice(0, 80) : '';
  if (!name) return null;
  const details = typeof a.details === 'string' ? a.details.trim().slice(0, 120) : undefined;
  const since = typeof a.since === 'number' && a.since <= Date.now() ? a.since : Date.now();
  return { type: a.type, name, details: details || undefined, since };
}

/** Status, frase personalizada e atividade de um usuário online. */
export function presenceOf(userId: string) {
  const row = get<{ settings: string }>('SELECT settings FROM users WHERE id = ?', userId);
  let settings: { status?: string; customStatus?: unknown } = {};
  try {
    settings = JSON.parse(row?.settings || '{}');
  } catch {
    // ignorado
  }
  return {
    userId,
    online: true,
    status: (settings.status === 'dnd' ? 'dnd' : 'online') as PresenceStatus,
    customStatus: typeof settings.customStatus === 'string' ? settings.customStatus.slice(0, 80) : '',
    activity: activities.get(userId) ?? null,
  };
}

export function isOnline(userId: string) {
  return online.has(userId);
}

/** Reenvia a presença quando o usuário troca de status (online / não perturbe). */
export function broadcastStatus(userId: string) {
  if (online.has(userId)) io.emit('presence', presenceOf(userId));
}

export function onlineUserIds() {
  return [...online.keys()];
}

/** Números ao vivo para o monitoramento. */
export function liveStats() {
  let streams = 0;
  let cameras = 0;
  let muted = 0;
  const rooms = new Set<string>();
  for (const v of voice.values()) {
    rooms.add(v.channelId);
    if (v.streaming) streams++;
    if (v.camera) cameras++;
    if (v.muted) muted++;
  }
  return {
    sockets: io ? io.engine.clientsCount : 0,
    online: online.size,
    voice: { participants: voice.size, rooms: rooms.size, streams, cameras, muted },
  };
}

const KNOWN_SOCKET_EVENTS = new Set(['voice:join', 'voice:update', 'voice:leave', 'voice:codec-fail', 'voice:codec-request', 'reaction', 'activity:set', 'typing', 'dev:ping']);

export function setupRealtime(httpServer: HttpServer) {
  io = new Server(httpServer, { path: '/socket.io', serveClient: false });

  io.use((socket, next) => {
    const userId = verifyToken(socket.handshake.auth?.token) ?? botUserId(socket.handshake.auth?.token);
    if (!userId || !get('SELECT 1 FROM users WHERE id = ?', userId)) return next(new Error('unauthorized'));
    socket.data.userId = userId;
    next();
  });

  // "connection" também é medido: num teste de carga, muita gente entrando junto pesa (consultas + presença para todos)
  io.on('connection', timedSocket('connection', (socket: Socket) => {
    const userId = socket.data.userId as string;
    socket.join(`user:${userId}`);
    socket.onAny((event: string) => socketEvents.inc({ event: KNOWN_SOCKET_EVENTS.has(event) ? event : 'outro' }));
    // todo handler registrado abaixo passa a medir quanto segura o servidor (painel de gargalos)
    const on = socket.on.bind(socket);
    socket.on = ((event: string, fn: (...args: unknown[]) => void) => on(event, timedSocket(event, fn))) as typeof socket.on;

    const servers = all<{ server_id: string }>('SELECT server_id FROM members WHERE user_id = ?', userId);
    for (const { server_id } of servers) {
      socket.join(`server:${server_id}`);
      socket.emit('voice:states', { serverId: server_id, states: voiceStatesFor(server_id) });
    }

    const count = (online.get(userId) ?? 0) + 1;
    online.set(userId, count);
    socket.emit(
      'presence:list',
      onlineUserIds().map((id) => presenceOf(id)),
    );
    if (count === 1) io.emit('presence', presenceOf(userId));

    socket.on('voice:join', (data: { channelId: string }, ack?: (r: unknown) => void) => {
      try {
        const channel = getChannel(data.channelId);
        const perms = channelPermissions(channel, userId);
        if (channel.type !== 'voice' || !has(perms, P.CONNECT)) throw new Error('Sem permissão');
        const prev = voice.get(userId);
        if (prev && prev.socketId !== socket.id) {
          io.to(prev.socketId).emit('voice:force-disconnect', { reason: 'Você entrou em uma sala em outro dispositivo.' });
        }
        const serverMuted = isServerMuted(channel.server_id, userId);
        voice.set(userId, {
          userId,
          serverId: channel.server_id,
          channelId: channel.id,
          socketId: socket.id,
          muted: serverMuted || !has(perms, P.SPEAK),
          deafened: false,
          streaming: false,
          camera: false,
          serverMuted,
        });
        if (prev && prev.serverId !== channel.server_id) broadcastVoice(prev.serverId);
        broadcastVoice(channel.server_id);
        ack?.({ ok: true });
      } catch (err) {
        ack?.({ ok: false, error: (err as Error).message });
      }
    });

    socket.on('voice:update', (data: Partial<Pick<VoiceState, 'muted' | 'deafened' | 'streaming' | 'camera'>>) => {
      const v = voice.get(userId);
      if (!v || v.socketId !== socket.id) return;
      if (typeof data.muted === 'boolean') v.muted = data.muted || v.serverMuted;
      if (typeof data.deafened === 'boolean') v.deafened = data.deafened;
      if (typeof data.streaming === 'boolean') v.streaming = data.streaming;
      if (typeof data.camera === 'boolean') v.camera = data.camera;
      broadcastVoice(v.serverId);
    });

    socket.on('voice:leave', () => {
      const v = voice.get(userId);
      if (!v || v.socketId !== socket.id) return;
      voice.delete(userId);
      broadcastVoice(v.serverId);
    });

    // H.265 na transmissão de tela: quem assiste avisa o host que não conseguiu decodificar
    // ("codec-fail": o app do host troca para H.264 sozinho, se ele permitiu) ou pede a troca
    // ("codec-request": o host recusou a troca automática e decide). Só entre pessoas da mesma sala.
    let codecNotices = 0;
    let codecNoticesAt = 0;
    for (const event of ['voice:codec-fail', 'voice:codec-request'] as const) {
      socket.on(event, (raw: { streamerId?: unknown }) => {
        const v = voice.get(userId);
        if (!v || v.socketId !== socket.id || typeof raw?.streamerId !== 'string' || raw.streamerId === userId) return;
        const streamer = voice.get(raw.streamerId);
        if (!streamer || streamer.channelId !== v.channelId || !streamer.streaming) return;
        const nowMs = Date.now();
        if (nowMs - codecNoticesAt > 10_000) {
          codecNoticesAt = nowMs;
          codecNotices = 0;
        }
        if (++codecNotices > 5) return; // no máximo 5 a cada 10 s
        io.to(streamer.socketId).emit(event, { viewerId: userId });
      });
    }

    // reações flutuantes (estilo TikTok): só para quem está na mesma sala de voz
    const reactionTimes: number[] = [];
    socket.on('reaction', (raw: { emoji?: unknown; x?: unknown; y?: unknown }) => {
      const v = voice.get(userId);
      if (!v || v.socketId !== socket.id) return;
      const emoji = typeof raw?.emoji === 'string' ? raw.emoji : '';
      if (!REACTIONS.includes(emoji)) return;
      const nowMs = Date.now();
      while (reactionTimes.length && nowMs - reactionTimes[0] > 2000) reactionTimes.shift();
      if (reactionTimes.length >= 10) return; // no máximo 10 a cada 2 s
      reactionTimes.push(nowMs);
      const clamp = (n: unknown) => (typeof n === 'number' && Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : Math.random());
      const payload = { userId, emoji, x: clamp(raw.x), y: clamp(raw.y), at: nowMs };
      for (const other of voice.values()) {
        if (other.channelId === v.channelId) io.to(other.socketId).emit('reaction', payload);
      }
    });

    socket.on('activity:set', (raw: unknown) => {
      const activity = sanitizeActivity(raw);
      const current = activities.get(userId);
      if (!activity && !current) return;
      if (activity && current && activity.type === current.type && activity.name === current.name && activity.details === current.details) return;
      if (activity) activities.set(userId, current?.name === activity.name ? { ...activity, since: current.since } : activity);
      else activities.delete(userId);
      io.emit('presence', presenceOf(userId));
    });

    // janela de diagnóstico: mede a latência da conexão em tempo real (ida e volta pelo próprio socket)
    socket.on('dev:ping', (ack: unknown) => {
      if (typeof ack === 'function') ack();
    });

    socket.on('typing', (data: { channelId: string }) => {
      try {
        const channel = getChannel(data.channelId);
        if (!has(channelPermissions(channel, userId), P.SEND_MESSAGES)) return;
        void emitToChannel(channel, 'typing', { channelId: channel.id, userId });
      } catch {
        // canal inexistente
      }
    });

    socket.on('disconnect', () => {
      const v = voice.get(userId);
      if (v && v.socketId === socket.id) {
        voice.delete(userId);
        broadcastVoice(v.serverId);
      }
      const left = (online.get(userId) ?? 1) - 1;
      if (left <= 0) {
        online.delete(userId);
        activities.delete(userId);
        io.emit('presence', { userId, online: false });
      } else {
        online.set(userId, left);
      }
    });
  }));
}
