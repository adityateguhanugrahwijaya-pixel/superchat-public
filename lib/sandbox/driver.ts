/**
 * Sandbox Execution Driver Interface
 * Defines the standard interface for command execution and lifecycle across drivers (Local, Docker, Bwrap).
 */

export interface ExecResult {
  exitCode: number | null
  signal: NodeJS.Signals | null
  stdout: string
  stderr: string
  timedOut: boolean
  killed: boolean
  durationMs: number
  truncated: boolean
}

export interface ExecOptions {
  cwd?: string
  timeoutMs?: number
  signal?: AbortSignal
  env?: Record<string, string>
}

export interface SandboxDriver {
  name: string
  exec(sessionId: string, cmd: string, opts?: ExecOptions): Promise<ExecResult>
  destroy(sessionId: string): Promise<void>
}

/**
 * Docker Sandbox Driver Stub (Future Extension)
 */
export class DockerDriver implements SandboxDriver {
  name = 'docker'
  async exec(_sessionId: string, _cmd: string, _opts?: ExecOptions): Promise<ExecResult> {
    throw new Error('DockerDriver not implemented in this environment.')
  }
  async destroy(_sessionId: string): Promise<void> {
    // Stub
  }
}

/**
 * Bubblewrap Sandbox Driver Stub (Future Extension for Linux unprivileged containers)
 */
export class BwrapDriver implements SandboxDriver {
  name = 'bwrap'
  async exec(_sessionId: string, _cmd: string, _opts?: ExecOptions): Promise<ExecResult> {
    throw new Error('BwrapDriver not implemented in this environment.')
  }
  async destroy(_sessionId: string): Promise<void> {
    // Stub
  }
}
