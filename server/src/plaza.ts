// Praça do servidor (ver shared/plaza.ts): quem está andando por ela, onde está e com que cara. Fica só na
// memória: a posição some quando a pessoa sai, e os balões passam direto, sem ficar guardados em lugar nenhum.
// Quem está sentado (na call) vem do estado de voz, não daqui.
import type { Server, Socket } from 'socket.io';
import { P, has } from '../../shared/permissions.ts';
import { DRINK_MS, FLOOR_TABLES, GROUND_TABLES, MAX_FLOORS, MAX_HALL_DOORS, hallFloorCount, isDrink, nearCounter, planFloors, NEAR_MS, NEAR_RADIUS, PEEK_COOLDOWN_MS, PEEK_MS, SAY_RADIUS, cleanSay, distance, isEmote, layoutFor, lobbyRoom, nearestWalkable, sanitizeAvatar, validateStyle, walkable, type PlaceScene, type PlaceStyle, type PlazaAvatar, type PlazaLayout, type Scene } from '../../shared/plaza.ts';
import { createVoiceToken, removeFromRoom } from './livekit.ts';
import { getVoiceState, isServerDeafened, isServerMuted, voiceStatesFor } from './realtime.ts';
import { channelPermissions, getChannel, isMember } from './access.ts';
import type { UserRow } from './db.ts';
import { config } from './config.ts';
import { all, get, run, type ChannelRow } from './db.ts';

interface Walker {
  /** no lobby (a praça) ou dentro do estabelecimento */
  scene: Scene;
  /** andar, lá dentro (0 = térreo) */
  floor: number;
  /** no quarto de quem (o id do dono), quando está num quarto */
  roomOf: string | null;
  x: number;
  y: number;
  avatar: PlazaAvatar;
  sockets: Set<string>;
  /** quando entrou ou mexeu pela última vez (o app mostra "zzz" em quem está parado há muito tempo) */
  activeAt: number;
  /** bebida na mão (pedida no balcão) e até quando */
  drink: string | null;
  drinkUntil: number;
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

// ---- espiar uma mesa / ouvir de perto ----
// Quem está andando lá dentro pode ouvir uma call: espiando (PEEK_MS, pode cochichar) ou só chegando perto da mesa
// (NEAR_MS, renovado enquanto continua perto, sem falar). Todo mundo da call vê o aviso enquanto dura; quem está
// na mesa pode fechá-la para as duas coisas; sala trancada não deixa.

interface Listening {
  until: number;
  /** só ouvindo de perto (sem microfone) */
  near: boolean;
}
const peeks = new Map<string, Map<string, Listening>>(); // channelId -> userId -> espiada
const peekCooldown = new Map<string, number>(); // `${userId}:${channelId}` -> quando pode de novo
const closedTables = new Set<string>(); // salas fechadas para espiadas (só na memória)

/** Está espiando esta sala agora? (a faxina das salas de voz deixa ficar, mesmo sem estar na call) */
export function isPeeking(channelId: string, userId: string) {
  return (peeks.get(channelId)?.get(userId)?.until ?? 0) > Date.now();
}

/** Tira uma espiada (acabou, saiu de perto, a mesa fechou): avisa todo mundo e tira da sala do LiveKit. */
function endPeek(serverId: string, channelId: string, userId: string) {
  const cur = peeks.get(channelId);
  if (!cur?.delete(userId)) return;
  if (!cur.size) peeks.delete(channelId);
  broadcastPeeks(serverId);
  if (getVoiceState(userId)?.channelId !== channelId) void removeFromRoom(channelId, userId).catch(() => {});
}

// faxina das espiadas vencidas (uma vez por segundo)
setInterval(() => {
  const now = Date.now();
  for (const [channelId, m] of peeks) {
    for (const [userId, l] of m) {
      if (l.until > now) continue;
      try {
        endPeek(getChannel(channelId).server_id, channelId, userId);
      } catch {
        m.delete(userId);
      }
    }
  }
}, 1000).unref();

function peeksOf(serverId: string) {
  const ids = new Set(voiceChannels(serverId).map((c) => c.id));
  const out: { channelId: string; userId: string; until: number; near: boolean }[] = [];
  for (const [channelId, m] of peeks) if (ids.has(channelId)) for (const [userId, l] of m) out.push({ channelId, userId, until: l.until, near: l.near });
  return out;
}

function broadcastPeeks(serverId: string) {
  io?.to(`server:${serverId}`).emit('voice:peeks', { serverId, peeks: peeksOf(serverId) });
}

function closedOf(serverId: string) {
  return voiceChannels(serverId)
    .map((c) => c.id)
    .filter((id) => closedTables.has(id));
}

export function plazaCount(serverId: string) {
  return plazas.get(serverId)?.size ?? 0;
}

function voiceChannels(serverId: string) {
  return all<ChannelRow>("SELECT * FROM channels WHERE server_id = ? AND type = 'voice' ORDER BY position, name", serverId);
}

// ---- como cada lugar está montado (editor da Praça) ----

const places = new Map<string, Partial<Record<PlaceScene, PlaceStyle | null>>>(); // serverId -> lugar -> estilo (null = padrão)

/** Copia os estilos de um servidor trocando o de um lugar (só 'lobby' ou 'inside', nunca outro nome). */
function withScene(prev: Partial<Record<PlaceScene, PlaceStyle | null>> | undefined, scene: PlaceScene, style: PlaceStyle | null) {
  return scene === 'lobby' ? { ...prev, lobby: style } : { ...prev, inside: style };
}

/** O estilo salvo de um lugar (null = o padrão). Lido do banco uma vez e guardado na memória. */
export function placeOf(serverId: string, scene: PlaceScene): PlaceStyle | null {
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

/** O mapa de cada lugar: o lobby tem tamanho fixo; o de dentro sai das salas de voz do andar. */
function layoutOf(serverId: string, scene: Scene, level = 0, roomOf: string | null = null) {
  if (scene === 'hall') return hallLayout(serverId, level);
  if (scene === 'room') return roomLayout(roomOf ?? '');
  return scene === 'lobby' ? lobbyLayout(serverId) : insideLayout(serverId, level);
}

/** O mapa de onde o boneco está agora. */
const layoutAt = (serverId: string, w: Walker) => layoutOf(serverId, w.scene, w.floor, w.roomOf);

/** Os dois estão no mesmo lugar (mesmo andar, mesmo quarto)? */
const samePlace = (a: Walker, b: Walker) => a.scene === b.scene && a.floor === b.floor && a.roomOf === b.roomOf;

// ---- quartos ----
// O corredor tem uma porta para cada pessoa do servidor, na ordem em que entraram, HALL_DOORS_PER_FLOOR por andar
// (escada no fim para o de cima). O quarto é da pessoa (o mesmo em toda Praça) e só ela monta.

const hallCache = new Map<string, PlazaLayout>(); // "quartos:andar" -> mapa
const memberCount = (serverId: string) => (get<{ n: number }>('SELECT COUNT(*) AS n FROM members WHERE server_id = ?', serverId)?.n ?? 0);
/** Um andar do corredor do servidor (o número de andares sai de quantas pessoas há nele). */
function hallLayout(serverId: string, level: number) {
  const total = Math.min(MAX_HALL_DOORS, memberCount(serverId));
  const key = `${total}:${level}`;
  let layout = hallCache.get(key);
  if (!layout) {
    layout = layoutFor('hall', total, null, level);
    hallCache.set(key, layout);
  }
  return layout;
}
const rooms = new Map<string, { style: PlaceStyle | null; layout: PlazaLayout }>(); // dono -> quarto

function roomEntry(owner: string) {
  const cached = rooms.get(owner);
  if (cached) return cached;
  const row = get<{ data: string }>('SELECT data FROM plaza_rooms WHERE user_id = ?', owner);
  let style: PlaceStyle | null = null;
  try {
    const check = row ? validateStyle(JSON.parse(row.data), 'room', 0) : null;
    style = check?.ok ? check.style : null;
  } catch {
    style = null;
  }
  const entry = { style, layout: layoutFor('room', 0, style) };
  rooms.set(owner, entry);
  return entry;
}

export const roomStyleOf = (owner: string) => roomEntry(owner).style;
const roomLayout = (owner: string) => roomEntry(owner).layout;

/** O dono salvou o quarto (null volta ao padrão): avisa as Praças onde há alguém e tira de cima dos móveis novos. */
export function saveRoom(owner: string, raw: unknown): string | null {
  let style: PlaceStyle | null = null;
  if (raw !== null) {
    const check = validateStyle(raw, 'room', 0);
    if (!check.ok) return check.error;
    style = check.style;
    run(
      'INSERT INTO plaza_rooms (user_id, data, updated_at) VALUES (?, ?, ?) ON CONFLICT (user_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at',
      owner,
      JSON.stringify(style),
      Date.now(),
    );
  } else {
    run('DELETE FROM plaza_rooms WHERE user_id = ?', owner);
  }
  const layout = layoutFor('room', 0, style);
  rooms.set(owner, { style, layout });
  if (!io) return null;
  for (const [serverId, plaza] of plazas) {
    if (!isMember(serverId, owner)) continue;
    io.to(room(serverId)).emit('plaza:room-style', { serverId, owner, style });
    for (const [userId, w] of plaza) {
      if (w.scene !== 'room' || w.roomOf !== owner || walkable(layout, w.x, w.y)) continue;
      Object.assign(w, nearestWalkable(layout, w));
      io.to(room(serverId)).emit('plaza:move', { serverId, userId, scene: 'room', floor: 0, roomOf: owner, x: w.x, y: w.y });
    }
  }
  return null;
}

// ---- andares do estabelecimento ----

const floorAssign = new Map<string, Record<string, number>>(); // serverId -> canal -> andar escolhido pelo admin

function assignOf(serverId: string): Record<string, number> {
  const cached = floorAssign.get(serverId);
  if (cached) return cached;
  const row = get<{ data: string }>("SELECT data FROM plaza_places WHERE server_id = ? AND scene = 'floors'", serverId);
  let assign: Record<string, number> = {};
  try {
    const raw = row ? JSON.parse(row.data) : {};
    if (raw && typeof raw === 'object') assign = raw as Record<string, number>;
  } catch {
    assign = {};
  }
  floorAssign.set(serverId, assign);
  return assign;
}

/** As salas de voz de cada andar (térreo primeiro). */
function floorPlan(serverId: string, channels = voiceChannels(serverId)): ChannelRow[][] {
  const byId = new Map(channels.map((c) => [c.id, c]));
  return planFloors(
    channels.map((c) => c.id),
    assignOf(serverId),
  ).map((ids) => ids.map((id) => byId.get(id)!));
}

/** Em que andar e em que mesa fica uma sala. */
function tableOf(serverId: string, channelId: string) {
  const plan = floorPlan(serverId);
  for (let level = 0; level < plan.length; level++) {
    const index = plan[level].findIndex((c) => c.id === channelId);
    if (index >= 0) return { level, index };
  }
  return null;
}

/** Os andares para mandar a uma pessoa: a sala que ela não vê vai sem o id ("mesa reservada"). */
function floorsFor(serverId: string, userId: string) {
  return floorPlan(serverId).map((f) => f.map((c) => (has(channelPermissions(c, userId), P.VIEW_CHANNEL) ? c.id : null)));
}

/**
 * Salva em que andar fica cada sala (o admin escolhe; o resto vai sozinho). Confere a lotação (térreo até
 * GROUND_TABLES, andares até FLOOR_TABLES), avisa cada pessoa na praça com o que ela pode ver e leva para o
 * térreo quem estava num andar que deixou de existir.
 */
export function saveFloors(serverId: string, raw: unknown): string | null {
  if (!raw || typeof raw !== 'object') return 'Escolha os andares.';
  const channels = voiceChannels(serverId);
  const ids = new Set(channels.map((c) => c.id));
  const assign: Record<string, number> = {};
  const count = new Map<number, number>();
  for (const [id, level] of Object.entries(raw as Record<string, unknown>)) {
    if (!ids.has(id) || typeof level !== 'number' || !Number.isInteger(level) || level < 0 || level > MAX_FLOORS) return 'Andar inválido.';
    const n = (count.get(level) ?? 0) + 1;
    if (n > (level === 0 ? GROUND_TABLES : FLOOR_TABLES)) return level === 0 ? `O térreo cabe ${GROUND_TABLES} salas.` : `Cada andar cabe ${FLOOR_TABLES} salas.`;
    count.set(level, n);
    assign[id] = level;
  }
  run(
    "INSERT INTO plaza_places (server_id, scene, data, updated_at) VALUES (?, 'floors', ?, ?) ON CONFLICT (server_id, scene) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at",
    serverId,
    JSON.stringify(assign),
    Date.now(),
  );
  floorAssign.set(serverId, assign);
  if (!io) return null;
  const plan = floorPlan(serverId);
  for (const [userId, w] of plazas.get(serverId) ?? []) {
    if (w.scene !== 'inside') continue;
    const layout = layoutOf(serverId, 'inside', Math.min(w.floor, plan.length - 1));
    if (w.floor < plan.length && walkable(layout, w.x, w.y)) continue;
    w.floor = Math.min(w.floor, plan.length - 1);
    Object.assign(w, nearestWalkable(layoutOf(serverId, 'inside', w.floor), w));
    io.to(room(serverId)).emit('plaza:scene', { serverId, userId, scene: 'inside', floor: w.floor, x: w.x, y: w.y });
  }
  void io
    .in(room(serverId))
    .fetchSockets()
    .then((sockets) => {
      for (const s of sockets) s.emit('plaza:floors', { serverId, floors: floorsFor(serverId, s.data.userId as string), assign });
    });
  return null;
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

/** O de dentro de um andar sai das salas de voz dele (todas, mesmo as que a pessoa não vê: a mesa aparece sem nome). */
function insideLayout(serverId: string, level = 0) {
  const style = placeOf(serverId, 'inside');
  const plan = floorPlan(serverId);
  const floor = plan[level] ?? [];
  const key = `${level}:${plan.length}:${floor.map((c) => c.id).join(',')}:${JSON.stringify(style)}`;
  const cached = layouts.get(`${serverId}:in:${level}`);
  if (cached?.key === key) return cached.layout;
  const layout = layoutFor('inside', floor.length, style, level);
  layouts.set(`${serverId}:in:${level}`, { key, layout });
  return layout;
}

/**
 * Salva como um lugar está montado (null volta ao padrão), avisa quem está na praça e tira de cima dos móveis
 * novos quem estava parado onde eles foram postos. Devolve o erro, se o estilo não vale.
 */
export function savePlace(serverId: string, scene: PlaceScene, raw: unknown): string | null {
  let style: PlaceStyle | null = null;
  if (raw !== null) {
    const plan = floorPlan(serverId);
    const tableCount = scene === 'inside' ? plan[0].length : 0;
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
    if (w.scene !== scene || w.floor !== 0 || walkable(layout, w.x, w.y)) continue;
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
function spawnPoint(layout: PlazaLayout, plaza: Map<string, Walker>, center = layout.spawn, roomOf: string | null = null) {
  const taken = new Set([...plaza.values()].filter((w) => w.scene === layout.kind && w.floor === layout.level && w.roomOf === roomOf).map((w) => `${w.x},${w.y}`));
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
  const where = tableOf(serverId, v.channelId);
  if (!where) return null;
  const layout = insideLayout(serverId, where.level);
  const t = layout.tables[where.index];
  return t ? { layout, front: t.front, level: where.level } : null;
}

/** Está a até NEAR_RADIUS casas do meio da mesa desta sala (lá dentro)? */
function closeToTable(serverId: string, w: { x: number; y: number; floor: number }, channelId: string) {
  const where = tableOf(serverId, channelId);
  if (!where || where.level !== w.floor) return false;
  const t = insideLayout(serverId, where.level).tables[where.index];
  return !!t && distance(w, { x: t.x + 0.5, y: t.y + 0.5 }) <= NEAR_RADIUS + 0.5;
}

const room = (serverId: string) => `plaza:${serverId}`;
const walkerJson = (userId: string, w: Walker) => ({
  userId,
  scene: w.scene,
  floor: w.floor,
  roomOf: w.roomOf,
  x: w.x,
  y: w.y,
  avatar: w.avatar,
  activeAt: w.activeAt,
  drink: w.drink && w.drinkUntil > Date.now() ? w.drink : null,
});

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

    const plaza = plazas.get(serverId) ?? new Map<string, Walker>();
    plazas.set(serverId, plaza);
    let w = plaza.get(userId);
    const isNew = !w;
    // numa call deste servidor: já chega lá dentro, na mesa dela (sem nascer na praça e ir andando)
    const spot = !w ? tableSpot(serverId, userId) : null;
    if (!w && spot) {
      w = { scene: 'inside', floor: spot.level, roomOf: null, ...spawnPoint(spot.layout, plaza, spot.front), avatar: avatarOf(userId), sockets: new Set(), activeAt: Date.now(), drink: null, drinkUntil: 0 };
      plaza.set(userId, w);
    } else if (!w) {
      w = { scene: 'lobby', floor: 0, roomOf: null, ...spawnPoint(lobbyLayout(serverId), plaza), avatar: avatarOf(userId), sockets: new Set(), activeAt: Date.now(), drink: null, drinkUntil: 0 };
      plaza.set(userId, w);
    } else {
      // o mapa pode ter mudado (sala criada ou apagada, andar que sumiu) desde a última vez
      if (w.scene === 'inside') w.floor = Math.min(w.floor, floorPlan(serverId).length - 1);
      Object.assign(w, nearestWalkable(layoutAt(serverId, w), w));
    }
    w.sockets.add(socket.id);
    joined.add(serverId);
    void socket.join(room(serverId));

    ack?.({
      ok: true,
      // as mesas de cada andar; a de uma sala que a pessoa não vê vai sem o id ("mesa reservada")
      floors: floorsFor(serverId, userId),
      tables: floorsFor(serverId, userId)[0],
      floorAssign: assignOf(serverId),
      walkers: [...plaza.entries()].map(([id, x]) => walkerJson(id, x)),
      // como cada lugar está montado (null = padrão)
      places: { lobby: placeOf(serverId, 'lobby'), inside: placeOf(serverId, 'inside') },
      // os quartos de quem está num quarto agora (o resto o app recebe ao entrar)
      rooms: Object.fromEntries([...new Set([...plaza.values()].map((x) => x.roomOf).filter((id): id is string => !!id))].map((id) => [id, roomStyleOf(id)])),
      peeks: peeksOf(serverId),
      closed: closedOf(serverId),
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
    const layout = layoutAt(here.serverId, here.w);
    const x = Number(data.x);
    const y = Number(data.y);
    if (!walkable(layout, x, y)) return;
    here.w.x = x;
    here.w.y = y;
    here.w.activeAt = Date.now();
    io.to(room(here.serverId)).emit('plaza:move', { serverId: here.serverId, userId, scene: here.w.scene, floor: here.w.floor, roomOf: here.w.roomOf, x, y });
  });

  /** Está de fato em cima do elevador (no prédio ou no corredor)? */
  const onElevator = (serverId: string, w: Walker) => {
    if (w.scene !== 'inside' && w.scene !== 'hall') return false;
    const from = layoutAt(serverId, w);
    return !!from.elevator && w.x === from.elevator.x && w.y === from.elevator.y;
  };
  const others = (serverId: string) => new Map([...plazas.get(serverId)!].filter(([id]) => id !== userId));
  const sceneChanged = (serverId: string, w: Walker) =>
    io.to(room(serverId)).emit('plaza:scene', { serverId, userId, scene: w.scene, floor: w.floor, roomOf: w.roomOf, x: w.x, y: w.y, ...(w.roomOf ? { roomStyle: roomStyleOf(w.roomOf) } : {}) });

  // no elevador: vai para um andar do prédio (também vindo do corredor dos quartos)
  socket.on('plaza:floor', (data: { serverId?: unknown; floor?: unknown }) => {
    const here = walkerHere(data?.serverId);
    if (!here || !moveRate() || !onElevator(here.serverId, here.w)) return;
    const { w } = here;
    const level = Number(data.floor);
    const plan = floorPlan(here.serverId);
    if (!Number.isInteger(level) || level < 0 || level >= plan.length || (w.scene === 'inside' && level === w.floor)) return;
    const to = layoutOf(here.serverId, 'inside', level);
    Object.assign(w, { scene: 'inside', floor: level, roomOf: null, ...spawnPoint(to, others(here.serverId), to.elevator ? { x: to.elevator.x, y: to.elevator.y + 1 } : to.spawn), activeAt: Date.now() });
    sceneChanged(here.serverId, w);
  });

  // no elevador: vai para o corredor dos quartos
  // no elevador (do prédio ou de um andar do corredor): vai para um andar do corredor dos quartos (`floor`, 0 = o primeiro)
  socket.on('plaza:hall', (data: { serverId?: unknown; floor?: unknown }) => {
    const here = walkerHere(data?.serverId);
    if (!here || !moveRate() || !onElevator(here.serverId, here.w)) return;
    const asked = data.floor === undefined ? 0 : Number(data.floor);
    if (!Number.isInteger(asked) || asked < 0 || asked >= hallFloorCount(memberCount(here.serverId))) return;
    if (here.w.scene === 'hall' && here.w.floor === asked) return;
    const to = hallLayout(here.serverId, asked);
    const arrive = to.elevator ? { x: to.elevator.x, y: to.elevator.y + 1 } : to.spawn;
    Object.assign(here.w, { scene: 'hall', floor: asked, roomOf: null, ...spawnPoint(to, others(here.serverId), arrive), activeAt: Date.now() });
    sceneChanged(here.serverId, here.w);
  });

  // no corredor, em cima de uma escada: sobe ou desce um andar (chega do lado da escada que leva de volta)
  socket.on('plaza:stairs', (data: { serverId?: unknown }) => {
    const here = walkerHere(data?.serverId);
    if (!here || !moveRate() || here.w.scene !== 'hall') return;
    const { w } = here;
    const from = hallLayout(here.serverId, w.floor);
    const on = (p: { x: number; y: number } | null | undefined) => !!p && w.x === p.x && w.y === p.y;
    const dir = on(from.stairs?.up) ? 1 : on(from.stairs?.down) ? -1 : 0;
    const level = w.floor + dir;
    if (!dir || level < 0 || level >= hallFloorCount(memberCount(here.serverId))) return;
    const to = hallLayout(here.serverId, level);
    const back = dir > 0 ? to.stairs?.down : to.stairs?.up;
    Object.assign(w, { scene: 'hall', floor: level, roomOf: null, ...spawnPoint(to, others(here.serverId), back ? { x: back.x, y: back.y + 1 } : to.spawn), activeAt: Date.now() });
    sceneChanged(here.serverId, w);
  });

  // no corredor, na frente de uma porta: entra no quarto de alguém do servidor
  socket.on('plaza:room', (data: { serverId?: unknown; owner?: unknown }) => {
    const here = walkerHere(data?.serverId);
    if (!here || !moveRate() || here.w.scene !== 'hall') return;
    const owner = typeof data.owner === 'string' ? data.owner : '';
    // encostado na parede do fundo, onde ficam as portas
    if (here.w.y !== 0 || !owner || !isMember(here.serverId, owner)) return;
    const to = roomLayout(owner);
    Object.assign(here.w, { scene: 'room', floor: 0, roomOf: owner, ...spawnPoint(to, others(here.serverId), to.spawn, owner), activeAt: Date.now() });
    sceneChanged(here.serverId, here.w);
  });

  // entrou numa call (pela lista, com a praça aberta): o boneco vai para a mesa dela, lá dentro
  socket.on('plaza:table', (data: { serverId?: unknown }) => {
    const here = walkerHere(data?.serverId);
    if (!here || !moveRate()) return;
    const spot = tableSpot(here.serverId, userId);
    if (!spot) return;
    Object.assign(here.w, { scene: 'inside', floor: spot.level, roomOf: null, ...spawnPoint(spot.layout, others(here.serverId), spot.front), activeAt: Date.now() });
    sceneChanged(here.serverId, here.w);
  });

  // pisou na porta: entra no estabelecimento (ou sai para a praça; ou sai do quarto para o corredor, na frente da
  // porta dele, em `x`). Só vale estando de fato na porta.
  socket.on('plaza:door', (data: { serverId?: unknown; x?: unknown; floor?: unknown }) => {
    const here = walkerHere(data?.serverId);
    if (!here || !moveRate()) return;
    const { w } = here;
    if (w.scene === 'hall') return;
    if (w.scene === 'room') {
      const from = layoutAt(here.serverId, w);
      if (w.x !== from.door.x || w.y !== from.door.y) return;
      // volta para o andar do corredor onde fica a porta desse quarto, na frente dela
      const asked = Number(data.floor);
      const level = Number.isInteger(asked) && asked >= 0 && asked < hallFloorCount(memberCount(here.serverId)) ? asked : 0;
      const hall = hallLayout(here.serverId, level);
      const x = Number(data.x);
      const back = Number.isInteger(x) && walkable(hall, x, 0) ? { x, y: 0 } : hall.spawn;
      Object.assign(w, { scene: 'hall', floor: level, roomOf: null, ...spawnPoint(hall, others(here.serverId), back), activeAt: Date.now() });
      return sceneChanged(here.serverId, w);
    }
    // a porta de saída só existe no térreo
    if (w.scene === 'inside' && w.floor !== 0) return;
    const from = layoutOf(here.serverId, w.scene, 0);
    if (w.x !== from.door.x || w.y !== from.door.y) return;
    const scene: Scene = w.scene === 'lobby' ? 'inside' : 'lobby';
    const to = layoutOf(here.serverId, scene, 0);
    const arrive = scene === 'lobby' ? { x: to.door.x, y: to.door.y + 1 } : to.spawn;
    Object.assign(w, { scene, floor: 0, roomOf: null, ...spawnPoint(to, others(here.serverId), arrive), activeAt: Date.now() });
    sceneChanged(here.serverId, w);
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
      if (blocked.has(other) || !o || !samePlace(o, me)) continue;
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

  // pedir uma bebida no balcão (só estando na frente dele, lá dentro); null larga a bebida
  const drinkRate = rate(10, 60_000);
  socket.on('plaza:drink', (data: { serverId?: unknown; drink?: unknown }, ack?: (r: unknown) => void) => {
    const here = walkerHere(data?.serverId);
    if (!here || !drinkRate()) return typeof ack === 'function' && ack({ ok: false });
    if (data.drink === null) {
      here.w.drink = null;
    } else {
      if (!isDrink(data.drink) || !nearCounter(layoutAt(here.serverId, here.w), here.w)) return typeof ack === 'function' && ack({ ok: false, error: 'Chegue no balcão para pedir.' });
      here.w.drink = data.drink;
      here.w.drinkUntil = Date.now() + DRINK_MS;
    }
    here.w.activeAt = Date.now();
    io.to(room(here.serverId)).emit('plaza:drink', { serverId: here.serverId, userId, drink: here.w.drink });
    if (typeof ack === 'function') ack({ ok: true });
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

  // espiar uma mesa: devolve o token para ouvir a call por PEEK_MS
  const peekRate = rate(6, 60_000);
  // ouvir de perto liga e desliga enquanto a pessoa anda: limite próprio, mais folgado
  const nearRate = rate(20, 60_000);
  socket.on('plaza:peek', async (data: { serverId?: unknown; channelId?: unknown; near?: unknown }, ack?: (r: unknown) => void) => {
    if (typeof ack !== 'function') return;
    try {
      const near = data?.near === true;
      const here = walkerHere(data?.serverId);
      if (!here || here.w.scene !== 'inside') return ack({ ok: false, error: 'Entre no prédio para espiar uma mesa.' });
      if (!(near ? nearRate() : peekRate())) return ack({ ok: false, error: 'Calma: muitas espiadas em pouco tempo.' });
      const channelId = typeof data.channelId === 'string' ? data.channelId : '';
      const channel = getChannel(channelId);
      if (channel.server_id !== here.serverId || channel.type !== 'voice') return ack({ ok: false, error: 'Mesa inválida.' });
      const perms = channelPermissions(channel, userId);
      if (!has(perms, P.CONNECT)) return ack({ ok: false, error: 'Essa mesa está trancada.' });
      if (closedTables.has(channelId)) return ack({ ok: false, error: 'Quem está nessa mesa fechou para espiadas.' });
      if (getVoiceState(userId)?.channelId === channelId) return ack({ ok: false, error: 'Você já está nessa mesa.' });
      const inCall = voiceStatesFor(here.serverId).filter((v) => v.channelId === channelId);
      if (!inCall.length) return ack({ ok: false, error: 'Não tem ninguém nessa mesa.' });
      if (near && !closeToTable(here.serverId, here.w, channelId)) return ack({ ok: false, error: 'Chegue mais perto da mesa.' });
      const key = `${userId}:${channelId}`;
      const wait = (peekCooldown.get(key) ?? 0) - Date.now();
      if (!near && wait > 0) return ack({ ok: false, error: `Espere ${Math.ceil(wait / 1000)} s para espiar essa mesa de novo.` });
      const user = get<UserRow>('SELECT * FROM users WHERE id = ?', userId)!;
      const token = await createVoiceToken({
        roomName: channelId,
        identity: userId,
        name: user.display_name,
        metadata: JSON.stringify({ avatarColor: user.avatar_color, username: user.username, peek: true }),
        // espiando: só o microfone (o cochicho), nunca tela ou câmera; de perto: só ouvir
        perms: near ? 0 : perms & P.SPEAK,
        serverMuted: isServerMuted(here.serverId, userId),
        serverDeafened: isServerDeafened(here.serverId, userId),
      });
      const until = Date.now() + (near ? NEAR_MS : PEEK_MS);
      // só uma mesa por vez: sai da que estava ouvindo antes
      for (const [other, m] of peeks) if (other !== channelId && m.has(userId)) endPeek(here.serverId, other, userId);
      const m = peeks.get(channelId) ?? new Map<string, Listening>();
      m.set(userId, { until, near });
      peeks.set(channelId, m);
      if (!near) peekCooldown.set(key, until + PEEK_COOLDOWN_MS);
      broadcastPeeks(here.serverId);
      // a faxina tira quando o tempo acabar, mesmo que o app não saia sozinho
      ack({ ok: true, token, url: config.livekit.publicUrl || null, until });
    } catch {
      ack({ ok: false, error: 'Não deu para espiar essa mesa.' });
    }
  });

  // ouvir de perto: o app renova enquanto a pessoa continua perto da mesa
  const renewRate = rate(20, 60_000);
  socket.on('plaza:peek-renew', (data: { serverId?: unknown; channelId?: unknown }, ack?: (r: unknown) => void) => {
    const here = walkerHere(data?.serverId);
    const channelId = typeof data?.channelId === 'string' ? data.channelId : '';
    const l = peeks.get(channelId)?.get(userId);
    const ok = !!here && !!l && l.near && renewRate() && !closedTables.has(channelId) && here.w.scene === 'inside' && closeToTable(here.serverId, here.w, channelId);
    if (ok) l!.until = Date.now() + NEAR_MS;
    else if (here && l) endPeek(here.serverId, channelId, userId);
    if (typeof ack === 'function') ack({ ok, until: l?.until });
  });

  socket.on('plaza:peek-stop', (data: { serverId?: unknown; channelId?: unknown }) => {
    const here = walkerHere(data?.serverId);
    if (here && typeof data?.channelId === 'string') endPeek(here.serverId, data.channelId, userId);
  });

  // quem está na call fecha (ou abre) a mesa para espiadas (e para quem ouve de perto)
  socket.on('plaza:close-table', (data: { channelId?: unknown; closed?: unknown }) => {
    const v = getVoiceState(userId);
    if (!v || v.channelId !== data?.channelId || typeof data.closed !== 'boolean') return;
    if (data.closed) closedTables.add(v.channelId);
    else closedTables.delete(v.channelId);
    if (data.closed) for (const id of [...(peeks.get(v.channelId)?.keys() ?? [])]) endPeek(v.serverId, v.channelId, id);
    io.to(`server:${v.serverId}`).emit('plaza:closed', { serverId: v.serverId, closed: closedOf(v.serverId) });
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
