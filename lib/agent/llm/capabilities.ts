import { sqlite } from '../../db'

export type ToolMode = 'native' | 'text'

export interface ModelCapabilities {
  toolMode: ToolMode
  contextWindow: number
  supportsVision: boolean
  supportsUsage: boolean
}

const DEFAULT_CAPABILITIES: ModelCapabilities = {
  toolMode: 'text',
  contextWindow: 32_768,
  supportsVision: false,
  supportsUsage: false,
}

const CAPABILITIES_TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7 days
const MAX_CONTEXT_CAP = Number(process.env.AGENT_CONTEXT_CAP || 100_000)

// Initialize non-destructive cache table in SQLite
try {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS model_capabilities (
      router_url TEXT NOT NULL,
      model TEXT NOT NULL,
      tool_mode TEXT NOT NULL,
      context_window INTEGER NOT NULL,
      supports_vision INTEGER NOT NULL,
      supports_usage INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (router_url, model)
    )
  `)
} catch {}

function getCachedCapabilities(routerUrl: string, model: string): ModelCapabilities | null {
  try {
    const row = sqlite
      .prepare(
        'SELECT tool_mode, context_window, supports_vision, supports_usage, updated_at FROM model_capabilities WHERE router_url = ? AND model = ?'
      )
      .get(routerUrl, model) as
      | {
          tool_mode: string
          context_window: number
          supports_vision: number
          supports_usage: number
          updated_at: number
        }
      | undefined

    if (row && Date.now() - row.updated_at < CAPABILITIES_TTL_MS) {
      return {
        toolMode: row.tool_mode === 'native' ? 'native' : 'text',
        contextWindow: Math.min(row.context_window, MAX_CONTEXT_CAP),
        supportsVision: Boolean(row.supports_vision),
        supportsUsage: Boolean(row.supports_usage),
      }
    }
  } catch {}
  return null
}

export function saveCachedCapabilities(
  routerUrl: string,
  model: string,
  caps: ModelCapabilities
): void {
  try {
    sqlite
      .prepare(
        `INSERT INTO model_capabilities (router_url, model, tool_mode, context_window, supports_vision, supports_usage, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(router_url, model) DO UPDATE SET
           tool_mode = excluded.tool_mode,
           context_window = excluded.context_window,
           supports_vision = excluded.supports_vision,
           supports_usage = excluded.supports_usage,
           updated_at = excluded.updated_at`
      )
      .run(
        routerUrl,
        model,
        caps.toolMode,
        caps.contextWindow,
        caps.supportsVision ? 1 : 0,
        caps.supportsUsage ? 1 : 0,
        Date.now()
      )
  } catch {}
}

export function invalidateCapabilities(routerUrl: string, model: string): void {
  try {
    sqlite.prepare('DELETE FROM model_capabilities WHERE router_url = ? AND model = ?').run(routerUrl, model)
  } catch {}
}

/**
 * Probes the model with a minimal tool-call request to test native tools support.
 */
async function probeNativeTools(routerUrl: string, model: string, apiKey: string): Promise<boolean> {
  const endpoint = routerUrl.endsWith('/chat/completions')
    ? routerUrl
    : `${routerUrl.replace(/\/+$/, '')}/chat/completions`

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 25_000)

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: 'Ping. Call the test tool.' }],
        tools: [
          {
            type: 'function',
            function: {
              name: '__probe_tool',
              description: 'Probe tool',
              parameters: { type: 'object', properties: {} },
            },
          },
        ],
        max_tokens: 512,
      }),
    })

    if (!res.ok) {
      return false
    }

    const data = await res.json()
    const toolCalls = data.choices?.[0]?.message?.tool_calls
    return Array.isArray(toolCalls) && toolCalls.length > 0
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Resolves model capabilities according to priority order:
 * 1. Manual override (env / config)
 * 2. SQLite Cache (within TTL)
 * 3. Probe test
 * 4. Safe fallback
 */
export async function getModelCapabilities(
  routerUrl: string,
  model: string,
  apiKey: string,
  modelMetadata?: { context_window?: number; vision?: boolean }
): Promise<ModelCapabilities> {
  // 1. Manual override via env (e.g. AGENT_FORCE_TOOL_MODE=native|text)
  const forcedMode = process.env.AGENT_FORCE_TOOL_MODE
  if (forcedMode === 'native' || forcedMode === 'text') {
    return {
      toolMode: forcedMode,
      contextWindow: Math.min(modelMetadata?.context_window || DEFAULT_CAPABILITIES.contextWindow, MAX_CONTEXT_CAP),
      supportsVision: Boolean(modelMetadata?.vision),
      supportsUsage: true,
    }
  }

  // 2. Cache
  const cached = getCachedCapabilities(routerUrl, model)
  if (cached) {
    return cached
  }

  // Skip probe for unit tests and mock addresses
  if (routerUrl.includes('127.0.0.1') || routerUrl.includes('localhost') || apiKey === 'test' || apiKey === 'mock') {
    return {
      ...DEFAULT_CAPABILITIES,
      contextWindow: Math.min(modelMetadata?.context_window || DEFAULT_CAPABILITIES.contextWindow, MAX_CONTEXT_CAP),
    }
  }

  // 3. Optimistic native mode (or active probe if AGENT_PROBE_TOOLS=true)
  const shouldProbe = process.env.AGENT_PROBE_TOOLS === 'true'
  const supportsNative = shouldProbe
    ? (apiKey ? await probeNativeTools(routerUrl, model, apiKey) : false)
    : Boolean(apiKey)

  const resolved: ModelCapabilities = {
    toolMode: supportsNative ? 'native' : 'text',
    contextWindow: Math.min(modelMetadata?.context_window || DEFAULT_CAPABILITIES.contextWindow, MAX_CONTEXT_CAP),
    supportsVision: Boolean(modelMetadata?.vision),
    supportsUsage: true,
  }

  // Save to cache
  saveCachedCapabilities(routerUrl, model, resolved)

  return resolved
}
