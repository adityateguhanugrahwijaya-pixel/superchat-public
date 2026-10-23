import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireUser } from '@/lib/session'

async function admin() {
  const user = await requireUser()
  if ((user as { role?: string }).role !== 'admin') throw new Error('FORBIDDEN')
  return user
}

const FALLBACK_MODELS = [
  { id: 'agnes-2.5-flash', name: 'Agnes 2.5 Flash', owned_by: 'byNara', context_window: 512000, vision: true, reasoning: true, web_search: true },
  { id: 'deepseek-v4-flash', name: 'DeepSeek v4 Flash', owned_by: 'DeepSeek', context_window: 64000, vision: false, reasoning: false, web_search: false },
  { id: 'deepseek-v4-pro', name: 'DeepSeek v4 Pro', owned_by: 'DeepSeek', context_window: 64000, vision: false, reasoning: true, web_search: false },
  { id: 'gpt-5.4', name: 'GPT 5.4', owned_by: 'OpenAI', context_window: 128000, vision: true, reasoning: true, web_search: true },
  { id: 'claude-sonnet-5', name: 'Claude Sonnet 5', owned_by: 'Anthropic', context_window: 200000, vision: true, reasoning: true, web_search: false },
  { id: 'qwen3.8-flash', name: 'Qwen 3.8 Flash', owned_by: 'Qwen', context_window: 32768, vision: false, reasoning: false, web_search: false },
]

export async function GET() {
  await admin()
  const users = db.prepare('SELECT id, name, email, role, banned, createdAt FROM "user" ORDER BY createdAt DESC LIMIT 200').all()
  const usage = db.prepare('SELECT usage_date as date, SUM(tokens_used) as tokens, COUNT(DISTINCT user_id) as users FROM usage_logs GROUP BY usage_date ORDER BY usage_date DESC LIMIT 30').all()

  // Fetch full model catalog from router with capabilities metadata
  const targetUrl = 'https://router.bynara.id/v1/models'
  const apiKey = process.env.BYNARA_API_KEY || ''
  let rawModels: any[] = []

  try {
    const res = await fetch(targetUrl, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(15000),
    })
    if (res.ok) {
      const data = await res.json()
      rawModels = Array.isArray(data) ? data : Array.isArray(data.data) ? data.data : []
    }
  } catch {}

  if (rawModels.length === 0) {
    rawModels = FALLBACK_MODELS
  }

  let disabledSet = new Set<string>()
  try {
    const disabledRows = db.prepare('SELECT model_id as modelId FROM disabled_models').all() as { modelId: string }[]
    disabledSet = new Set(disabledRows.map((r) => r.modelId.toLowerCase()))
  } catch {}

  const models = rawModels.map((m) => ({
    id: m.id,
    name: m.name || m.id,
    owned_by: m.owned_by || 'Unknown',
    context_window: m.context_window || 32768,
    vision: Boolean(m.vision),
    reasoning: Boolean(m.reasoning),
    web_search: Boolean(m.web_search),
    disabled: disabledSet.has(m.id.toLowerCase()),
  }))

  return NextResponse.json({ users, usage, models })
}

export async function POST(request: NextRequest) {
  const user = await admin()
  const body = await request.json().catch(() => ({}))

  if (body.action === 'user') {
    db.prepare(`
      UPDATE "user"
      SET banned = ?, role = ?, updatedAt = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(body.banned ? 1 : 0, body.role === 'admin' ? 'admin' : 'user', String(body.userId))

    return NextResponse.json({ ok: true })
  }

  if (body.action === 'toggle-model') {
    const modelId = String(body.modelId || '').trim()
    const disabled = Boolean(body.disabled)

    if (!modelId) {
      return NextResponse.json({ error: 'modelId is required' }, { status: 400 })
    }

    if (disabled) {
      db.prepare('INSERT OR REPLACE INTO disabled_models (model_id, disabled_by) VALUES (?, ?)').run(
        modelId,
        (user as any).email || 'admin'
      )
    } else {
      db.prepare('DELETE FROM disabled_models WHERE LOWER(model_id) = LOWER(?)').run(modelId)
    }

    return NextResponse.json({ ok: true, modelId, disabled })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
