import Database from 'better-sqlite3'
import path from 'node:path'

const dbPath = process.env.SQLITE_PATH || path.join(process.cwd(), 'local.db')

export const sqlite = new Database(dbPath)
sqlite.pragma('journal_mode = WAL')

// Initialize SQLite schema supporting both camelCase and snake_case column aliases for zero-error compatibility
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS "user" (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    emailVerified INTEGER NOT NULL DEFAULT 0,
    email_verified INTEGER NOT NULL DEFAULT 0,
    image TEXT,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    role TEXT DEFAULT 'user',
    package_id TEXT,
    packageId TEXT,
    banned INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS "session" (
    id TEXT PRIMARY KEY,
    expiresAt DATETIME,
    expires_at DATETIME,
    token TEXT NOT NULL UNIQUE,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ipAddress TEXT,
    ip_address TEXT,
    userAgent TEXT,
    user_agent TEXT,
    userId TEXT,
    user_id TEXT
  );

  CREATE TABLE IF NOT EXISTS "account" (
    id TEXT PRIMARY KEY,
    accountId TEXT,
    account_id TEXT,
    providerId TEXT,
    provider_id TEXT,
    userId TEXT,
    user_id TEXT,
    accessToken TEXT,
    access_token TEXT,
    refreshToken TEXT,
    refresh_token TEXT,
    idToken TEXT,
    id_token TEXT,
    accessTokenExpiresAt DATETIME,
    access_token_expires_at DATETIME,
    refreshTokenExpiresAt DATETIME,
    refresh_token_expires_at DATETIME,
    scope TEXT,
    password TEXT,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS "verification" (
    id TEXT PRIMARY KEY,
    identifier TEXT NOT NULL,
    value TEXT NOT NULL,
    expiresAt DATETIME,
    expires_at DATETIME,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS "user_settings" (
    user_id TEXT PRIMARY KEY,
    api_mode TEXT DEFAULT 'superchat',
    custom_api_key_encrypted TEXT,
    custom_router_url TEXT,
    global_system_prompt TEXT,
    default_model TEXT,
    timezone TEXT DEFAULT 'UTC',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );


  CREATE TABLE IF NOT EXISTS "packages" (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    daily_token_limit INTEGER DEFAULT 2000000,
    allowed_models TEXT DEFAULT '[]',
    rate_limit_per_minute INTEGER DEFAULT 30,
    max_chats INTEGER DEFAULT 100,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS "usage_logs" (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    usage_date TEXT NOT NULL,
    tokens_used INTEGER DEFAULT 0,
    model TEXT,
    router_url TEXT DEFAULT 'https://router.bynara.id/v1',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`)

try {
  sqlite.exec(`ALTER TABLE usage_logs ADD COLUMN router_url TEXT DEFAULT 'https://router.bynara.id/v1'`)
} catch {}
try {
  sqlite.exec(`ALTER TABLE user_settings ADD COLUMN global_system_prompt TEXT`)
} catch {}
try {
  sqlite.exec(`ALTER TABLE user_settings ADD COLUMN default_model TEXT`)
} catch {}
try {
  sqlite.exec(`ALTER TABLE user_settings ADD COLUMN sandbox_enabled INTEGER DEFAULT 1`)
} catch {}

export const db = sqlite

// Auto-bootstrap or update configured Admin account in SQLite DB on app start
try {
  const { bootstrapAdminAccount } = require('./bootstrap-admin')
  bootstrapAdminAccount()
} catch (err) {
  console.error('[Admin Bootstrap Init Error]', err)
}


