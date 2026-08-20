import { headers } from 'next/headers'
import { auth } from '@/lib/auth'

export async function requireUser() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user || (session.user as { banned?: boolean }).banned) throw new Error('UNAUTHORIZED')
  return session.user
}
