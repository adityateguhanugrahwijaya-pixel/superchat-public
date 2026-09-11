import { betterAuth } from 'better-auth'
import Database from 'better-sqlite3'
import path from 'node:path'

const dbPath = process.env.SQLITE_PATH || path.join(process.cwd(), 'local.db')
const sqlite = new Database(dbPath)
sqlite.pragma('journal_mode = WAL')

function nonEmpty(value: string | undefined) {
  const trimmed = value?.trim()
  return trimmed ? trimmed : undefined
}

function originFromHost(value: string | undefined) {
  const host = nonEmpty(value)
  return host ? `https://${host}` : undefined
}

const baseURL =
  nonEmpty(process.env.BETTER_AUTH_URL) ??
  originFromHost(process.env.VERCEL_PROJECT_PRODUCTION_URL) ??
  originFromHost(process.env.VERCEL_URL) ??
  nonEmpty(process.env.V0_RUNTIME_URL) ??
  nonEmpty(process.env.V0_DEV_APP_URL) ??
  'http://localhost:3000'

const origins = [
  'http://localhost:3000',
  nonEmpty(process.env.V0_RUNTIME_URL),
  nonEmpty(process.env.V0_DEV_APP_URL),
  nonEmpty(process.env.V0_BUILD_URL),
  nonEmpty(process.env.V0_SANDBOX_URL),
  originFromHost(process.env.VERCEL_URL),
  originFromHost(process.env.VERCEL_PROJECT_PRODUCTION_URL),
].filter((origin): origin is string => Boolean(origin))

export const auth = betterAuth({
  database: sqlite,
  baseURL,
  trustedOrigins: origins,
  emailAndPassword: { enabled: true },
  advanced: {
    useSnakeCase: true,
    ...(process.env.NODE_ENV === 'development'
      ? { defaultCookieAttributes: { sameSite: 'none' as const, secure: true } }
      : {}),
  },
  user: {
    additionalFields: {
      role: { type: 'string', defaultValue: 'user', input: false },
      packageId: { type: 'string', required: false, input: false, fieldName: 'package_id' },
      banned: { type: 'boolean', defaultValue: false, input: false },
    },
  },
})
