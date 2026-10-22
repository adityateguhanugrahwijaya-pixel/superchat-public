import { AgentEvent } from '../events'

/**
 * Server-Sent Events (SSE) Stream Encoder (Agent v2)
 * Encodes AgentEvent instances into standard W3C text/event-stream chunks:
 * "event: <type>\ndata: <JSON>\n\n"
 */
export function encodeSSEEvent(event: AgentEvent): string {
  const json = JSON.stringify(event)
  return `event: ${event.type}\ndata: ${json}\n\n`
}

/**
 * Creates a ReadableStream formatted as Server-Sent Events
 */
export function createSSEEventStream(
  eventGenerator: AsyncGenerator<AgentEvent, void, unknown>,
  onClose?: () => void
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const event of eventGenerator) {
          const chunk = encodeSSEEvent(event)
          controller.enqueue(encoder.encode(chunk))
        }
      } catch (err: any) {
        const errorEvent: AgentEvent = {
          type: 'error',
          code: 'STREAM_ERROR',
          message: err?.message || 'Agent SSE stream failure',
          retryable: false,
        }
        controller.enqueue(encoder.encode(encodeSSEEvent(errorEvent)))
      } finally {
        onClose?.()
        try {
          controller.close()
        } catch {}
      }
    },
  })
}
