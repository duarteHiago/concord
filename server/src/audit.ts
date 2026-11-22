// Registro de auditoria de cada servidor: as rotas chamam audit() depois de mudar algo (cargos, canais, expulsões,
// banimentos, convites...), e quem tem "Ver o registro de auditoria" lê em GET /servers/:id/audit-log.
// Os nomes vão gravados junto: a linha continua legível depois que o canal, o cargo ou a conta somem.
import type { Router } from 'express';
import { P, PERMISSION_INFO } from '../../shared/permissions.ts';
import {
  AUDIT_ACTIONS,
  AUDIT_DAYS,
  actionsOf,
  isAuditAction,
  isAuditGroup,
  type AuditAction,
  type AuditChange,
  type AuditEntry,
  type AuditTargetType,
} from '../../shared/audit.ts';
import { requireServerPerm } from './access.ts';
import { all, get, run } from './db.ts';
import { uid } from './http.ts';

export interface AuditTarget {
  type: AuditTargetType;
  id?: string | null;
  name?: string | null;
}

interface AuditRow {
  id: number;
  actor_id: string | null;
  actor_name: string;
  action: string;
  target_type: string | null;
  target_id: string | null;
  target_name: string | null;
  changes: string | null;
  reason: string | null;
  created_at: number;
  avatar_url: string | null;
  avatar_color: string | null;
  display_name: string | null;
}

/** Nome de exibição de uma pessoa agora (para gravar junto). */
export function userName(userId: string): string {
  return get<{ display_name: string }>('SELECT display_name FROM users WHERE id = ?', userId)?.display_name ?? 'Conta removida';
}

/** Alvo "pessoa", com o nome de agora. */
export const userTarget = (userId: string): AuditTarget => ({ type: 'user', id: userId, name: userName(userId) });

/** "Fulano fez tal coisa": grava uma linha. Nunca derruba a ação que já aconteceu. */
export function audit(
  serverId: string,
  actorId: string | null,
  action: AuditAction,
  o: { target?: AuditTarget; changes?: AuditChange[]; reason?: string | null; actorName?: string; ifChanged?: boolean } = {},
) {
  try {
    const changes = (o.changes ?? []).filter((c) => c.from !== c.to || c.added?.length || c.removed?.length);
    // edição que não mudou nada (salvou igual, ou só reordenou): não vira linha
    if (o.ifChanged && !changes.length) return;
    run(
      `INSERT INTO audit_log (server_id, actor_id, actor_name, action, target_type, target_id, target_name, changes, reason, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      serverId,
      actorId,
      o.actorName ?? (actorId ? userName(actorId) : 'Concord'),
      action,
      o.target?.type ?? null,
      o.target?.id ?? null,
      o.target?.name ?? null,
      changes.length ? JSON.stringify(changes) : null,
      o.reason ?? null,
      Date.now(),
    );
  } catch (err) {
    console.error('[audit] falhou ao gravar:', err);
  }
}

/** Campo simples que mudou (ou nada, se ficou igual). */
export function change(field: string, from: unknown, to: unknown): AuditChange[] {
  const s = (v: unknown) => (v === null || v === undefined || v === '' ? null : typeof v === 'boolean' ? (v ? 'sim' : 'não') : String(v));
  return s(from) === s(to) ? [] : [{ field, from: s(from), to: s(to) }];
}

const permLabel = (bit: number) => PERMISSION_INFO.find((p) => P[p.key] === bit)?.label ?? `#${bit}`;
const bitsOf = (mask: number) => Object.values(P).filter((b) => (mask & b) === b);

/** Permissões que entraram e saíram de uma máscara. */
export function permChange(field: string, before: number, after: number): AuditChange[] {
  const added = bitsOf(after & ~before).map(permLabel);
  const removed = bitsOf(before & ~after).map(permLabel);
  return added.length || removed.length ? [{ field, added, removed }] : [];
}

/** Lista que ganhou e perdeu itens (cargos de alguém, por exemplo). */
export function listChange(field: string, added: string[], removed: string[]): AuditChange[] {
  return added.length || removed.length ? [{ field, added, removed }] : [];
}

function entryJson(r: AuditRow): AuditEntry {
  let changes: AuditChange[] = [];
  try {
    changes = r.changes ? (JSON.parse(r.changes) as AuditChange[]) : [];
  } catch {
    // linha antiga ou corrompida: mostra sem o detalhe
  }
  return {
    id: r.id,
    action: r.action as AuditAction,
    actor: { id: r.actor_id, name: r.display_name ?? r.actor_name, avatarUrl: r.avatar_url, avatarColor: r.avatar_color ?? '#5865f2' },
    target: r.target_type ? { type: r.target_type as AuditTargetType, id: r.target_id, name: r.target_name } : null,
    changes,
    reason: r.reason,
    createdAt: r.created_at,
  };
}

const PAGE = 50;

/** Conta apagada: o registro dos servidores continua, mas sem o nome nem o id dela. */
export function forgetInAudit(userId: string) {
  run("UPDATE audit_log SET actor_id = NULL, actor_name = 'Conta removida' WHERE actor_id = ?", userId);
  run("UPDATE audit_log SET target_id = NULL, target_name = 'Conta removida' WHERE target_type = 'user' AND target_id = ?", userId);
}

/** Tira as linhas mais velhas que AUDIT_DAYS. */
export function pruneAudit() {
  run('DELETE FROM audit_log WHERE created_at < ?', Date.now() - AUDIT_DAYS * 86_400_000);
}

export function registerAuditRoutes(api: Router) {
  pruneAudit();
  setInterval(pruneAudit, 6 * 3_600_000).unref();

  /**
   * As últimas entradas, da mais nova para a mais velha, 50 por vez (`before` = id da última que já veio).
   * Filtros: `action` (uma ação ou um grupo) e `actor` (id de quem fez).
   */
  api.get('/servers/:id/audit-log', (req, res) => {
    const server = requireServerPerm(req.params.id, uid(res), P.VIEW_AUDIT_LOG);
    const where = ['a.server_id = ?'];
    const params: (string | number)[] = [server.id];
    const before = Number(req.query.before);
    if (Number.isInteger(before) && before > 0) {
      where.push('a.id < ?');
      params.push(before);
    }
    const filter = req.query.action;
    const actions = isAuditAction(filter) ? [filter] : isAuditGroup(filter) ? actionsOf(filter) : null;
    if (actions) {
      where.push(`a.action IN (${actions.map(() => '?').join(', ')})`);
      params.push(...actions);
    }
    if (typeof req.query.actor === 'string' && req.query.actor) {
      where.push('a.actor_id = ?');
      params.push(req.query.actor);
    }
    const rows = all<AuditRow>(
      `SELECT a.*, u.display_name, u.avatar_url, u.avatar_color FROM audit_log a LEFT JOIN users u ON u.id = a.actor_id
       WHERE ${where.join(' AND ')} ORDER BY a.id DESC LIMIT ${PAGE + 1}`,
      ...params,
    );
    // quem aparece no registro (para o filtro "Quem fez"), dos últimos AUDIT_DAYS dias
    const actors = all<{ id: string; name: string }>(
      `SELECT a.actor_id AS id, COALESCE(u.display_name, MAX(a.actor_name)) AS name FROM audit_log a LEFT JOIN users u ON u.id = a.actor_id
       WHERE a.server_id = ? AND a.actor_id IS NOT NULL GROUP BY a.actor_id ORDER BY name COLLATE NOCASE`,
      server.id,
    );
    res.json({
      entries: rows.slice(0, PAGE).filter((r) => r.action in AUDIT_ACTIONS).map(entryJson),
      // para a próxima página: o `before` a mandar (null = acabou)
      next: rows.length > PAGE ? rows[PAGE - 1].id : null,
      actors,
      days: AUDIT_DAYS,
    });
  });
}
