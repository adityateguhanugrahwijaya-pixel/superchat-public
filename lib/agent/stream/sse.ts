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
 * Creates a ReadableStream formatted as Server-Sent Events.
 * Decouples stream cancellation from the background generator loop.
 */
export function createSSEEventStream(
  eventGenerator: AsyncGenerator<AgentEvent, void, unknown>,
  onClose?: () => void
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  let streamClosed = false

  return new ReadableStream<Uint8Array>({
    start(controller) {
      const safeEnqueue = (chunk: string) => {
        if (streamClosed || !chunk) return
        try {
          controller.enqueue(encoder.encode(chunk))
        } catch {
          streamClosed = true
        }
      }

      ;(async () => {
        try {
          for await (const event of eventGenerator) {
            safeEnqueue(encodeSSEEvent(event))
          }
        } catch (err: any) {
          const errorEvent: AgentEvent = {
            type: 'error',
            code: 'STREAM_ERROR',
            message: err?.message || 'Agent SSE stream failure',
            retryable: false,
          }
          safeEnqueue(encodeSSEEvent(errorEvent))
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
