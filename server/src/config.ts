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
  // código de um convite permanente: o app mostra "Entrar na comunidade" e a landing page ganha o botão
  communityInvite: (env.COMMUNITY_INVITE ?? '').trim().replace(/^.*\/invite\//, ''),
  // servidor cujo cargo "Administrador" vira autoridade da instalação inteira: dá o selo de verificado
  // em qualquer servidor ou pessoa (não só no próprio servidor). Vazio desliga a função.
  authorityServerId: (env.AUTHORITY_SERVER_ID ?? '').trim(),
  // métricas do Prometheus (0 desliga). Só dentro da VPS por padrão.
  metricsPort: Number(env.METRICS_PORT ?? 9464),
  metricsHost: env.METRICS_HOST ?? '127.0.0.1',
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

if (env.NODE_ENV === 'production' && config.jwtSecret === 'dev-secret-troque-isto') {
  console.warn('[aviso] JWT_SECRET não definido — defina um valor aleatório em produção!');
}
