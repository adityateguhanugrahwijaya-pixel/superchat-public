import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

/**
 * Finds the Python interpreter the sandbox should use. Order of preference:
 *   1. PYTHON_BIN (from .env.local / environment) - e.g. your own conda env or venv
 *   2. <project>/.sandbox-venv  (created by start.sh / start.bat via scripts/setup-sandbox.js)
 *   3. python3 / python / py -3 from the system PATH
 */

export type PythonStatus = {
  found: boolean
  /** Ready-to-use prefix, e.g. `"/path/to/python"` or `"py" -3`. Append the script path. */
  commandLine: string
  version?: string
  source: 'env' | 'venv' | 'system' | 'none'
  /** Human-readable explanation when found is false. */
  message?: string
}

type Candidate = { cmd: string; args: string[]; source: 'env' | 'venv' | 'system' }

export function getVenvDir(): string {
  return path.join(process.cwd(), '.sandbox-venv')
}

export function getVenvPython(): string | null {
  const p =
    process.platform === 'win32'
      ? path.join(getVenvDir(), 'Scripts', 'python.exe')
      : path.join(getVenvDir(), 'bin', 'python')
  return fs.existsSync(p) ? p : null
}

function customPythonBin(): string {
  return (process.env.PYTHON_BIN || '').trim()
}

function candidates(): Candidate[] {
  const custom = customPythonBin()
  // If the admin set PYTHON_BIN explicitly, only use that (don't silently fall back)
  if (custom) return [{ cmd: custom, args: [], source: 'env' }]

  const list: Candidate[] = []
  const venv = getVenvPython()
  if (venv) list.push({ cmd: venv, args: [], source: 'venv' })

  if (process.platform === 'win32') {
    list.push(
      { cmd: 'python', args: [], source: 'system' },
      { cmd: 'py', args: ['-3'], source: 'system' },
      { cmd: 'python3', args: [], source: 'system' }
    )
  } else {
    list.push({ cmd: 'python3', args: [], source: 'system' }, { cmd: 'python', args: [], source: 'system' })
  }
  return list
}

function probe(c: Candidate): string | null {
  try {
    const out = execFileSync(c.cmd, [...c.args, '-c', 'import sys;print(sys.version.split()[0])'], {
      encoding: 'utf8',
      timeout: 10_000,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
    return /^3\.\d+/.test(out) ? out : null
  } catch {
    return null
  }
}

let cached: { at: number; status: PythonStatus } | null = null

export function pythonSetupMessage(): string {
  const custom = customPythonBin()
  if (custom) {
    return [
      `❌ Python is not available: PYTHON_BIN is set to "${custom}", but that interpreter could not be run.`,
      `Fix the path in .env.local (or remove PYTHON_BIN to use the built-in sandbox environment), then restart SuperChat.`,
    ].join('\n')
  }
  return [
    '❌ Python 3 is not installed (or not on PATH) on the SuperChat server, so Python code cannot run yet.',
    '',
    'To fix this, the server admin should:',
    '1. Install Python 3.9 or newer: https://www.python.org/downloads/',
    '   (Windows: tick "Add python.exe to PATH" in the installer.)',
    '2. Run start.sh (Linux/macOS) or start.bat (Windows) again. It creates the sandbox environment automatically.',
    '   Or run: node scripts/setup-sandbox.js',
    '',
    'Tip: you can also point SuperChat to your own environment with PYTHON_BIN in .env.local.',
    'Do not retry run_python until this is fixed; use the Node.js tool or write files directly instead.',
  ].join('\n')
}

export function detectPython(force = false): PythonStatus {
  if (cached && !force) {
    const ttl = cached.status.found ? 60_000 : 5_000
    if (Date.now() - cached.at < ttl) return cached.status
  }

  let status: PythonStatus = { found: false, commandLine: '', source: 'none', message: pythonSetupMessage() }
  for (const c of candidates()) {
    const version = probe(c)
    if (version) {
      status = {
        found: true,
        commandLine: [`"${c.cmd}"`, ...c.args].join(' '),
        version,
        source: c.source,
      }
      break
    }
  }

  cached = { at: Date.now(), status }
  return status
}

/**
 * Makes `python` / `pip` inside execute_command resolve to the sandbox venv
 * (only when PYTHON_BIN is not overriding it).
 */
export function applyVenvToEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  if (customPythonBin()) return env
  const venvPy = getVenvPython()
  if (!venvPy) return env

  // On Windows the variable is usually called "Path", so match case-insensitively
  const pathKey = Object.keys(env).find((k) => k.toLowerCase() === 'path') || 'PATH'
  env[pathKey] = path.dirname(venvPy) + path.delimiter + (env[pathKey] || '')
  env.VIRTUAL_ENV = getVenvDir()
  delete env.PYTHONHOME
  return env
}
