// Modo gravação: para gravar os vídeos do Concord, a equipe (ADMIN_USERS) liga numa sala de voz do servidor da
// equipe (AUTHORITY_SERVER_ID) e pode disparar, na hora, o que o app já faz no dia a dia: efeito de voz em alguém,
// tremer a tela de alguém. Quem está na sala vê o selo "Gravando" em cima do nome dela. Desliga sozinho depois
// de RECORDING_MS. Tudo fica em memória (reiniciar o servidor desliga) e cada ação vai para admin_actions.
import type { Router } from 'express';
import { isPrankEffect } from '../../shared/contracts.ts';
import { config } from './config.ts';
import { get, run, type ChannelRow, type UserRow } from './db.ts';
import { fail, uid } from './http.ts';
import { emitToUser, getVoiceState, serverChanged } from './realtime.ts';

export const RECORDING_MS = 3 * 60 * 60_000;
const FX_MIN_MS = 2_000;
const FX_MAX_MS = 15_000;

interface Recording {
  by: string;
  until: number;
  timer: ReturnType<typeof setTimeout>;
}
const recordings = new Map<string, Recording>(); // channelId -> gravação ligada

/** Estado de gravação da sala para o app (null quando desligada). */
export function recordingOf(channelId: string): { until: number } | null {
  const r = recordings.get(channelId);
  return r && r.until > Date.now() ? { until: r.until } : null;
}

function stop(channelId: string, serverId: string) {
  const r = recordings.get(channelId);
  if (!r) return;
  clearTimeout(r.timer);
  recordings.delete(channelId);
  serverChanged(serverId);
}

function audit(adminId: string, target: UserRow | { id: string; username: string }, action: string, reason: string | null) {
  run(
    'INSERT INTO admin_actions (admin_id, target_id, target_username, action, reason, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    adminId,
    target.id,
    target.username,
    action,
    reason,
    Date.now(),
  );
}

function requireDirector(me: string, channelId: string): ChannelRow {
  const u = get<UserRow>('SELECT * FROM users WHERE id = ?', me);
  if (!u || !config.adminUsers.has(u.username.toLowerCase())) fail(403, 'Só a equipe do Concord usa o modo gravação');
  const channel = get<ChannelRow>('SELECT * FROM channels WHERE id = ?', channelId) ?? fail(404, 'Sala não encontrada');
  if (channel!.type !== 'voice' || !config.authorityServerId || channel!.server_id !== config.authorityServerId) {
    fail(403, 'O modo gravação só vale nas salas de voz do servidor da equipe');
  }
  return channel!;
}

export function registerDirectorRoutes(api: Router) {
  /** Ligar ou desligar o modo gravação da sala. */
  api.post('/channels/:id/recording', (req, res) => {
    const me = uid(res);
    const channel = requireDirector(me, req.params.id);
    const on = req.body?.on === true;
    if (on) {
      const old = recordings.get(channel.id);
      if (old) clearTimeout(old.timer);
      const until = Date.now() + RECORDING_MS;
      const timer = setTimeout(() => stop(channel.id, channel.server_id), RECORDING_MS);
      timer.unref?.();
      recordings.set(channel.id, { by: me, until, timer });
      serverChanged(channel.server_id);
    } else {
      stop(channel.id, channel.server_id);
    }
    audit(me, { id: channel.id, username: `#${channel.name}` }, on ? 'recording_on' : 'recording_off', null);
    console.log(`[gravação] ${on ? 'ligada' : 'desligada'} em #${channel.name}`);
    res.json({ recording: recordingOf(channel.id) });
  });

  /** Disparar um efeito em quem está na sala, com o modo gravação ligado. */
  api.post('/channels/:id/director', (req, res) => {
    const me = uid(res);
    const channel = requireDirector(me, req.params.id);
    if (!recordingOf(channel.id)) fail(409, 'Ligue o modo gravação da sala antes');
    const target = get<UserRow>('SELECT * FROM users WHERE id = ?', String(req.body?.userId ?? '')) ?? fail(404, 'Pessoa não encontrada');
    if (getVoiceState(target!.id)?.channelId !== channel.id) fail(409, `@${target!.username} não está nesta sala`);
    const action = req.body?.action;
    if (action === 'fx') {
      const effect = req.body?.effect;
      if (!isPrankEffect(effect)) fail(400, 'Efeito inválido');
      const durationMs = Math.min(FX_MAX_MS, Math.max(FX_MIN_MS, Number(req.body?.durationMs) || 5_000));
      emitToUser(target!.id, 'voice:fx', { effect, durationMs, director: true });
      audit(me, target!, 'director_fx', `${effect} por ${Math.round(durationMs / 1000)} s em #${channel.name}`);
    } else if (action === 'shake') {
      emitToUser(target!.id, 'director:shake', {});
      audit(me, target!, 'director_shake', `#${channel.name}`);
    } else {
      fail(400, 'Ação inválida');
    }
    res.json({ ok: true });
  });
}
