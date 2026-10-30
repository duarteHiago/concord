// Contratos de Mecenato. Duas pessoas que apoiam o Concord combinam, por até 30 dias, que quem tem mais apoio
// confirmado (o Mecenas) pode fazer umas sacanagens com a outra: silenciar, ensurdecer, tirar da sala, trocar o
// apelido, trocar a foto e soltar um efeito de voz surpresa. A liderança muda sozinha quando o total de apoio
// muda (ver support.ts). Cada pessoa tem um Escudo com 3 h de saldo que bloqueia essas ações; as contas dele
// estão em shared/contracts.ts. Rescindir antes do prazo gera multa (R$ 25 + 10% do que os dois apoiaram
// durante o contrato), cobrada pelo mesmo Pix do apoio.
//
// Tudo é decidido aqui no servidor: o app só mostra. O que vence (contrato, convite, Escudo) é posto em dia em
// cada leitura e também por uma varredura periódica, para valer com as pessoas offline.
import { randomInt, randomUUID } from 'node:crypto';
import express, { type Router } from 'express';
import {
  CONTRACT_COOLDOWN_HOURS,
  CONTRACT_INVITE_TTL_MS,
  CONTRACT_MAX_DAYS,
  CONTRACT_RENEWAL_TTL_MS,
  SHIELD_MAX_MS,
  SHIELD_RESTORE_MS,
  VOICE_FX_MAX_MS,
  VOICE_FX_MIN_MS,
  VOICE_FX_WINDOW_MAX_MS,
  decideLeader,
  fineCents,
  freshShield,
  isPrankEffect,
  settleShield,
  shieldBalance,
  shieldBlocked,
  stopShield,
  type PrankEffect,
  type ShieldEvent,
  type ShieldState,
} from '../../shared/contracts.ts';
import { channelPermissions, getChannel, isMember } from './access.ts';
import { config } from './config.ts';
import { all, get, run, tx, type ContractFineRow, type ContractRow, type PaymentRow, type UserRow } from './db.ts';
import { fail, humansOnly, int, str, uid } from './http.ts';
import { TrackSource, muteTracks, removeFromRoom, updateVoicePermission } from './livekit.ts';
import { dropVoice, emitToUser, getVoiceState, isServerMuted, serverChanged, setServerDeafen, setServerMute } from './realtime.ts';
import { createPix, onPayment } from './support.ts';
import { removeUpload, saveImage } from './uploads.ts';

export const MECENAS_TITLE = 'Mecenas';

const now = () => Date.now();
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
/** Quantos convites alguém pode mandar por dia (convite trava as duas pessoas até ser respondido). */
const MAX_INVITES_PER_DAY = 5;

type EndReason = 'expired' | 'rescinded' | 'safety' | 'staff' | 'declined' | 'cancelled' | 'invite_expired';

/** Hooks do api.ts: avisar a própria pessoa (me:updated) e os servidores dela (perfil mudou). */
let hooks: { meUpdated: (userId: string) => void; profileChanged: (userId: string) => void } = {
  meUpdated: () => {},
  profileChanged: () => {},
};
export const setContractHooks = (h: typeof hooks) => {
  hooks = h;
};

// ------------------------------------------------------------------ consultas

const byId = (id: string) => get<ContractRow>('SELECT * FROM contracts WHERE id = ?', id);

/** O contrato (ou convite) em que a pessoa está agora. */
const currentOf = (userId: string) =>
  get<ContractRow>('SELECT c.* FROM contract_locks l JOIN contracts c ON c.id = l.contract_id WHERE l.user_id = ?', userId);

const participants = (c: ContractRow) => [c.creator_id, c.invitee_id];
const isParticipant = (c: ContractRow, userId: string) => c.creator_id === userId || c.invitee_id === userId;
const otherOf = (c: ContractRow, userId: string) => (c.creator_id === userId ? c.invitee_id : c.creator_id);

/** Total de apoio confirmado (o support.ts já tira os estornos). */
const totalOf = (userId: string) => get<{ c: number }>('SELECT support_total_cents AS c FROM users WHERE id = ?', userId)?.c ?? 0;

const openFine = (userId: string) => get<ContractFineRow>("SELECT * FROM contract_fines WHERE user_id = ? AND status = 'open' LIMIT 1", userId);

function lite(id: string) {
  const u = get<Pick<UserRow, 'id' | 'username' | 'display_name' | 'avatar_url' | 'avatar_color'>>(
    'SELECT id, username, display_name, avatar_url, avatar_color FROM users WHERE id = ?',
    id,
  );
  return u
    ? { id: u.id, username: u.username, displayName: u.display_name, avatarUrl: u.avatar_url, avatarColor: u.avatar_color }
    : { id, username: '?', displayName: 'Conta removida', avatarUrl: null, avatarColor: '#5865f2' };
}

/** Registro de auditoria (só cresce). `at` serve para eventos com hora exata no passado, como o Escudo zerando. */
function log(contractId: string | null, type: string, o: { userId?: string | null; actorId?: string | null; data?: unknown; at?: number } = {}) {
  run(
    'INSERT INTO contract_events (contract_id, user_id, actor_id, type, data, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    contractId,
    o.userId ?? null,
    o.actorId ?? null,
    type,
    o.data === undefined ? null : JSON.stringify(o.data),
    o.at ?? now(),
  );
}

// ------------------------------------------------------------------ Escudo

interface ShieldRow {
  balance_ms: number;
  active_since: number | null;
  depleted_at: number | null;
  cooldown_until: number | null;
}

function loadShield(userId: string): ShieldState {
  const r = get<ShieldRow>('SELECT * FROM user_shields WHERE user_id = ?', userId);
  return r ? { balanceMs: r.balance_ms, activeSince: r.active_since, depletedAt: r.depleted_at, cooldownUntil: r.cooldown_until } : freshShield();
}

function saveShield(userId: string, s: ShieldState) {
  run(
    `INSERT INTO user_shields (user_id, balance_ms, active_since, depleted_at, cooldown_until) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (user_id) DO UPDATE SET balance_ms = excluded.balance_ms, active_since = excluded.active_since,
       depleted_at = excluded.depleted_at, cooldown_until = excluded.cooldown_until`,
    userId,
    Math.min(Math.max(0, Math.round(s.balanceMs)), SHIELD_MAX_MS),
    s.activeSince,
    s.depletedAt,
    s.cooldownUntil,
  );
}

function logShieldEvents(contractId: string | null, userId: string, events: ShieldEvent[]) {
  for (const e of events) log(contractId, e.type === 'depleted' ? 'shield_depleted' : 'shield_restored', { userId, at: e.at });
}

/** O Escudo da pessoa posto em dia (e gravado, se mudou). Rodar de novo não restaura duas vezes. */
function settled(userId: string, contract: ContractRow | null | undefined): ShieldState {
  return tx(() => {
    const { state, events } = settleShield(loadShield(userId), now(), contract?.cooldown_ms ?? 0);
    if (events.length) {
      saveShield(userId, state);
      logShieldEvents(contract?.id ?? null, userId, events);
    }
    return state;
  });
}

function shieldJson(s: ShieldState) {
  const t = now();
  return {
    active: s.activeSince !== null,
    balanceMs: shieldBalance(s, t),
    maxMs: SHIELD_MAX_MS,
    activeSince: s.activeSince,
    runsOutAt: s.activeSince !== null ? s.activeSince + s.balanceMs : null,
    cooldownUntil: s.cooldownUntil !== null && s.cooldownUntil > t ? s.cooldownUntil : null,
    depletedAt: s.depletedAt,
    restoresAt: s.depletedAt !== null ? s.depletedAt + SHIELD_RESTORE_MS : null,
  };
}

// ------------------------------------------------------------------ liderança e selos

/** Quem manda no contrato agora. Se mudou, grava, registra e avisa. */
function leadership(c: ContractRow) {
  const totals = { [c.creator_id]: totalOf(c.creator_id), [c.invitee_id]: totalOf(c.invitee_id) };
  const r = decideLeader({
    a: c.creator_id,
    aCents: totals[c.creator_id],
    b: c.invitee_id,
    bCents: totals[c.invitee_id],
    leaderId: c.leader_id,
    tieClause: !!c.tie_clause,
  });
  if (c.status === 'active' && r.leaderId !== c.leader_id) {
    run('UPDATE contracts SET leader_id = ? WHERE id = ?', r.leaderId, c.id);
    log(c.id, 'leader_changed', { userId: r.leaderId, data: { from: c.leader_id, to: r.leaderId, totals } });
    c.leader_id = r.leaderId;
    afterChange(c);
  }
  return { ...r, totals };
}

// selo público (perfil, mensagens): fica na memória e é refeito quando um contrato muda
let badges = new Map<string, { mecenas?: true; mecenasBy?: string }>();

function refreshBadges() {
  const next = new Map<string, { mecenas?: true; mecenasBy?: string }>();
  for (const c of all<ContractRow>("SELECT * FROM contracts WHERE status = 'active'")) {
    const { holders } = decideLeader({
      a: c.creator_id,
      aCents: totalOf(c.creator_id),
      b: c.invitee_id,
      bCents: totalOf(c.invitee_id),
      leaderId: c.leader_id,
      tieClause: !!c.tie_clause,
    });
    for (const p of participants(c)) {
      if (holders.includes(p)) next.set(p, { mecenas: true });
      else if (holders.length === 1) next.set(p, { mecenasBy: lite(holders[0]).username });
    }
  }
  const changed = new Set([...badges.keys(), ...next.keys()].filter((id) => JSON.stringify(badges.get(id)) !== JSON.stringify(next.get(id))));
  badges = next;
  for (const id of changed) hooks.profileChanged(id);
}

/** Para o perfil público: é o Mecenas, ou tem um (e quem). */
export const mecenasBadge = (userId: string) => badges.get(userId) ?? {};

/** Um contrato mudou: selos, e as duas pessoas recarregam a tela do contrato. */
function afterChange(c: ContractRow) {
  refreshBadges();
  for (const p of participants(c)) {
    emitToUser(p, 'contract:updated', { id: c.id });
    hooks.meUpdated(p);
  }
}

// ------------------------------------------------------------------ ciclo de vida

/** O contrato em dia: vencido ou convite caducado termina aqui mesmo, sem esperar a varredura. */
function live(c: ContractRow | undefined): ContractRow | undefined {
  if (!c) return c;
  const t = now();
  if (c.status === 'active' && c.ends_at !== null && c.ends_at <= t) endContract(c, 'expired', null);
  else if (c.status === 'pending' && c.invite_expires_at <= t) endContract(c, 'invite_expired', null);
  else return c;
  return byId(c.id);
}

function endContract(c: ContractRow, reason: EndReason, by: string | null, note: string | null = null, review: 'pending' | null = null) {
  const t = now();
  const done = tx(() => {
    const fresh = byId(c.id);
    if (!fresh || fresh.status === 'ended') return false;
    // Escudo ligado no fim: desliga (o tempo usado sai do saldo)
    if (fresh.status === 'active') {
      for (const p of participants(fresh)) {
        const s = settled(p, fresh);
        if (s.activeSince === null) continue;
        const { state, events } = stopShield(s, t, fresh.cooldown_ms);
        saveShield(p, state);
        log(c.id, 'shield_off', { userId: p, data: { auto: true, usedMs: s.balanceMs - state.balanceMs } });
        logShieldEvents(c.id, p, events);
      }
    }
    run(
      "UPDATE contracts SET status = 'ended', ended_at = ?, end_reason = ?, ended_by = ?, end_note = ?, review = ? WHERE id = ?",
      t,
      reason,
      by,
      note,
      review,
      c.id,
    );
    run('DELETE FROM contract_locks WHERE contract_id = ?', c.id);
    log(c.id, 'ended', { actorId: by, data: { reason, note } });
    return true;
  });
  if (!done) return;
  restoreAvatars(c.id);
  cancelFx(c.id);
  void liftApplied(c.id);
  afterChange(c);
}

/** Contribuições que entram na multa: Pix de apoio confirmados dos dois, do início do contrato até `until`. */
function contributedDuring(c: ContractRow, until: number) {
  if (c.started_at === null) return [];
  return all<{ id: string; user_id: string; amount_cents: number; paid_at: number }>(
    "SELECT id, user_id, amount_cents, paid_at FROM payments WHERE kind = 'support' AND status = 'paid' AND user_id IN (?, ?) AND paid_at >= ? AND paid_at <= ? ORDER BY paid_at",
    c.creator_id,
    c.invitee_id,
    c.started_at,
    until,
  );
}

function fineFor(c: ContractRow, until: number) {
  const payments = contributedDuring(c, until);
  const baseCents = payments.reduce((n, p) => n + p.amount_cents, 0);
  return { baseCents, amountCents: fineCents(baseCents), payments };
}

function createFine(c: ContractRow, userId: string, until: number, by: string | null) {
  const { baseCents, amountCents, payments } = fineFor(c, until);
  const id = randomUUID();
  run(
    "INSERT INTO contract_fines (id, contract_id, user_id, amount_cents, base_cents, status, created_at) VALUES (?, ?, ?, ?, ?, 'open', ?)",
    id,
    c.id,
    userId,
    amountCents,
    baseCents,
    now(),
  );
  log(c.id, 'fine_created', { userId, actorId: by, data: { fineId: id, amountCents, baseCents, payments: payments.map((p) => p.id) } });
  return id;
}

// ------------------------------------------------------------------ poderes

export type MecenasPower = 'yes' | 'no' | 'shielded';

/** `me` pode usar os poderes de Mecenas sobre `target` agora? ('shielded': poderia, mas o Escudo está ligado) */
export function mecenasPower(me: string, target: string): MecenasPower {
  const c = live(currentOf(me));
  if (!c || c.status !== 'active' || otherOf(c, me) !== target) return 'no';
  if (!leadership(c).holders.includes(me)) return 'no';
  return settled(target, c).activeSince !== null ? 'shielded' : 'yes';
}

/** Recusa com a mensagem certa quando quem tenta não é (ou não pode ser agora) o Mecenas. */
function requirePower(me: string, target: string): ContractRow {
  const p = mecenasPower(me, target);
  if (p === 'shielded') fail(409, `${lite(target).displayName} está com o Escudo ligado`);
  if (p === 'no') fail(403, 'Você não é o Mecenas desse contrato agora');
  return currentOf(me)!;
}

/** Para o /me de quem tem os poderes agora: o título e sobre quem. */
export function mecenasOfMe(userId: string) {
  const c = currentOf(userId);
  if (!c || c.status !== 'active' || (c.ends_at ?? 0) <= now()) return null;
  if (!leadership(c).holders.includes(userId)) return null;
  const t = lite(otherOf(c, userId));
  return { title: MECENAS_TITLE, contractId: c.id, target: { id: t.id, username: t.username, displayName: t.displayName } };
}

function logPower(c: ContractRow, me: string, target: string, power: string, data: Record<string, unknown> = {}) {
  log(c.id, 'power', { actorId: me, userId: target, data: { power, ...data } });
  afterChange(c);
}

// silenciado/ensurdecido pelo Mecenas: o Escudo ligado e o fim do contrato desfazem (não mexe no que a moderação fez)
const applied = new Map<string, Set<string>>(); // contractId -> `${tipo}|${serverId}|${userId}`

function noteApplied(contractId: string, kind: 'mute' | 'deafen', serverId: string, userId: string, on: boolean) {
  const key = `${kind}|${serverId}|${userId}`;
  let set = applied.get(contractId);
  if (!set) applied.set(contractId, (set = new Set()));
  if (on) set.add(key);
  else set.delete(key);
}

async function setDeafen(serverId: string, userId: string, deafened: boolean) {
  setServerDeafen(serverId, userId, deafened);
  const v = getVoiceState(userId);
  if (v?.serverId === serverId) {
    await updateVoicePermission(v.channelId, userId, {
      perms: channelPermissions(getChannel(v.channelId), userId),
      serverMuted: isServerMuted(serverId, userId),
      serverDeafened: deafened,
    });
  }
}

async function liftApplied(contractId: string, onlyUser?: string) {
  const set = applied.get(contractId);
  if (!set) return;
  for (const key of [...set]) {
    const [kind, serverId, userId] = key.split('|');
    if (onlyUser && userId !== onlyUser) continue;
    set.delete(key);
    if (kind === 'mute') setServerMute(serverId, userId, false);
    else await setDeafen(serverId, userId, false);
  }
  if (!set.size) applied.delete(contractId);
}

/** O servidor da sala onde o alvo está, se o Mecenas também está nele (ou o indicado). */
function voiceServer(me: string, target: string, serverId?: string) {
  const v = getVoiceState(target);
  const id = serverId ?? v?.serverId ?? fail(400, `${lite(target).displayName} não está em uma sala de voz`);
  if (!isMember(id, me)) fail(403, 'Vocês precisam estar no mesmo servidor');
  return { serverId: id, voice: v?.serverId === id ? v : undefined };
}

export async function mecenasMute(me: string, target: string, muted: boolean, serverId?: string) {
  const c = requirePower(me, target);
  if (!muted && !serverId && !getVoiceState(target)) {
    // fora da sala: desfaz o que o Mecenas tinha silenciado
    for (const key of applied.get(c.id) ?? []) {
      const [kind, sid, userId] = key.split('|');
      if (kind === 'mute' && userId === target) {
        setServerMute(sid, target, false);
        noteApplied(c.id, 'mute', sid, target, false);
      }
    }
    return logPower(c, me, target, 'unmute');
  }
  const { serverId: sid, voice } = voiceServer(me, target, serverId);
  if (muted && voice) await muteTracks(voice.channelId, target, [TrackSource.MICROPHONE]);
  setServerMute(sid, target, muted);
  noteApplied(c.id, 'mute', sid, target, muted);
  logPower(c, me, target, muted ? 'mute' : 'unmute', { serverId: sid });
}

export async function mecenasDeafen(me: string, target: string, deafened: boolean, serverId?: string) {
  const c = requirePower(me, target);
  const { serverId: sid } = voiceServer(me, target, serverId);
  await setDeafen(sid, target, deafened);
  noteApplied(c.id, 'deafen', sid, target, deafened);
  logPower(c, me, target, deafened ? 'deafen' : 'undeafen', { serverId: sid });
}

export async function mecenasDisconnect(me: string, target: string, serverId?: string) {
  const c = requirePower(me, target);
  const { serverId: sid, voice } = voiceServer(me, target, serverId);
  if (!voice) fail(400, `${lite(target).displayName} não está em uma sala de voz`);
  dropVoice(target, 'Seu Mecenas tirou você da sala.');
  await removeFromRoom(voice!.channelId, target);
  logPower(c, me, target, 'disconnect', { serverId: sid });
}

export function mecenasNickname(me: string, target: string, serverId: string, nickname: string | null) {
  const c = requirePower(me, target);
  if (!isMember(serverId, me) || !isMember(serverId, target)) fail(403, 'Vocês precisam estar no mesmo servidor');
  run('UPDATE members SET nickname = ? WHERE server_id = ? AND user_id = ?', nickname, serverId, target);
  serverChanged(serverId);
  logPower(c, me, target, 'nickname', { serverId, nickname });
}

// ---- foto/GIF: o Mecenas troca, a original fica guardada e volta no fim do contrato

/** A foto da pessoa foi escolhida pelo Mecenas (e ela não pode trocar até o contrato acabar)? */
export function avatarLocked(userId: string): boolean {
  const c = currentOf(userId);
  return !!c && c.status === 'active' && !!get('SELECT 1 FROM contract_avatars WHERE contract_id = ? AND user_id = ?', c.id, userId);
}

function setAvatar(me: string, target: string, body: unknown) {
  const c = requirePower(me, target);
  const url = saveImage('avatars', target, body);
  const previous = tx(() => {
    const row = get<{ current_url: string | null }>('SELECT current_url FROM contract_avatars WHERE contract_id = ? AND user_id = ?', c.id, target);
    if (row) run('UPDATE contract_avatars SET current_url = ? WHERE contract_id = ? AND user_id = ?', url, c.id, target);
    else {
      const original = get<{ avatar_url: string | null }>('SELECT avatar_url FROM users WHERE id = ?', target)?.avatar_url ?? null;
      run('INSERT INTO contract_avatars (contract_id, user_id, original_url, current_url) VALUES (?, ?, ?, ?)', c.id, target, original, url);
    }
    run('UPDATE users SET avatar_url = ? WHERE id = ?', url, target);
    return row?.current_url ?? null;
  });
  removeUpload(previous); // a que o Mecenas tinha posto antes (a original fica)
  hooks.profileChanged(target);
  hooks.meUpdated(target);
  logPower(c, me, target, 'avatar');
}

function restoreAvatars(contractId: string, onlyUser?: string) {
  const rows = all<{ user_id: string; original_url: string | null; current_url: string | null }>(
    'SELECT user_id, original_url, current_url FROM contract_avatars WHERE contract_id = ?',
    contractId,
  );
  for (const r of rows) {
    if (onlyUser && r.user_id !== onlyUser) continue;
    run('UPDATE users SET avatar_url = ? WHERE id = ?', r.original_url, r.user_id);
    run('DELETE FROM contract_avatars WHERE contract_id = ? AND user_id = ?', contractId, r.user_id);
    removeUpload(r.current_url);
    log(contractId, 'avatar_restored', { userId: r.user_id });
    hooks.profileChanged(r.user_id);
    hooks.meUpdated(r.user_id);
  }
}

// ---- efeito de voz surpresa: o servidor sorteia o momento; o app do alvo aplica sem avisar

interface PendingFx {
  timer: ReturnType<typeof setTimeout>;
  actorId: string;
  targetId: string;
  effect: PrankEffect;
  durationMs: number;
}
const pendingFx = new Map<string, PendingFx>(); // contractId -> agendado

function cancelFx(contractId: string, onlyTarget?: string) {
  const p = pendingFx.get(contractId);
  if (!p || (onlyTarget && p.targetId !== onlyTarget)) return;
  clearTimeout(p.timer);
  pendingFx.delete(contractId);
  log(contractId, 'voice_fx_cancelled', { actorId: p.actorId, userId: p.targetId, data: { effect: p.effect } });
}

function scheduleFx(me: string, target: string, effect: PrankEffect, durationMs: number, windowMs: number) {
  const c = requirePower(me, target);
  if (pendingFx.has(c.id)) fail(409, 'Já tem um efeito surpresa esperando a hora');
  const delay = randomInt(0, windowMs + 1);
  const timer = setTimeout(() => fireFx(c.id), delay);
  timer.unref?.();
  pendingFx.set(c.id, { timer, actorId: me, targetId: target, effect, durationMs });
  // só quem agendou vê este registro (o alvo descobre no histórico depois que acontece)
  log(c.id, 'voice_fx_scheduled', { actorId: me, userId: target, data: { effect, durationMs, windowMs } });
  emitToUser(me, 'contract:updated', { id: c.id });
}

function fireFx(contractId: string) {
  const p = pendingFx.get(contractId);
  if (!p) return;
  pendingFx.delete(contractId);
  const power = mecenasPower(p.actorId, p.targetId);
  const v = getVoiceState(p.targetId);
  const skipped = power === 'shielded' ? 'shield' : power === 'no' ? 'no_power' : !v ? 'not_in_voice' : v.muted || v.serverMuted ? 'muted' : null;
  if (!skipped) emitToUser(p.targetId, 'voice:fx', { effect: p.effect, durationMs: p.durationMs });
  log(contractId, skipped ? 'voice_fx_skipped' : 'voice_fx', {
    actorId: p.actorId,
    userId: p.targetId,
    data: { effect: p.effect, durationMs: p.durationMs, reason: skipped },
  });
  const c = byId(contractId);
  if (c) afterChange(c);
}

// ------------------------------------------------------------------ JSON

interface EventRow {
  id: number;
  contract_id: string | null;
  user_id: string | null;
  actor_id: string | null;
  type: string;
  data: string | null;
  created_at: number;
}

const parse = (raw: string | null) => {
  try {
    return raw ? (JSON.parse(raw) as unknown) : null;
  } catch {
    return null;
  }
};

/** Histórico do contrato. `viewer` null é a equipe (vê tudo); o alvo não vê o efeito surpresa agendado. */
function eventsJson(contractId: string, viewer: string | null, limit = 200) {
  return all<EventRow>('SELECT * FROM contract_events WHERE contract_id = ? ORDER BY id DESC LIMIT ?', contractId, limit)
    .filter((e) => viewer === null || e.type !== 'voice_fx_scheduled' || e.actor_id === viewer)
    .map((e) => ({ id: e.id, type: e.type, userId: e.user_id, actorId: e.actor_id, data: parse(e.data), at: e.created_at }));
}

function briefJson(c: ContractRow) {
  return {
    id: c.id,
    status: c.status,
    renewal: !!c.renewal,
    creator: lite(c.creator_id),
    invitee: lite(c.invitee_id),
    durationMs: c.duration_ms,
    cooldownMs: c.cooldown_ms,
    tieClause: !!c.tie_clause,
    createdAt: c.created_at,
    inviteExpiresAt: c.invite_expires_at,
    startedAt: c.started_at,
    endsAt: c.ends_at,
    endedAt: c.ended_at,
    endReason: c.end_reason,
    endedBy: c.ended_by,
    leaderId: c.leader_id,
  };
}

/** O contrato completo para uma das duas pessoas (ou para a equipe, com `viewer` null). */
function contractJson(c: ContractRow, viewer: string | null) {
  const activeNow = c.status === 'active';
  const lead = leadership(c);
  const contributed = activeNow ? contributedDuring(c, now()) : [];
  const contributedCents = contributed.reduce((n, p) => n + p.amount_cents, 0);
  const fx = pendingFx.get(c.id);
  const target = viewer ? otherOf(c, viewer) : null;
  const tv = target ? getVoiceState(target) : undefined;
  return {
    ...briefJson(c),
    leaderId: lead.leaderId,
    tie: lead.tie,
    holders: activeNow ? lead.holders : [],
    totals: lead.totals,
    accepted: { [c.creator_id]: c.creator_accepted_at, [c.invitee_id]: c.invitee_accepted_at },
    shields: activeNow ? Object.fromEntries(participants(c).map((p) => [p, shieldJson(settled(p, c))])) : null,
    contributedCents,
    fineEstimateCents: activeNow ? fineCents(contributedCents) : null,
    avatarOverrides: all<{ user_id: string }>('SELECT user_id FROM contract_avatars WHERE contract_id = ?', c.id).map((r) => r.user_id),
    // só para quem agendou
    pendingFx: fx && viewer && fx.actorId === viewer ? { effect: fx.effect, durationMs: fx.durationMs } : null,
    // onde o outro está em chamada, se for num servidor de quem está vendo
    otherVoice:
      tv && viewer && isMember(tv.serverId, viewer)
        ? { serverId: tv.serverId, channelId: tv.channelId, muted: tv.muted, deafened: tv.deafened, serverMuted: tv.serverMuted, serverDeafened: tv.serverDeafened }
        : null,
    mutualServers: viewer
      ? all<{ id: string; name: string }>(
          'SELECT s.id, s.name FROM servers s JOIN members a ON a.server_id = s.id JOIN members b ON b.server_id = s.id WHERE a.user_id = ? AND b.user_id = ? ORDER BY s.name',
          c.creator_id,
          c.invitee_id,
        )
      : [],
    endNote: viewer === null || viewer === c.ended_by ? c.end_note : null,
    review: viewer === null ? c.review : undefined,
    events: eventsJson(c.id, viewer),
  };
}

const fineJson = (f: ContractFineRow) => ({
  id: f.id,
  contractId: f.contract_id,
  userId: f.user_id,
  amountCents: f.amount_cents,
  baseCents: f.base_cents,
  status: f.status,
  createdAt: f.created_at,
  resolvedAt: f.resolved_at,
  note: f.note,
});

function requireParticipant(id: string, me: string) {
  const c = live(byId(id));
  if (!c || !isParticipant(c, me)) fail(404, 'Contrato não encontrado');
  return c!;
}

function requireTerms(body: unknown) {
  if ((body as { acceptTerms?: unknown } | undefined)?.acceptTerms !== true) fail(400, 'Para seguir, aceite os termos do contrato');
}

const username = (raw: unknown) => str(raw, '@', 1, 64).replace(/^@/, '');

// ------------------------------------------------------------------ rotas

const imageBody = express.raw({ type: () => true, limit: '9mb' });

export function registerContractRoutes(api: Router) {
  api.get('/contracts/me', (_req, res) => {
    const me = uid(res);
    const current = live(currentOf(me));
    const cur = current && current.status !== 'ended' ? current : undefined;
    res.json({
      current: cur ? contractJson(cur, me) : null,
      history: all<ContractRow>(
        "SELECT * FROM contracts WHERE status = 'ended' AND (creator_id = ? OR invitee_id = ?) ORDER BY ended_at DESC LIMIT 20",
        me,
        me,
      ).map(briefJson),
      shield: shieldJson(settled(me, cur?.status === 'active' ? cur : null)),
      fines: all<ContractFineRow>('SELECT * FROM contract_fines WHERE user_id = ? ORDER BY created_at DESC LIMIT 20', me).map(fineJson),
      supportTotalCents: totalOf(me),
    });
  });

  api.get('/contracts/:id', (req, res) => {
    const me = uid(res);
    res.json(contractJson(requireParticipant(req.params.id, me), me));
  });

  /** Propor um contrato: quem propõe já aceita os termos. O convidado pode ainda não ter apoiado. */
  api.post('/contracts', humansOnly, (req, res) => {
    const me = uid(res);
    requireTerms(req.body);
    const days = int(req.body?.durationDays, 'prazo');
    if (days < 1 || days > CONTRACT_MAX_DAYS) fail(400, `O prazo vai de 1 a ${CONTRACT_MAX_DAYS} dias`);
    const cooldownHours = int(req.body?.cooldownHours, 'intervalo do Escudo');
    if (!(CONTRACT_COOLDOWN_HOURS as readonly number[]).includes(cooldownHours)) fail(400, 'O intervalo do Escudo é de 1, 2 ou 3 horas');
    const tieClause = req.body?.tieClause === true;
    const target =
      get<UserRow>('SELECT * FROM users WHERE username = ? COLLATE NOCASE AND is_bot = 0', username(req.body?.username)) ??
      fail(404, 'Ninguém com esse @');
    if (target!.id === me) fail(400, 'O contrato é entre duas pessoas');
    if (!(totalOf(me) > 0)) fail(403, 'Só quem já apoiou o Concord pode propor um contrato');
    if (openFine(me)) fail(409, 'Você tem uma multa de rescisão em aberto. Pague antes de entrar em outro contrato.');
    if (openFine(target!.id)) fail(409, `@${target!.username} não pode entrar em contratos agora`);
    const recent = get<{ n: number }>('SELECT COUNT(*) AS n FROM contracts WHERE creator_id = ? AND created_at > ?', me, now() - DAY)!.n;
    if (recent >= MAX_INVITES_PER_DAY) fail(429, 'Muitos convites hoje. Tente de novo amanhã.');

    const id = randomUUID();
    const t = now();
    tx(() => {
      if (currentOf(me)) fail(409, 'Você já está em um contrato (ou tem um convite em aberto)');
      if (currentOf(target!.id)) fail(409, `@${target!.username} já está em um contrato (ou tem um convite em aberto)`);
      run(
        `INSERT INTO contracts (id, creator_id, invitee_id, status, duration_ms, cooldown_ms, tie_clause, creator_accepted_at, created_at, invite_expires_at)
         VALUES (?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?)`,
        id,
        me,
        target!.id,
        days * DAY,
        cooldownHours * HOUR,
        tieClause ? 1 : 0,
        t,
        t,
        t + CONTRACT_INVITE_TTL_MS,
      );
      // a chave primária é a garantia final de um contrato por pessoa
      run('INSERT INTO contract_locks (user_id, contract_id) VALUES (?, ?)', me, id);
      run('INSERT INTO contract_locks (user_id, contract_id) VALUES (?, ?)', target!.id, id);
      log(id, 'invited', { actorId: me, userId: target!.id, data: { days, cooldownHours, tieClause } });
    });
    const c = byId(id)!;
    afterChange(c);
    res.json(contractJson(c, me));
  });

  /** Aceitar (o convidado; na renovação do contrato antigo, as duas pessoas). Começa quando as duas aceitaram. */
  api.post('/contracts/:id/accept', humansOnly, (req, res) => {
    const me = uid(res);
    requireTerms(req.body);
    const c = requireParticipant(req.params.id, me);
    if (c.status !== 'pending') fail(409, c.status === 'active' ? 'O contrato já está em vigor' : 'Esse convite não vale mais');
    const mine = c.creator_id === me ? 'creator_accepted_at' : 'invitee_accepted_at';
    if (!(totalOf(me) > 0)) fail(402, 'Para aceitar, apoie o Concord primeiro: qualquer valor confirmado vale.');
    if (openFine(me)) fail(409, 'Você tem uma multa de rescisão em aberto. Pague antes de entrar em outro contrato.');
    const t = now();
    tx(() => {
      const fresh = byId(c.id)!;
      if (fresh.status !== 'pending') fail(409, 'Esse convite não vale mais');
      if (!fresh[mine]) {
        run(`UPDATE contracts SET ${mine} = ? WHERE id = ?`, t, c.id);
        log(c.id, 'accepted', { actorId: me });
      }
      const both = byId(c.id)!;
      if (both.creator_accepted_at && both.invitee_accepted_at) {
        const other = otherOf(both, me);
        if (!(totalOf(other) > 0)) fail(409, `@${lite(other).username} está sem apoio confirmado no momento`);
        run("UPDATE contracts SET status = 'active', started_at = ?, ends_at = ? WHERE id = ?", t, t + both.duration_ms, c.id);
        log(c.id, 'started', { data: { endsAt: t + both.duration_ms, totals: { [both.creator_id]: totalOf(both.creator_id), [both.invitee_id]: totalOf(both.invitee_id) } } });
      }
    });
    const started = byId(c.id)!;
    if (started.status === 'active') leadership(started);
    afterChange(started);
    res.json(contractJson(byId(c.id)!, me));
  });

  /** Recusar o convite (ou, quem propôs, desistir dele). */
  api.post('/contracts/:id/decline', (req, res) => {
    const me = uid(res);
    const c = requireParticipant(req.params.id, me);
    if (c.status !== 'pending') fail(409, 'Só dá para recusar um convite');
    endContract(c, c.creator_id === me && !c.renewal ? 'cancelled' : 'declined', me);
    res.json({ ok: true });
  });

  /** Rescindir antes do prazo: acaba na hora e a multa fica em aberto para quem rescindiu. */
  api.post('/contracts/:id/rescind', (req, res) => {
    const me = uid(res);
    const c = requireParticipant(req.params.id, me);
    if (c.status !== 'active') fail(409, 'O contrato não está em vigor');
    const t = now();
    // o app manda o valor que mostrou; se mudou (alguém apoiou nesse meio tempo), pede para confirmar de novo
    const { amountCents } = fineFor(c, t);
    if (req.body?.confirmCents !== amountCents) fail(409, `A multa agora é de R$ ${(amountCents / 100).toFixed(2).replace('.', ',')}. Confira e confirme de novo.`);
    let fineId = '';
    tx(() => {
      fineId = createFine(c, me, t, me);
      endContract(c, 'rescinded', me);
    });
    res.json({ ok: true, fine: fineJson(get<ContractFineRow>('SELECT * FROM contract_fines WHERE id = ?', fineId)!) });
  });

  /** Sair por segurança: sem multa, acaba na hora e vai para a equipe revisar. */
  api.post('/contracts/:id/safety-end', (req, res) => {
    const me = uid(res);
    const c = requireParticipant(req.params.id, me);
    if (c.status !== 'active') fail(409, 'O contrato não está em vigor');
    const note = typeof req.body?.note === 'string' ? req.body.note.trim().slice(0, 500) || null : null;
    endContract(c, 'safety', me, note, 'pending');
    res.json({ ok: true });
  });

  /** Ligar/desligar o próprio Escudo. */
  api.post('/contracts/shield', (req, res) => {
    const me = uid(res);
    const on = req.body?.on === true;
    const c = live(currentOf(me));
    if (!c || c.status !== 'active') fail(400, 'O Escudo só vale com um contrato em vigor');
    const t = now();
    const state = tx(() => {
      const s = settled(me, c);
      if (on) {
        const why = shieldBlocked(s, t);
        if (why === 'active') return s;
        if (why === 'empty') fail(409, 'Seu Escudo está sem saldo. As 3 h voltam 24 h depois de zerar.');
        if (why === 'cooldown') fail(409, 'Espere o intervalo do Escudo acabar para ligar de novo');
        const next = { ...s, activeSince: t };
        saveShield(me, next);
        log(c!.id, 'shield_on', { userId: me, data: { balanceMs: s.balanceMs } });
        return next;
      }
      if (s.activeSince === null) return s;
      const { state: next, events } = stopShield(s, t, c!.cooldown_ms);
      saveShield(me, next);
      log(c!.id, 'shield_off', { userId: me, data: { usedMs: s.balanceMs - next.balanceMs } });
      logShieldEvents(c!.id, me, events);
      return next;
    });
    if (on) {
      // proteção vale para o que já estava feito: desfaz o silêncio/surdez do Mecenas e o efeito agendado
      cancelFx(c!.id, me);
      void liftApplied(c!.id, me);
    }
    afterChange(c!);
    res.json(shieldJson(state));
  });

  /** As sacanagens (janela "Sacanagens e Peripécias"). A foto vai por /avatar, com a imagem no corpo. */
  api.post('/contracts/:id/powers', humansOnly, async (req, res) => {
    const me = uid(res);
    const c = requireParticipant(req.params.id, me);
    if (c.status !== 'active') fail(409, 'O contrato não está em vigor');
    const target = otherOf(c, me);
    const b = (req.body ?? {}) as Record<string, unknown>;
    const on = b.on !== false;
    switch (b.power) {
      case 'mute':
        await mecenasMute(me, target, on);
        break;
      case 'deafen':
        await mecenasDeafen(me, target, on);
        break;
      case 'disconnect':
        await mecenasDisconnect(me, target);
        break;
      case 'nickname': {
        const nickname = b.nickname === null || b.nickname === '' ? null : str(b.nickname, 'apelido', 1, 32);
        mecenasNickname(me, target, str(b.serverId, 'servidor', 1, 64), nickname);
        break;
      }
      case 'voice_fx': {
        if (!isPrankEffect(b.effect)) fail(400, 'Efeito desconhecido');
        const durationMs = int(b.durationMs, 'duração');
        const windowMs = int(b.windowMs, 'janela');
        if (durationMs < VOICE_FX_MIN_MS || durationMs > VOICE_FX_MAX_MS) fail(400, 'O efeito dura de 1 a 5 segundos');
        if (windowMs < 0 || windowMs > VOICE_FX_WINDOW_MAX_MS) fail(400, 'O efeito acontece em até 3 minutos');
        scheduleFx(me, target, b.effect as PrankEffect, durationMs, windowMs);
        break;
      }
      default:
        fail(400, 'Poder desconhecido');
    }
    res.json(contractJson(byId(c.id)!, me));
  });

  api.delete('/contracts/:id/voice-fx', (req, res) => {
    const me = uid(res);
    const c = requireParticipant(req.params.id, me);
    if (pendingFx.get(c.id)?.actorId === me) cancelFx(c.id);
    afterChange(c);
    res.json(contractJson(byId(c.id)!, me));
  });

  api.post('/contracts/:id/avatar', humansOnly, imageBody, (req, res) => {
    const me = uid(res);
    const c = requireParticipant(req.params.id, me);
    if (c.status !== 'active') fail(409, 'O contrato não está em vigor');
    setAvatar(me, otherOf(c, me), req.body);
    res.json(contractJson(byId(c.id)!, me));
  });

  /** O Mecenas devolve a foto original antes do fim. */
  api.delete('/contracts/:id/avatar', (req, res) => {
    const me = uid(res);
    const c = requireParticipant(req.params.id, me);
    const target = otherOf(c, me);
    requirePower(me, target);
    restoreAvatars(c.id, target);
    afterChange(c);
    res.json(contractJson(byId(c.id)!, me));
  });

  /** Pix da multa (o mesmo do apoio; não soma no total). */
  api.post('/contracts/fines/:id/pix', humansOnly, async (req, res) => {
    const me = uid(res);
    const f = get<ContractFineRow>('SELECT * FROM contract_fines WHERE id = ? AND user_id = ?', req.params.id, me) ?? fail(404, 'Multa não encontrada');
    if (f!.status !== 'open') fail(409, 'Essa multa não está em aberto');
    res.json(await createPix(me, f!.amount_cents, f!.id));
  });

  // ---------------------------------------------------------------- portal da equipe (depois do requireAdmin do admin.ts)

  api.get('/admin/contracts', (req, res) => {
    const status = typeof req.query.status === 'string' ? req.query.status : '';
    const review = req.query.review === 'pending';
    const rows = all<ContractRow>(
      `SELECT * FROM contracts WHERE (? = '' OR status = ?) AND (? = 0 OR review = 'pending') ORDER BY created_at DESC LIMIT 200`,
      status,
      status,
      review ? 1 : 0,
    );
    res.json({
      items: rows.map((c) => ({
        ...briefJson(c),
        review: c.review,
        fines: all<ContractFineRow>('SELECT * FROM contract_fines WHERE contract_id = ?', c.id).map(fineJson),
      })),
      pendingReviews: get<{ n: number }>("SELECT COUNT(*) AS n FROM contracts WHERE review = 'pending'")!.n,
      openFines: get<{ n: number }>("SELECT COUNT(*) AS n FROM contract_fines WHERE status = 'open'")!.n,
    });
  });

  api.get('/admin/contracts/:id', (req, res) => {
    const c = live(byId(req.params.id)) ?? fail(404, 'Contrato não encontrado');
    const until = c!.ended_at ?? now();
    res.json({
      ...contractJson(c!, null),
      contributions: contributedDuring(c!, until).map((p) => ({ id: p.id, userId: p.user_id, amountCents: p.amount_cents, paidAt: p.paid_at })),
      fines: all<ContractFineRow>('SELECT * FROM contract_fines WHERE contract_id = ? ORDER BY created_at', c!.id).map(fineJson),
    });
  });

  /** Encerramento excepcional pela equipe (segurança, abuso, regras): sem multa. */
  api.post('/admin/contracts/:id/end', (req, res) => {
    const c = byId(req.params.id) ?? fail(404, 'Contrato não encontrado');
    if (c!.status === 'ended') fail(409, 'O contrato já terminou');
    const note = typeof req.body?.note === 'string' ? req.body.note.trim().slice(0, 500) || null : null;
    endContract(c!, 'staff', uid(res), note);
    res.json({ ok: true });
  });

  /** Revisão de uma saída por segurança: confirmar (sem multa) ou reaplicar a multa a quem saiu. */
  api.post('/admin/contracts/:id/review', (req, res) => {
    const c = byId(req.params.id) ?? fail(404, 'Contrato não encontrado');
    if (c!.review !== 'pending') fail(409, 'Esse contrato não está esperando revisão');
    const decision = req.body?.decision;
    if (decision !== 'confirm' && decision !== 'fine') fail(400, 'Decisão inválida');
    tx(() => {
      if (decision === 'fine') createFine(c!, c!.ended_by!, c!.ended_at!, uid(res));
      run('UPDATE contracts SET review = ? WHERE id = ?', decision === 'fine' ? 'fined' : 'confirmed', c!.id);
      log(c!.id, 'reviewed', { actorId: uid(res), data: { decision } });
    });
    if (c!.ended_by) emitToUser(c!.ended_by, 'contract:updated', { id: c!.id });
    res.json({ ok: true });
  });

  /** Devolve a foto original de alguém antes do fim do contrato. */
  api.post('/admin/contracts/:id/restore-avatar', (req, res) => {
    const c = byId(req.params.id) ?? fail(404, 'Contrato não encontrado');
    restoreAvatars(c!.id, typeof req.body?.userId === 'string' ? req.body.userId : undefined);
    log(c!.id, 'staff_restored_avatar', { actorId: uid(res) });
    afterChange(c!);
    res.json({ ok: true });
  });

  api.post('/admin/fines/:id/waive', (req, res) => {
    const f = get<ContractFineRow>('SELECT * FROM contract_fines WHERE id = ?', req.params.id) ?? fail(404, 'Multa não encontrada');
    if (f!.status !== 'open') fail(409, 'Essa multa não está em aberto');
    const note = typeof req.body?.note === 'string' ? req.body.note.trim().slice(0, 500) || null : null;
    run("UPDATE contract_fines SET status = 'waived', resolved_at = ?, resolved_by = ?, note = ? WHERE id = ?", now(), uid(res), note, f!.id);
    log(f!.contract_id, 'fine_waived', { userId: f!.user_id, actorId: uid(res), data: { fineId: f!.id, note } });
    emitToUser(f!.user_id, 'contract:updated', { id: f!.contract_id });
    res.json({ ok: true });
  });
}

// ------------------------------------------------------------------ Pix

onPayment((p: PaymentRow, status) => {
  if (p.kind === 'fine') {
    const f = p.fine_id ? get<ContractFineRow>('SELECT * FROM contract_fines WHERE id = ?', p.fine_id) : undefined;
    if (!f) return;
    if (status === 'paid' && f.status === 'open') {
      run("UPDATE contract_fines SET status = 'paid', resolved_at = ? WHERE id = ?", now(), f.id);
      log(f.contract_id, 'fine_paid', { userId: f.user_id, data: { fineId: f.id, paymentId: p.id, amountCents: p.amount_cents } });
    } else if (status === 'refunded' && f.status === 'paid') {
      run("UPDATE contract_fines SET status = 'open', resolved_at = NULL WHERE id = ?", f.id);
      log(f.contract_id, 'fine_reopened', { userId: f.user_id, data: { fineId: f.id, paymentId: p.id } });
    }
    emitToUser(f.user_id, 'contract:updated', { id: f.contract_id });
    return;
  }
  // apoio: a liderança pode virar, e quem foi convidado já pode aceitar
  const c = currentOf(p.user_id);
  if (!c) return;
  if (c.status === 'active') {
    log(c.id, 'contribution', { userId: p.user_id, data: { paymentId: p.id, amountCents: p.amount_cents, status } });
    leadership(c);
  }
  afterChange(c);
});

// ------------------------------------------------------------------ varredura e contrato antigo

/** Contratos e convites vencidos, e Escudos que zeraram ou já podem voltar, mesmo com todo mundo offline. */
function sweep() {
  const t = now();
  for (const c of all<ContractRow>(
    "SELECT * FROM contracts WHERE (status = 'active' AND ends_at <= ?) OR (status = 'pending' AND invite_expires_at <= ?)",
    t,
    t,
  )) {
    live(c);
  }
  const due = all<{ user_id: string }>(
    'SELECT user_id FROM user_shields WHERE (active_since IS NOT NULL AND active_since + balance_ms <= ?) OR (depleted_at IS NOT NULL AND depleted_at + ? <= ?)',
    t,
    SHIELD_RESTORE_MS,
    t,
  );
  for (const { user_id } of due) {
    const c = currentOf(user_id);
    settled(user_id, c?.status === 'active' ? c : null);
    if (c) afterChange(c);
    else emitToUser(user_id, 'contract:updated', {});
  }
}

/**
 * A dupla fixa do .env (MECENAS=quem>sobre-quem) vira um convite de renovação, uma vez só: as duas pessoas
 * veem a janela de renovação ao entrar e precisam aceitar. Quem era o Mecenas começa como líder.
 */
function migrateLegacyPair() {
  const m = config.mecenas;
  if (!m || get("SELECT 1 FROM meta WHERE key = 'mecenas_renewal'")) return;
  const find = (u: string) => get<{ id: string }>('SELECT id FROM users WHERE username = ? COLLATE NOCASE AND is_bot = 0', u);
  const holder = find(m.holder);
  const target = find(m.target);
  tx(() => {
    if (holder && target && holder.id !== target.id && !currentOf(holder.id) && !currentOf(target.id)) {
      const id = randomUUID();
      const t = now();
      run(
        `INSERT INTO contracts (id, creator_id, invitee_id, status, duration_ms, cooldown_ms, tie_clause, renewal, leader_id, created_at, invite_expires_at)
         VALUES (?, ?, ?, 'pending', ?, ?, 0, 1, ?, ?, ?)`,
        id,
        holder.id,
        target.id,
        CONTRACT_MAX_DAYS * DAY,
        HOUR,
        holder.id,
        t,
        t + CONTRACT_RENEWAL_TTL_MS,
      );
      run('INSERT INTO contract_locks (user_id, contract_id) VALUES (?, ?)', holder.id, id);
      run('INSERT INTO contract_locks (user_id, contract_id) VALUES (?, ?)', target.id, id);
      log(id, 'renewal_created', { data: { from: 'env' } });
      console.log('[mecenato] a dupla do MECENAS= virou um convite de renovação');
    }
    run("INSERT INTO meta (key, value) VALUES ('mecenas_renewal', ?)", String(now()));
  });
}

migrateLegacyPair();
refreshBadges();
setInterval(sweep, 30_000).unref();
