// Notificações: o que cada pessoa ainda não leu e como ela quer ser avisada.
//
// - Leitura: guarda até que hora a pessoa leu cada canal (channel_reads). Ler no celular limpa no PC.
//   Canal nunca aberto conta a partir da entrada no servidor (entrar num servidor não deixa o histórico todo "novo").
// - Menções: cada @usuario, @todos (de quem pode) ou resposta vira uma linha em `mentions`, que some quando a pessoa
//   lê o canal. É o contador vermelho.
// - Nível: "todas as mensagens", "só menções" ou "nada", e silenciar até uma hora, por servidor ou por canal.
//   O app decide o som e o aviso com isso; o servidor só guarda (para valer em todos os aparelhos).
import type { Router } from 'express';
import { P, has } from '../../shared/permissions.ts';
import { channelPermissions, getChannel, isMember, requireChannelPerm } from './access.ts';
import { all, get, run, type ChannelRow } from './db.ts';
import { fail, uid } from './http.ts';
import { emitToUser } from './realtime.ts';

export type NotifyLevel = 'all' | 'mentions' | 'none';
const LEVELS = new Set<NotifyLevel>(['all', 'mentions', 'none']);
/** "até eu reativar": silencia até o ano 9999 */
export const MUTED_FOREVER = 253402300799000;
/** Marca o canal como lido até `at` (nunca volta para trás) e limpa as menções até ali. */
export function markRead(userId: string, channelId: string, at: number) {
  run(
    `INSERT INTO channel_reads (user_id, channel_id, last_read_at) VALUES (?, ?, ?)
     ON CONFLICT (user_id, channel_id) DO UPDATE SET last_read_at = MAX(last_read_at, excluded.last_read_at)`,
    userId,
    channelId,
    at,
  );
  run('DELETE FROM mentions WHERE user_id = ? AND channel_id = ? AND created_at <= ?', userId, channelId, at);
  const row = get<{ last_read_at: number }>('SELECT last_read_at FROM channel_reads WHERE user_id = ? AND channel_id = ?', userId, channelId)!;
  // os outros aparelhos da pessoa limpam a bolinha na hora
  emitToUser(userId, 'read:update', { channelId, lastReadAt: row.last_read_at });
  return row.last_read_at;
}

/** Guarda as menções de uma mensagem nova (chamado por quem já decidiu quem foi mencionado). */
export function recordMentions(channelId: string, messageId: string, createdAt: number, userIds: string[]) {
  for (const userId of userIds) {
    run('INSERT OR IGNORE INTO mentions (user_id, channel_id, message_id, created_at) VALUES (?, ?, ?, ?)', userId, channelId, messageId, createdAt);
  }
}

function levelsOf(userId: string) {
  const out: Record<string, { level: NotifyLevel | null; mutedUntil: number | null }> = {};
  for (const r of all<{ target_id: string; level: NotifyLevel | null; muted_until: number | null }>('SELECT * FROM notify_levels WHERE user_id = ?', userId)) {
    out[r.target_id] = { level: r.level, mutedUntil: r.muted_until };
  }
  return out;
}

export function registerUnreadRoutes(api: Router) {
  /** Tudo que a barra lateral precisa: por canal, a última mensagem de outra pessoa, até onde li e quantas menções. */
  api.get('/me/unreads', (_req, res) => {
    const me = uid(res);
    const reads = new Map(all<{ channel_id: string; last_read_at: number }>('SELECT channel_id, last_read_at FROM channel_reads WHERE user_id = ?', me).map((r) => [r.channel_id, r.last_read_at]));
    const mentionCounts = new Map(
      all<{ channel_id: string; n: number }>('SELECT channel_id, COUNT(*) AS n FROM mentions WHERE user_id = ? GROUP BY channel_id', me).map((r) => [r.channel_id, r.n]),
    );
    const channels: Record<string, { serverId: string; lastMessageAt: number; lastReadAt: number; mentions: number }> = {};
    for (const m of all<{ server_id: string; joined_at: number }>('SELECT server_id, joined_at FROM members WHERE user_id = ?', me)) {
      // fórum não tem mensagens de chat (os posts têm o próprio "novo")
      const visible = all<ChannelRow>("SELECT * FROM channels WHERE server_id = ? AND type != 'forum'", m.server_id).filter((c) =>
        has(channelPermissions(c, me), P.VIEW_CHANNEL),
      );
      if (!visible.length) continue;
      const last = new Map(
        all<{ channel_id: string; t: number }>(
          `SELECT channel_id, MAX(created_at) AS t FROM messages WHERE channel_id IN (${visible.map(() => '?').join(',')}) AND author_id != ? GROUP BY channel_id`,
          ...visible.map((c) => c.id),
          me,
        ).map((r) => [r.channel_id, r.t]),
      );
      for (const c of visible) {
        channels[c.id] = {
          serverId: m.server_id,
          lastMessageAt: last.get(c.id) ?? 0,
          lastReadAt: reads.get(c.id) ?? m.joined_at,
          mentions: mentionCounts.get(c.id) ?? 0,
        };
      }
    }
    res.json({ channels, levels: levelsOf(me) });
  });

  api.post('/channels/:id/read', (req, res) => {
    const me = uid(res);
    const channel = requireChannelPerm(req.params.id, me, P.VIEW_CHANNEL);
    // "li até a mensagem X": não aceita hora no futuro (senão a bolinha das próximas nunca acenderia)
    const asked = Number(req.body?.at);
    const at = Number.isFinite(asked) && asked > 0 ? Math.min(asked, Date.now()) : Date.now();
    res.json({ lastReadAt: markRead(me, channel.id, at) });
  });

  /** Nível de aviso de um servidor (de que sou membro) ou de um canal (que eu vejo). level/mutedUntil null = herdar. */
  api.put('/me/notify-levels/:targetId', (req, res) => {
    const me = uid(res);
    const targetId = String(req.params.targetId).slice(0, 64);
    const isServer = isMember(targetId, me);
    if (!isServer) {
      const channel = get<ChannelRow>('SELECT * FROM channels WHERE id = ?', targetId);
      if (!channel || !has(channelPermissions(getChannel(channel.id), me), P.VIEW_CHANNEL)) fail(404, 'Servidor ou canal não encontrado');
    }
    const rawLevel = req.body?.level;
    if (rawLevel !== null && rawLevel !== undefined && !LEVELS.has(rawLevel)) fail(400, 'Nível inválido');
    const level = (rawLevel ?? null) as NotifyLevel | null;
    const rawMuted = req.body?.mutedUntil;
    let mutedUntil: number | null = null;
    if (rawMuted !== null && rawMuted !== undefined) {
      const n = Number(rawMuted);
      if (!Number.isFinite(n)) fail(400, 'Prazo inválido');
      mutedUntil = n > Date.now() ? Math.min(n, MUTED_FOREVER) : null;
    }
    if (level === null && mutedUntil === null) {
      run('DELETE FROM notify_levels WHERE user_id = ? AND target_id = ?', me, targetId);
    } else {
      run(
        `INSERT INTO notify_levels (user_id, target_id, level, muted_until) VALUES (?, ?, ?, ?)
         ON CONFLICT (user_id, target_id) DO UPDATE SET level = excluded.level, muted_until = excluded.muted_until`,
        me,
        targetId,
        level,
        mutedUntil,
      );
    }
    emitToUser(me, 'notify-levels:update', { targetId, level, mutedUntil });
    res.json({ level, mutedUntil });
  });
}
