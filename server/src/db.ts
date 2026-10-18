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
    type TEXT NOT NULL CHECK (type IN ('text', 'voice')),
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
  CREATE UNIQUE INDEX IF NOT EXISTS idx_users_bot_token ON users(bot_token_hash) WHERE bot_token_hash IS NOT NULL;
`);

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

export function get<T>(sql: string, ...params: SQLInputValue[]): T | undefined {
  return stmt(sql).get(...params) as T | undefined;
}

export function all<T>(sql: string, ...params: SQLInputValue[]): T[] {
  return stmt(sql).all(...params) as T[];
}

export function run(sql: string, ...params: SQLInputValue[]) {
  return stmt(sql).run(...params);
}

export function tx<T>(fn: () => T): T {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
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
  created_at: number;
}

export interface CustomStickerRow {
  id: string;
  server_id: string;
  name: string;
  url: string;
  uploader_id: string | null;
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
  type: 'text' | 'voice';
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
