// Rotas do Fator de Confiança (o cálculo e a máscara de permissões ficam em trust.ts).
import type { Router } from 'express';
import { P } from '../../shared/permissions.ts';
import { parseTrustRules } from '../../shared/trust.ts';
import { getChannel, requireServerPerm } from './access.ts';
import { all } from './db.ts';
import { fail, uid } from './http.ts';
import { resyncServerVoice, serverChanged } from './realtime.ts';
import { channelRulesOf, rulesOf, saveRules, trustOf } from './trust.ts';

export function registerTrustRoutes(api: Router) {
  /** A própria conta: o nível e a faixa (a nota exata e o que entrou nela, só a equipe vê). */
  api.get('/me/trust', (_req, res) => {
    const t = trustOf(uid(res)) ?? fail(404, 'Conta não encontrada');
    res.json({ level: t.level, band: t.band });
  });

  api.get('/servers/:id/trust-rules', (req, res) => {
    const server = requireServerPerm(req.params.id, uid(res), P.MANAGE_SERVER);
    const valid = new Set(all<{ id: string }>('SELECT id FROM channels WHERE server_id = ?', server.id).map((c) => c.id));
    const channels = Object.fromEntries(Object.entries(channelRulesOf(server.id)).filter(([id]) => valid.has(id)));
    res.json({ server: rulesOf(server.id), channels });
  });

  api.put('/servers/:id/trust-rules', (req, res) => {
    const me = uid(res);
    const server = requireServerPerm(req.params.id, me, P.MANAGE_SERVER);
    const rules = parseTrustRules(req.body?.rules, false);
    if (typeof rules === 'string') fail(400, rules);
    saveRules(server.id, null, rules as Exclude<typeof rules, string>, me);
    serverChanged(server.id);
    resyncServerVoice(server.id);
    res.json({ rules: rulesOf(server.id) });
  });

  /** As do canal e as do servidor (que valem junto: no canal vale a mais exigente). */
  api.get('/channels/:id/trust-rules', (req, res) => {
    const channel = getChannel(req.params.id);
    requireServerPerm(channel.server_id, uid(res), P.MANAGE_CHANNELS);
    res.json({ channel: rulesOf(channel.server_id, channel.id), server: rulesOf(channel.server_id) });
  });

  api.put('/channels/:id/trust-rules', (req, res) => {
    const me = uid(res);
    const channel = getChannel(req.params.id);
    requireServerPerm(channel.server_id, me, P.MANAGE_CHANNELS);
    const rules = parseTrustRules(req.body?.rules, true);
    if (typeof rules === 'string') fail(400, rules);
    saveRules(channel.server_id, channel.id, rules as Exclude<typeof rules, string>, me);
    serverChanged(channel.server_id);
    resyncServerVoice(channel.server_id);
    res.json({ rules: rulesOf(channel.server_id, channel.id) });
  });
}
