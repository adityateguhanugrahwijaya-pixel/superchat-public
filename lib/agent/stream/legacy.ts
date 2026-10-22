import { AgentEvent } from '../events'

/**
 * Legacy Stream Encoder
 * Translates AgentEvent instances into the exact legacy markdown format expected by SuperChat UI:
 * - Indicator: "> 🛠️ **Executing Tool:** `tool_name`..."
 * - Output: "> ✅ **Output:**\n```\n...\n```" or "> ❌ **Execution Error:**\n```\n...\n```"
 * - File card tag: "<file path="...">Judul</file>"
 */

export function encodeLegacyEvent(event: AgentEvent): string {
  switch (event.type) {
    case 'text-delta':
      return event.text

    case 'tool-call':
      return `\n\n> 🛠️ **Executing Tool:** \`${event.name}\`...\n`

    case 'tool-result': {
      const icon = event.ok ? '✅' : '❌'
      const header = event.ok ? 'Output' : 'Execution Error'
      const snippet = (event.output || 'Command executed successfully.').trim()
      return `\n> ${icon} **${header}:**\n\`\`\`\n${snippet.slice(0, 4000)}\n\`\`\`\n\n`
    }

    case 'file':
      return `<file path="${event.path}">${event.title}</file>`

    case 'error':
      if (event.message.startsWith('[Router Error')) {
        return `\n\n${event.message}`
      }
      return `\n\n[Router Error ${event.message}]`

    case 'approval-required': {
      const payload = JSON.stringify({
        toolName: event.toolName,
        params: event.params,
        reason: event.reason,
      })
      return `\n\n<!-- approval_required:${payload} -->\n\n> ⚠️ **Approval Required:** ${event.reason || 'This action requires confirmation.'}\n`
    }

    case 'turn-start':
    case 'usage':
    case 'done':
    default:
      return ''
  }
}

/**
 * Pipes an async generator of AgentEvents into a TextEncoder ReadableStream
 */
export function createLegacyEventStream(
  eventGenerator: AsyncGenerator<AgentEvent, void, unknown>,
  onClose?: () => void
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const event of eventGenerator) {
          const chunkText = encodeLegacyEvent(event)
          if (chunkText) {
            controller.enqueue(encoder.encode(chunkText))
          }
        }
      } catch (err: any) {
        const errMsg = err?.message || 'Agent stream error'
        controller.enqueue(encoder.encode(`\n\n[Router Error ${errMsg}]`))
      } finally {
        onClose?.()
        try {
          controller.close()
        } catch {}
      }
    },
  })
}
