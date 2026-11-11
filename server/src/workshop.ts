// Oficina do servidor: rascunho, publicação e o Mural com widgets. Por enquanto só existe no Concord de testes
// (STAGING=true): fora dele as rotas respondem 404, como se não existissem.
//
// O que fica salvo é só o JSON validado por shared/workshop.ts (escolhas em listas fechadas, textos curtos e
// números com limite). Nada de CSS, HTML ou script: o cliente desenha tudo com componentes próprios.
import express, { type NextFunction, type Request, type Response, type Router } from 'express';
import { P, has } from '../../shared/permissions.ts';
import { canPublishWorkshop, isBlock, parseWorkshop, type WidgetPlacement, type WorkshopConfig } from '../../shared/workshop.ts';
import { requireMember, requireServerPerm, serverPermissions } from './access.ts';
import { config } from './config.ts';
import { all, get, run } from './db.ts';
import { fail, humansOnly, uid } from './http.ts';
import { emitToServer } from './realtime.ts';
import { limiter } from './recovery.ts';
import { saveImage } from './uploads.ts';

interface WorkshopRow {
  server_id: string;
  draft: string | null;
  published: string | null;
  updated_at: number;
  published_at: number | null;
}

export const workshopEnabled = () => config.staging || process.env.WORKSHOP === 'true';

function onlyWhenEnabled(_req: Request, _res: Response, next: NextFunction) {
  if (!workshopEnabled()) fail(404, 'Não encontrado');
  next();
}

const parseStored = (json: string | null): WorkshopConfig | null => {
  if (!json) return null;
  try {
    // o que está no banco já passou pela validação; parse de novo só por segurança (versões futuras)
    const r = parseWorkshop(JSON.parse(json), Date.now());
    return r.ok ? r.value : null;
  } catch {
    return null;
  }
};

const rowOf = (serverId: string) => get<WorkshopRow>('SELECT * FROM server_workshop WHERE server_id = ?', serverId);

/** Valida e confere o que depende do servidor (os atalhos só podem apontar para canais daqui). */
function validFor(serverId: string, body: unknown): WorkshopConfig {
  const r = parseWorkshop(body);
  if (!r.ok) fail(400, r.error);
  const value = (r as { ok: true; value: WorkshopConfig }).value;
  const channels = new Set(all<{ id: string }>('SELECT id FROM channels WHERE server_id = ?', serverId).map((c) => c.id));
  const screenWidgets = (value.screen?.items ?? []).filter((i): i is WidgetPlacement => !isBlock(i));
  for (const w of [...value.mural.widgets, ...screenWidgets]) {
    if (w.type === 'channels' && w.props.channelIds.some((id) => !channels.has(id))) fail(400, 'Um atalho aponta para um canal que não é deste servidor');
    if (w.type === 'image' && w.props.url && !w.props.url.startsWith(`/uploads/workshop/${serverId}-`)) fail(400, 'A imagem precisa ser enviada pela Oficina deste servidor');
  }
  return value;
}

function saveDraft(serverId: string, value: WorkshopConfig) {
  const json = JSON.stringify(value);
  run(
    `INSERT INTO server_workshop (server_id, draft, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(server_id) DO UPDATE SET draft = excluded.draft, updated_at = excluded.updated_at`,
    serverId,
    json,
    Date.now(),
  );
}

function publish(serverId: string, value: WorkshopConfig | null) {
  const now = Date.now();
  run(
    `INSERT INTO server_workshop (server_id, published, updated_at, published_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(server_id) DO UPDATE SET published = excluded.published, updated_at = excluded.updated_at, published_at = excluded.published_at`,
    serverId,
    value ? JSON.stringify(value) : null,
    now,
    value ? now : null,
  );
  emitToServer(serverId, 'workshop:changed', { serverId, config: value });
}

const draftRate = limiter(240, 60 * 60_000);
const publishRate = limiter(30, 60 * 60_000);
const imageRate = limiter(20, 60 * 60_000);
const pomodoroRate = limiter(30, 10 * 60_000);
const imageBody = express.raw({ type: () => true, limit: '5mb' });

export function registerWorkshopRoutes(api: Router) {
  /** As versões publicadas de todos os servidores da pessoa (o ícone animado aparece na barra de cima). */
  api.get('/workshop', onlyWhenEnabled, (_req, res) => {
    const rows = all<{ server_id: string; published: string }>(
      'SELECT w.server_id, w.published FROM server_workshop w JOIN members m ON m.server_id = w.server_id WHERE m.user_id = ? AND w.published IS NOT NULL',
      uid(res),
    );
    res.json(Object.fromEntries(rows.map((r) => [r.server_id, parseStored(r.published)]).filter(([, v]) => v)));
  });

  /** Membro vê o publicado; quem gerencia vê também o rascunho. */
  api.get('/servers/:id/workshop', onlyWhenEnabled, (req, res) => {
    const me = uid(res);
    const server = requireMember(String(req.params.id), me);
    const canManage = has(serverPermissions(server.id, me), P.MANAGE_SERVER);
    const row = rowOf(server.id);
    res.json({
      published: parseStored(row?.published ?? null),
      publishedAt: row?.published_at ?? null,
      ...(canManage ? { draft: parseStored(row?.draft ?? null), updatedAt: row?.updated_at ?? null, canPublish: canPublishWorkshop({ canManage }) } : {}),
    });
  });

  /** Rascunho: grátis e sem limite de testes (só um freio contra flood). */
  api.put('/servers/:id/workshop/draft', onlyWhenEnabled, humansOnly, (req, res) => {
    const server = requireServerPerm(String(req.params.id), uid(res), P.MANAGE_SERVER);
    if (!draftRate(server.id)) fail(429, 'Muitas alterações seguidas. Espere um pouco.');
    const value = validFor(server.id, req.body);
    saveDraft(server.id, value);
    res.json({ draft: value });
  });

  /** Publicar para os membros. O boost vai entrar em canPublishWorkshop. */
  api.post('/servers/:id/workshop/publish', onlyWhenEnabled, humansOnly, (req, res) => {
    const me = uid(res);
    const server = requireServerPerm(String(req.params.id), me, P.MANAGE_SERVER);
    if (!canPublishWorkshop({ canManage: true })) fail(402, 'Publicar a Oficina precisa de boost no servidor');
    if (!publishRate(server.id)) fail(429, 'Muitas publicações seguidas. Espere um pouco.');
    const value = validFor(server.id, req.body);
    saveDraft(server.id, value);
    publish(server.id, value);
    res.json({ published: value });
  });

  /** Tirar do ar: os membros voltam ao visual padrão. O rascunho continua guardado. */
  api.delete('/servers/:id/workshop/published', onlyWhenEnabled, humansOnly, (req, res) => {
    const server = requireServerPerm(String(req.params.id), uid(res), P.MANAGE_SERVER);
    publish(server.id, null);
    res.json({ ok: true });
  });

  /** Imagem para o widget de imagem. Fica em /uploads/workshop/<servidor>-... (o validador confere o prefixo). */
  api.post('/servers/:id/workshop/image', onlyWhenEnabled, humansOnly, imageBody, (req, res) => {
    const server = requireServerPerm(String(req.params.id), uid(res), P.MANAGE_SERVER);
    if (!imageRate(server.id)) fail(429, 'Muitas imagens em pouco tempo. Espere um pouco.');
    res.json({ url: saveImage('workshop', server.id, req.body) });
  });

  /** Pomodoro da sala: qualquer membro começa ou para, e todo mundo vê o mesmo relógio. */
  api.post('/servers/:id/workshop/pomodoro/:widgetId', onlyWhenEnabled, humansOnly, (req, res) => {
    const server = requireMember(String(req.params.id), uid(res));
    if (!pomodoroRate(server.id)) fail(429, 'Calma: o pomodoro foi mexido muitas vezes agora.');
    const row = rowOf(server.id);
    const current = parseStored(row?.published ?? null) ?? fail(404, 'O Mural deste servidor não está publicado');
    const startedAt = req.body?.start === true ? Date.now() : null;
    let found = false;
    const widgets = current.mural.widgets.map((w) => {
      if (w.id !== String(req.params.widgetId) || w.type !== 'pomodoro') return w;
      found = true;
      return { ...w, props: { ...w.props, startedAt } };
    });
    if (!found) fail(404, 'Pomodoro não encontrado');
    const next: WorkshopConfig = { ...current, mural: { ...current.mural, widgets } };
    run('UPDATE server_workshop SET published = ? WHERE server_id = ?', JSON.stringify(next), server.id);
    emitToServer(server.id, 'workshop:changed', { serverId: server.id, config: next });
    res.json({ published: next });
  });
}
