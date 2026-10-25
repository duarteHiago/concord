// Cópia dos backups para fora da VPS (ver backup.ts), num bucket compatível com S3: Cloudflare R2, Backblaze B2,
// MinIO... Um PUT assinado com AWS Signature V4, sem SDK. Sem BACKUP_S3_BUCKET, fica tudo só no disco da VPS.
// Quanto tempo o bucket guarda os backups é uma regra de ciclo de vida do próprio bucket (ver README).
import { createHash, createHmac } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { config } from './config.ts';

export const offsiteEnabled = () => {
  const s = config.backup.s3;
  return !!(s.endpoint && s.bucket && s.accessKey && s.secret);
};

const sha256 = (data: string | Buffer) => createHash('sha256').update(data).digest('hex');
const hmac = (key: string | Buffer, data: string) => createHmac('sha256', key).update(data).digest();

/** Envia o arquivo para o bucket, com o mesmo nome (o arquivo de hoje substitui o de hoje). */
export async function uploadBackup(file: string): Promise<void> {
  const { endpoint, bucket, region, accessKey, secret, prefix } = config.backup.s3;
  // o backup compactado cabe na memória com folga; um PUT só vai até 5 GB
  const body = await readFile(file);
  const url = new URL(`${endpoint.replace(/\/+$/, '')}/${encodeURIComponent(bucket)}/${prefix}${encodeURIComponent(basename(file))}`);
  const amzDate = new Date().toISOString().replace(/[-:]|\.\d{3}/g, ''); // 20261024T060000Z
  const day = amzDate.slice(0, 8);
  const payloadHash = sha256(body);

  const headers: Record<string, string> = { host: url.host, 'x-amz-content-sha256': payloadHash, 'x-amz-date': amzDate };
  const signed = Object.keys(headers).sort();
  const canonical = ['PUT', url.pathname, '', ...signed.map((h) => `${h}:${headers[h]}`), '', signed.join(';'), payloadHash].join('\n');
  const scope = `${day}/${region}/s3/aws4_request`;
  const toSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256(canonical)].join('\n');
  const key = hmac(hmac(hmac(hmac(`AWS4${secret}`, day), region), 's3'), 'aws4_request');
  const signature = createHmac('sha256', key).update(toSign).digest('hex');

  const res = await fetch(url, {
    method: 'PUT',
    body,
    signal: AbortSignal.timeout(10 * 60_000),
    headers: {
      ...headers,
      'content-type': 'application/gzip',
      authorization: `AWS4-HMAC-SHA256 Credential=${accessKey}/${scope}, SignedHeaders=${signed.join(';')}, Signature=${signature}`,
    },
  });
  if (!res.ok) throw new Error(`envio para o bucket: HTTP ${res.status} ${(await res.text()).slice(0, 300)}`);
}
