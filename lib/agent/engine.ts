import fs from 'node:fs'
import path from 'node:path'
import { AgentEvent } from './events'
import { streamChatCompletions, LLMMessage } from './llm/client'
import { extractTextToolCalls } from './llm/toolcall-text'
import { executeSandboxTool } from '../sandbox/executor'
import { resolveSandboxPath } from '../sandbox/paths'

export interface RunAgentOptions {
  userEmail: string
  chatId: string
  model: string
  endpointUrl: string
  apiKey: string
  systemMessages: string[]
  history: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>
  userMessage: string
  temperature?: number
  topP?: number
  maxTokens?: number
  sandboxActive: boolean
  signal?: AbortSignal
  maxTurns?: number
  maxToolCalls?: number
  wallClockMs?: number
  onProgressSave?: (
    fullAssistantText: string,
    toolCalls: Array<{ toolName: string; status: 'running' | 'success' | 'failed'; output?: string }>
  ) => Promise<void>
}

const DEFAULT_MAX_TURNS = 25
const DEFAULT_MAX_TOOL_CALLS = 60
const DEFAULT_WALL_CLOCK_MS = 10 * 60 * 1000 // 10 minutes

export async function* runAgent(
  options: RunAgentOptions
): AsyncGenerator<AgentEvent, void, unknown> {
  const {
    userEmail,
    chatId,
    model,
    endpointUrl,
    apiKey,
    systemMessages,
    history,
    userMessage,
    temperature = 0.7,
    topP = 1,
    maxTokens = 4096,
    sandboxActive,
    signal,
    maxTurns = sandboxActive ? Number(process.env.AGENT_MAX_TURNS || DEFAULT_MAX_TURNS) : 1,
    maxToolCalls = Number(process.env.AGENT_MAX_TOOL_CALLS || DEFAULT_MAX_TOOL_CALLS),
    wallClockMs = Number(process.env.AGENT_WALL_CLOCK_MS || DEFAULT_WALL_CLOCK_MS),
    onProgressSave,
  } = options

  const startTime = Date.now()
  let turn = 0
  let totalToolCalls = 0
  let fullAssistantText = ''
  const recordedToolCalls: Array<{ toolName: string; status: 'running' | 'success' | 'failed'; output?: string }> = []

  // Build initial message context
  const apiMessages: LLMMessage[] = [
    ...systemMessages.map((text) => ({ role: 'system' as const, content: text })),
    ...history.map((m) => ({ role: m.role, content: m.content })),
    { role: 'user' as const, content: userMessage },
  ]

  let doneReason: 'completed' | 'max_turns' | 'max_tool_calls' | 'wall_clock' | 'cancelled' | 'llm_error' =
    'completed'

  try {
    while (turn < maxTurns) {
      if (signal?.aborted) {
        doneReason = 'cancelled'
        break
      }

      if (Date.now() - startTime > wallClockMs) {
        doneReason = 'wall_clock'
        break
      }

      if (totalToolCalls >= maxToolCalls) {
        doneReason = 'max_tool_calls'
        break
      }

      turn++
      yield { type: 'turn-start', turn }

      let turnText = ''
      try {
        const stream = streamChatCompletions({
          endpointUrl,
          apiKey,
          model,
          messages: apiMessages,
          temperature,
          topP,
          maxTokens,
          signal,
        })

        for await (const chunk of stream) {
          if (signal?.aborted) {
            doneReason = 'cancelled'
            break
          }

          if (chunk.token) {
            turnText += chunk.token
            fullAssistantText += chunk.token
            yield { type: 'text-delta', text: chunk.token }
          }

          if (chunk.usage) {
            yield {
              type: 'usage',
              promptTokens: chunk.usage.promptTokens,
              completionTokens: chunk.usage.completionTokens,
              estimated: chunk.usage.estimated,
            }
          }
        }
      } catch (err: any) {
        if (signal?.aborted || err?.message?.includes('cancelled')) {
          doneReason = 'cancelled'
        } else {
          doneReason = 'llm_error'
          yield { type: 'error', code: 'LLM_ERROR', message: err?.message || 'LLM error', retryable: false }
        }
        break
      }

      if (signal?.aborted) {
        doneReason = 'cancelled'
        break
      }

      // Save interim progress after tokens received
      if (onProgressSave) {
        await onProgressSave(fullAssistantText, recordedToolCalls).catch(() => {})
      }

      // Parse tool calls in this turn
      let toolCallsInTurn = sandboxActive ? extractTextToolCalls(turnText) : []
      let executedToolsThisTurn = 0

      if (toolCallsInTurn.length > 0) {
        // Fix F11: Push the assistant's turn output ONCE before tool execution feedback
        apiMessages.push({ role: 'assistant', content: turnText })

        for (const call of toolCallsInTurn) {
          if (signal?.aborted || totalToolCalls >= maxToolCalls) break

          const toolId = `call_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
          const toolName = call.tool
          const params = call.params || {}

          totalToolCalls++
          executedToolsThisTurn++

          yield { type: 'tool-call', id: toolId, name: toolName, args: params }

          const toolStart = Date.now()
          const toolResult = await executeSandboxTool(userEmail, chatId, toolName, params, signal)
          const durationMs = Date.now() - toolStart

          const status = toolResult.success ? 'success' : 'failed'
          const outputSnippet = (toolResult.output || toolResult.error || 'Command executed successfully.').trim()

          recordedToolCalls.push({
            toolName,
            status,
            output: outputSnippet.slice(0, 4000),
          })

          if (toolResult.requiresApproval) {
            yield {
              type: 'approval-required',
              toolName,
              params: params,
              reason: toolResult.approvalReason,
            }
          }

          yield {
            type: 'tool-result',
            id: toolId,
            ok: toolResult.success,
            output: outputSnippet,
            durationMs,
            truncated: outputSnippet.length > 4000,
          }

          if (toolResult.presentedFiles && toolResult.presentedFiles.length > 0) {
            for (const pf of toolResult.presentedFiles) {
              yield {
                type: 'file',
                path: pf.path,
                title: pf.title,
              }
            }
          } else if (toolName === 'present_files' && toolResult.filePath) {
            yield {
              type: 'file',
              path: toolResult.filePath,
              title: toolResult.fileTitle || path.basename(toolResult.filePath),
            }
          }

          // Invalidate/save progress with toolCall
          if (onProgressSave) {
            await onProgressSave(fullAssistantText, recordedToolCalls).catch(() => {})
          }

          // Append feedback message for this tool call to context
          let fileNotice = ''
          if (toolResult.filePath) {
            fileNotice = `\nFiles Created/Updated in Workspace: ${toolResult.filePath}`
          }

          apiMessages.push({
            role: 'user',
            content: `[System Tool Execution Feedback]\nTool: ${toolName}\nStatus: ${toolResult.success ? 'SUCCESS' : 'FAILED'}\nOutput:\n${toolResult.output || '(none)'}\nError:\n${toolResult.error || 'none'}${fileNotice}\n\nReview the tool result above. If an error occurred or script failed, fix the code and call the next tool. If complete, summarize your work and display the file reference card <file path="filename.ext">Display Title</file>.`,
          })
        }
      }

      // Check for non-existent file references in <file path="..."> tags
      if (sandboxActive && !signal?.aborted) {
        const missingFiles: string[] = []
        const validFileTagRegex = /<file\s+path=["']([^"']+)["'][^>]*>([\s\S]*?)<\/file>/gi
        let fileMatch: RegExpExecArray | null

        while ((fileMatch = validFileTagRegex.exec(turnText)) !== null) {
          const targetPath = fileMatch[1].trim()
          if (!targetPath) continue
          try {
            const fullPath = resolveSandboxPath(userEmail, chatId, targetPath)
            if (!fs.existsSync(fullPath)) {
              missingFiles.push(targetPath)
            }
          } catch {
            missingFiles.push(targetPath)
          }
        }

        if (missingFiles.length > 0) {
          for (const missingPath of missingFiles) {
            const stripRegex = new RegExp(
              `<file\\s+path=["']${missingPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["'][^>]*>[\\s\\S]*?<\\/file>`,
              'gi'
            )
            fullAssistantText = fullAssistantText.replace(stripRegex, '')
          }

          if (toolCallsInTurn.length === 0) {
            apiMessages.push({ role: 'assistant', content: turnText })
          }

          apiMessages.push({
            role: 'user',
            content:
              `[System File Verification Error]\nThe file(s) referenced in <file> tag(s) DO NOT exist in your workspace: ${missingFiles.map((f) => `"${f}"`).join(', ')}.\n` +
              `You CANNOT output <file> reference cards for files that do not exist.\n` +
              `You MUST execute the \`write_file\` tool FIRST to create the file before outputting <file path="...">Title</file>.\n\n` +
              `Please call \`write_file\` now to create the missing file(s).`,
          })

          executedToolsThisTurn++
        }
      }

      if (!sandboxActive || executedToolsThisTurn === 0) {
        break
      }
    }

    if (turn >= maxTurns && doneReason === 'completed') {
      doneReason = 'max_turns'
    }
  } finally {
    yield { type: 'done', reason: doneReason }
  }
}
