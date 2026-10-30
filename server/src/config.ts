import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const env = process.env;

export const config = {
  port: Number(env.PORT ?? 3000),
  host: env.HOST ?? '0.0.0.0',
  jwtSecret: env.JWT_SECRET ?? 'dev-secret-troque-isto',
  dbPath: env.DB_PATH ?? fileURLToPath(new URL('../data/concord.db', import.meta.url)),
  uploadsDir: env.UPLOADS_DIR ?? '',
  downloadsDir: env.DOWNLOADS_DIR ?? '',
  publicDir:env.PUBLIC_DIR ?? fileURLToPath(new URL('../../client/dist', import.meta.url)),
  allowRegistration: env.ALLOW_REGISTRATION !== 'false',
  // endereço público do site (https://dominio), usado no retorno do login com Google
  publicUrl: (env.PUBLIC_URL ?? '').replace(/\/+$/, ''),
  google: { clientId: env.GOOGLE_CLIENT_ID ?? '', clientSecret: env.GOOGLE_CLIENT_SECRET ?? '' },
  // e-mail de recuperação de senha (opcional), enviado pela API do Brevo. Sem chave, a função some do app.
  mail: { brevoKey: env.BREVO_API_KEY ?? '', from: (env.MAIL_FROM ?? '').trim(), fromName: env.MAIL_FROM_NAME || 'Concord', logoUrl: env.MAIL_LOGO_URL || '' },
  // código de um convite permanente: o app mostra "Entrar na comunidade" e a landing page ganha o botão
  communityInvite: (env.COMMUNITY_INVITE ?? '').trim().replace(/^.*\/invite\//, ''),
  // servidor cujo cargo "Administrador" vira autoridade da instalação inteira: dá o selo de verificado
  // em qualquer servidor ou pessoa (não só no próprio servidor). Vazio desliga a função.
  authorityServerId: (env.AUTHORITY_SERVER_ID ?? '').trim(),
  // quem entra no portal da equipe (/admin): nomes de usuário separados por vírgula. Vazio desliga o portal.
  adminUsers: new Set(
    (env.ADMIN_USERS ?? '')
      .split(',')
      .map((u) => u.trim().replace(/^@/, '').toLowerCase())
      .filter(Boolean),
  ),
  // Dupla antiga de Mecenas ("quem>sobre-quem", por nome de usuário). Não dá mais poderes: no primeiro início
  // vira um convite de renovação de contrato para as duas pessoas (ver contracts.ts#migrateLegacyPair).
  mecenas: (() => {
    const [holder, target] = (env.MECENAS ?? '').split('>').map((u) => u.trim().replace(/^@/, '').toLowerCase());
    return holder && target ? { holder, target } : null;
  })(),
  // biblioteca da Steam na página do perfil (ver integrations.ts). Sem chave, a vitrine some.
  steamApiKey: (env.STEAM_API_KEY ?? '').trim(),
  // diagnósticos enviados ficam ao lado do banco, fora de /uploads (que é público)
  diagnosticsDir: env.DIAGNOSTICS_DIR ?? '',
  // backup diário do banco (ver backup.ts): quantos dias guardar (0 desliga) e a partir de que hora (UTC)
  backup: {
    dir: env.BACKUP_DIR ?? '',
    keep: Number(env.BACKUP_KEEP ?? 7),
    hourUtc: Number(env.BACKUP_HOUR_UTC ?? 6),
    // cópia fora da VPS (ver offsite.ts), num bucket compatível com S3. Ex. do R2: https://<conta>.r2.cloudflarestorage.com
    s3: {
      endpoint: (env.BACKUP_S3_ENDPOINT ?? '').trim(),
      bucket: (env.BACKUP_S3_BUCKET ?? '').trim(),
      region: (env.BACKUP_S3_REGION ?? '').trim() || 'auto',
      prefix: (env.BACKUP_S3_PREFIX ?? 'db/').trim(),
      accessKey: (env.BACKUP_S3_ACCESS_KEY ?? '').trim(),
      secret: (env.BACKUP_S3_SECRET ?? '').trim(),
    },
  },
  // métricas do Prometheus (0 desliga). Só dentro da VPS por padrão.
  metricsPort: Number(env.METRICS_PORT ?? 9464),
  metricsHost: env.METRICS_HOST ?? '127.0.0.1',
  // requisição, evento do socket ou consulta acima disto (ms) vai para o log como "[lento]"
  slowMs: Number(env.SLOW_MS ?? 100),
  // apoio voluntário por Pix (ver support.ts). Sem token, o botão de apoiar some do app.
  // PAYMENTS_FAKE=true (só fora de produção): QR de teste e botão "simular pagamento", sem dinheiro de verdade.
  payments: {
    mpAccessToken: (env.MP_ACCESS_TOKEN ?? '').trim(),
    // "assinatura secreta" do webhook, no painel do Mercado Pago (Suas integrações → Webhooks)
    mpWebhookSecret: (env.MP_WEBHOOK_SECRET ?? '').trim(),
    fake: env.PAYMENTS_FAKE === 'true' && env.NODE_ENV !== 'production',
  },
  livekit: {
    // URL que o navegador usa. Vazio = mesmo domínio do app em /livekit (via proxy reverso).
    publicUrl: env.LIVEKIT_PUBLIC_URL ?? '',
    // URL que o backend usa para a API administrativa do LiveKit.
    apiUrl: env.LIVEKIT_API_URL ?? 'http://localhost:7880',
    apiKey: env.LIVEKIT_API_KEY ?? 'devkey',
    apiSecret: env.LIVEKIT_API_SECRET ?? 'secret',
  },
};

// por padrão os uploads ficam ao lado do banco (no Docker: /data/uploads)
if (!config.uploadsDir) config.uploadsDir = join(dirname(config.dbPath), 'uploads');
if (!config.downloadsDir) config.downloadsDir = join(dirname(config.dbPath), 'downloads');
if (!config.diagnosticsDir) config.diagnosticsDir = join(dirname(config.dbPath), 'diagnostics');
if (!config.backup.dir) config.backup.dir = join(dirname(config.dbPath), 'backups');

if (env.NODE_ENV === 'production' && config.jwtSecret === 'dev-secret-troque-isto') {
  console.warn('[aviso] JWT_SECRET não definido — defina um valor aleatório em produção!');
}
