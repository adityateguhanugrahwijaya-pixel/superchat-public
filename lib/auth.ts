import { betterAuth } from 'better-auth'
import { Pool } from 'pg'

const pool = new Pool({ connectionString: process.env.DATABASE_URL })

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
  database: pool,
  baseURL,
  trustedOrigins: origins,
  emailAndPassword: { enabled: true },
  user: {
    additionalFields: {
      role: { type: 'string', defaultValue: 'user', input: false },
      packageId: { type: 'string', required: false, input: false },
      banned: { type: 'boolean', defaultValue: false, input: false },
    },
  },
  ...(process.env.NODE_ENV === 'development'
    ? { advanced: { defaultCookieAttributes: { sameSite: 'none' as const, secure: true } } }
    : {}),
})
