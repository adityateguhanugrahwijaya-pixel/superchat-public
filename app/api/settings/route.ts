import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { db } from '@/lib/db'
import { sql } from 'drizzle-orm'
import { requireUser } from '@/lib/session'
import { encryptSecret } from '@/lib/crypto'

export async function GET() {
  const user = await requireUser()
  const result = await db.execute(sql`SELECT api_mode as "apiMode", custom_router_url as "customRouterUrl", timezone FROM user_settings WHERE user_id = ${user.id}`)
  return NextResponse.json(result.rows[0] ?? { apiMode: 'superchat', customRouterUrl: null, timezone: 'UTC' })
}

export async function PUT(request: NextRequest) {
  const user = await requireUser()
  const body = await request.json()
  const mode = body.apiMode === 'byo' ? 'byo' : 'superchat'
  const key = typeof body.customApiKey === 'string' && body.customApiKey.trim() ? encryptSecret(body.customApiKey.trim()) : null
  const url = typeof body.customRouterUrl === 'string' ? body.customRouterUrl.trim().slice(0, 500) : null
  await db.execute(sql`INSERT INTO user_settings (user_id, api_mode, custom_api_key_encrypted, custom_router_url) VALUES (${user.id}, ${mode}, ${key}, ${url}) ON CONFLICT (user_id) DO UPDATE SET api_mode = ${mode}, custom_api_key_encrypted = COALESCE(${key}, user_settings.custom_api_key_encrypted), custom_router_url = ${url}, updated_at = NOW()`)
  return NextResponse.json({ ok: true, apiMode: mode, customRouterUrl: url })
}
