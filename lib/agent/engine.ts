import fs from 'node:fs'
import path from 'node:path'
import { AgentEvent } from './events'
import { streamChatCompletions, LLMMessage } from './llm/client'
import { extractTextToolCalls, createToolCallFilter } from './llm/toolcall-text'
import { toolRegistry } from './tools/registry'
import { getModelCapabilities, saveCachedCapabilities, ModelCapabilities } from './llm/capabilities'
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
  capabilities?: ModelCapabilities
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

  let caps: ModelCapabilities = options.capabilities || {
    toolMode: 'text',
    contextWindow: 32768,
    supportsVision: false,
    supportsUsage: true,
  }
  if (!options.capabilities && sandboxActive) {
    try {
      caps = await getModelCapabilities(endpointUrl, model, apiKey)
    } catch {
      // safe fallback
    }
  }

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

      const toolFilter = createToolCallFilter()
      let turnText = ''
      const accumulatedNativeTools: Record<number, { id: string; name: string; arguments: string }> = {}

      const executeStreamTurn = async function* (withTools: boolean) {
        const toolsSchema =
          sandboxActive && withTools ? toolRegistry.getOpenAISchema() : undefined

        const stream = streamChatCompletions({
          endpointUrl,
          apiKey,
          model,
          messages: apiMessages,
          temperature,
          topP,
          maxTokens,
          tools: toolsSchema,
          signal,
        })

        for await (const chunk of stream) {
          if (signal?.aborted) {
            doneReason = 'cancelled'
            break
          }

          if (chunk.toolCallsDelta && Array.isArray(chunk.toolCallsDelta)) {
            for (const delta of chunk.toolCallsDelta) {
              const idx = delta.index ?? 0
              if (!accumulatedNativeTools[idx]) {
                accumulatedNativeTools[idx] = {
                  id: delta.id || `call_${Date.now()}_${idx}`,
                  name: delta.function?.name || '',
                  arguments: delta.function?.arguments || '',
                }
              } else {
                if (delta.id) accumulatedNativeTools[idx].id = delta.id
                if (delta.function?.name) accumulatedNativeTools[idx].name += delta.function.name
                if (delta.function?.arguments) accumulatedNativeTools[idx].arguments += delta.function.arguments
              }
            }
          }

          if (chunk.token) {
            turnText += chunk.token
            const cleanToken = toolFilter.push(chunk.token)
            if (cleanToken) {
              fullAssistantText += cleanToken
              yield { type: 'text-delta' as const, text: cleanToken }
            }
          }

          if (chunk.usage) {
            yield {
              type: 'usage' as const,
              promptTokens: chunk.usage.promptTokens,
              completionTokens: chunk.usage.completionTokens,
              estimated: chunk.usage.estimated,
            }
          }
        }

        const remainingToken = toolFilter.flush()
        if (remainingToken) {
          fullAssistantText += remainingToken
          yield { type: 'text-delta' as const, text: remainingToken }
        }
      }

      try {
        for await (const ev of executeStreamTurn(caps.toolMode === 'native')) {
          yield ev
        }
      } catch (err: any) {
        if (signal?.aborted || err?.message?.includes('cancelled')) {
          doneReason = 'cancelled'
          break
        }
        // Dynamic fallback: if native tools failed before any output, downgrade to text mode and retry
        if (sandboxActive && caps.toolMode === 'native' && turnText === '' && Object.keys(accumulatedNativeTools).length === 0) {
          caps = { ...caps, toolMode: 'text' }
          saveCachedCapabilities(endpointUrl, model, caps)
          try {
            for await (const ev of executeStreamTurn(false)) {
              yield ev
            }
          } catch (retryErr: any) {
            if (signal?.aborted || retryErr?.message?.includes('cancelled')) {
              doneReason = 'cancelled'
            } else {
              doneReason = 'llm_error'
              yield { type: 'error', code: 'LLM_ERROR', message: retryErr?.message || 'LLM error', retryable: false }
            }
            break
          }
        } else {
          doneReason = 'llm_error'
          yield { type: 'error', code: 'LLM_ERROR', message: err?.message || 'LLM error', retryable: false }
          break
        }
      }

      if (signal?.aborted) {
        doneReason = 'cancelled'
        break
      }

      // Save interim progress after tokens received
      if (onProgressSave) {
        await onProgressSave(fullAssistantText, recordedToolCalls).catch(() => {})
      }

      // Parse tool calls in this turn: native tools + text tool fallback
      const parsedNativeCalls: Array<{ id: string; tool: string; params: Record<string, any>; isNative: true }> = []
      for (const idx of Object.keys(accumulatedNativeTools).map(Number).sort((a, b) => a - b)) {
        const tc = accumulatedNativeTools[idx]
        if (!tc || !tc.name) continue
        let params: Record<string, any> = {}
        if (tc.arguments) {
          try {
            params = JSON.parse(tc.arguments)
          } catch {
            params = { raw: tc.arguments }
          }
        }
        parsedNativeCalls.push({
          id: tc.id,
          tool: tc.name,
          params,
          isNative: true,
        })
      }

      const parsedTextCalls = sandboxActive ? extractTextToolCalls(turnText) : []
      const toolCallsInTurn: Array<{ id: string; tool: string; params: Record<string, any>; isNative: boolean }> = [
        ...parsedNativeCalls,
      ]

      for (const tc of parsedTextCalls) {
        const isDuplicate = parsedNativeCalls.some(
          (n) => n.tool === tc.tool && JSON.stringify(n.params) === JSON.stringify(tc.params)
        )
        if (!isDuplicate) {
          toolCallsInTurn.push({
            id: `call_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            tool: tc.tool,
            params: tc.params,
            isNative: false,
          })
        }
      }

      let executedToolsThisTurn = 0

      if (toolCallsInTurn.length > 0) {
        // Push the assistant's turn output with native tool_calls if applicable
        const assistantMsg: LLMMessage = { role: 'assistant', content: turnText }
        if (parsedNativeCalls.length > 0) {
          assistantMsg.tool_calls = parsedNativeCalls.map((c) => ({
            id: c.id,
            type: 'function',
            function: {
              name: c.tool,
              arguments: JSON.stringify(c.params),
            },
          }))
        }
        apiMessages.push(assistantMsg)

        for (const call of toolCallsInTurn) {
          if (signal?.aborted || totalToolCalls >= maxToolCalls) break

          const toolId = call.id
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

          if (call.isNative) {
            apiMessages.push({
              role: 'tool',
              tool_call_id: call.id,
              name: toolName,
              content: `Status: ${toolResult.success ? 'SUCCESS' : 'FAILED'}\nOutput:\n${toolResult.output || '(none)'}\nError:\n${toolResult.error || 'none'}${fileNotice}\n\nGuidance: Review the tool result above. If an error occurred or script failed, fix the code and call the next tool. If complete, summarize your work and display the file reference card <file path="filename.ext">Display Title</file>.`,
            })
          } else {
            apiMessages.push({
              role: 'user',
              content: `[System Tool Execution Feedback]\nTool: ${toolName}\nStatus: ${toolResult.success ? 'SUCCESS' : 'FAILED'}\nOutput:\n${toolResult.output || '(none)'}\nError:\n${toolResult.error || 'none'}${fileNotice}\n\nReview the tool result above. If an error occurred or script failed, fix the code and call the next tool. If complete, summarize your work and display the file reference card <file path="filename.ext">Display Title</file>.`,
            })
          }
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

    if (sandboxActive && totalToolCalls > 0 && fullAssistantText.trim().length === 0 && doneReason !== 'cancelled') {
      const fallbackSummary = 'Completed requested operations.'
      fullAssistantText += fallbackSummary
      yield { type: 'text-delta', text: fallbackSummary }
    }
  } finally {
    yield { type: 'done', reason: doneReason }
  }
}
