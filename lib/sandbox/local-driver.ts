import { spawn, ChildProcess } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { StringDecoder } from 'node:string_decoder'
import { ExecOptions, ExecResult, SandboxDriver } from './driver'
import { getSessionDir, getSkillsDir } from './paths'
import { applyVenvToEnv } from './runtime'
import { destroySession } from './janitor'

const DEFAULT_TIMEOUT_MS = 120_000
const DEFAULT_MAX_OUTPUT_BYTES = 2 * 1024 * 1024 // 2 MB per stream cap
const KILL_GRACE_PERIOD_MS = 2_000

function findShell(): string {
  const envPath = process.env.PATH || ''
  const dirs = envPath.split(path.delimiter)
  for (const name of ['bash', 'sh']) {
    for (const dir of dirs) {
      const full = path.join(dir, name)
      try {
        if (fs.existsSync(full) && fs.statSync(full).isFile()) {
          return full
        }
      } catch {}
    }
  }
  return 'sh'
}

function killProcessGroup(pid: number, signal: NodeJS.Signals): void {
  try {
    process.kill(-pid, signal)
  } catch (err: any) {
    if (err?.code !== 'ESRCH') {
      try {
        process.kill(pid, signal)
      } catch {}
    }
  }
}

function parseSessionKey(sessionId: string): { userEmail: string; chatId: string } {
  if (sessionId.includes('/')) {
    const parts = sessionId.split('/')
    return { userEmail: parts[0], chatId: parts.slice(1).join('/') }
  }
  if (sessionId.includes(':')) {
    const parts = sessionId.split(':')
    return { userEmail: parts[0], chatId: parts.slice(1).join(':') }
  }
  return { userEmail: 'default', chatId: sessionId }
}

export function buildSandboxEnv(sessionRoot: string, customEnv?: Record<string, string>): NodeJS.ProcessEnv {
  const baseEnv: NodeJS.ProcessEnv = {
    NODE_ENV: (process.env.NODE_ENV as any) || 'production',
    PATH: process.env.PATH || '',
    HOME: sessionRoot,
    LANG: process.env.LANG || 'en_US.UTF-8',
    MPLBACKEND: 'Agg',
    PYTHONUNBUFFERED: '1',
    PYTHONIOENCODING: 'utf-8',
    SKILLS_DIR: getSkillsDir(),
  }

  // Apply Python sandbox virtual environment if available
  const env = applyVenvToEnv(baseEnv)

  if (customEnv) {
    for (const [k, v] of Object.entries(customEnv)) {
      if (typeof v === 'string') {
        env[k] = v
      }
    }
  }

  return env
}

function wrapCommandWithUlimits(cmd: string, timeoutMs: number): string {
  const cpuSec = Math.max(10, Math.ceil(timeoutMs / 1000) + 15)
  let prefix = `ulimit -t ${cpuSec} 2>/dev/null || true; ulimit -f 1048576 2>/dev/null || true; `
  if (process.env.SANDBOX_ULIMIT_VM) {
    const vm = Number(process.env.SANDBOX_ULIMIT_VM)
    if (Number.isFinite(vm) && vm > 0) {
      prefix += `ulimit -v ${vm} 2>/dev/null || true; `
    }
  }
  return `${prefix}${cmd}`
}

export class LocalDriver implements SandboxDriver {
  name = 'local'

  async exec(sessionId: string, cmd: string, opts?: ExecOptions): Promise<ExecResult> {
    const { userEmail, chatId } = parseSessionKey(sessionId)
    const sessionDir = getSessionDir(userEmail, chatId, true)
    const workingDir = opts?.cwd ? path.resolve(sessionDir, opts.cwd) : sessionDir
    const timeoutMs = opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS
    const abortSignal = opts?.signal

    const startTime = Date.now()

    if (abortSignal?.aborted) {
      return {
        exitCode: null,
        signal: 'SIGTERM',
        stdout: '',
        stderr: 'Execution aborted before start.',
        timedOut: false,
        killed: true,
        durationMs: 0,
        truncated: false,
      }
    }

    const shell = findShell()
    const env = buildSandboxEnv(sessionDir, opts?.env)
    const wrappedCmd = wrapCommandWithUlimits(cmd, timeoutMs)

    return new Promise<ExecResult>((resolve) => {
      let child: ChildProcess
      try {
        child = spawn(shell, ['-c', wrappedCmd], {
          cwd: workingDir,
          env,
          detached: true,
          stdio: ['ignore', 'pipe', 'pipe'],
        })
      } catch (err: any) {
        return resolve({
          exitCode: 1,
          signal: null,
          stdout: '',
          stderr: `Failed to spawn process: ${err?.message || String(err)}`,
          timedOut: false,
          killed: false,
          durationMs: Date.now() - startTime,
          truncated: false,
        })
      }

      const pid = child.pid
      let timedOut = false
      let killed = false
      let killedSignal: NodeJS.Signals | null = null
      let truncated = false

      let stdout = ''
      let stdoutBytes = 0
      const stdoutDecoder = new StringDecoder('utf-8')

      let stderr = ''
      let stderrBytes = 0
      const stderrDecoder = new StringDecoder('utf-8')

      child.stdout?.on('data', (chunk: Buffer) => {
        stdoutBytes += chunk.length
        if (stdoutBytes <= DEFAULT_MAX_OUTPUT_BYTES) {
          stdout += stdoutDecoder.write(chunk)
        } else {
          truncated = true
          const remaining = DEFAULT_MAX_OUTPUT_BYTES - (stdoutBytes - chunk.length)
          if (remaining > 0) {
            stdout += stdoutDecoder.write(chunk.subarray(0, remaining))
          }
        }
      })

      child.stderr?.on('data', (chunk: Buffer) => {
        stderrBytes += chunk.length
        if (stderrBytes <= DEFAULT_MAX_OUTPUT_BYTES) {
          stderr += stderrDecoder.write(chunk)
        } else {
          truncated = true
          const remaining = DEFAULT_MAX_OUTPUT_BYTES - (stderrBytes - chunk.length)
          if (remaining > 0) {
            stderr += stderrDecoder.write(chunk.subarray(0, remaining))
          }
        }
      })

      let killTimer: NodeJS.Timeout | null = null
      let hardKillTimer: NodeJS.Timeout | null = null

      const terminate = (isTimeout: boolean, sig: NodeJS.Signals = 'SIGTERM') => {
        if (!pid || killed) return
        killed = true
        timedOut = isTimeout
        killedSignal = sig

        killProcessGroup(pid, 'SIGTERM')

        hardKillTimer = setTimeout(() => {
          killProcessGroup(pid, 'SIGKILL')
        }, KILL_GRACE_PERIOD_MS)
      }

      if (timeoutMs > 0 && timeoutMs !== Infinity) {
        killTimer = setTimeout(() => {
          terminate(true, 'SIGTERM')
        }, timeoutMs)
      }

      const abortHandler = () => {
        terminate(false, 'SIGTERM')
      }
      if (abortSignal) {
        abortSignal.addEventListener('abort', abortHandler, { once: true })
      }

      child.on('close', (code, sig) => {
        if (killTimer) clearTimeout(killTimer)
        if (hardKillTimer) clearTimeout(hardKillTimer)
        if (abortSignal) abortSignal.removeEventListener('abort', abortHandler)

        // Kill any surviving orphans in the process group
        if (pid) {
          killProcessGroup(pid, 'SIGKILL')
        }

        stdout += stdoutDecoder.end()
        stderr += stderrDecoder.end()

        const finalSignal = (sig as NodeJS.Signals) || killedSignal || null
        const finalExitCode = finalSignal ? null : code

        resolve({
          exitCode: finalExitCode,
          signal: finalSignal,
          stdout: stdout.trim(),
          stderr: stderr.trim(),
          timedOut,
          killed,
          durationMs: Date.now() - startTime,
          truncated,
        })
      })

      child.on('error', (err) => {
        if (killTimer) clearTimeout(killTimer)
        if (hardKillTimer) clearTimeout(hardKillTimer)
        if (abortSignal) abortSignal.removeEventListener('abort', abortHandler)

        resolve({
          exitCode: 1,
          signal: null,
          stdout: stdout.trim(),
          stderr: (stderr + '\n' + (err.message || String(err))).trim(),
          timedOut: false,
          killed: false,
          durationMs: Date.now() - startTime,
          truncated,
        })
      })
    })
  }

  async destroy(sessionId: string): Promise<void> {
    const { userEmail, chatId } = parseSessionKey(sessionId)
    await destroySession(userEmail, chatId)
  }
}
