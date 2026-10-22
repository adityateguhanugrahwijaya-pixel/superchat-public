/**
 * Agent Loop Event Definitions (Agent v2)
 * Discriminated union of all events emitted by the agent engine.
 */

export type AgentEvent =
  | { type: 'turn-start'; turn: number }
  | { type: 'text-delta'; text: string }
  | { type: 'tool-call'; id: string; name: string; args: unknown }
  | { type: 'tool-result'; id: string; ok: boolean; output: string; durationMs: number; truncated: boolean }
  | { type: 'file'; path: string; title: string }
  | { type: 'approval-required'; id: string; tool: string; summary: string; expiresAt: number }
  | { type: 'usage'; promptTokens: number; completionTokens: number; estimated: boolean }
  | { type: 'error'; code: string; message: string; retryable: boolean }
  | {
      type: 'done'
      reason:
        | 'completed'
        | 'max_turns'
        | 'max_tool_calls'
        | 'token_budget'
        | 'wall_clock'
        | 'cancelled'
        | 'llm_error'
    }
