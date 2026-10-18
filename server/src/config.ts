import { fileURLToPath } from 'node:url';

const env = process.env;

export const config = {
  port: Number(env.PORT ?? 3000),
  host: env.HOST ?? '0.0.0.0',
  jwtSecret: env.JWT_SECRET ?? 'dev-secret-troque-isto',
  dbPath: env.DB_PATH ?? fileURLToPath(new URL('../data/concord.db', import.meta.url)),
  publicDir: env.PUBLIC_DIR ?? fileURLToPath(new URL('../../client/dist', import.meta.url)),
  allowRegistration: env.ALLOW_REGISTRATION !== 'false',
  livekit: {
    // URL que o navegador usa. Vazio = mesmo domínio do app em /livekit (via proxy reverso).
    publicUrl: env.LIVEKIT_PUBLIC_URL ?? '',
    // URL que o backend usa para a API administrativa do LiveKit.
    apiUrl: env.LIVEKIT_API_URL ?? 'http://localhost:7880',
    apiKey: env.LIVEKIT_API_KEY ?? 'devkey',
    apiSecret: env.LIVEKIT_API_SECRET ?? 'secret',
  },
};

if (env.NODE_ENV === 'production' && config.jwtSecret === 'dev-secret-troque-isto') {
  console.warn('[aviso] JWT_SECRET não definido — defina um valor aleatório em produção!');
}
