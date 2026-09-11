import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/session'
import { db } from '@/lib/db'
import { getChat, createChatFile, saveChat, MessageItem } from '@/lib/chats'
import { performWebSearch } from '@/lib/websearch'

export async function POST(request: NextRequest) {
  const user = await requireUser()
  const body = await request.json().catch(() => ({}))
  const chatId = String(body.chatId || '')
  const content = String(body.content || '').trim()
  const model = String(body.model || 'deepseek/deepseek-chat')
  const temperature = Math.min(2, Math.max(0, Number(body.temperature ?? 0.7)))
  const topP = Math.min(1, Math.max(0, Number(body.topP ?? 1)))
  const maxTokens = Math.min(32768, Math.max(256, Math.floor(Number(body.maxTokens ?? 4096))))
  const enableWebSearch = Boolean(body.webSearch)

  if (!chatId || !content || !model) {
    return NextResponse.json({ error: 'chatId, content, and model are required' }, { status: 400 })
  }

  // Get or create chat file
  let chat = getChat(user.email, chatId)
  if (!chat) {
    const title = content.length > 42 ? `${content.slice(0, 42)}…` : content
    chat = createChatFile(user.email, {
      id: chatId,
      title,
      model,
      systemPrompt: String(body.systemPrompt || ''),
    })
  }

  // Check settings & rate limits in SQLite
  const settingsStmt = db.prepare(
    'SELECT api_mode as apiMode, custom_router_url as customRouterUrl, custom_api_key_encrypted as customKeyEncrypted, global_system_prompt as globalSystemPrompt FROM user_settings WHERE user_id = ?'
  )
  const settings = settingsStmt.get(user.id) as
    | { apiMode?: string; customRouterUrl?: string; customKeyEncrypted?: string; globalSystemPrompt?: string }
    | undefined
  const apiMode = settings?.apiMode || 'superchat'

  const defaultRouterUrl = 'https://router.bynara.id/v1'
  const isCustom = apiMode === 'byo' && Boolean(settings?.customRouterUrl?.trim())
  const activeRouterUrl = isCustom ? settings!.customRouterUrl!.trim() : defaultRouterUrl

  let apiKey = process.env.BYNARA_API_KEY || ''
  if (isCustom && settings?.customKeyEncrypted) {
    try {
      const { decryptSecret } = await import('@/lib/crypto')
      const decrypted = decryptSecret(settings.customKeyEncrypted)
      if (decrypted) apiKey = decrypted
    } catch {
      /* fallback to default key */
    }
  }

  let endpointUrl = activeRouterUrl
  if (endpointUrl.endsWith('/chat/completions')) {
    // keep as is
  } else if (endpointUrl.endsWith('/')) {
    endpointUrl = `${endpointUrl}chat/completions`
  } else {
    endpointUrl = `${endpointUrl}/chat/completions`
  }

  // Grounding & LLM Request Setup

  // Perform free Web Search Grounding if enabled
  let searchGroundingPrompt = ''
  if (enableWebSearch) {
    const searchData = await performWebSearch(content)
    if (searchData.formattedContext) {
      searchGroundingPrompt = searchData.formattedContext
    }
  }

  // Build message history
  const systemMessage = []
  if (searchGroundingPrompt) {
    systemMessage.push({ role: 'system', content: searchGroundingPrompt })
  }
  const effectiveSystemPrompt = chat.systemPrompt || settings?.globalSystemPrompt || ''
  if (effectiveSystemPrompt) {
    systemMessage.push({ role: 'system', content: effectiveSystemPrompt })
  }


  const history = chat.messages.map((m) => ({ role: m.role, content: m.content }))
  const apiMessages = [...systemMessage, ...history, { role: 'user', content }]

  // Add user message to chat file
  const userMsg: MessageItem = {
    id: crypto.randomUUID(),
    role: 'user',
    content,
    createdAt: new Date().toISOString(),
  }
  chat.messages.push(userMsg)
  chat.updatedAt = new Date().toISOString()
  saveChat(user.email, chat)

  // Call upstream LLM router
  const upstream = await fetch(endpointUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: apiMessages,
      stream: true,
      temperature,
      top_p: topP,
      max_tokens: maxTokens,
    }),
  })

  if (!upstream.ok || !upstream.body) {
    let rawDetail = ''
    try {
      const errJson = await upstream.json()
      rawDetail = errJson.error?.message || errJson.message || (typeof errJson.error === 'string' ? errJson.error : JSON.stringify(errJson))
    } catch {
      try {
        rawDetail = await upstream.text()
      } catch {
        rawDetail = ''
      }
    }

    const cleanDetail = rawDetail ? `: ${rawDetail.trim().slice(0, 300)}` : ''
    let errorText = `Router returned status ${upstream.status}${cleanDetail}`

    if (upstream.status === 429) {
      errorText = `Router Rate Limit / Quota Exceeded (429)${cleanDetail}`
    } else if (upstream.status === 401) {
      errorText = `Router Authentication Failed (401 Invalid API Key)${cleanDetail}`
    } else if (upstream.status === 403) {
      errorText = `Router Access Denied (403 Forbidden)${cleanDetail}`
    } else if (upstream.status === 404) {
      errorText = `Router Model Not Found (404)${cleanDetail}`
    } else if (upstream.status === 400) {
      errorText = `Router Bad Request (400)${cleanDetail}`
    } else if (upstream.status >= 500) {
      errorText = `Router Server Error (${upstream.status})${cleanDetail}`
    }

    return NextResponse.json({ error: errorText, status: upstream.status }, { status: upstream.status || 502 })
  }


  const encoder = new TextEncoder()
  const decoder = new TextDecoder()
  let assistantText = ''

  const stream = new ReadableStream({
    async start(controller) {
      const reader = upstream.body!.getReader()
      let buffer = ''
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() || ''
          for (const line of lines) {
            if (!line.startsWith('data:')) continue
            const data = line.slice(5).trim()
            if (data === '[DONE]') continue
            try {
              const token = JSON.parse(data).choices?.[0]?.delta?.content || ''
              if (token) {
                assistantText += token
                controller.enqueue(encoder.encode(token))
              }
            } catch {
              /* ignore chunk parse errors */
            }
          }
        }

        if (assistantText) {
          // Append assistant message and save chat file
          const currentChat = getChat(user.email, chatId)
          if (currentChat) {
            currentChat.messages.push({
              id: crypto.randomUUID(),
              role: 'assistant',
              content: assistantText,
              createdAt: new Date().toISOString(),
            })
            currentChat.updatedAt = new Date().toISOString()
            saveChat(user.email, currentChat)
          }

          // Record usage in SQLite with activeRouterUrl
          const estimatedTokens = Math.max(1, Math.ceil((content.length + assistantText.length) / 4))
          db.prepare(
            `INSERT INTO usage_logs (id, user_id, usage_date, tokens_used, model, router_url) VALUES (?, ?, DATE('now'), ?, ?, ?)`
          ).run(crypto.randomUUID(), user.id, estimatedTokens, model, activeRouterUrl)
        }

        controller.close()
      } catch (error) {
        controller.error(error)
      }
    },
  })


  return new Response(stream, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
