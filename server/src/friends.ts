// Amigos (como no Discord): pedido de amizade pelo @usuário, lista de amigos e bloqueio.
// Cada pessoa tem a sua visão da relação, uma linha por lado: 'friend', 'outgoing' (eu pedi), 'incoming'
// (me pediram) ou 'blocked' (eu bloqueei). O bloqueio é de um lado só: quem foi bloqueado não fica sabendo.
import type { Router } from 'express';
import { all, get, run, tx, type UserRow } from './db.ts';
import { fail, humansOnly, str, uid } from './http.ts';
import { emitToUser } from './realtime.ts';
import { limiter } from './recovery.ts';

export type RelationType = 'friend' | 'outgoing' | 'incoming' | 'blocked';

/** Como `me` vê `other` (null = sem relação). */
export const relationOf = (me: string, other: string): RelationType | null =>
  get<{ type: RelationType }>('SELECT type FROM relationships WHERE user_id = ? AND other_id = ?', me, other)?.type ?? null;

export const areFriends = (a: string, b: string) => relationOf(a, b) === 'friend';

/** Um dos dois bloqueou o outro: sem DM nova, sem mensagem na DM, sem pedido. */
export const blockedBetween = (a: string, b: string) =>
  !!get("SELECT 1 FROM relationships WHERE type = 'blocked' AND ((user_id = ? AND other_id = ?) OR (user_id = ? AND other_id = ?))", a, b, b, a);

/** Amigos dos dois (para o "Em comum" do perfil). */
export const mutualFriends = (a: string, b: string) =>
  all<UserRow>(
    `SELECT u.* FROM relationships x JOIN relationships y ON y.other_id = x.other_id JOIN users u ON u.id = x.other_id
     WHERE x.user_id = ? AND x.type = 'friend' AND y.user_id = ? AND y.type = 'friend' ORDER BY u.display_name COLLATE NOCASE`,
    a,
    b,
  );

const setRelation = (me: string, other: string, type: RelationType) =>
  run(
    `INSERT INTO relationships (user_id, other_id, type, created_at) VALUES (?, ?, ?, ?)
     ON CONFLICT (user_id, other_id) DO UPDATE SET type = excluded.type, created_at = excluded.created_at`,
    me,
    other,
    type,
    Date.now(),
  );

/** Desfaz amizade/pedido dos dois lados, sem mexer num bloqueio. */
const clearPair = (a: string, b: string) =>
  run(
    "DELETE FROM relationships WHERE type != 'blocked' AND ((user_id = ? AND other_id = ?) OR (user_id = ? AND other_id = ?))",
    a,
    b,
    b,
    a,
  );

// 20 pedidos por hora: dá para adicionar a galera toda de uma vez, não dá para sair pedindo para todo mundo
const requestLimit = limiter(20, 60 * 60_000);

type RelationRow = UserRow & { rel_type: RelationType; rel_since: number };

export function registerFriendRoutes(api: Router, userJson: (u: UserRow) => unknown) {
  const itemJson = (r: RelationRow) => ({ user: userJson(r), type: r.rel_type, since: r.rel_since });
  const userRow = (id: string) => get<UserRow>('SELECT * FROM users WHERE id = ?', id);
  /** As listas dos dois lados mudaram: cada cliente recarrega a sua. */
  const changed = (...ids: string[]) => ids.forEach((id) => emitToUser(id, 'relationships:changed', {}));

  function accept(me: string, other: string) {
    tx(() => {
      setRelation(me, other, 'friend');
      setRelation(other, me, 'friend');
    });
    emitToUser(other, 'friend:accepted', { user: userJson(userRow(me)!) });
    changed(me, other);
  }

  api.get('/friends', humansOnly, (_req, res) => {
    const rows = all<RelationRow>(
      `SELECT u.*, r.type AS rel_type, r.created_at AS rel_since FROM relationships r JOIN users u ON u.id = r.other_id
       WHERE r.user_id = ? ORDER BY u.display_name COLLATE NOCASE`,
      uid(res),
    );
    res.json(rows.map(itemJson));
  });

  /** Pedido de amizade pelo @usuário (ou pelo id, nos botões do perfil). Se a pessoa já tinha pedido, vira amizade. */
  api.post('/friends', humansOnly, (req, res) => {
    const me = uid(res);
    // a mesma resposta para "não existe" e "bloqueou você": ninguém descobre que foi bloqueado
    const notFound = 'Não encontramos ninguém com esse nome de usuário. Confira se está escrito certinho.';
    const target =
      typeof req.body?.userId === 'string'
        ? userRow(req.body.userId)
        : get<UserRow>('SELECT * FROM users WHERE username = ?', str(req.body?.username, 'usuário', 1, 33).replace(/^@/, ''));
    if (!target || target.is_bot) fail(404, notFound);
    const other = target!.id;
    if (other === me) fail(400, 'Você não pode adicionar a si mesmo.');
    const mine = relationOf(me, other);
    if (mine === 'blocked') fail(400, 'Você bloqueou essa pessoa. Desbloqueie para mandar o pedido.');
    if (relationOf(other, me) === 'blocked') fail(404, notFound);
    if (mine === 'friend') fail(409, `Você e ${target!.display_name} já são amigos.`);
    if (mine === 'outgoing') fail(409, `Você já mandou um pedido para ${target!.display_name}.`);
    if (mine === 'incoming') {
      accept(me, other);
      return res.json({ type: 'friend', user: userJson(target!) });
    }
    if (!requestLimit(me)) fail(429, 'Você mandou muitos pedidos de amizade. Espere um pouco e tente de novo.');
    tx(() => {
      setRelation(me, other, 'outgoing');
      setRelation(other, me, 'incoming');
    });
    emitToUser(other, 'friend:request', { from: userJson(userRow(me)!) });
    changed(me, other);
    res.json({ type: 'outgoing', user: userJson(target!) });
  });

  api.post('/friends/:id/accept', humansOnly, (req, res) => {
    const me = uid(res);
    if (relationOf(me, req.params.id) !== 'incoming') fail(404, 'Esse pedido de amizade não existe mais.');
    accept(me, req.params.id);
    res.json({ ok: true });
  });

  /** Desfaz a amizade, cancela o pedido que eu mandei ou recusa o que recebi. */
  api.delete('/friends/:id', humansOnly, (req, res) => {
    const me = uid(res);
    const mine = relationOf(me, req.params.id);
    if (!mine || mine === 'blocked') fail(404, 'Vocês não são amigos.');
    clearPair(me, req.params.id);
    changed(me, req.params.id);
    res.json({ ok: true });
  });

  /** Bloquear: desfaz amizade e pedidos; a pessoa não consegue mais mandar pedido nem mensagem privada. */
  api.post('/friends/:id/block', humansOnly, (req, res) => {
    const me = uid(res);
    const other = req.params.id;
    if (other === me) fail(400, 'Você não pode bloquear a si mesmo.');
    if (!userRow(other)) fail(404, 'Usuário não encontrado');
    tx(() => {
      clearPair(me, other);
      setRelation(me, other, 'blocked');
    });
    changed(me, other);
    res.json({ ok: true });
  });

  api.delete('/friends/:id/block', humansOnly, (req, res) => {
    const me = uid(res);
    if (relationOf(me, req.params.id) !== 'blocked') fail(404, 'Essa pessoa não está bloqueada.');
    run('DELETE FROM relationships WHERE user_id = ? AND other_id = ?', me, req.params.id);
    changed(me);
    res.json({ ok: true });
  });
}
