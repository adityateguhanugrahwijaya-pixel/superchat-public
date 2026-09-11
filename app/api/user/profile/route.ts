import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/session'
import { db } from '@/lib/db'
import { auth } from '@/lib/auth'
import { headers } from 'next/headers'

// Update Username / Display Name
export async function PATCH(request: NextRequest) {
  try {
    const user = await requireUser()
    const body = await request.json().catch(() => ({}))
    const name = String(body.name || '').trim()

    if (!name || name.length < 2 || name.length > 60) {
      return NextResponse.json({ error: 'Username must be between 2 and 60 characters.' }, { status: 400 })
    }

    db.prepare('UPDATE "user" SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(name, user.id)

    return NextResponse.json({ ok: true, name, message: 'Username updated successfully!' })
  } catch {
    return NextResponse.json({ error: 'Unauthorized or invalid request' }, { status: 401 })
  }
}

// Change Password
export async function POST(request: NextRequest) {
  try {
    const user = await requireUser()
    const body = await request.json().catch(() => ({}))
    const currentPassword = String(body.currentPassword || '')
    const newPassword = String(body.newPassword || '')

    if (!currentPassword) {
      return NextResponse.json({ error: 'Current password is required.' }, { status: 400 })
    }
    if (!newPassword || newPassword.length < 8) {
      return NextResponse.json({ error: 'New password must be at least 8 characters long.' }, { status: 400 })
    }

    const reqHeaders = await headers()
    try {
      await auth.api.changePassword({
        body: {
          currentPassword,
          newPassword,
          revokeOtherSessions: false,
        },
        headers: reqHeaders,
      })
      return NextResponse.json({ ok: true, message: 'Password updated successfully!' })
    } catch (err: any) {
      const msg = err?.message || 'Current password incorrect or password update failed.'
      return NextResponse.json({ error: msg }, { status: 400 })
    }
  } catch {
    return NextResponse.json({ error: 'Unauthorized or invalid request' }, { status: 401 })
  }
}
