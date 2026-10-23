import { AgentEvent } from '../events'
import { stripErrorPatterns } from '../llm/toolcall-text'

/**
 * Legacy Stream Encoder
 * Translates AgentEvent instances into the exact legacy markdown format expected by SuperChat UI:
 * - Indicator: "> 🛠️ **Executing Tool:** `tool_name`..."
 * - Output: "> ✅ **Output:**\n```\n...\n```" or "> ❌ **Execution Error:**\n```\n...\n```"
 * - File card tag: "<file path="...">Judul</file>"
 * - Error events are never emitted as text into message.content.
 */

export function encodeLegacyEvent(event: AgentEvent): string {
  switch (event.type) {
    case 'text-delta':
      return stripErrorPatterns(event.text)

    case 'tool-call':
      return `\n\n> 🛠️ **Executing Tool:** \`${event.name}\`...\n`

    case 'tool-result': {
      const icon = event.ok ? '✅' : '❌'
      const header = event.ok ? 'Output' : 'Execution Error'
      const rawOutput = (event.output || 'Command executed successfully.').trim()
      const isTruncated = Boolean(event.truncated) || rawOutput.length > 4000
      const sliced = rawOutput.slice(0, 4000).replace(/`{3,}/g, (m) => m.split('').join('\u200b'))
      const body = isTruncated ? `${sliced}\n[dipotong]` : sliced
      return `\n> ${icon} **${header}:**\n\`\`\`\n${body}\n\`\`\`\n\n`
    }

    case 'file':
      return `<file path="${event.path}">${event.title}</file>`

    case 'approval-required': {
      const payload = JSON.stringify({
        toolName: event.toolName,
        params: event.params,
        reason: event.reason,
      })
      return `\n\n<!-- approval_required:${payload} -->\n\n> ⚠️ **Approval Required:** ${event.reason || 'This action requires confirmation.'}\n`
    }

    case 'error':
    case 'turn-start':
    case 'usage':
    case 'done':
    default:
      return ''
  }
}

/**
 * Pipes an async generator of AgentEvents into a TextEncoder ReadableStream.
 * Decouples stream cancellation (e.g. closing browser tab) from the background generator loop
 * so the agent continues executing in the background until completion.
 */
export function createLegacyEventStream(
  eventGenerator: AsyncGenerator<AgentEvent, void, unknown>,
  onClose?: () => void
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  let streamClosed = false

  return new ReadableStream<Uint8Array>({
    start(controller) {
      const safeEnqueue = (text: string) => {
        if (streamClosed || !text) return
        try {
          controller.enqueue(encoder.encode(text))
        } catch {
          streamClosed = true
        }
      }

      ;(async () => {
        try {
          for await (const event of eventGenerator) {
            const chunkText = encodeLegacyEvent(event)
            if (chunkText) {
              safeEnqueue(chunkText)
            }
          }
        } catch (err: any) {
          console.error('[LegacyEventStream Error]', err?.message || err)
        } finally {
          onClose?.()
          if (!streamClosed) {
            streamClosed = true
            try {
              controller.close()
            } catch {}
          }
        }
      })()
    },
    cancel() {
      streamClosed = true
    },
  })
}
