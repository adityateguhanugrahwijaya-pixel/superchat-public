import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { auth } from '@/lib/auth'
import { headers } from 'next/headers'
import { decryptSecret } from '@/lib/crypto'

const FALLBACK_MODELS = [
  { id: 'agnes-2.5-flash', name: 'Agnes 2.5 Flash' },
  { id: 'deepseek-v4-flash', name: 'DeepSeek v4 Flash' },
  { id: 'deepseek-v4-pro', name: 'DeepSeek v4 Pro' },
  { id: 'gpt-5.4', name: 'GPT 5.4' },
  { id: 'claude-sonnet-5', name: 'Claude Sonnet 5' },
  { id: 'qwen3.8-flash', name: 'Qwen 3.8 Flash' },
]

export async function GET() {
  let targetUrl = 'https://router.bynara.id/v1/models'
  let apiKey = process.env.BYNARA_API_KEY || ''
  let userCustomModels: { id: string; name: string }[] = []

  try {
    const session = await auth.api.getSession({ headers: await headers() })
    if (session?.user) {
      const settings = db
        .prepare(
          'SELECT api_mode as apiMode, custom_router_url as customRouterUrl, custom_api_key_encrypted as customKeyEncrypted, custom_models as customModels FROM user_settings WHERE user_id = ?'
        )
        .get(session.user.id) as
        | { apiMode?: string; customRouterUrl?: string; customKeyEncrypted?: string; customModels?: string }
        | undefined

      if (settings?.customModels) {
        try {
          const parsed = JSON.parse(settings.customModels)
          if (Array.isArray(parsed)) {
            userCustomModels = parsed
              .map((m: any) => {
                const modelId = typeof m === 'string' ? m.trim() : String(m?.id || '').trim()
                const modelName = typeof m === 'object' && m?.name ? String(m.name).trim() : modelId
                return modelId ? { id: modelId, name: modelName } : null
              })
              .filter((m): m is { id: string; name: string } => m !== null)
          }
        } catch {}
      }

      if (settings?.apiMode === 'byo' && settings?.customRouterUrl?.trim()) {
        let base = settings.customRouterUrl.trim()
        if (base.endsWith('/chat/completions')) {
          base = base.replace(/\/chat\/completions$/, '')
        }
        if (base.endsWith('/')) {
          targetUrl = `${base}models`
        } else {
          targetUrl = `${base}/models`
        }

        if (settings.customKeyEncrypted) {
          try {
            apiKey = decryptSecret(settings.customKeyEncrypted)
          } catch {}
        }
      }
    }
  } catch {}

  let providerModels: { id: string; name: string }[] = []
  try {
    const response = await fetch(targetUrl, {
      headers: { Authorization: `Bearer ${apiKey}` },
    })

    if (response.ok) {
      const data = await response.json()
      providerModels = (data.data ?? []).map((model: { id: string; name?: string }) => ({
        id: model.id,
        name: model.name || model.id,
      }))
    }
  } catch {}

  if (providerModels.length === 0) {
    providerModels = FALLBACK_MODELS
  }

  // Combine user custom models first + provider models second (deduped by ID)
  const combined: { id: string; name: string }[] = []
  const seenIds = new Set<string>()

  for (const m of [...userCustomModels, ...providerModels]) {
    const lowerId = m.id.toLowerCase()
    if (!seenIds.has(lowerId)) {
      seenIds.add(lowerId)
      combined.push(m)
    }
  }

  return NextResponse.json(combined)
}
