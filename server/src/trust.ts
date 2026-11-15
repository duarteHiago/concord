// Fator de Confiança e exigências por servidor e canal (ver shared/trust.ts para as regras e os pesos).
//
// A nota sai dos sinais da conta (e-mail, 2FA, idade, denúncias confirmadas pela equipe, bans em servidores) e fica
// num cache curto. As exigências viram uma máscara nas permissões do canal (access.ts#channelPermissions): quem não
// alcança o mínimo perde "Enviar mensagens"/"Falar" ou "Transmitir" ali. Como o LiveKit e o app usam essas mesmas
// permissões, não tem como driblar pelo app. Quem gerencia o servidor e os bots ficam de fora.
//
// Este arquivo não importa access.ts (que importa este): as rotas ficam em trustRoutes.ts.
import { P, has } from '../../shared/permissions.ts';
import type { ReportCategory } from '../../shared/reports.ts';
import {
  computeTrust,
  meetsRequirement,
  requirementText,
  strictest,
  type TrustAction,
  type TrustLevel,
  type TrustRequirement,
  type TrustResult,
  type TrustRules,
} from '../../shared/trust.ts';
import { all, get, run } from './db.ts';
import { fail } from './http.ts';

const DAY = 86_400_000;
const CACHE_MS = 60_000;

// ---------------------------------------------------------------- Nota

interface TrustUserRow {
  id: string;
  created_at: number;
  email: string | null;
  google_sub: string | null;
  totp_enabled: number;
  banned_at: number | null;
  is_bot: number;
}

const trustCache = new Map<string, { at: number; result: TrustResult }>();

export function invalidateTrust(...userIds: (string | null | undefined)[]) {
  for (const id of userIds) if (id) trustCache.delete(id);
}

export function levelOf(u: Pick<TrustUserRow, 'email' | 'google_sub'>): TrustLevel {
  // o Google já confirmou o e-mail da conta dele, mesmo que o Concord não guarde o endereço
  return u.email || u.google_sub ? 1 : 0;
}

/** Os sinais crus da conta (sem cache). Várias denúncias do mesmo caso contam uma vez, pelo motivo mais pesado. */
function signalsOf(u: TrustUserRow) {
  const rows = all<{ category: ReportCategory; at: number; message_id: string | null; kind: string; created_at: number }>(
    `SELECT COALESCE(confirmed_category, category) AS category, COALESCE(resolved_at, created_at) AS at, message_id, kind, created_at
     FROM reports WHERE target_user_id = ? AND outcome = 'actioned'`,
    u.id,
  );
  const SEVERITY: ReportCategory[] = ['csam', 'violence', 'nudity', 'harassment', 'spam', 'other'];
  const cases = new Map<string, { category: ReportCategory; at: number }>();
  for (const r of rows) {
    const key = r.message_id ?? `${r.kind}:${Math.floor(r.created_at / DAY)}`;
    const prev = cases.get(key);
    if (!prev || SEVERITY.indexOf(r.category) < SEVERITY.indexOf(prev.category)) cases.set(key, { category: r.category, at: r.at });
  }
  const helpful = get<{ n: number }>(
    `SELECT COUNT(DISTINCT COALESCE(message_id, kind || ':' || target_user_id)) AS n FROM reports WHERE reporter_id = ? AND outcome = 'actioned'`,
    u.id,
  )!.n;
  const bans = all<{ created_at: number }>('SELECT created_at FROM server_bans WHERE user_id = ?', u.id).map((b) => b.created_at);
  return {
    suspended: !!u.banned_at,
    level: levelOf(u),
    twoFactor: !!u.totp_enabled,
    createdAt: u.created_at,
    confirmedAgainst: [...cases.values()],
    serverBans: bans,
    helpfulReports: helpful,
  };
}

const userRow = (userId: string) =>
  get<TrustUserRow>('SELECT id, created_at, email, google_sub, totp_enabled, banned_at, is_bot FROM users WHERE id = ?', userId);

/** Nota da conta (null: conta não existe). Fica 1 minuto em cache; quem muda um sinal chama invalidateTrust. */
export function trustOf(userId: string): TrustResult | null {
  const now = Date.now();
  const hit = trustCache.get(userId);
  if (hit && now - hit.at < CACHE_MS) return hit.result;
  const u = userRow(userId);
  if (!u) return null;
  const result = computeTrust(signalsOf(u), now);
  trustCache.set(userId, { at: now, result });
  if (trustCache.size > 5000) trustCache.delete(trustCache.keys().next().value!);
  return result;
}

// ---------------------------------------------------------------- Exigências

/** Exigências gravadas: a do servidor tem channel_id ''. */
const rulesCache = new Map<string, TrustRules>();
let rulesLoaded = false;
const rulesKey = (serverId: string, channelId: string | null) => `${serverId}:${channelId ?? ''}`;
/** servidores com alguma exigência (no servidor ou num canal): os outros nem calculam a nota */
const serversWithRules = new Set<string>();

function loadRules() {
  if (rulesLoaded) return;
  rulesLoaded = true;
  for (const r of all<{ server_id: string; channel_id: string; rules: string }>('SELECT server_id, channel_id, rules FROM trust_rules')) {
    try {
      rulesCache.set(rulesKey(r.server_id, r.channel_id || null), JSON.parse(r.rules) as TrustRules);
      serversWithRules.add(r.server_id);
    } catch {
      // linha estragada: ignora
    }
  }
}

export function rulesOf(serverId: string, channelId: string | null = null): TrustRules {
  loadRules();
  return rulesCache.get(rulesKey(serverId, channelId)) ?? {};
}

export function channelRulesOf(serverId: string): Record<string, TrustRules> {
  loadRules();
  const out: Record<string, TrustRules> = {};
  const prefix = `${serverId}:`;
  for (const [key, rules] of rulesCache) if (key.startsWith(prefix) && key.length > prefix.length) out[key.slice(prefix.length)] = rules;
  return out;
}

export function saveRules(serverId: string, channelId: string | null, rules: TrustRules, by: string) {
  loadRules();
  const key = rulesKey(serverId, channelId);
  if (Object.keys(rules).length === 0) {
    run('DELETE FROM trust_rules WHERE server_id = ? AND channel_id = ?', serverId, channelId ?? '');
    rulesCache.delete(key);
  } else {
    run(
      `INSERT INTO trust_rules (server_id, channel_id, rules, updated_by, updated_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (server_id, channel_id) DO UPDATE SET rules = excluded.rules, updated_by = excluded.updated_by, updated_at = excluded.updated_at`,
      serverId,
      channelId ?? '',
      JSON.stringify(rules),
      by,
      Date.now(),
    );
    rulesCache.set(key, rules);
  }
  if ([...rulesCache.keys()].some((k) => k.startsWith(`${serverId}:`))) serversWithRules.add(serverId);
  else serversWithRules.delete(serverId);
}

/** Apaga as exigências de um canal apagado (as do servidor somem junto com ele, pela chave estrangeira). */
export function forgetChannelRules(serverId: string, channelId: string) {
  saveRules(serverId, channelId, {}, '');
}

function requirementFor(serverId: string, channelId: string | null, action: TrustAction): TrustRequirement | undefined {
  const server = rulesOf(serverId)[action];
  return channelId ? strictest(server, rulesOf(serverId, channelId)[action]) : server;
}

const isBot = (userId: string) => !!get('SELECT 1 FROM users WHERE id = ? AND is_bot = 1', userId);

/** O que a pessoa não alcança neste canal (ou no servidor, sem canal). Vazio: alcança tudo. */
export function unmetRequirements(serverId: string, channelId: string | null, userId: string): Partial<Record<TrustAction, TrustRequirement>> {
  loadRules();
  if (!serversWithRules.has(serverId) || isBot(userId)) return {};
  const t = trustOf(userId);
  if (!t) return {};
  const out: Partial<Record<TrustAction, TrustRequirement>> = {};
  for (const action of ['speak', 'stream'] as const) {
    const req = requirementFor(serverId, channelId, action);
    if (req && !meetsRequirement(req, t)) out[action] = req;
  }
  return out;
}

/**
 * Tira das permissões do canal o que a pessoa não alcança. `serverPerms`: as do servidor (quem gerencia o servidor
 * fica de fora das exigências).
 */
export function trustMask(serverId: string, channelId: string | null, userId: string, serverPerms: number, perms: number): number {
  if (!perms || has(serverPerms, P.MANAGE_SERVER)) return perms;
  loadRules();
  if (!serversWithRules.has(serverId)) return perms;
  const unmet = unmetRequirements(serverId, channelId, userId);
  if (unmet.speak) perms &= ~(P.SEND_MESSAGES | P.SPEAK);
  if (unmet.stream) perms &= ~P.STREAM;
  return perms;
}

/** Na entrada pelo convite: quem não alcança o mínimo do servidor não entra (e fica sabendo o que falta). */
export function requireJoinTrust(serverId: string, serverName: string, userId: string) {
  const req = rulesOf(serverId).join;
  if (!req || isBot(userId)) return;
  const t = trustOf(userId);
  if (t && !meetsRequirement(req, t)) fail(403, `${serverName} só aceita ${requirementText(req)}.`);
}
