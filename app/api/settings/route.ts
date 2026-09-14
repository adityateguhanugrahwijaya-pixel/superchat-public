import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireUser } from '@/lib/session'
import { encryptSecret, decryptSecret } from '@/lib/crypto'
import { isSandboxEnabled } from '@/lib/sandbox'

export async function GET() {
  const user = await requireUser()
  const globalSandboxEnabled = isSandboxEnabled()
  const row = db
    .prepare(
      'SELECT api_mode as apiMode, custom_router_url as customRouterUrl, custom_api_key_encrypted as customApiKeyEncrypted, global_system_prompt as globalSystemPrompt, default_model as defaultModel, timezone, sandbox_enabled as sandboxEnabled, custom_models as customModels FROM user_settings WHERE user_id = ?'
    )
    .get(user.id) as
    | {
        apiMode?: string
        customRouterUrl?: string
        customApiKeyEncrypted?: string
        globalSystemPrompt?: string
        defaultModel?: string
        timezone?: string
        sandboxEnabled?: number
        customModels?: string
      }
    | undefined

  const userSandboxEnabled = row?.sandboxEnabled !== undefined ? row.sandboxEnabled !== 0 : true
  let customModels: string[] = []
  if (row?.customModels) {
    try {
      const parsed = JSON.parse(row.customModels)
      if (Array.isArray(parsed)) {
        customModels = parsed.map((m) => String(m).trim()).filter(Boolean)
      }
    } catch {}
  }

  return NextResponse.json({
    apiMode: row?.apiMode || 'superchat',
    customRouterUrl: row?.customRouterUrl || '',
    hasCustomApiKey: Boolean(row?.customApiKeyEncrypted),
    globalSystemPrompt: row?.globalSystemPrompt || '',
    defaultModel: row?.defaultModel || '',
    timezone: row?.timezone || 'UTC',
    globalSandboxEnabled,
    userSandboxEnabled,
    customModels,
    userEmail: user.email,
    userName: user.name,
    userId: user.id,
    createdAt: (user as any).createdAt || (user as any).created_at || null,
  })
}

export async function PUT(request: NextRequest) {
  const user = await requireUser()
  const body = await request.json().catch(() => ({}))
  const mode = body.apiMode === 'byo' ? 'byo' : 'superchat'
  const key = typeof body.customApiKey === 'string' && body.customApiKey.trim() ? encryptSecret(body.customApiKey.trim()) : null
  const url = typeof body.customRouterUrl === 'string' ? body.customRouterUrl.trim().slice(0, 500) : null
  const globalSystemPrompt = typeof body.globalSystemPrompt === 'string' ? body.globalSystemPrompt.slice(0, 3000) : null
  const defaultModel = typeof body.defaultModel === 'string' ? body.defaultModel.trim() : null
  const timezone = typeof body.timezone === 'string' ? body.timezone.trim() : 'UTC'
  const userSandboxEnabled = body.userSandboxEnabled !== undefined ? (body.userSandboxEnabled ? 1 : 0) : 1
  let customModelsJson: string | null = null
  if (Array.isArray(body.customModels)) {
    const cleaned = body.customModels.map((m: any) => String(m).trim()).filter(Boolean)
    customModelsJson = JSON.stringify(cleaned)
  }

  db.prepare(`
    INSERT INTO user_settings (user_id, api_mode, custom_api_key_encrypted, custom_router_url, global_system_prompt, default_model, timezone, sandbox_enabled, custom_models)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      api_mode = excluded.api_mode,
      custom_api_key_encrypted = COALESCE(excluded.custom_api_key_encrypted, user_settings.custom_api_key_encrypted),
      custom_router_url = excluded.custom_router_url,
      global_system_prompt = excluded.global_system_prompt,
      default_model = excluded.default_model,
      timezone = excluded.timezone,
      sandbox_enabled = excluded.sandbox_enabled,
      custom_models = COALESCE(excluded.custom_models, user_settings.custom_models),
      updated_at = CURRENT_TIMESTAMP
  `).run(user.id, mode, key, url, globalSystemPrompt, defaultModel, timezone, userSandboxEnabled, customModelsJson)

  return NextResponse.json({
    ok: true,
    apiMode: mode,
    customRouterUrl: url,
    globalSystemPrompt,
    defaultModel,
    timezone,
    userSandboxEnabled: userSandboxEnabled === 1,
    customModels: customModelsJson ? JSON.parse(customModelsJson) : [],
  })
}

export async function POST(request: NextRequest) {
  const user = await requireUser()
  const body = await request.json().catch(() => ({}))

  if (body.action === 'test_connection') {
    let testUrl = String(body.customRouterUrl || '').trim() || 'https://router.bynara.id/v1'
    if (testUrl.endsWith('/chat/completions')) {
      testUrl = testUrl.replace(/\/chat\/completions$/, '/models')
    } else if (testUrl.endsWith('/')) {
      testUrl = `${testUrl}models`
    } else {
      testUrl = `${testUrl}/models`
    }

    let apiKey = String(body.customApiKey || '').trim()
    if (!apiKey) {
      const row = db
        .prepare('SELECT custom_api_key_encrypted FROM user_settings WHERE user_id = ?')
        .get(user.id) as { custom_api_key_encrypted?: string } | undefined
      if (row?.custom_api_key_encrypted) {
        try {
          apiKey = decryptSecret(row.custom_api_key_encrypted)
        } catch {}
      }
    }
    if (!apiKey) apiKey = process.env.BYNARA_API_KEY || ''

    try {
      const res = await fetch(testUrl, {
        headers: { Authorization: `Bearer ${apiKey}` },
      })
      if (res.ok) {
        return NextResponse.json({
          ok: true,
          status: res.status,
          message: 'Router connection successful! Endpoint and API key are valid.',
        })
      }
      return NextResponse.json({
        ok: false,
        status: res.status,
        message: `Router connection returned status ${res.status}. Please check URL and API Key permissions.`,
      })
    } catch (err: any) {
      return NextResponse.json({
        ok: false,
        status: 500,
        message: `Failed to connect to router endpoint: ${err?.message || 'Network error'}`,
      })
    }
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
}

