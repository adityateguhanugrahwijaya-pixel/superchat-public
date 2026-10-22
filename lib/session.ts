import { headers } from 'next/headers'
import { auth } from '@/lib/auth'

export class AuthError extends Error {
  status: number
  constructor(message = 'UNAUTHORIZED', status = 401) {
    super(message)
    this.name = 'AuthError'
    this.status = status
  }
}

export function isAuthError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const anyErr = err as any
  return (
    anyErr.name === 'AuthError' ||
    anyErr.message === 'UNAUTHORIZED' ||
    anyErr.code === 'UNAUTHORIZED' ||
    anyErr.status === 401
  )
}

export async function getUser() {
  try {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session?.user || (session.user as { banned?: boolean }).banned) return null
    return session.user
  } catch {
    return null
  }
}

export async function requireUser() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user || (session.user as { banned?: boolean }).banned) {
    throw new AuthError('UNAUTHORIZED', 401)
  }
  return session.user
}
