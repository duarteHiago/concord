// Backup diário do banco, em data/backups/concord-AAAA-MM-DD.db.gz (ver README > Backup e restauração).
// A cópia é online, pela API de backup do SQLite, numa worker thread com conexão própria: o node:sqlite é
// síncrono, e copiar ou conferir o banco na thread principal travaria o app inteiro enquanto durasse.
import { createReadStream, createWriteStream, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Worker } from 'node:worker_threads';
import { createGzip } from 'node:zlib';
import { config } from './config.ts';
import { offsiteEnabled, syncUploads, uploadBackup } from './offsite.ts';

const NAME = /^concord-(\d{4}-\d{2}-\d{2})\.db\.gz$/;

// copia o banco para dest e confere a cópia antes de ela virar backup (um backup corrompido é pior que nenhum).
// import() funciona tanto se o código for lido como CommonJS quanto como módulo.
const WORKER = `
(async () => {
  const { workerData } = await import('node:worker_threads');
  const { DatabaseSync, backup } = await import('node:sqlite');
  const src = new DatabaseSync(workerData.src, { readOnly: true });
  // tudo num passo só: em passos, qualquer escrita do servidor no meio recomeça a cópia do zero, e com o
  // banco movimentado ela poderia nunca acabar. Em WAL essa leitura não segura quem está escrevendo.
  try { await backup(src, workerData.dest, { rate: 2147483647 }); } finally { src.close(); }
  const copy = new DatabaseSync(workerData.dest);
  try {
    // o arquivo restaurado fica sozinho, sem -wal/-shm do lado
    copy.exec('PRAGMA journal_mode = DELETE');
    const { integrity_check } = copy.prepare('PRAGMA integrity_check').get();
    if (integrity_check !== 'ok') throw new Error('cópia falhou no integrity_check: ' + integrity_check);
  } finally { copy.close(); }
})();
`;

function copyDatabase(dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(WORKER, { eval: true, workerData: { src: config.dbPath, dest } });
    worker.once('error', reject);
    worker.once('exit', (code) => (code === 0 ? resolve() : reject(new Error(`backup terminou com código ${code}`))));
  });
}

/** Backups guardados, do mais antigo para o mais novo. */
export function listBackups(): { file: string; day: string; size: number; mtimeMs: number }[] {
  let names: string[];
  try {
    names = readdirSync(config.backup.dir);
  } catch {
    return [];
  }
  return names
    .filter((n) => NAME.test(n))
    .sort()
    .map((n) => {
      const file = join(config.backup.dir, n);
      const { size, mtimeMs } = statSync(file);
      return { file, day: NAME.exec(n)![1], size, mtimeMs };
    });
}

let running: Promise<string> | null = null;

/** Faz o backup de hoje (substitui o de hoje, se já houver) e apaga os que passaram de BACKUP_KEEP. */
export function backupNow(): Promise<string> {
  running ??= (async () => {
    mkdirSync(config.backup.dir, { recursive: true });
    const day = new Date().toISOString().slice(0, 10);
    const tmp = join(config.backup.dir, `.concord-${day}.db.tmp`);
    const final = join(config.backup.dir, `concord-${day}.db.gz`);
    rmSync(tmp, { force: true });
    try {
      await copyDatabase(tmp);
      await pipeline(createReadStream(tmp), createGzip(), createWriteStream(`${final}.part`));
      renameSync(`${final}.part`, final);
    } finally {
      rmSync(tmp, { force: true });
      rmSync(`${final}.part`, { force: true });
    }
    const all = listBackups();
    for (const old of all.slice(0, Math.max(0, all.length - config.backup.keep))) rmSync(old.file, { force: true });
    return final;
  })().finally(() => {
    running = null;
  });
  return running;
}

// dia do último backup que chegou no bucket (ver offsite.ts); o mtime do arquivo diz quando
const offsiteMark = () => join(config.backup.dir, '.offsite');

export function lastOffsite(): { day: string; mtimeMs: number } | null {
  try {
    return { day: readFileSync(offsiteMark(), 'utf8').trim(), mtimeMs: statSync(offsiteMark()).mtimeMs };
  } catch {
    return null;
  }
}

/** Manda o backup para o bucket, se houver um configurado. */
export async function sendOffsite(file: string): Promise<boolean> {
  if (!offsiteEnabled()) return false;
  await uploadBackup(file);
  writeFileSync(offsiteMark(), NAME.exec(basename(file))![1]);
  return true;
}

/**
 * Confere de meia em meia hora: passou da hora do backup (UTC) e ainda não tem o de hoje, faz. Se o envio
 * para o bucket falhou (rede, bucket fora do ar), a próxima conferência tenta de novo só o envio.
 */
export function scheduleBackups() {
  if (config.backup.keep <= 0) return;
  let busy = false;
  const check = async () => {
    const now = new Date();
    if (busy || now.getUTCHours() < config.backup.hourUtc) return;
    const today = now.toISOString().slice(0, 10);
    let file = listBackups().find((b) => b.day === today)?.file;
    if (file && (!offsiteEnabled() || lastOffsite()?.day === today)) return;
    busy = true;
    try {
      if (!file) {
        const start = performance.now();
        file = await backupNow();
        console.log(`[backup] ${file} (${((performance.now() - start) / 1000).toFixed(1)} s)`);
      }
      if (await sendOffsite(file)) console.log(`[backup] ${basename(file)} enviado para o bucket ${config.backup.s3.bucket}`);
    } catch (err) {
      console.error('[backup] falhou:', err);
    } finally {
      busy = false;
    }
  };
  // o espelho dos arquivos enviados não espera a hora do backup: um arquivo apagado no app sai logo do bucket
  let syncing = false;
  const sync = async () => {
    if (syncing || !offsiteEnabled()) return;
    syncing = true;
    try {
      const { sent, deleted } = await syncUploads();
      if (sent || deleted) console.log(`[backup] uploads no bucket: ${sent} enviado(s), ${deleted} apagado(s)`);
    } catch (err) {
      console.error('[backup] espelho dos uploads falhou:', err);
    } finally {
      syncing = false;
    }
  };
  setTimeout(check, 60_000).unref();
  setInterval(check, 30 * 60_000).unref();
  setTimeout(sync, 2 * 60_000).unref();
  setInterval(sync, 30 * 60_000).unref();
}
