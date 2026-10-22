import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/session'
import { isUserSandboxEnabled } from '@/lib/sandbox'
import { detectPython } from '@/lib/sandbox/runtime'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/sandbox/status
 * Lets the UI show a warning like "Python is not installed on the server" when the
 * sandbox is on but the Python runtime isn't ready.
 *
 * Response:
 *   {
 *     enabled: boolean,                 // sandbox on for this user
 *     python: {
 *       found: boolean,
 *       version?: string,               // e.g. "3.12.3"
 *       source: 'env' | 'venv' | 'system' | 'none',
 *       message?: string                // install instructions when found === false
 *     }
 *   }
 */
export async function GET() {
  try {
    const user = await requireUser()
    const enabled = isUserSandboxEnabled(user.id)

    if (!enabled) {
      return NextResponse.json({ enabled: false, python: { found: false, source: 'none' } })
    }

    const py = detectPython()
    return NextResponse.json({
      enabled: true,
      python: {
        found: py.found,
        version: py.version,
        source: py.source,
        message: py.found ? undefined : py.message,
      },
    })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Unauthorized' }, { status: 401 })
  }
}
