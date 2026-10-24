// Diagnósticos enviados pelo app: a pessoa grava na janela de diagnóstico (client/src/lib/devRecording.ts)
// e escolhe mandar para a equipe. Chega compactado (gzip); guardamos o arquivo do jeito que veio, fora de
// /uploads, e só o resumo no banco. Quem lê é o portal da equipe (admin.ts). Some sozinho depois de 90 dias.
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import express, { type Router } from 'express';
import { config } from './config.ts';
import { all, run } from './db.ts';
import { fail, humansOnly, uid } from './http.ts';
import { limiter } from './recovery.ts';

export const DIAGNOSTIC_RETENTION_DAYS = 90;
const MAX_COMPRESSED = 8 * 1024 * 1024;
// 3 h de leituras a cada 2 s dão uns poucos MB; isso só barra arquivo que não é diagnóstico
const MAX_JSON = 80 * 1024 * 1024;

mkdirSync(config.diagnosticsDir, { recursive: true });

const fileOf = (id: string) => join(config.diagnosticsDir, `${id}.json.gz`);

export function readDiagnostic(id: string): Buffer | null {
  try {
    return readFileSync(fileOf(id));
  } catch {
    return null;
  }
}

export function deleteDiagnostic(id: string) {
  run('DELETE FROM diagnostics WHERE id = ?', id);
  rmSync(fileOf(id), { force: true });
}

function cleanup() {
  const old = Date.now() - DIAGNOSTIC_RETENTION_DAYS * 86_400_000;
  for (const { id } of all<{ id: string }>('SELECT id FROM diagnostics WHERE created_at < ?', old)) deleteDiagnostic(id);
}
cleanup();
setInterval(cleanup, 6 * 3_600_000).unref();

const time = (v: unknown) => {
  const t = typeof v === 'string' ? Date.parse(v) : NaN;
  return Number.isFinite(t) ? t : fail(400, 'Arquivo de diagnóstico inválido');
};

// gravar e mandar leva minutos; mais que isso por hora é engano ou abuso
const allowSend = limiter(6, 3_600_000);

export function registerDiagnosticRoutes(api: Router) {
  api.post('/diagnostics', humansOnly, express.raw({ type: () => true, limit: MAX_COMPRESSED }), (req, res) => {
    const me = uid(res);
    if (!allowSend(me)) fail(429, 'Você já mandou vários diagnósticos agora há pouco. Tente de novo daqui a pouco.');
    const body = req.body as Buffer;
    if (!Buffer.isBuffer(body) || body.length === 0) fail(400, 'Arquivo de diagnóstico vazio');

    type Env = { mode?: unknown; clientCommit?: unknown; userAgent?: unknown };
    let data: { format?: unknown; startedAt?: unknown; endedAt?: unknown; samples?: unknown; markers?: unknown; environment?: Env | null };
    try {
      data = JSON.parse(gunzipSync(body, { maxOutputLength: MAX_JSON }).toString('utf8'));
    } catch {
      return fail(400, 'Arquivo de diagnóstico inválido');
    }
    if (data?.format !== 'concord-diagnostico/1' || !Array.isArray(data.samples) || !Array.isArray(data.markers)) {
      fail(400, 'Arquivo de diagnóstico inválido');
    }

    const header = req.headers['x-diagnostic-note'];
    let note = '';
    try {
      note = typeof header === 'string' ? decodeURIComponent(header).trim().slice(0, 1000) : '';
    } catch {
      // nota mal codificada: manda sem
    }
    const env: Env = data.environment ?? {};
    const text = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : null);

    // lê as datas antes de gravar: arquivo com data quebrada nem chega ao disco
    const startedAt = time(data.startedAt);
    const endedAt = time(data.endedAt);
    const id = randomUUID();
    writeFileSync(fileOf(id), body);
    run(
      `INSERT INTO diagnostics (id, user_id, note, started_at, ended_at, samples, markers, mode, client_commit, user_agent, size, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      me,
      note,
      startedAt,
      endedAt,
      (data.samples as unknown[]).length,
      (data.markers as unknown[]).length,
      text(env.mode, 16),
      text(env.clientCommit, 40),
      text(env.userAgent, 400),
      body.length,
      Date.now(),
    );
    res.status(201).json({ id });
  });
}
