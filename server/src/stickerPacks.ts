// Figurinhas do chat: packs que cada pessoa importa (do WhatsApp, por exemplo) e manda nas conversas.
// O pack é de quem importou (só essa pessoa edita); outras pessoas podem salvá-lo na própria biblioteca
// a partir de uma figurinha que receberam. O pack some quando ninguém mais o tem.
import { randomUUID } from 'node:crypto';
import express, { type Router } from 'express';
import { MAX_PACK_STICKERS, MAX_STICKER_PACKS } from '../../shared/cosmetics.ts';
import { all, get, run, tx, type PackStickerRow, type StickerPackRow } from './db.ts';
import { fail, humansOnly, str, uid } from './http.ts';
import { emitToUser } from './realtime.ts';
import { removeUpload, saveImage } from './uploads.ts';

const now = () => Date.now();
// o limite de verdade (1 MB) é conferido em saveImage; aqui só não deixa o corpo crescer sem fim
const imageBody = express.raw({ type: () => true, limit: '2mb' });

function packJson(p: StickerPackRow, me: string) {
  const stickers = all<PackStickerRow>('SELECT * FROM pack_stickers WHERE pack_id = ? ORDER BY position', p.id);
  return { id: p.id, name: p.name, author: p.author, mine: p.owner_id === me, stickers: stickers.map((s) => ({ id: s.id, url: s.url })) };
}

const getPack = (id: string) => get<StickerPackRow>('SELECT * FROM sticker_packs WHERE id = ?', id) ?? fail(404, 'Pack não encontrado');

function requireOwnPack(id: string, me: string) {
  const pack = getPack(id);
  if (pack.owner_id !== me) fail(403, 'Só quem importou o pack pode mudar ele');
  return pack;
}

const inLibrary = (packId: string, userId: string) => !!get('SELECT 1 FROM user_sticker_packs WHERE pack_id = ? AND user_id = ?', packId, userId);

/** Avisa todo mundo que tem o pack (a biblioteca de cada um recarrega, inclusive nos outros aparelhos). */
function packChanged(packId: string, also?: string) {
  const users = all<{ user_id: string }>('SELECT user_id FROM user_sticker_packs WHERE pack_id = ?', packId).map((r) => r.user_id);
  for (const u of new Set([...users, ...(also ? [also] : [])])) emitToUser(u, 'sticker-packs:changed', {});
}

/** Apaga packs que ninguém mais tem. Figurinhas já mandadas mantêm o arquivo, para as conversas antigas. */
function sweepOrphanPacks() {
  const orphans = all<{ id: string }>('SELECT id FROM sticker_packs WHERE id NOT IN (SELECT pack_id FROM user_sticker_packs)');
  for (const { id } of orphans) {
    for (const s of all<PackStickerRow>('SELECT * FROM pack_stickers WHERE pack_id = ? AND used = 0', id)) removeUpload(s.url);
    run('DELETE FROM sticker_packs WHERE id = ?', id);
  }
}
// contas apagadas levam a biblioteca junto, mas não os packs
setInterval(sweepOrphanPacks, 60 * 60_000).unref();

/** Figurinha que a pessoa pode mandar (está num pack da biblioteca dela); marca como usada. */
export function stickerMessageData(rawId: unknown, me: string) {
  const id = str(rawId, 'figurinha', 1, 64);
  const row = get<{ id: string; url: string; pack_id: string; name: string }>(
    `SELECT s.id, s.url, s.pack_id, p.name FROM pack_stickers s
       JOIN sticker_packs p ON p.id = s.pack_id
       JOIN user_sticker_packs l ON l.pack_id = s.pack_id AND l.user_id = ?
     WHERE s.id = ?`,
    me,
    id,
  ) ?? fail(404, 'Figurinha não encontrada');
  run('UPDATE pack_stickers SET used = 1 WHERE id = ?', row.id);
  return { stickerId: row.id, packId: row.pack_id, packName: row.name, url: row.url };
}

/** Texto da mensagem de figurinha: aparece em notificações e no resumo das conversas. */
export const STICKER_MESSAGE_TEXT = '🖼️ Figurinha';

export function registerStickerPackRoutes(api: Router) {
  api.get('/me/sticker-packs', (_req, res) => {
    const me = uid(res);
    const packs = all<StickerPackRow>(
      'SELECT p.* FROM sticker_packs p JOIN user_sticker_packs l ON l.pack_id = p.id WHERE l.user_id = ? ORDER BY l.added_at',
      me,
    );
    res.json(packs.map((p) => packJson(p, me)));
  });

  /** Cria um pack vazio na biblioteca; as figurinhas sobem uma a uma em seguida. */
  api.post('/sticker-packs', humansOnly, (req, res) => {
    const me = uid(res);
    const name = str(req.body?.name, 'nome do pack', 1, 40);
    const author = typeof req.body?.author === 'string' ? req.body.author.trim().slice(0, 60) : '';
    const count = get<{ n: number }>('SELECT COUNT(*) AS n FROM user_sticker_packs WHERE user_id = ?', me)!.n;
    if (count >= MAX_STICKER_PACKS) fail(400, `Você já tem ${MAX_STICKER_PACKS} packs. Remova algum antes.`);
    const pack: StickerPackRow = { id: randomUUID(), owner_id: me, name, author, created_at: now() };
    tx(() => {
      run('INSERT INTO sticker_packs (id, owner_id, name, author, created_at) VALUES (?, ?, ?, ?, ?)', pack.id, me, name, author, pack.created_at);
      run('INSERT INTO user_sticker_packs (user_id, pack_id, added_at) VALUES (?, ?, ?)', me, pack.id, now());
    });
    emitToUser(me, 'sticker-packs:changed', {});
    res.json(packJson(pack, me));
  });

  api.get('/sticker-packs/:id', (req, res) => {
    const me = uid(res);
    const pack = getPack(req.params.id);
    res.json({ ...packJson(pack, me), saved: inLibrary(pack.id, me) });
  });

  api.patch('/sticker-packs/:id', (req, res) => {
    const me = uid(res);
    const pack = requireOwnPack(req.params.id, me);
    const name = str(req.body?.name, 'nome do pack', 1, 40);
    run('UPDATE sticker_packs SET name = ? WHERE id = ?', name, pack.id);
    packChanged(pack.id);
    res.json(packJson({ ...pack, name }, me));
  });

  api.post('/sticker-packs/:id/stickers', humansOnly, imageBody, (req, res) => {
    const me = uid(res);
    const pack = requireOwnPack(req.params.id, me);
    const last = get<{ n: number; pos: number | null }>('SELECT COUNT(*) AS n, MAX(position) AS pos FROM pack_stickers WHERE pack_id = ?', pack.id)!;
    if (last.n >= MAX_PACK_STICKERS) fail(400, `Um pack pode ter até ${MAX_PACK_STICKERS} figurinhas`);
    const sticker: PackStickerRow = { id: randomUUID(), pack_id: pack.id, url: saveImage('packs', me, req.body), position: (last.pos ?? -1) + 1, used: 0, created_at: now() };
    run(
      'INSERT INTO pack_stickers (id, pack_id, url, position, created_at) VALUES (?, ?, ?, ?, ?)',
      sticker.id,
      pack.id,
      sticker.url,
      sticker.position,
      sticker.created_at,
    );
    // durante uma importação chega um aviso por figurinha; o app junta tudo numa recarga só
    packChanged(pack.id);
    res.json({ id: sticker.id, url: sticker.url });
  });

  api.delete('/sticker-packs/:id/stickers/:sid', (req, res) => {
    const me = uid(res);
    const pack = requireOwnPack(req.params.id, me);
    const s = get<PackStickerRow>('SELECT * FROM pack_stickers WHERE id = ? AND pack_id = ?', req.params.sid, pack.id) ?? fail(404, 'Figurinha não encontrada');
    run('DELETE FROM pack_stickers WHERE id = ?', s.id);
    if (!s.used) removeUpload(s.url);
    packChanged(pack.id);
    res.json({ ok: true });
  });

  /** Salva na biblioteca o pack de uma figurinha que a pessoa recebeu. */
  api.post('/sticker-packs/:id/save', humansOnly, (req, res) => {
    const me = uid(res);
    const pack = getPack(req.params.id);
    if (!inLibrary(pack.id, me)) {
      const count = get<{ n: number }>('SELECT COUNT(*) AS n FROM user_sticker_packs WHERE user_id = ?', me)!.n;
      if (count >= MAX_STICKER_PACKS) fail(400, `Você já tem ${MAX_STICKER_PACKS} packs. Remova algum antes.`);
      run('INSERT INTO user_sticker_packs (user_id, pack_id, added_at) VALUES (?, ?, ?)', me, pack.id, now());
    }
    emitToUser(me, 'sticker-packs:changed', {});
    res.json(packJson(pack, me));
  });

  /** Tira o pack da biblioteca. Se ninguém mais tiver, ele é apagado. */
  api.delete('/sticker-packs/:id', (req, res) => {
    const me = uid(res);
    run('DELETE FROM user_sticker_packs WHERE pack_id = ? AND user_id = ?', req.params.id, me);
    sweepOrphanPacks();
    emitToUser(me, 'sticker-packs:changed', {});
    res.json({ ok: true });
  });
}
