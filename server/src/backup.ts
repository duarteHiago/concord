// Backup diário do banco, em data/backups/concord-AAAA-MM-DD.db.gz (ver README > Backup e restauração).
// A cópia é online, pela API de backup do SQLite, numa worker thread com conexão própria: o node:sqlite é
// síncrono, e copiar ou conferir o banco na thread principal travaria o app inteiro enquanto durasse.
import { createReadStream, createWriteStream, mkdirSync, readdirSync, renameSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Worker } from 'node:worker_threads';
import { createGzip } from 'node:zlib';
import { config } from './config.ts';

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

/** Confere de meia em meia hora: passou da hora do backup (UTC) e ainda não tem o de hoje, faz. */
export function scheduleBackups() {
  if (config.backup.keep <= 0) return;
  const check = () => {
    const now = new Date();
    if (now.getUTCHours() < config.backup.hourUtc) return;
    const today = now.toISOString().slice(0, 10);
    if (listBackups().some((b) => b.day === today)) return;
    const start = performance.now();
    backupNow().then(
      (file) => console.log(`[backup] ${file} (${((performance.now() - start) / 1000).toFixed(1)} s)`),
      (err) => console.error('[backup] falhou:', err),
    );
  };
  setTimeout(check, 60_000).unref();
  setInterval(check, 30 * 60_000).unref();
}
