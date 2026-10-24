import { DatabaseSync, type SQLInputValue, type StatementSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { config } from './config.ts';

mkdirSync(dirname(config.dbPath), { recursive: true });

const db = new DatabaseSync(config.dbPath);

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    display_name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    avatar_color TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS servers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    owner_id TEXT NOT NULL REFERENCES users(id),
    icon_color TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS roles (
    id TEXT PRIMARY KEY,
    server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    color TEXT,
    permissions INTEGER NOT NULL DEFAULT 0,
    position INTEGER NOT NULL DEFAULT 0,
    is_default INTEGER NOT NULL DEFAULT 0,
    hoist INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS members (
    server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    nickname TEXT,
    joined_at INTEGER NOT NULL,
    PRIMARY KEY (server_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS member_roles (
    server_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    role_id TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    PRIMARY KEY (server_id, user_id, role_id),
    FOREIGN KEY (server_id, user_id) REFERENCES members(server_id, user_id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS channels (
    id TEXT PRIMARY KEY,
    server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('text', 'voice', 'forum')),
    topic TEXT NOT NULL DEFAULT '',
    position INTEGER NOT NULL DEFAULT 0,
    user_limit INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS channel_overwrites (
    channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    role_id TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    allow INTEGER NOT NULL DEFAULT 0,
    deny INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (channel_id, role_id)
  );

  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    author_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    edited_at INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_messages_channel ON messages(channel_id, created_at);

  CREATE TABLE IF NOT EXISTS invites (
    code TEXT PRIMARY KEY,
    server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
    creator_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    uses INTEGER NOT NULL DEFAULT 0,
    max_uses INTEGER NOT NULL DEFAULT 0,
    expires_at INTEGER,
    created_at INTEGER NOT NULL
  );
`);

// ---- Migrações (bancos criados em versões anteriores) ----

function addColumn(table: string, column: string, ddl: string) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (!cols.some((c) => c.name === column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
}

addColumn('users', 'avatar_url', 'TEXT');
addColumn('users', 'banner_color', 'TEXT');
addColumn('users', 'bio', "TEXT NOT NULL DEFAULT ''");
addColumn('users', 'settings', "TEXT NOT NULL DEFAULT '{}'");
addColumn('servers', 'icon_url', 'TEXT');
addColumn('users', 'recovery_hash', 'TEXT');
addColumn('users', 'banner_url', 'TEXT');
addColumn('users', 'is_bot', 'INTEGER NOT NULL DEFAULT 0');
addColumn('users', 'bot_owner_id', 'TEXT');
addColumn('users', 'bot_token_hash', 'TEXT');
addColumn('messages', 'kind', "TEXT NOT NULL DEFAULT 'text'");
addColumn('messages', 'data', 'TEXT');
addColumn('users', 'profile_style', "TEXT NOT NULL DEFAULT '{}'");
// login com Google: só o identificador da conta (sub)
addColumn('users', 'google_sub', 'TEXT');
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google ON users(google_sub) WHERE google_sub IS NOT NULL');
// selo de verificado: só quem tem Administrador no servidor configurado como autoridade da instância
// (AUTHORITY_SERVER_ID) concede isso, em qualquer servidor ou pessoa — ver access.ts#isInstanceAuthority
addColumn('users', 'verified', 'INTEGER NOT NULL DEFAULT 0');
addColumn('servers', 'verified', 'INTEGER NOT NULL DEFAULT 0');
// anexos das mensagens (lista em JSON) e os arquivos enviados, ainda sem mensagem ou já anexados
addColumn('messages', 'attachments', 'TEXT');
db.exec(`
  CREATE TABLE IF NOT EXISTS attachments (
    id TEXT PRIMARY KEY,
    uploader_id TEXT NOT NULL,
    url TEXT NOT NULL,
    name TEXT NOT NULL,
    size INTEGER NOT NULL,
    image INTEGER NOT NULL DEFAULT 0,
    message_id TEXT,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_attachments_message ON attachments(message_id);
`);
// e-mail de recuperação (opcional): só entra aqui depois de confirmado pelo link
addColumn('users', 'email', 'TEXT');
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email) WHERE email IS NOT NULL');
// sobe a cada troca de senha: tokens de login antigos (outros aparelhos, quem roubou a senha) param de valer
addColumn('users', 'token_version', 'INTEGER NOT NULL DEFAULT 0');
// verificação em duas etapas (ver twoFactor.ts): o segredo fica cifrado; os códigos de backup, só o hash
addColumn('users', 'totp_secret', 'TEXT');
addColumn('users', 'totp_enabled', 'INTEGER NOT NULL DEFAULT 0');
addColumn('users', 'totp_last_step', 'INTEGER NOT NULL DEFAULT 0');
addColumn('users', 'totp_backup', 'TEXT');
db.exec(`
  CREATE TABLE IF NOT EXISTS email_tokens (
    token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind TEXT NOT NULL,
    email TEXT NOT NULL,
    expires_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_email_tokens_user ON email_tokens(user_id);
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS sounds (
    id TEXT PRIMARY KEY,
    server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    uploader_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_sounds_server ON sounds(server_id);

  -- conversas privadas (DMs): uma por par de usuários, user_a < user_b
  CREATE TABLE IF NOT EXISTS dm_channels (
    id TEXT PRIMARY KEY,
    user_a TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    user_b TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL,
    last_message_at INTEGER NOT NULL,
    UNIQUE (user_a, user_b)
  );
  CREATE TABLE IF NOT EXISTS dm_messages (
    id TEXT PRIMARY KEY,
    dm_id TEXT NOT NULL REFERENCES dm_channels(id) ON DELETE CASCADE,
    author_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    kind TEXT NOT NULL DEFAULT 'text',
    data TEXT,
    created_at INTEGER NOT NULL,
    edited_at INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_dm_messages ON dm_messages(dm_id, created_at);
  CREATE TABLE IF NOT EXISTS dm_reads (
    dm_id TEXT NOT NULL REFERENCES dm_channels(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    last_read_at INTEGER NOT NULL,
    PRIMARY KEY (dm_id, user_id)
  );
  -- stickers enviados pela galera do servidor
  CREATE TABLE IF NOT EXISTS custom_stickers (
    id TEXT PRIMARY KEY,
    server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    uploader_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_custom_stickers ON custom_stickers(server_id);
  -- figurinhas do chat (packs importados do WhatsApp etc.): o pack é de quem importou e fica na
  -- biblioteca de cada pessoa que o salvou; salvar o pack de alguém não copia arquivo nenhum
  CREATE TABLE IF NOT EXISTS sticker_packs (
    id TEXT PRIMARY KEY,
    owner_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    author TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS pack_stickers (
    id TEXT PRIMARY KEY,
    pack_id TEXT NOT NULL REFERENCES sticker_packs(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    position INTEGER NOT NULL,
    -- já foi mandada em alguma conversa: o arquivo fica mesmo se o pack for apagado
    used INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_pack_stickers ON pack_stickers(pack_id, position);
  CREATE TABLE IF NOT EXISTS user_sticker_packs (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    pack_id TEXT NOT NULL REFERENCES sticker_packs(id) ON DELETE CASCADE,
    added_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, pack_id)
  );
  -- stickers colados no palco das salas de voz (todo mundo vê)
  CREATE TABLE IF NOT EXISTS placed_stickers (
    id TEXT PRIMARY KEY,
    channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    sticker TEXT NOT NULL,
    finish TEXT NOT NULL DEFAULT 'gloss',
    x REAL NOT NULL,
    y REAL NOT NULL,
    rot REAL NOT NULL DEFAULT 0,
    scale REAL NOT NULL DEFAULT 1,
    author_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_placed_stickers ON placed_stickers(channel_id, created_at);
  -- patches criados pela galera e compartilhados no servidor
  CREATE TABLE IF NOT EXISTS server_patches (
    id TEXT PRIMARY KEY,
    server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
    creator_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    data TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_server_patches ON server_patches(server_id, created_at);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_users_bot_token ON users(bot_token_hash) WHERE bot_token_hash IS NOT NULL;
`);

// Canais de fórum: bancos antigos têm o CHECK de channels.type só com 'text' e 'voice'. O SQLite não altera
// um CHECK, então a tabela é recriada com as mesmas colunas (as chaves estrangeiras apontam pelo nome).
const channelsSql = (db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'channels'").get() as { sql: string }).sql;
if (!channelsSql.includes("'forum'")) {
  const cols = (db.prepare('PRAGMA table_info(channels)').all() as { name: string }[]).map((c) => c.name).join(', ');
  db.exec('PRAGMA foreign_keys = OFF');
  try {
    db.exec('BEGIN');
    db.exec(channelsSql.replace(/CREATE TABLE "?channels"?/, 'CREATE TABLE channels_new').replace("IN ('text', 'voice')", "IN ('text', 'voice', 'forum')"));
    db.exec(`INSERT INTO channels_new (${cols}) SELECT ${cols} FROM channels`);
    db.exec('DROP TABLE channels');
    db.exec('ALTER TABLE channels_new RENAME TO channels');
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  } finally {
    db.exec('PRAGMA foreign_keys = ON');
  }
}

db.exec(`
  CREATE TABLE IF NOT EXISTS forum_posts (
    id TEXT PRIMARY KEY,
    channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    author_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    tag TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'aberto',
    pinned INTEGER NOT NULL DEFAULT 0,
    locked INTEGER NOT NULL DEFAULT 0,
    vote_count INTEGER NOT NULL DEFAULT 0,
    reply_count INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    edited_at INTEGER,
    last_activity_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_forum_posts ON forum_posts(channel_id, last_activity_at);
  CREATE TABLE IF NOT EXISTS forum_replies (
    id TEXT PRIMARY KEY,
    post_id TEXT NOT NULL REFERENCES forum_posts(id) ON DELETE CASCADE,
    author_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    edited_at INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_forum_replies ON forum_replies(post_id, created_at);
  CREATE TABLE IF NOT EXISTS forum_votes (
    post_id TEXT NOT NULL REFERENCES forum_posts(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    PRIMARY KEY (post_id, user_id)
  );
`);

// Patches de presente: quem criou o patch gera um link; cada pessoa resgata uma vez.
db.exec(`
  CREATE TABLE IF NOT EXISTS patch_drops (
    id TEXT PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    creator_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    patch TEXT NOT NULL,
    max_uses INTEGER NOT NULL DEFAULT 0,
    uses INTEGER NOT NULL DEFAULT 0,
    expires_at INTEGER,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS patch_claims (
    drop_id TEXT NOT NULL REFERENCES patch_drops(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    claimed_at INTEGER NOT NULL,
    PRIMARY KEY (drop_id, user_id)
  );
`);
// o link sai em nome de um servidor (quem cria precisa ser admin dele)
addColumn('patch_drops', 'server_id', 'TEXT REFERENCES servers(id) ON DELETE SET NULL');

// Apoio voluntário por Pix (ver support.ts). O total apoiado decide o acabamento do patch de apoiador.
db.exec(`
  CREATE TABLE IF NOT EXISTS payments (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider TEXT NOT NULL,
    provider_id TEXT,
    amount_cents INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    qr_code TEXT,
    qr_base64 TEXT,
    expires_at INTEGER NOT NULL,
    checked_at INTEGER,
    created_at INTEGER NOT NULL,
    paid_at INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_payments_user ON payments(user_id, created_at);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_provider ON payments(provider, provider_id) WHERE provider_id IS NOT NULL;
`);
addColumn('users', 'support_total_cents', 'INTEGER NOT NULL DEFAULT 0');

// Diagnósticos que as pessoas mandam do app (ver diagnostics.ts). O arquivo em si fica fora do banco,
// compactado, numa pasta que não é servida para fora; aqui fica só o resumo para a lista do portal.
db.exec(`
  CREATE TABLE IF NOT EXISTS diagnostics (
    id TEXT PRIMARY KEY,
    user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    note TEXT NOT NULL DEFAULT '',
    started_at INTEGER NOT NULL,
    ended_at INTEGER NOT NULL,
    samples INTEGER NOT NULL,
    markers INTEGER NOT NULL,
    mode TEXT,
    client_commit TEXT,
    user_agent TEXT,
    size INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_diagnostics_created ON diagnostics(created_at);
`);

// (depois do CREATE TABLE de dm_messages: num banco novo a tabela ainda não existe lá em cima)
addColumn('dm_messages', 'attachments', 'TEXT');
db.exec('CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
const version = Number((db.prepare("SELECT value FROM meta WHERE key = 'schema'").get() as { value: string } | undefined)?.value ?? 1);
if (version < 2) {
  // v2: permissão "Alterar o próprio apelido" (1 << 14) passa a vir no @everyone
  db.exec(`UPDATE roles SET permissions = permissions | ${1 << 14} WHERE is_default = 1`);
}
if (version < 3) {
  // v3: mesa de sons liberada para todos; "mencionar todos" para quem já modera mensagens
  db.exec(`UPDATE roles SET permissions = permissions | ${1 << 16} WHERE is_default = 1`);
  db.exec(`UPDATE roles SET permissions = permissions | ${1 << 17} WHERE permissions & ${1 << 6}`);
}
db.prepare("INSERT INTO meta (key, value) VALUES ('schema', '3') ON CONFLICT (key) DO UPDATE SET value = excluded.value").run();

const cache = new Map<string, StatementSync>();
function stmt(sql: string): StatementSync {
  let s = cache.get(sql);
  if (!s) {
    s = db.prepare(sql);
    cache.set(sql, s);
  }
  return s;
}

// O SQLite aqui é síncrono: enquanto uma consulta roda, o app inteiro espera. O metrics.ts liga este
// observador para medir quanto cada consulta segura o servidor (painel de gargalos).
let onQuery: ((sql: string, seconds: number) => void) | undefined;
export function observeQueries(fn: (sql: string, seconds: number) => void) {
  onQuery = fn;
}

function timed<T>(sql: string, fn: () => T): T {
  if (!onQuery) return fn();
  const start = performance.now();
  try {
    return fn();
  } finally {
    onQuery(sql, (performance.now() - start) / 1000);
  }
}

export function get<T>(sql: string, ...params: SQLInputValue[]): T | undefined {
  return timed(sql, () => stmt(sql).get(...params) as T | undefined);
}

export function all<T>(sql: string, ...params: SQLInputValue[]): T[] {
  return timed(sql, () => stmt(sql).all(...params) as T[]);
}

export function run(sql: string, ...params: SQLInputValue[]) {
  return timed(sql, () => stmt(sql).run(...params));
}

export function tx<T>(fn: () => T): T {
  db.exec('BEGIN');
  try {
    const result = fn();
    // no COMMIT o SQLite grava no disco: é onde um disco lento aparece
    timed('COMMIT', () => db.exec('COMMIT'));
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

// ---- Tipos das linhas ----

export interface UserRow {
  id: string;
  username: string;
  display_name: string;
  password_hash: string;
  avatar_color: string;
  avatar_url: string | null;
  banner_color: string | null;
  bio: string;
  settings: string;
  recovery_hash: string | null;
  banner_url: string | null;
  is_bot: number;
  bot_owner_id: string | null;
  bot_token_hash: string | null;
  profile_style: string;
  google_sub?: string | null;
  verified: number;
  email?: string | null;
  token_version?: number;
  totp_secret?: string | null;
  totp_enabled?: number;
  totp_last_step?: number;
  totp_backup?: string | null;
  support_total_cents?: number;
  created_at: number;
}

export interface AttachmentRow {
  id: string;
  uploader_id: string;
  url: string;
  name: string;
  size: number;
  image: number;
  message_id: string | null;
  created_at: number;
}

/** Link de uso único mandado por e-mail: confirmar o endereço (verify) ou trocar a senha (reset). */
export interface EmailTokenRow {
  token_hash: string;
  user_id: string;
  kind: 'verify' | 'reset';
  email: string;
  expires_at: number;
}

export interface CustomStickerRow {
  id: string;
  server_id: string;
  name: string;
  url: string;
  uploader_id: string | null;
  created_at: number;
}

export interface StickerPackRow {
  id: string;
  owner_id: string | null;
  name: string;
  author: string;
  created_at: number;
}

export interface PackStickerRow {
  id: string;
  pack_id: string;
  url: string;
  position: number;
  used: number;
  created_at: number;
}

export interface ServerPatchRow {
  id: string;
  server_id: string;
  creator_id: string | null;
  data: string;
  created_at: number;
}

export interface PlacedStickerRow {
  id: string;
  channel_id: string;
  sticker: string;
  finish: string;
  x: number;
  y: number;
  rot: number;
  scale: number;
  author_id: string | null;
  created_at: number;
}

export interface SoundRow {
  id: string;
  server_id: string;
  name: string;
  url: string;
  uploader_id: string | null;
  created_at: number;
}

export interface ServerRow {
  id: string;
  name: string;
  owner_id: string;
  icon_color: string;
  icon_url: string | null;
  verified: number;
  created_at: number;
}

export interface RoleRow {
  id: string;
  server_id: string;
  name: string;
  color: string | null;
  permissions: number;
  position: number;
  is_default: number;
  hoist: number;
}

export interface ChannelRow {
  id: string;
  server_id: string;
  name: string;
  type: 'text' | 'voice' | 'forum';
  topic: string;
  position: number;
  user_limit: number;
}

export interface OverwriteRow {
  channel_id: string;
  role_id: string;
  allow: number;
  deny: number;
}

export interface MessageRow {
  id: string;
  channel_id: string;
  author_id: string;
  content: string;
  kind: string;
  data: string | null;
  attachments?: string | null;
  created_at: number;
  edited_at: number | null;
}

export interface DmChannelRow {
  id: string;
  user_a: string;
  user_b: string;
  created_at: number;
  last_message_at: number;
}

export interface InviteRow {
  code: string;
  server_id: string;
  creator_id: string;
  uses: number;
  max_uses: number;
  expires_at: number | null;
  created_at: number;
}

export interface ForumPostRow {
  id: string;
  channel_id: string;
  author_id: string;
  title: string;
  content: string;
  tag: string;
  status: string;
  pinned: number;
  locked: number;
  vote_count: number;
  reply_count: number;
  created_at: number;
  edited_at: number | null;
  last_activity_at: number;
}

export interface ForumReplyRow {
  id: string;
  post_id: string;
  author_id: string;
  content: string;
  created_at: number;
  edited_at: number | null;
}

export interface PatchDropRow {
  id: string;
  code: string;
  creator_id: string;
  server_id: string | null;
  patch: string;
  max_uses: number;
  uses: number;
  expires_at: number | null;
  created_at: number;
}

export interface PaymentRow {
  id: string;
  user_id: string;
  provider: string;
  provider_id: string | null;
  amount_cents: number;
  status: 'pending' | 'paid' | 'expired' | 'refunded';
  qr_code: string | null;
  qr_base64: string | null;
  expires_at: number;
  checked_at: number | null;
  created_at: number;
  paid_at: number | null;
}
