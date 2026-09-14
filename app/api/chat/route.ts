import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/session'
import { db } from '@/lib/db'
import { getChat, createChatFile, saveChat, MessageItem } from '@/lib/chats'
import { performWebSearch } from '@/lib/websearch'
import { isSandboxEnabled, isUserSandboxEnabled, resolveSandboxPath } from '@/lib/sandbox'
import { executeSandboxTool } from '@/lib/sandbox/executor'
import fs from 'node:fs'

// In-memory registry for background running jobs
const activeAgentJobs = new Map<string, { cancel: boolean; startedAt: number }>()

export async function DELETE(request: NextRequest) {
  const user = await requireUser()
  const searchParams = new URL(request.url).searchParams
  const chatId = searchParams.get('chatId')
  if (chatId) {
    const job = activeAgentJobs.get(chatId)
    if (job) job.cancel = true
    const chat = getChat(user.email, chatId)
    if (chat) {
      chat.isAgentRunning = false
      saveChat(user.email, chat)
    }
  }
  return NextResponse.json({ ok: true })
}

export async function POST(request: NextRequest) {
  const user = await requireUser()
  const body = await request.json().catch(() => ({}))
  const chatId = String(body.chatId || '')

  if (body.cancel || body.action === 'cancel') {
    if (chatId) {
      const job = activeAgentJobs.get(chatId)
      if (job) job.cancel = true
      const chat = getChat(user.email, chatId)
      if (chat) {
        chat.isAgentRunning = false
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

  // Build system message capabilities
  const capabilityPrompts: string[] = []

  if (isUserSandboxEnabled(user.id)) {
    capabilityPrompts.push(
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
        `AVAILABLE TOOLS:\n` +
        `- write_file: {"path": "filename.ext", "content": "..."} (write or overwrite file in sandbox)\n` +
        `- read_file: {"path": "filename.ext"} (read file contents)\n` +
        `- edit_file: {"path": "filename.ext", "target": "old text", "replacement": "new text"}\n` +
        `- list_dir: {"path": "."} (list directory items)\n` +
        `- delete_file: {"path": "filename.ext"}\n` +
        `- run_python: {"code": "python code..."} (runs python script in sandbox)\n` +
        `- run_node: {"code": "js code..."} (runs nodejs script in sandbox)\n` +
        `- execute_command: {"command": "shell command..."} (e.g. "pip install pkg" or "python script.py")\n\n` +
        `2. RELATIVE PATHS ONLY:\n` +
        `- Always create and write files using simple relative filenames in the current directory (e.g. "proposal.pdf" or "app.py").\n` +
        `- NEVER use '/mnt/data/', '/tmp/', '/root/', or absolute paths! They will fail.\n\n` +
        `3. AGENTIC EXECUTION & RECOVERY:\n` +
        `- When creating files, scripts, documents, or running code: FIRST call write_file, run_python, run_node, or execute_command.\n` +
        `- If a tool execution fails or returns an error (e.g., SyntaxError, Missing Module), inspect the error output, fix your code, or run missing setup commands, and call the tool again.\n` +
        `- Continue iterating autonomously in a loop until the file or code runs cleanly.\n\n` +
        `4. FILE REFERENCING (<file path="...">Title</file>):\n` +
        `- Markdown code blocks: Use standard \`\`\`python ... \`\`\` for showing code directly in chat text.\n` +
        `- <file path="filename.ext">Display Title</file>: The <file> tag is STRICTLY a reference card to point to an ACTUAL existing file in the sandbox workspace.\n` +
        `- STRICT 5-WORD LIMIT: The title inside <file> tag MUST BE 5 WORDS OR FEWER (e.g. <file path="app.py">Main Script</file>). NEVER place code, script contents, or text longer than 5 words inside <file> tags. Titles exceeding 5 words will be automatically rejected and sanitized.\n` +
        `- ONLY output a <file> tag AFTER the file has actually been written/created in the sandbox workspace.`
    )
  }

  if (enableWebSearch) {
    capabilityPrompts.push(
      `[Web Search Status: ACTIVE]\n` +
        `Live Web Search Grounding is ENABLED. You have access to real-time internet search context.\n` +
        `CRITICAL CITATION MANDATE: You MUST cite your references using markdown links like [Source Title](URL) directly in your response text. Always include clickable markdown links [Title](URL) for every source you use.`
    )
    if (searchGroundingPrompt) {
      capabilityPrompts.push(searchGroundingPrompt)
    }
  }

  const effectiveSystemPrompt = chat.systemPrompt || settings?.globalSystemPrompt || ''
  if (effectiveSystemPrompt) {
    capabilityPrompts.push(effectiveSystemPrompt)
  }

  const systemMessage = capabilityPrompts.map((text) => ({ role: 'system', content: text }))

  // Strip non-system/history messages for context
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

  const sandboxActive = isUserSandboxEnabled(user.id)

  // Add initial assistant message placeholder
  const assistantMsgId = crypto.randomUUID()
  const assistantMsg: MessageItem = {
    id: assistantMsgId,
    role: 'assistant',
    content: '',
    createdAt: new Date().toISOString(),
  }
  chat.messages.push(assistantMsg)
  chat.isAgentRunning = sandboxActive
  chat.updatedAt = new Date().toISOString()
  saveChat(user.email, chat)

  // Set up job tracker
  const currentJob = { cancel: false, startedAt: Date.now() }
  if (sandboxActive) {
    activeAgentJobs.set(chatId, currentJob)
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

function cleanAssistantContent(rawText: string): string {
  if (!rawText) return ''
  return rawText
    .replace(/(?:```(?:tool_call|toolcall|tool)\s*[\s\S]*?(?:```|$)|<tool_call>\s*[\s\S]*?(?:<\/tool_call>|$))/gi, '')
    .replace(/>?\s*🛠️\s*\*\*Executing Tool:\*\*\s*`?[^`\r\n]+`?\s*(?:\.\.\.)?[\r\n]*/gi, '')
    .replace(/>?\s*(?:✅|❌)\s*\*\*(?:Output|Command executed successfully\.|Execution Error|Error):\*\*\s*[\r\n]*(?:```[\s\S]*?```|[^\r\n]+(?:[\r\n]+(?![#\w]|>|\n\n)[^\r\n]+)*)?[\r\n]*/gi, '')
    .replace(/>?\s*⚠️\s*\*\*Notice:\*\*\s*[^\r\n]*(?:[\r\n]+[^\r\n]+)*/gi, '')
    .replace(/>?\s*(?:✅|❌)?\s*(?:Output|Execution Error|Command executed successfully):\s*[\r\n]*(?:```[\s\S]*?```|[^\r\n]+)?[\r\n]*/gi, '')
    .replace(/\[System Tool Execution Feedback\][\s\S]*?(?=\n\n|$)/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function parseToolCallJson(rawStr: string): { tool?: string; params?: Record<string, any> } | null {
  const trimmed = rawStr.trim()
  if (!trimmed) return null

  // Attempt 1: Direct JSON parse
  try {
    const data = JSON.parse(trimmed)
    if (data && typeof data === 'object') {
      const tool = String(data.tool || data.name || data.action || '').trim()
      const params = data.params || data.arguments || data.parameters || data.input || {}
      return { tool, params }
    }
  } catch {}

  // Attempt 2: Escape literal unescaped newlines/tabs inside string literals
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
    if (data && typeof data === 'object') {
      const tool = String(data.tool || data.name || data.action || '').trim()
      const params = data.params || data.arguments || data.parameters || data.input || {}
      return { tool, params }
    }
  } catch {}

  // Attempt 3: Regex fallback extraction for tool & params if JSON is heavily malformed
  try {
    const toolMatch = trimmed.match(/["']?tool["']?\s*:\s*["']([^"']+)["']/i) || trimmed.match(/["']?name["']?\s*:\s*["']([^"']+)["']/i)
    if (toolMatch) {
      const tool = toolMatch[1].trim()

      const pathMatch = trimmed.match(/["']?(?:path|filename|filepath|file)["']?\s*:\s*["']([^"']+)["']/i)
      const pathVal = pathMatch ? pathMatch[1].trim() : ''

      let contentVal = ''
      const contentMatch = trimmed.match(/["']?(?:content|code|script|text)["']?\s*:\s*["']([\s\S]*?)["']\s*[,}]/i)
      if (contentMatch) {
        contentVal = contentMatch[1]
      }

      return {
        tool,
        params: {
          path: pathVal,
          content: contentVal,
          code: contentVal,
        },
      }
    }
  } catch {}

  return null
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
