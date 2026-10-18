import type { Server as HttpServer } from 'node:http';
import { Server, type Socket } from 'socket.io';
import { P, has } from '../../shared/permissions.ts';
import { channelPermissions, getChannel } from './access.ts';
import { all, get, type ChannelRow } from './db.ts';
import { verifyToken } from './http.ts';

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
const online = new Map<string, number>(); // userId -> nº de sockets
const voice = new Map<string, VoiceState>(); // userId -> estado
const serverMutes = new Set<string>(); // `${serverId}:${userId}`

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
}

export function emitToUser(userId: string, event: string, payload: unknown) {
  io.to(`user:${userId}`).emit(event, payload);
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
  socketsOf(userId).forEach((s) => s.emit('voice:states', { serverId, states: voiceStatesFor(serverId) }));
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

export function isOnline(userId: string) {
  return online.has(userId);
}

/** Reenvia a presença quando o usuário troca de status (online / não perturbe). */
export function broadcastStatus(userId: string) {
  if (online.has(userId)) io.emit('presence', { userId, online: true, status: statusOf(userId) });
}

export function onlineUserIds() {
  return [...online.keys()];
}

export function setupRealtime(httpServer: HttpServer) {
  io = new Server(httpServer, { path: '/socket.io', serveClient: false });

  io.use((socket, next) => {
    const userId = verifyToken(socket.handshake.auth?.token);
    if (!userId || !get('SELECT 1 FROM users WHERE id = ?', userId)) return next(new Error('unauthorized'));
    socket.data.userId = userId;
    next();
  });

  io.on('connection', (socket) => {
    const userId = socket.data.userId as string;
    socket.join(`user:${userId}`);

    const servers = all<{ server_id: string }>('SELECT server_id FROM members WHERE user_id = ?', userId);
    for (const { server_id } of servers) {
      socket.join(`server:${server_id}`);
      socket.emit('voice:states', { serverId: server_id, states: voiceStatesFor(server_id) });
    }

    const count = (online.get(userId) ?? 0) + 1;
    online.set(userId, count);
    socket.emit(
      'presence:list',
      onlineUserIds().map((id) => ({ userId: id, status: statusOf(id) })),
    );
    if (count === 1) io.emit('presence', { userId, online: true, status: statusOf(userId) });

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
        io.emit('presence', { userId, online: false });
      } else {
        online.set(userId, left);
      }
    });
  });
}
