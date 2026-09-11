import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireUser } from '@/lib/session'

async function admin() {
  const user = await requireUser()
  if ((user as { role?: string }).role !== 'admin') throw new Error('FORBIDDEN')
  return user
}

export async function GET() {
  await admin()
  const users = db.prepare('SELECT id, name, email, role, banned, createdAt FROM "user" ORDER BY createdAt DESC LIMIT 200').all()
  const usage = db.prepare('SELECT usage_date as date, SUM(tokens_used) as tokens, COUNT(DISTINCT user_id) as users FROM usage_logs GROUP BY usage_date ORDER BY usage_date DESC LIMIT 30').all()

  return NextResponse.json({ users, usage })
}

export async function POST(request: NextRequest) {
  await admin()
  const body = await request.json().catch(() => ({}))

  if (body.action === 'user') {
    db.prepare(`
      UPDATE "user"
      SET banned = ?, role = ?, updatedAt = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(body.banned ? 1 : 0, body.role === 'admin' ? 'admin' : 'user', String(body.userId))

    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
