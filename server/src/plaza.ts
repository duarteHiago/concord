// Praça do servidor (ver shared/plaza.ts): quem está andando por ela, onde está e com que cara. Fica só na
// memória: a posição some quando a pessoa sai, e os balões passam direto, sem ficar guardados em lugar nenhum.
// Quem está sentado (na call) vem do estado de voz, não daqui.
import type { Server, Socket } from 'socket.io';
import { P, has } from '../../shared/permissions.ts';
import { SAY_RADIUS, cleanSay, distance, isEmote, layoutFor, lobbyRoom, nearestWalkable, sanitizeAvatar, validateStyle, walkable, type PlaceStyle, type PlazaAvatar, type PlazaLayout, type Scene } from '../../shared/plaza.ts';
import { removeFromRoom } from './livekit.ts';
import { getVoiceState } from './realtime.ts';
import { channelPermissions, isMember } from './access.ts';
import { config } from './config.ts';
import { all, get, run, type ChannelRow } from './db.ts';

interface Walker {
  /** no lobby (a praça) ou dentro do estabelecimento */
  scene: Scene;
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

/** Está andando pela Praça deste servidor (no lobby ou dentro)? Só assim vale estar na voz da Praça. */
export function inPlaza(serverId: string, userId: string) {
  return !!plazas.get(serverId)?.get(userId);
}

/** Nome de sala do LiveKit que é o lobby de algum servidor: devolve o servidor (senão, null). */
export function lobbyServerOf(roomName: string) {
  return roomName.startsWith('plaza_') ? roomName.slice('plaza_'.length) : null;
}

/** Fechou a praça: sai da voz da Praça na hora, não só na próxima faxina. */
function dropLobbyVoice(serverId: string, userId: string) {
  void removeFromRoom(lobbyRoom(serverId), userId).catch(() => {});
}

export function plazaCount(serverId: string) {
  return plazas.get(serverId)?.size ?? 0;
}

function voiceChannels(serverId: string) {
  return all<ChannelRow>("SELECT * FROM channels WHERE server_id = ? AND type = 'voice' ORDER BY position, name", serverId);
}

// ---- como cada lugar está montado (editor da Praça) ----

const places = new Map<string, Partial<Record<Scene, PlaceStyle | null>>>(); // serverId -> lugar -> estilo (null = padrão)

/** Copia os estilos de um servidor trocando o de um lugar (só 'lobby' ou 'inside', nunca outro nome). */
function withScene(prev: Partial<Record<Scene, PlaceStyle | null>> | undefined, scene: Scene, style: PlaceStyle | null) {
  return scene === 'lobby' ? { ...prev, lobby: style } : { ...prev, inside: style };
}

/** O estilo salvo de um lugar (null = o padrão). Lido do banco uma vez e guardado na memória. */
export function placeOf(serverId: string, scene: Scene): PlaceStyle | null {
  const cached = places.get(serverId);
  if (cached && scene in cached) return cached[scene] ?? null;
  const row = get<{ data: string }>('SELECT data FROM plaza_places WHERE server_id = ? AND scene = ?', serverId, scene);
  let style: PlaceStyle | null = null;
  try {
    style = row ? (JSON.parse(row.data) as PlaceStyle) : null;
  } catch {
    style = null;
  }
  places.set(serverId, withScene(cached, scene, style));
  return style;
}

/** O mapa de cada lugar: o lobby tem tamanho fixo; o de dentro sai das salas de voz. Os dois com os móveis salvos. */
function layoutOf(serverId: string, scene: Scene) {
  return scene === 'lobby' ? lobbyLayout(serverId) : insideLayout(serverId);
}

function lobbyLayout(serverId: string) {
  const style = placeOf(serverId, 'lobby');
  const key = `lobby:${JSON.stringify(style)}`;
  const cached = layouts.get(`${serverId}:lobby`);
  if (cached?.key === key) return cached.layout;
  const layout = layoutFor('lobby', 0, style);
  layouts.set(`${serverId}:lobby`, { key, layout });
  return layout;
}

/** O de dentro sai das salas de voz (todas, mesmo as que a pessoa não vê: a mesa delas aparece sem nome). */
function insideLayout(serverId: string, channels = voiceChannels(serverId)) {
  const style = placeOf(serverId, 'inside');
  const key = `${channels.map((c) => c.id).join(',')}:${JSON.stringify(style)}`;
  const cached = layouts.get(serverId);
  if (cached?.key === key) return cached.layout;
  const layout = layoutFor('inside', channels.length, style);
  layouts.set(serverId, { key, layout });
  return layout;
}

/**
 * Salva como um lugar está montado (null volta ao padrão), avisa quem está na praça e tira de cima dos móveis
 * novos quem estava parado onde eles foram postos. Devolve o erro, se o estilo não vale.
 */
export function savePlace(serverId: string, scene: Scene, raw: unknown): string | null {
  let style: PlaceStyle | null = null;
  if (raw !== null) {
    const tableCount = scene === 'inside' ? voiceChannels(serverId).length : 0;
    const check = validateStyle(raw, scene, tableCount);
    if (!check.ok) return check.error;
    style = check.style;
    run(
      'INSERT INTO plaza_places (server_id, scene, data, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT (server_id, scene) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at',
      serverId,
      scene,
      JSON.stringify(style),
      Date.now(),
    );
  } else {
    run('DELETE FROM plaza_places WHERE server_id = ? AND scene = ?', serverId, scene);
  }
  places.set(serverId, withScene(places.get(serverId), scene, style));
  if (!io) return null;
  io.to(room(serverId)).emit('plaza:place', { serverId, scene, style });
  const layout = layoutOf(serverId, scene);
  for (const [userId, w] of plazas.get(serverId) ?? []) {
    if (w.scene !== scene || walkable(layout, w.x, w.y)) continue;
    Object.assign(w, nearestWalkable(layout, w));
    io.to(room(serverId)).emit('plaza:move', { serverId, userId, scene, x: w.x, y: w.y });
  }
  return null;
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
function spawnPoint(layout: PlazaLayout, plaza: Map<string, Walker>, center = layout.spawn) {
  const taken = new Set([...plaza.values()].filter((w) => w.scene === layout.kind).map((w) => `${w.x},${w.y}`));
  const { x, y } = center;
  for (let r = 0; r <= 2; r++) {
    const ring: { x: number; y: number }[] = [];
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) === r && walkable(layout, x + dx, y + dy) && !taken.has(`${x + dx},${y + dy}`)) ring.push({ x: x + dx, y: y + dy });
      }
    }
    if (ring.length) return ring[Math.floor(Math.random() * ring.length)];
  }
  return nearestWalkable(layout, center);
}

/** Quem está numa call deste servidor: a frente da mesa dela, lá dentro (para já aparecer sentado lá). */
function tableSpot(serverId: string, userId: string) {
  const v = getVoiceState(userId);
  if (!v || v.serverId !== serverId) return null;
  const channels = voiceChannels(serverId);
  const layout = insideLayout(serverId, channels);
  const t = layout.tables[channels.findIndex((c) => c.id === v.channelId)];
  return t ? { layout, front: t.front } : null;
}

const room = (serverId: string) => `plaza:${serverId}`;
const walkerJson = (userId: string, w: Walker) => ({ userId, scene: w.scene, x: w.x, y: w.y, avatar: w.avatar, activeAt: w.activeAt });

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
  dropLobbyVoice(serverId, userId);
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
    const inside = insideLayout(serverId, channels);
    const plaza = plazas.get(serverId) ?? new Map<string, Walker>();
    plazas.set(serverId, plaza);
    let w = plaza.get(userId);
    const isNew = !w;
    // numa call deste servidor: já chega lá dentro, na mesa dela (sem nascer na praça e ir andando)
    const spot = !w ? tableSpot(serverId, userId) : null;
    if (!w && spot) {
      w = { scene: 'inside', ...spawnPoint(spot.layout, plaza, spot.front), avatar: avatarOf(userId), sockets: new Set(), activeAt: Date.now() };
      plaza.set(userId, w);
    } else if (!w) {
      w = { scene: 'lobby', ...spawnPoint(lobbyLayout(serverId), plaza), avatar: avatarOf(userId), sockets: new Set(), activeAt: Date.now() };
      plaza.set(userId, w);
    } else {
      // o mapa pode ter mudado (sala criada ou apagada) desde a última vez
      Object.assign(w, nearestWalkable(w.scene === 'lobby' ? lobbyLayout(serverId) : inside, w));
    }
    w.sockets.add(socket.id);
    joined.add(serverId);
    void socket.join(room(serverId));

    ack?.({
      ok: true,
      // a mesa de uma sala que a pessoa não vê vai sem o id (aparece como "mesa reservada")
      tables: channels.slice(0, inside.tables.length).map((c) => (has(channelPermissions(c, userId), P.VIEW_CHANNEL) ? c.id : null)),
      walkers: [...plaza.entries()].map(([id, x]) => walkerJson(id, x)),
      // como cada lugar está montado (null = padrão)
      places: { lobby: placeOf(serverId, 'lobby'), inside: placeOf(serverId, 'inside') },
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
    const layout = layoutOf(here.serverId, here.w.scene);
    const x = Number(data.x);
    const y = Number(data.y);
    if (!walkable(layout, x, y)) return;
    here.w.x = x;
    here.w.y = y;
    here.w.activeAt = Date.now();
    io.to(room(here.serverId)).emit('plaza:move', { serverId: here.serverId, userId, scene: here.w.scene, x, y });
  });

  // entrou numa call (pela lista, com a praça aberta): o boneco vai para a mesa dela, lá dentro
  socket.on('plaza:table', (data: { serverId?: unknown }) => {
    const here = walkerHere(data?.serverId);
    if (!here || !moveRate()) return;
    const spot = tableSpot(here.serverId, userId);
    if (!spot) return;
    const others = new Map([...plazas.get(here.serverId)!].filter(([id]) => id !== userId));
    Object.assign(here.w, { scene: 'inside', ...spawnPoint(spot.layout, others, spot.front), activeAt: Date.now() });
    io.to(room(here.serverId)).emit('plaza:scene', { serverId: here.serverId, userId, scene: 'inside', x: here.w.x, y: here.w.y });
  });

  // pisou na porta: entra no estabelecimento (ou sai para a praça). Só vale estando de fato na porta.
  socket.on('plaza:door', (data: { serverId?: unknown }) => {
    const here = walkerHere(data?.serverId);
    if (!here || !moveRate()) return;
    const { w } = here;
    const from = layoutOf(here.serverId, w.scene);
    if (w.x !== from.door.x || w.y !== from.door.y) return;
    const scene: Scene = w.scene === 'lobby' ? 'inside' : 'lobby';
    const to = layoutOf(here.serverId, scene);
    const arrive = scene === 'lobby' ? { x: to.door.x, y: to.door.y + 1 } : to.spawn;
    const others = new Map([...plazas.get(here.serverId)!].filter(([id]) => id !== userId));
    Object.assign(w, { scene, ...spawnPoint(to, others, arrive), activeAt: Date.now() });
    io.to(room(here.serverId)).emit('plaza:scene', { serverId: here.serverId, userId, scene, x: w.x, y: w.y });
  });

  /**
   * Manda para quem está no mesmo lugar (lobby ou dentro), menos quem bloqueou a pessoa (ou foi bloqueado por ela).
   * `near`: no lobby, só para quem está a até SAY_RADIUS casas (a conversa por proximidade).
   */
  async function sendToPlaza(serverId: string, event: string, payload: unknown, near = false) {
    const blocked = blockedPairs(userId);
    const plaza = plazas.get(serverId);
    const me = plaza?.get(userId);
    if (!me) return;
    for (const s of await io.in(room(serverId)).fetchSockets()) {
      const other = s.data.userId as string;
      const o = plaza?.get(other);
      if (blocked.has(other) || !o || o.scene !== me.scene) continue;
      if (near && me.scene === 'lobby' && other !== userId && distance(o, me) > SAY_RADIUS) continue;
      s.emit(event, payload);
    }
  }

  socket.on('plaza:say', (data: { serverId?: unknown; text?: unknown }, ack?: (r: unknown) => void) => {
    const here = walkerHere(data?.serverId);
    if (!here) return ack?.({ ok: false, error: 'Você não está na praça.' });
    const text = cleanSay(data.text);
    if (!text) return ack?.({ ok: false, error: 'Escreva alguma coisa.' });
    if (!sayRate()) return ack?.({ ok: false, error: 'Calma: muitos balões em pouco tempo.' });
    here.w.activeAt = Date.now();
    void sendToPlaza(here.serverId, 'plaza:say', { serverId: here.serverId, userId, text, at: Date.now() }, true);
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
