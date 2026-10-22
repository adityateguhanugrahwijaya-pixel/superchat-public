/**
 * Resilient LLM Client (Agent v2)
 * Handles streaming completions with exponential backoff retry for 429/5xx/network errors,
 * AbortSignal propagation, reasoning delta separation, and usage calculation.
 */

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  name?: string
  tool_call_id?: string
  tool_calls?: any[]
}

export interface LLMStreamChunk {
  token: string
  reasoning?: string
  toolCallsDelta?: any[]
  usage?: {
    promptTokens: number
    completionTokens: number
    estimated: boolean
  }
}

export interface LLMClientOptions {
  endpointUrl: string
  apiKey: string
  model: string
  messages: LLMMessage[]
  temperature?: number
  topP?: number
  maxTokens?: number
  tools?: any[]
  signal?: AbortSignal
  maxRetries?: number
}

const DEFAULT_MAX_RETRIES = 3
const INITIAL_BACKOFF_MS = 1000

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new Error('Aborted'))
    const timer = setTimeout(resolve, ms)
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer)
        reject(new Error('Aborted'))
      },
      { once: true }
    )
  })
}

export async function* streamChatCompletions(
  options: LLMClientOptions
): AsyncGenerator<LLMStreamChunk, void, unknown> {
  const {
    endpointUrl,
    apiKey,
    model,
    messages,
    temperature = 0.7,
    topP = 1,
    maxTokens = 4096,
    tools,
    signal,
    maxRetries = DEFAULT_MAX_RETRIES,
  } = options

  const payload: Record<string, any> = {
    model,
    messages,
    stream: true,
    temperature,
    top_p: topP,
    max_tokens: maxTokens,
  }

  if (tools && tools.length > 0) {
    payload.tools = tools
  }

  let attempt = 0
  let lastError: Error | null = null

  while (attempt <= maxRetries) {
    if (signal?.aborted) {
      throw new Error('LLM call cancelled by user')
    }

    try {
      const response = await fetch(endpointUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(payload),
        signal,
      })

      if (!response.ok) {
        let errorBody = ''
        try {
          const errJson = await response.json()
          errorBody =
            errJson.error?.message ||
            errJson.message ||
            (typeof errJson.error === 'string' ? errJson.error : JSON.stringify(errJson))
        } catch {
          try {
            errorBody = await response.text()
          } catch {
            errorBody = `HTTP ${response.status}`
          }
        }

        const isRetryable =
          response.status === 429 ||
          (response.status >= 500 && response.status <= 599)

        if (isRetryable && attempt < maxRetries) {
          attempt++
          const backoff = INITIAL_BACKOFF_MS * Math.pow(2, attempt - 1)
          await sleep(backoff, signal)
          continue
        }

        const cleanDetail = errorBody ? `: ${errorBody.trim().slice(0, 300)}` : ''
        throw new Error(`[Router Error ${response.status}${cleanDetail}]`)
      }

      if (!response.body) {
        throw new Error('Empty response body received from router')
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let reportedUsage = false

      let totalContentLength = 0

      while (true) {
        if (signal?.aborted) {
          reader.cancel().catch(() => {})
          throw new Error('LLM stream cancelled by user')
        }

        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed.startsWith('data:')) continue
          const dataStr = trimmed.slice(5).trim()
          if (dataStr === '[DONE]') continue

          let data: any = null
          try {
            data = JSON.parse(dataStr)
          } catch {
            continue
          }

          if (data.error) {
            const errMsg =
              data.error.message ||
              (typeof data.error === 'string' ? data.error : JSON.stringify(data.error))
            throw new Error(`[Router Error: ${errMsg}]`)
          }

          // Extract usage if reported by router
          if (data.usage) {
            reportedUsage = true
            yield {
              token: '',
              usage: {
                promptTokens: data.usage.prompt_tokens || 0,
                completionTokens: data.usage.completion_tokens || 0,
                estimated: false,
              },
            }
          }

          const choice = data.choices?.[0]
          if (!choice) continue

          const delta = choice.delta || {}
          const token = delta.content || ''
          const reasoning = delta.reasoning_content || delta.reasoning || ''
          const toolCallsDelta = delta.tool_calls || choice.tool_calls || undefined

          if (token) {
            totalContentLength += token.length
          }

          if (token || reasoning || toolCallsDelta) {
            yield {
              token,
              reasoning,
              toolCallsDelta,
            }
          }
        }
      }

      // If router didn't include usage, compute estimated tokens
      if (!reportedUsage) {
        const promptChars = messages.reduce((acc, m) => acc + (m.content?.length || 0), 0)
        yield {
          token: '',
          usage: {
            promptTokens: Math.max(1, Math.ceil(promptChars / 4)),
            completionTokens: Math.max(1, Math.ceil(totalContentLength / 4)),
            estimated: true,
          },
        }
      }

      return
    } catch (err: any) {
      if (signal?.aborted || err?.name === 'AbortError') {
        throw new Error('LLM call cancelled by user')
      }

      lastError = err

      // Check if network error (fetch failed) and can retry
      const isNetworkErr = err?.message?.includes('fetch failed') || err?.code === 'ECONNRESET'
      if (isNetworkErr && attempt < maxRetries) {
        attempt++
        const backoff = INITIAL_BACKOFF_MS * Math.pow(2, attempt - 1)
        await sleep(backoff, signal)
        continue
      }

      throw err
    }
  }

  if (lastError) {
    throw lastError
  }
}
