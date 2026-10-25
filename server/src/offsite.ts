// Cópia dos backups para fora da VPS (ver backup.ts), num bucket compatível com S3: Cloudflare R2, Backblaze B2,
// MinIO... Requisições assinadas com AWS Signature V4, sem SDK. Sem BACKUP_S3_BUCKET, fica tudo só no disco da VPS.
// No bucket: db/ (um backup do banco por dia; o ciclo de vida do bucket apaga os antigos, ver README) e uploads/
// (espelho de data/uploads: arquivo novo vai, arquivo apagado no app sai de lá também).
import { createHash, createHmac } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { basename, join, relative, sep } from 'node:path';
import { config } from './config.ts';

export const offsiteEnabled = () => {
  const s = config.backup.s3;
  return !!(s.endpoint && s.bucket && s.accessKey && s.secret);
};

const sha256 = (data: string | Buffer) => createHash('sha256').update(data).digest('hex');
const hmac = (key: string | Buffer, data: string) => createHmac('sha256', key).update(data).digest();

/** Uma requisição ao bucket. `key` é o caminho do objeto (ex.: "db/concord-2026-10-24.db.gz"). */
async function s3(method: 'PUT' | 'DELETE', key: string, body?: Buffer<ArrayBuffer>, contentType = 'application/octet-stream') {
  const { endpoint, bucket, region, accessKey, secret } = config.backup.s3;
  const path = [bucket, ...key.split('/')].map(encodeURIComponent).join('/');
  const url = new URL(`${endpoint.replace(/\/+$/, '')}/${path}`);
  const amzDate = new Date().toISOString().replace(/[-:]|\.\d{3}/g, ''); // 20261024T060000Z
  const day = amzDate.slice(0, 8);
  const payloadHash = sha256(body ?? '');

  const headers: Record<string, string> = { host: url.host, 'x-amz-content-sha256': payloadHash, 'x-amz-date': amzDate };
  const signed = Object.keys(headers).sort();
  const canonical = [method, url.pathname, '', ...signed.map((h) => `${h}:${headers[h]}`), '', signed.join(';'), payloadHash].join('\n');
  const scope = `${day}/${region}/s3/aws4_request`;
  const toSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256(canonical)].join('\n');
  const signingKey = hmac(hmac(hmac(hmac(`AWS4${secret}`, day), region), 's3'), 'aws4_request');
  const signature = createHmac('sha256', signingKey).update(toSign).digest('hex');

  const res = await fetch(url, {
    method,
    body,
    signal: AbortSignal.timeout(10 * 60_000),
    headers: {
      ...headers,
      ...(body ? { 'content-type': contentType } : {}),
      authorization: `AWS4-HMAC-SHA256 Credential=${accessKey}/${scope}, SignedHeaders=${signed.join(';')}, Signature=${signature}`,
    },
  });
  // apagar o que já não existe também é sucesso
  if (!res.ok && !(method === 'DELETE' && res.status === 404)) {
    throw new Error(`${method} ${key} no bucket: HTTP ${res.status} ${(await res.text()).slice(0, 300)}`);
  }
}

/** Envia o backup do banco para o bucket, com o mesmo nome (o arquivo de hoje substitui o de hoje). */
export async function uploadBackup(file: string): Promise<void> {
  // o backup compactado cabe na memória com folga; um PUT só vai até 5 GB
  await s3('PUT', `${config.backup.s3.prefix}${basename(file)}`, await readFile(file), 'application/gzip');
}

// ---- espelho de data/uploads ----

// o que já está no bucket (caminhos relativos a data/uploads), para mandar só o que é novo
const sentList = () => join(config.backup.dir, '.uploads-sent');

function readSent(): Set<string> {
  try {
    return new Set(readFileSync(sentList(), 'utf8').split('\n').filter(Boolean));
  } catch {
    return new Set();
  }
}

function localUploads(dir = config.uploadsDir, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) localUploads(full, out);
    else if (entry.isFile()) out.push(relative(config.uploadsDir, full).split(sep).join('/'));
  }
  return out;
}

/**
 * Deixa uploads/ no bucket igual a data/uploads: manda os arquivos novos e apaga os que saíram (mensagem
 * apagada, conta excluída...). Os arquivos têm nome aleatório e nunca mudam, então basta comparar os nomes.
 */
export async function syncUploads(): Promise<{ sent: number; deleted: number }> {
  if (!offsiteEnabled()) return { sent: 0, deleted: 0 };
  mkdirSync(config.backup.dir, { recursive: true });
  const sent = readSent();
  const local = new Set(localUploads());
  const toSend = [...local].filter((f) => !sent.has(f));
  const toDelete = [...sent].filter((f) => !local.has(f));
  const save = () => writeFileSync(sentList(), [...sent].join('\n'));

  let done = 0;
  try {
    // 4 de cada vez: rápido o bastante sem encher o upload da VPS (que também leva a voz)
    const queue = [...toDelete.map((f) => ['DELETE', f] as const), ...toSend.map((f) => ['PUT', f] as const)];
    const worker = async () => {
      for (let item = queue.shift(); item; item = queue.shift()) {
        const [method, file] = item;
        if (method === 'PUT') {
          // pode ter sido apagado entre a listagem e o envio
          const body = await readFile(join(config.uploadsDir, file)).catch(() => null);
          if (!body) continue;
          await s3('PUT', `uploads/${file}`, body);
          sent.add(file);
        } else {
          await s3('DELETE', `uploads/${file}`);
          sent.delete(file);
        }
        if (++done % 50 === 0) save();
      }
    };
    await Promise.all(Array.from({ length: 4 }, worker));
  } finally {
    save();
  }
  return { sent: toSend.length, deleted: toDelete.length };
}

/** Quando o espelho dos uploads terminou a última sincronização (a lista é regravada a cada uma). */
export const lastUploadsSync = (): number | null => statSync(sentList(), { throwIfNoEntry: false })?.mtimeMs ?? null;
