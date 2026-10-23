import { NextRequest, NextResponse } from 'next/server'
import { requireUser, isAuthError } from '@/lib/session'
import { db } from '@/lib/db'
import { getChat, createChatFile, saveChat, MessageItem } from '@/lib/chats'
import { performWebSearch } from '@/lib/websearch'
import { isSandboxEnabled, isUserSandboxEnabled, resolveSandboxPath } from '@/lib/sandbox'
import { executeSandboxTool } from '@/lib/sandbox/executor'
import { runAgent } from '@/lib/agent/engine'
import { createLegacyEventStream } from '@/lib/agent/stream/legacy'
import { createSSEEventStream } from '@/lib/agent/stream/sse'
import { processUserAttachments } from '@/lib/agent/uploads'
import { formatSkillsCatalogPrompt } from '@/lib/agent/skills/loader'
import { cleanAssistantContent } from '@/lib/agent/llm/toolcall-text'
import fs from 'node:fs'

// In-memory registry for background running jobs (shared via globalThis across route handlers)
const globalForJobs = globalThis as unknown as {
  __superchatActiveAgentJobs?: Map<string, { cancel: boolean; startedAt: number; abortController?: AbortController }>
}
const activeAgentJobs =
  globalForJobs.__superchatActiveAgentJobs ||
  (globalForJobs.__superchatActiveAgentJobs = new Map<
    string,
    { cancel: boolean; startedAt: number; abortController?: AbortController }
  >())

const KNOWN_TOOLS = new Set([
  'run_python',
  'run_node',
  'execute_command',
  'run_shell',
  'write_file',
  'read_file',
  'edit_file',
  'list_dir',
  'delete_file',
])

function extractToolAndParams(data: any): { tool: string; params: Record<string, any> } | null {
  if (!data || typeof data !== 'object') return null

  // 1. Determine tool name
  let tool = String(
    data.tool ||
    data.name ||
    data.action ||
    data.function?.name ||
    ''
  ).trim()

  // If not found in standard properties, check if a known tool is the key itself
  // e.g. { "run_python": { "code": "..." } } or { "run_python": "print(1)" }
  if (!tool) {
    for (const key of Object.keys(data)) {
      const lower = key.toLowerCase().trim()
      if (KNOWN_TOOLS.has(lower)) {
        tool = lower
        const val = data[key]
        if (typeof val === 'string') {
          return { tool, params: { code: val, command: val, content: val, path: val } }
        } else if (val && typeof val === 'object') {
          return { tool, params: val }
        }
      }
    }
  }

  if (!tool) return null

  const lowerTool = tool.toLowerCase()
  if (KNOWN_TOOLS.has(lowerTool)) {
    tool = lowerTool
  }

  // 2. Extract params
  let rawParams =
    data.params ??
    data.parameters ??
    data.input ??
    data.arguments ??
    data.function?.arguments

  if (typeof rawParams === 'string') {
    const trimmed = rawParams.trim()
    try {
      rawParams = JSON.parse(trimmed)
    } catch {
      rawParams = { code: trimmed, command: trimmed, content: trimmed, path: trimmed }
    }
  }

  let params: Record<string, any> = (rawParams && typeof rawParams === 'object' && !Array.isArray(rawParams)) ? { ...rawParams } : {}

  // 3. Merge in top-level fields (e.g. { "tool": "run_python", "code": "..." })
  const {
    tool: _t,
    name: _n,
    action: _a,
    type: _ty,
    function: _f,
    id: _id,
    params: _p,
    arguments: _args,
    parameters: _params,
    input: _in,
    ...topLevelFields
  } = data

  params = { ...topLevelFields, ...params }

  return { tool, params }
}

function parseToolCallJson(rawStr: string): { tool?: string; params?: Record<string, any> } | null {
  const trimmed = rawStr.trim()
  if (!trimmed) return null

  // Attempt 1: Direct JSON parse
  try {
    const data = JSON.parse(trimmed)
    const res = extractToolAndParams(data)
    if (res && res.tool) return res
  } catch {}

  // Attempt 2: Sanitize literal unescaped newlines/tabs inside string literals
  try {
    let sanitized = ''
    let inString = false
    let isEscaped = false

    for (let i = 0; i < trimmed.length; i++) {
      const char = trimmed[i]
      if (char === '"' && !isEscaped) {
        inString = !inString
        sanitized += char
        isEscaped = false
        continue
      }

      if (inString) {
        if (char === '\n') {
          sanitized += '\\n'
        } else if (char === '\r') {
          sanitized += '\\r'
        } else if (char === '\t') {
          sanitized += '\\t'
        } else {
          sanitized += char
        }
      } else {
        sanitized += char
      }

      if (char === '\\' && !isEscaped) {
        isEscaped = true
      } else {
        isEscaped = false
      }
    }

    sanitized = sanitized.replace(/,\s*([}\]])/g, '$1')

    const data = JSON.parse(sanitized)
    const res = extractToolAndParams(data)
    if (res && res.tool) return res
  } catch {}

  // Attempt 3: Plaintext or regex fallback extraction
  try {
    const plainToolMatch = trimmed.match(/^([a-zA-Z_]+)(?::|\n)([\s\S]*)$/)
    if (plainToolMatch) {
      const toolCandidate = plainToolMatch[1].trim().toLowerCase()
      if (KNOWN_TOOLS.has(toolCandidate)) {
        const body = plainToolMatch[2].trim()
        return {
          tool: toolCandidate,
          params: { code: body, command: body, content: body, path: body },
        }
      }
    }

      const toolMatch = trimmed.match(/["']?(?:tool|name|action)["']?\s*:\s*["']([^"']+)["']/i)
    if (toolMatch) {
      const tool = toolMatch[1].trim()
      const codeMatch = trimmed.match(/["']?(?:code|script|content|command)["']?\s*:\s*["']([\s\S]*?)(?:["']\s*[,}]|$)/i)
      const pathMatch = trimmed.match(/["']?(?:path|filename|filepath|file)["']?\s*:\s*["']([^"']+)["']/i)
      const rawBody = codeMatch
        ? codeMatch[1].replace(/\\(\\|n|r|t|")/g, (_m, c) =>
            c === 'n' ? '\n' : c === 'r' ? '\r' : c === 't' ? '\t' : c === '"' ? '"' : '\\'
          )
        : ''
      return {
        tool,
        params: {
          code: rawBody,
          command: rawBody,
          content: rawBody,
          path: pathMatch ? pathMatch[1] : '',
        },
      }
    }
  } catch {}

  return null
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await requireUser()
    const searchParams = new URL(request.url).searchParams
    const chatId = searchParams.get('chatId')
    if (chatId) {
      const job = activeAgentJobs.get(chatId)
      if (job) {
        job.cancel = true
        job.abortController?.abort()
      }
      const chat = getChat(user.email, chatId)
      if (chat) {
        chat.isAgentRunning = false
        chat.activity = 'idle'
        saveChat(user.email, chat)
      }
    }
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    if (isAuthError(err)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return NextResponse.json({ error: err?.message || 'Server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  let user: any
  try {
    user = await requireUser()
  } catch (err: any) {
    if (isAuthError(err)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return NextResponse.json({ error: err?.message || 'Server error' }, { status: 500 })
  }
  const body = await request.json().catch(() => ({}))
  const chatId = String(body.chatId || '')

  if (body.cancel || body.action === 'cancel') {
    if (chatId) {
      const job = activeAgentJobs.get(chatId)
      if (job) {
        job.cancel = true
        job.abortController?.abort()
      }
      const chat = getChat(user.email, chatId)
      if (chat) {
        chat.isAgentRunning = false
        chat.activity = 'idle'
        saveChat(user.email, chat)
      }
    }
    return NextResponse.json({ ok: true, cancelled: true })
  }

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
  let searchGroundingPrompt = ''
  if (enableWebSearch) {
    const searchData = await performWebSearch(content)
    if (searchData.formattedContext) {
      searchGroundingPrompt = searchData.formattedContext
    }
  }

  const sandboxActive = isUserSandboxEnabled(user.id)

  // Build single combined system message at index 0
  const systemParts: string[] = []

  if (sandboxActive) {
    systemParts.push(
      `[System Workspace & Autonomous Sandbox Tool Capabilities]\n` +
        `You are SuperChat AI, an autonomous coding partner equipped with an active isolated sandbox workspace for this conversation.\n\n` +
        `CRITICAL FILE & TOOL RULES:\n` +
        `1. AUTONOMOUS TOOL CALLING: You can execute tools inside the sandbox directory. To execute a tool, output a JSON block wrapped in \`\`\`tool_call ... \`\`\` as follows:\n` +
        `\`\`\`tool_call\n` +
        `{\n` +
        `  "tool": "tool_name",\n` +
        `  "params": {\n` +
        `    "key": "value"\n` +
        `  }\n` +
        `}\n` +
        `\`\`\`\n` +
        `AVAILABLE TOOLS & FORMATS:\n` +
        `- run_python: {"tool": "run_python", "params": {"code": "python code..."}} (runs python script in sandbox)\n` +
        `- run_node: {"tool": "run_node", "params": {"code": "js code..."}} (runs nodejs script in sandbox)\n` +
        `- execute_command: {"tool": "execute_command", "params": {"command": "shell command..."}} (e.g. "pip install pkg" or "python script.py")\n` +
        `- write_file: {"tool": "write_file", "params": {"path": "filename.ext", "content": "..."}} (write or overwrite file in sandbox)\n` +
        `- read_file: {"tool": "read_file", "params": {"path": "filename.ext"}} (read file contents)\n` +
        `- edit_file: {"tool": "edit_file", "params": {"path": "filename.ext", "target": "old text", "replacement": "new text"}}\n` +
        `- list_dir: {"tool": "list_dir", "params": {"path": "."}} (list directory items)\n` +
        `- delete_file: {"tool": "delete_file", "params": {"path": "filename.ext"}}\n` +
        `- preview_file: {"tool": "preview_file", "params": {"path": "filename.ext", "pages": "1-3", "mode": "auto"}} (inspects and lints PDF/PPTX/DOCX/image before presenting)\n` +
        `- present_files: {"tool": "present_files", "params": {"files": ["filename.ext"]}} (presents final file card(s) to user)\n\n` +
        `2. RELATIVE PATHS ONLY:\n` +
        `- Always create and write files using simple relative filenames in the current directory (e.g. "proposal.pdf" or "app.py").\n` +
        `- NEVER use '/mnt/data/', '/tmp/', '/root/', or absolute paths! They will fail.\n\n` +
        `3. AGENTIC EXECUTION & RECOVERY:\n` +
        `- When creating files, scripts, documents, or running code: FIRST call write_file, run_python, run_node, or execute_command.\n` +
        `- If a tool execution fails or returns an error (e.g., SyntaxError, Missing Module), inspect the error output, fix your code, or run missing setup commands, and call the tool again.\n` +
        `- Continue iterating autonomously in a loop until the file or code runs cleanly.\n\n` +
        `4. PREVIEW & PRESENTATION WORKFLOW:\n` +
        `- Setelah membuat PDF/PPTX/DOCX/gambar untuk user, panggil preview_file. Jika ada teks terpotong, tumpang tindih, kotak/glyph hilang, atau halaman kosong, perbaiki dan preview ulang (maksimal 2 putaran), baru present_files. present_files tetap berjalan tanpa preview, tapi hasilnya menyertakan catatan jika file belum di-preview.\n\n` +
        `5. FILE REFERENCING (<file path="...">Title</file>):\n` +
        `- Markdown code blocks: Use standard \`\`\`python ... \`\`\` for showing code directly in chat text.\n` +
        `- <file path="filename.ext">Display Title</file>: The <file> tag is STRICTLY a reference card to point to an ACTUAL existing file in the sandbox workspace.\n` +
        `- STRICT 5-WORD LIMIT: The title inside <file> tag MUST BE 5 WORDS OR FEWER (e.g. <file path="app.py">Main Script</file>). NEVER place code, script contents, or text longer than 5 words inside <file> tags. Titles exceeding 5 words will be automatically rejected and sanitized.\n` +
        `- ONLY output a <file> tag AFTER the file has actually been written/created in the sandbox workspace.`
    )

    const skillsPrompt = formatSkillsCatalogPrompt()
    if (skillsPrompt) {
      systemParts.push(skillsPrompt)
    }
  }

  if (enableWebSearch) {
    systemParts.push(
      `[Web Search Status: ACTIVE]\n` +
        `Live Web Search Grounding is ENABLED. You have access to real-time internet search context.\n` +
        `CRITICAL CITATION MANDATE: You MUST cite your references using markdown links like [Source Title](URL) directly in your response text. Always include clickable markdown links [Title](URL) for every source you use.`
    )
    if (searchGroundingPrompt) {
      systemParts.push(searchGroundingPrompt)
    }
  }

  const defaultPersona = 'You are SuperChat AI, a helpful assistant.'
  const effectiveSystemPrompt = (chat.systemPrompt || settings?.globalSystemPrompt || defaultPersona).trim()
  if (effectiveSystemPrompt) {
    systemParts.push(effectiveSystemPrompt)
  }

  const singleSystemPrompt = systemParts.filter(Boolean).join('\n\n')
  const capabilityPrompts = [singleSystemPrompt]
  const systemMessage = [{ role: 'system', content: singleSystemPrompt }]

  // Intercept user attachments, save to sandbox uploads/ and generate metadata
  const { processedContent } = processUserAttachments(user.email, chatId, content)
  const effectiveContent = processedContent || content

  // Strip any system messages from history so only 1 system message is at index 0
  const history = chat.messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({ role: m.role, content: m.content }))
  const apiMessages = [...systemMessage, ...history, { role: 'user', content: effectiveContent }]

  // Add user message to chat file
  const userMsg: MessageItem = {
    id: crypto.randomUUID(),
    role: 'user',
    content: effectiveContent,
    createdAt: new Date().toISOString(),
  }
  chat.messages.push(userMsg)

  // Add initial assistant message placeholder (schema: 2 for structured prose + toolCalls + files)
  const assistantMsgId = crypto.randomUUID()
  const assistantMsg: MessageItem = {
    id: assistantMsgId,
    schema: 2,
    role: 'assistant',
    content: '',
    toolCalls: [],
    files: [],
    createdAt: new Date().toISOString(),
  }
  chat.schema = 2
  chat.messages.push(assistantMsg)
  chat.isAgentRunning = sandboxActive
  chat.activity = 'thinking'
  chat.runStatus = { state: 'running' }
  chat.updatedAt = new Date().toISOString()
  saveChat(user.email, chat)

  // Set up job tracker
  const abortController = new AbortController()
  const currentJob = { cancel: false, startedAt: Date.now(), abortController }
  if (sandboxActive) {
    activeAgentJobs.set(chatId, currentJob)
  }

  const useV2Engine = process.env.AGENT_ENGINE !== 'legacy'

  if (useV2Engine) {
    const streamFormat = (process.env.STREAM_FORMAT || 'sse').toLowerCase()
    const isSSEFormat = streamFormat === 'sse'

    let finalAssistantText = ''
    let recordedToolCalls: Array<{ id?: string; toolName: string; status: 'running' | 'success' | 'failed'; output?: string }> = []
    let recordedFiles: Array<{ path: string; title: string }> = []
    let finalRunStatus: { state: 'running' | 'completed' | 'failed'; code?: string; userMessage?: string; detail?: string } | null = {
      state: 'running',
    }
    let promptTokens = 0
    let completionTokens = 0

    const agentGen = runAgent({
      userEmail: user.email,
      chatId,
      model,
      endpointUrl,
      apiKey,
      systemMessages: capabilityPrompts,
      history,
      userMessage: effectiveContent,
      temperature,
      topP,
      maxTokens,
      sandboxActive,
      signal: abortController.signal,
      onProgressSave: async (text, toolCalls, meta) => {
        finalAssistantText = text
        recordedToolCalls = [...toolCalls]
        if (meta?.files) {
          recordedFiles = [...meta.files]
        }
        if (meta?.runStatus !== undefined) {
          finalRunStatus = meta.runStatus
        }
        const liveChat = getChat(user.email, chatId)
        if (liveChat) {
          liveChat.schema = 2
          const idx = liveChat.messages.findIndex((m) => m.id === assistantMsgId)
          if (idx !== -1) {
            liveChat.messages[idx].schema = 2
            liveChat.messages[idx].toolCalls = [...toolCalls]
            if (recordedFiles.length > 0) {
              liveChat.messages[idx].files = [...recordedFiles]
            }
            liveChat.messages[idx].content = isSSEFormat ? text.trim() : cleanAssistantContent(text)
            if (meta?.runStatus !== undefined) {
              liveChat.messages[idx].runStatus = meta.runStatus
            }
          }
          if (meta?.activity) {
            liveChat.activity = meta.activity
          }
          if (meta?.runStatus !== undefined) {
            liveChat.runStatus = meta.runStatus
          }
          liveChat.updatedAt = new Date().toISOString()
          saveChat(user.email, liveChat)
        }
      },
    })

    async function* wrappedAgent() {
      try {
        for await (const event of agentGen) {
          if (event.type === 'usage') {
            promptTokens = event.promptTokens
            completionTokens = event.completionTokens
          } else if (event.type === 'file') {
            if (!recordedFiles.some((f) => f.path === event.path)) {
              recordedFiles.push({ path: event.path, title: event.title })
            }
            if (!isSSEFormat) {
              const fileTag = `<file path="${event.path}">${event.title}</file>`
              if (!finalAssistantText.includes(fileTag)) {
                finalAssistantText += `\n${fileTag}`
              }
            }
          } else if (event.type === 'error') {
            finalRunStatus = {
              state: 'failed',
              code: event.code || 'LLM_ERROR',
              userMessage: 'Proses gagal, coba lagi',
              detail: event.message,
            }
          }
          yield event
        }
      } finally {
        try {
          const finalChat = getChat(user.email, chatId)
          if (finalChat) {
            finalChat.schema = 2
            const idx = finalChat.messages.findIndex((m) => m.id === assistantMsgId)
            const cleaned = isSSEFormat ? finalAssistantText.trim() : cleanAssistantContent(finalAssistantText)
            const resolvedStatus =
              finalRunStatus?.state === 'running' ? { state: 'completed' as const } : finalRunStatus
            if (idx !== -1) {
              finalChat.messages[idx].schema = 2
              finalChat.messages[idx].content = cleaned
              if (recordedToolCalls.length > 0) {
                finalChat.messages[idx].toolCalls = [...recordedToolCalls]
              }
              if (recordedFiles.length > 0) {
                finalChat.messages[idx].files = [...recordedFiles]
              }
              finalChat.messages[idx].runStatus = resolvedStatus
            }
            finalChat.isAgentRunning = false
            finalChat.activity = 'idle'
            finalChat.runStatus = resolvedStatus
            finalChat.updatedAt = new Date().toISOString()
            saveChat(user.email, finalChat)
          }

          const tokensUsed =
            promptTokens + completionTokens > 0
              ? promptTokens + completionTokens
              : Math.max(1, Math.ceil((content.length + finalAssistantText.length) / 4))

          db.prepare(
            `INSERT INTO usage_logs (id, user_id, usage_date, tokens_used, model, router_url) VALUES (?, ?, DATE('now'), ?, ?, ?)`
          ).run(crypto.randomUUID(), user.id, tokensUsed, model, activeRouterUrl)
        } catch {}
        activeAgentJobs.delete(chatId)
      }
    }

    if (isSSEFormat) {
      const sseStream = createSSEEventStream(wrappedAgent())
      return new Response(sseStream, {
        headers: {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'X-Content-Type-Options': 'nosniff',
        },
      })
    }

    const v2Stream = createLegacyEventStream(wrappedAgent())
    return new Response(v2Stream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  }

  const encoder = new TextEncoder()
  const decoder = new TextDecoder()

  const stream = new ReadableStream({
    async start(controller) {
      let controllerActive = true

      function safeWrite(text: string) {
        if (!controllerActive) return
        try {
          controller.enqueue(encoder.encode(text))
        } catch {
          controllerActive = false
        }
      }

      // Run background execution loop asynchronously
      let turn = 0
      const maxTurns = sandboxActive ? 12 : 1
      let fullAssistantText = ''

      try {
        while (turn < maxTurns) {
          if (currentJob.cancel) break
          turn++

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
              rawDetail =
                errJson.error?.message || errJson.message || (typeof errJson.error === 'string' ? errJson.error : JSON.stringify(errJson))
            } catch {
              try {
                rawDetail = await upstream.text()
              } catch {
                rawDetail = ''
              }
            }

            const cleanDetail = rawDetail ? `: ${rawDetail.trim().slice(0, 300)}` : ''
            const errorText = `[Router Error ${upstream.status}${cleanDetail}]`
            fullAssistantText += `\n\n${errorText}`
            safeWrite(`\n\n${errorText}`)
            break
          }

          let turnText = ''
          const reader = upstream.body.getReader()
          let buffer = ''

          while (true) {
            if (currentJob.cancel) break
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
                  turnText += token
                  fullAssistantText += token
                  safeWrite(token)
                }
              } catch {
                /* ignore chunk parse errors */
              }
            }
          }

          // Persist progress to disk after turn tokens read
          const currentChat = getChat(user.email, chatId)
          if (currentChat) {
            const targetMsgIndex = currentChat.messages.findIndex((m) => m.id === assistantMsgId)
            if (targetMsgIndex !== -1) {
              currentChat.messages[targetMsgIndex].content = fullAssistantText
            } else {
              currentChat.messages.push({
                id: assistantMsgId,
                role: 'assistant',
                content: fullAssistantText,
                createdAt: new Date().toISOString(),
              })
            }
            currentChat.updatedAt = new Date().toISOString()
            saveChat(user.email, currentChat)
          }

          let executedTools = 0

          // Extract and execute tool calls
          const hasToolCallBlock = sandboxActive && (
            turnText.includes('```tool_call') ||
            turnText.includes('```tool') ||
            turnText.includes('<tool_call>')
          )

          if (hasToolCallBlock) {
            const toolCallRegex = /(?:```(?:tool_call|toolcall|tool)\s*([\s\S]*?)\s*```|<tool_call>\s*([\s\S]*?)\s*<\/tool_call>)/gi
            let match

            while ((match = toolCallRegex.exec(turnText)) !== null) {
              if (currentJob.cancel) break
              try {
                const jsonStr = (match[1] || match[2] || '').trim()
                const parsed = parseToolCallJson(jsonStr)

                if (parsed && parsed.tool) {
                  const toolName = parsed.tool
                  const params = parsed.params || {}

                  executedTools++
                  const execMsg = `\n\n> 🛠️ **Executing Tool:** \`${toolName}\`...\n`
                  fullAssistantText += execMsg
                  safeWrite(execMsg)

                  // Execute tool in sandbox
                  const toolResult = await executeSandboxTool(user.email, chatId, toolName, params)

                  const status = toolResult.success ? 'success' : 'failed'
                  const outputSnippet = (toolResult.output || toolResult.error || 'Command executed successfully.').trim()

                  let fileNotice = ''
                  if (toolResult.filePath) {
                    fileNotice = `\nFiles Created/Updated in Workspace: ${toolResult.filePath}`
                  }

                  // Live stream the completion status & output chunk to client immediately
                  const resultIcon = toolResult.success ? '✅' : '❌'
                  const resultHeader = toolResult.success ? 'Output' : 'Execution Error'
                  const resultMsg = `\n> ${resultIcon} **${resultHeader}:**\n\`\`\`\n${outputSnippet.slice(0, 4000)}\n\`\`\`\n\n`
                  fullAssistantText += resultMsg
                  safeWrite(resultMsg)

                  // Update chat on disk with structured tool result & clean content
                  const toolChat = getChat(user.email, chatId)
                  if (toolChat) {
                    const idx = toolChat.messages.findIndex((m) => m.id === assistantMsgId)
                    if (idx !== -1) {
                      if (!toolChat.messages[idx].toolCalls) {
                        toolChat.messages[idx].toolCalls = []
                      }
                      toolChat.messages[idx].toolCalls!.push({
                        toolName,
                        status,
                        output: outputSnippet.slice(0, 4000),
                      })

                      const cleanContent = cleanAssistantContent(fullAssistantText)
                      toolChat.messages[idx].content = cleanContent
                      toolChat.updatedAt = new Date().toISOString()
                      saveChat(user.email, toolChat)
                    }
                  }

                  // Append current assistant turn and tool output to apiMessages context
                  apiMessages.push({ role: 'assistant', content: turnText })
                  apiMessages.push({
                    role: 'user',
                    content: `[System Tool Execution Feedback]\nTool: ${toolName}\nStatus: ${toolResult.success ? 'SUCCESS' : 'FAILED'}\nOutput:\n${toolResult.output || '(none)'}\nError:\n${toolResult.error || 'none'}${fileNotice}\n\nReview the tool result above. If an error occurred or script failed, fix the code and call the next tool. If complete, summarize your work and display the file reference card <file path="filename.ext">Display Title</file>.`,
                  })
                }
              } catch {
                /* ignore unparseable block */
              }
            }
          }

          // Check for non-existent file references in <file path="..."> tags
          if (sandboxActive && !currentJob.cancel) {
            const missingFiles: string[] = []
            const validFileTagRegex = /<file\s+path=["']([^"']+)["'][^>]*>([\s\S]*?)<\/file>/gi
            let fileMatch
            while ((fileMatch = validFileTagRegex.exec(turnText)) !== null) {
              const targetPath = fileMatch[1].trim()
              if (!targetPath) continue
              try {
                const fullPath = resolveSandboxPath(user.email, chatId, targetPath)
                if (!fs.existsSync(fullPath)) {
                  missingFiles.push(targetPath)
                }
              } catch {
                missingFiles.push(targetPath)
              }
            }

            if (missingFiles.length > 0) {
              for (const missingPath of missingFiles) {
                const stripRegex = new RegExp(`<file\\s+path=["']${missingPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["'][^>]*>[\\s\\S]*?<\\/file>`, 'gi')
                fullAssistantText = fullAssistantText.replace(stripRegex, '')
              }

              apiMessages.push({ role: 'assistant', content: turnText })
              apiMessages.push({
                role: 'user',
                content: `[System File Verification Error]\nThe file(s) referenced in <file> tag(s) DO NOT exist in your workspace: ${missingFiles.map((f) => `"${f}"`).join(', ')}.\n` +
                  `You CANNOT output <file> reference cards for files that do not exist.\n` +
                  `You MUST execute the \`write_file\` tool FIRST to create the file before outputting <file path="...">Title</file>.\n\n` +
                  `Please call \`write_file\` now to create the missing file(s).`,
              })

              executedTools++
            }

            fullAssistantText = fullAssistantText.replace(/<file(?:\s+path=["']\s*["'])?\s*>[\s\S]*?<\/file>|<file\s*\/?>/gi, '')
          }

          if (!sandboxActive || executedTools === 0) {
            break
          }
        }

        // Final cleanup & sanitization pass
        if (fullAssistantText && sandboxActive) {
          const finalCheckRegex = /<file\s+path=["']([^"']+)["'][^>]*>([\s\S]*?)<\/file>/gi
          let finalMatch
          const invalidTags: string[] = []
          while ((finalMatch = finalCheckRegex.exec(fullAssistantText)) !== null) {
            const targetPath = finalMatch[1].trim()
            if (!targetPath) {
              invalidTags.push(finalMatch[0])
              continue
            }
            try {
              const fullPath = resolveSandboxPath(user.email, chatId, targetPath)
              if (!fs.existsSync(fullPath)) {
                invalidTags.push(finalMatch[0])
              }
            } catch {
              invalidTags.push(finalMatch[0])
            }
          }
          for (const tagText of invalidTags) {
            fullAssistantText = fullAssistantText.replace(tagText, '')
          }
          fullAssistantText = fullAssistantText.replace(/<file(?:\s+path=["']\s*["'])?\s*>[\s\S]*?<\/file>|<file\s*\/?>/gi, '')
        }

        // Final save to chat file and mark agent finished
        const finalChat = getChat(user.email, chatId)
        if (finalChat) {
          const cleanedFinalText = cleanAssistantContent(fullAssistantText)
          const idx = finalChat.messages.findIndex((m) => m.id === assistantMsgId)
          if (idx !== -1) {
            finalChat.messages[idx].content = cleanedFinalText
          } else {
            finalChat.messages.push({
              id: assistantMsgId,
              role: 'assistant',
              content: cleanedFinalText,
              createdAt: new Date().toISOString(),
            })
          }
          finalChat.isAgentRunning = false
          finalChat.updatedAt = new Date().toISOString()
          saveChat(user.email, finalChat)
        }

        // Record usage log in SQLite
        if (fullAssistantText) {
          const estimatedTokens = Math.max(1, Math.ceil((content.length + fullAssistantText.length) / 4))
          db.prepare(
            `INSERT INTO usage_logs (id, user_id, usage_date, tokens_used, model, router_url) VALUES (?, ?, DATE('now'), ?, ?, ?)`
          ).run(crypto.randomUUID(), user.id, estimatedTokens, model, activeRouterUrl)
        }
      } catch {
        const errorChat = getChat(user.email, chatId)
        if (errorChat) {
          errorChat.isAgentRunning = false
          saveChat(user.email, errorChat)
        }
      } finally {
        activeAgentJobs.delete(chatId)
        if (controllerActive) {
          try {
            controller.close()
          } catch {}
        }
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
