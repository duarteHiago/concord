// Praça do servidor (ver shared/plaza.ts): quem está andando por ela, onde está e com que cara. Fica só na
// memória: a posição some quando a pessoa sai, e os balões passam direto, sem ficar guardados em lugar nenhum.
// Quem está sentado (na call) vem do estado de voz, não daqui.
import type { Server, Socket } from 'socket.io';
import { P, has } from '../../shared/permissions.ts';
import { buildLayout, cleanSay, isEmote, nearestWalkable, sanitizeAvatar, walkable, type PlazaAvatar, type PlazaLayout } from '../../shared/plaza.ts';
import { channelPermissions, isMember } from './access.ts';
import { config } from './config.ts';
import { all, get, type ChannelRow } from './db.ts';

interface Walker {
  x: number;
  y: number;
  avatar: PlazaAvatar;
  sockets: Set<string>;
  /** quando entrou ou mexeu pela última vez (o app mostra "zzz" em quem está parado há muito tempo) */
  activeAt: number;
}

const plazas = new Map<string, Map<string, Walker>>(); // serverId -> userId -> boneco
const layouts = new Map<string, { key: string; layout: PlazaLayout }>();

/** Praça liberada neste servidor? No Concord de testes, em todos; na produção, só nos de PLAZA_SERVERS (`*` = todos). */
export function plazaEnabled(serverId: string) {
  if (config.plazaServers) return config.plazaServers.has('*') || config.plazaServers.has(serverId);
  return config.staging;
}

export function plazaCount(serverId: string) {
  return plazas.get(serverId)?.size ?? 0;
}

function voiceChannels(serverId: string) {
  return all<ChannelRow>("SELECT * FROM channels WHERE server_id = ? AND type = 'voice' ORDER BY position, name", serverId);
}

/** O mapa sai das salas de voz (todas, mesmo as que a pessoa não vê: a mesa delas aparece sem nome). */
function layoutOf(serverId: string, channels = voiceChannels(serverId)) {
  const key = channels.map((c) => c.id).join(',');
  const cached = layouts.get(serverId);
  if (cached?.key === key) return cached.layout;
  const layout = buildLayout(channels.length);
  layouts.set(serverId, { key, layout });
  return layout;
}

function avatarOf(userId: string) {
  const row = get<{ settings: string }>('SELECT settings FROM users WHERE id = ?', userId);
  try {
    return sanitizeAvatar(JSON.parse(row?.settings || '{}').plazaAvatar, userId);
  } catch {
    return sanitizeAvatar(null, userId);
  }
}

/** Quem bloqueou quem (dos dois lados): não vê o balão do outro. */
function blockedPairs(userId: string) {
  const out = new Set<string>();
  for (const r of all<{ user_id: string; other_id: string }>(
    "SELECT user_id, other_id FROM relationships WHERE type = 'blocked' AND (user_id = ? OR other_id = ?)",
    userId,
    userId,
  )) {
    out.add(r.user_id === userId ? r.other_id : r.user_id);
  }
  return out;
}

/** Onde chega quem entra: no portal, ou numa casa livre em volta dele (para ninguém nascer em cima de ninguém). */
function spawnPoint(layout: PlazaLayout, plaza: Map<string, Walker>) {
  const taken = new Set([...plaza.values()].map((w) => `${w.x},${w.y}`));
  const { x, y } = layout.spawn;
  for (let r = 0; r <= 2; r++) {
    const ring: { x: number; y: number }[] = [];
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) === r && walkable(layout, x + dx, y + dy) && !taken.has(`${x + dx},${y + dy}`)) ring.push({ x: x + dx, y: y + dy });
      }
    }
    if (ring.length) return ring[Math.floor(Math.random() * ring.length)];
  }
  return layout.spawn;
}

const room = (serverId: string) => `plaza:${serverId}`;
const walkerJson = (userId: string, w: Walker) => ({ userId, x: w.x, y: w.y, avatar: w.avatar, activeAt: w.activeAt });

let io: Server;

function broadcastCount(serverId: string) {
  io.to(`server:${serverId}`).emit('plaza:count', { serverId, count: plazaCount(serverId) });
}

function removeSocket(serverId: string, userId: string, socketId: string) {
  const plaza = plazas.get(serverId);
  const w = plaza?.get(userId);
  if (!plaza || !w) return;
  w.sockets.delete(socketId);
  io.sockets.sockets.get(socketId)?.leave(room(serverId));
  if (w.sockets.size) return;
  plaza.delete(userId);
  if (!plaza.size) plazas.delete(serverId);
  io.to(room(serverId)).emit('plaza:left', { serverId, userId });
  broadcastCount(serverId);
}

/** Saiu (ou foi tirado) do servidor: sai da praça junto, em todos os aparelhos. */
export function plazaLeaveServer(userId: string, serverId: string) {
  const w = plazas.get(serverId)?.get(userId);
  if (!w) return;
  for (const id of [...w.sockets]) removeSocket(serverId, userId, id);
}

export function setupPlaza(server: Server) {
  io = server;
}

/** Limite simples por conexão: no máximo `max` vezes a cada `ms`. */
function rate(max: number, ms: number) {
  const times: number[] = [];
  return () => {
    const now = Date.now();
    while (times.length && now - times[0] > ms) times.shift();
    if (times.length >= max) return false;
    times.push(now);
    return true;
  };
}

export function registerPlaza(socket: Socket, userId: string) {
  const joined = new Set<string>(); // servidores cuja praça esta conexão abriu
  const moveRate = rate(20, 5_000);
  const sayRate = rate(5, 8_000);
  const emoteRate = rate(6, 6_000);
  const enterRate = rate(10, 10_000);

  socket.on('plaza:enter', (data: { serverId?: unknown }, ack?: (r: unknown) => void) => {
    const serverId = typeof data?.serverId === 'string' ? data.serverId : '';
    if (!enterRate()) return ack?.({ ok: false, error: 'Calma, tente de novo em instantes.' });
    if (!serverId || !isMember(serverId, userId)) return ack?.({ ok: false, error: 'Você não está neste servidor.' });
    if (!plazaEnabled(serverId)) return ack?.({ ok: false, error: 'A praça ainda não abriu neste servidor.' });

    const channels = voiceChannels(serverId);
    const layout = layoutOf(serverId, channels);
    const plaza = plazas.get(serverId) ?? new Map<string, Walker>();
    plazas.set(serverId, plaza);
    let w = plaza.get(userId);
    const isNew = !w;
    if (!w) {
      w = { ...spawnPoint(layout, plaza), avatar: avatarOf(userId), sockets: new Set(), activeAt: Date.now() };
      plaza.set(userId, w);
    } else {
      // o mapa pode ter mudado (sala criada ou apagada) desde a última vez
      Object.assign(w, nearestWalkable(layout, w));
    }
    w.sockets.add(socket.id);
    joined.add(serverId);
    void socket.join(room(serverId));

    ack?.({
      ok: true,
      // a mesa de uma sala que a pessoa não vê vai sem o id (aparece como "mesa reservada")
      tables: channels.slice(0, layout.tables.length).map((c) => (has(channelPermissions(c, userId), P.VIEW_CHANNEL) ? c.id : null)),
      walkers: [...plaza.entries()].map(([id, x]) => walkerJson(id, x)),
    });
    if (isNew) {
      socket.to(room(serverId)).emit('plaza:joined', { serverId, walker: walkerJson(userId, w) });
      broadcastCount(serverId);
    }
  });

  socket.on('plaza:leave', (data: { serverId?: unknown }) => {
    const serverId = typeof data?.serverId === 'string' ? data.serverId : '';
    if (!joined.delete(serverId)) return;
    removeSocket(serverId, userId, socket.id);
  });

  const walkerHere = (raw: unknown) => {
    const serverId = typeof raw === 'string' ? raw : '';
    if (!joined.has(serverId)) return null;
    const w = plazas.get(serverId)?.get(userId);
    return w ? { serverId, w } : null;
  };

  socket.on('plaza:move', (data: { serverId?: unknown; x?: unknown; y?: unknown }) => {
    const here = walkerHere(data?.serverId);
    if (!here || !moveRate()) return;
    const layout = layoutOf(here.serverId);
    const x = Number(data.x);
    const y = Number(data.y);
    if (!walkable(layout, x, y)) return;
    here.w.x = x;
    here.w.y = y;
    here.w.activeAt = Date.now();
    io.to(room(here.serverId)).emit('plaza:move', { serverId: here.serverId, userId, x, y });
  });

  /** Manda para quem está na praça, menos quem bloqueou a pessoa (ou foi bloqueado por ela). */
  async function sendToPlaza(serverId: string, event: string, payload: unknown) {
    const blocked = blockedPairs(userId);
    for (const s of await io.in(room(serverId)).fetchSockets()) {
      if (!blocked.has(s.data.userId as string)) s.emit(event, payload);
    }
  }

  socket.on('plaza:say', (data: { serverId?: unknown; text?: unknown }, ack?: (r: unknown) => void) => {
    const here = walkerHere(data?.serverId);
    if (!here) return ack?.({ ok: false, error: 'Você não está na praça.' });
    const text = cleanSay(data.text);
    if (!text) return ack?.({ ok: false, error: 'Escreva alguma coisa.' });
    if (!sayRate()) return ack?.({ ok: false, error: 'Calma: muitos balões em pouco tempo.' });
    here.w.activeAt = Date.now();
    void sendToPlaza(here.serverId, 'plaza:say', { serverId: here.serverId, userId, text, at: Date.now() });
    ack?.({ ok: true });
  });

  socket.on('plaza:emote', (data: { serverId?: unknown; emote?: unknown }) => {
    const here = walkerHere(data?.serverId);
    if (!here || !isEmote(data.emote) || !emoteRate()) return;
    here.w.activeAt = Date.now();
    void sendToPlaza(here.serverId, 'plaza:emote', { serverId: here.serverId, userId, emote: data.emote, at: Date.now() });
  });

  // quem está sentado numa mesa (na call) sem ter aberto a praça: o app pede a cara dessas pessoas
  const avatarsRate = rate(10, 10_000);
  socket.on('plaza:avatars', (data: { serverId?: unknown; userIds?: unknown }, ack?: (r: unknown) => void) => {
    const serverId = typeof data?.serverId === 'string' ? data.serverId : '';
    if (typeof ack !== 'function') return;
    if (!joined.has(serverId) || !Array.isArray(data.userIds) || !avatarsRate()) return ack({});
    const out: Record<string, PlazaAvatar> = {};
    for (const id of data.userIds.slice(0, 60)) {
      if (typeof id === 'string' && isMember(serverId, id)) out[id] = avatarOf(id);
    }
    ack(out);
  });

  // trocou a roupa: o servidor relê das preferências salvas (não confia no que o app manda)
  socket.on('plaza:avatar', () => {
    for (const serverId of joined) {
      const w = plazas.get(serverId)?.get(userId);
      if (!w) continue;
      w.avatar = avatarOf(userId);
      io.to(room(serverId)).emit('plaza:avatar', { serverId, userId, avatar: w.avatar });
    }
  });

  socket.on('disconnect', () => {
    for (const serverId of joined) removeSocket(serverId, userId, socket.id);
    joined.clear();
  });
}
