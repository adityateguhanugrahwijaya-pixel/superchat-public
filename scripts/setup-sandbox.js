#!/usr/bin/env node
/**
 * SuperChat sandbox setup (used by start.sh and start.bat, safe to run any time).
 *
 *   node scripts/setup-sandbox.js            # normal: only does something if the sandbox is enabled
 *   node scripts/setup-sandbox.js --yes      # never ask questions, accept defaults
 *   node scripts/setup-sandbox.js --force    # run even if the sandbox is disabled in the config
 *
 * What it does when the sandbox is enabled:
 *   1. Checks that Python 3.9+ is installed. If not, shows how to install it and waits.
 *   2. Creates a virtual environment in ./.sandbox-venv (so system Python is never touched).
 *   3. Installs the packages listed in ./sandbox-requirements.txt (asks first).
 *
 * If PYTHON_BIN is set (e.g. your own conda/venv clone), it only verifies that interpreter
 * and leaves your environment alone.
 */
'use strict'

const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const readline = require('node:readline')
const { spawnSync } = require('node:child_process')

const ROOT = path.resolve(__dirname, '..')
const VENV_DIR = path.join(ROOT, '.sandbox-venv')
const REQ_FILE = path.join(ROOT, 'sandbox-requirements.txt')
const HASH_FILE = path.join(VENV_DIR, '.requirements.sha256')
const IS_WIN = process.platform === 'win32'
const MIN_PY = [3, 9]

const flags = new Set(process.argv.slice(2))
const ASSUME_YES = flags.has('--yes') || flags.has('-y')
const FORCE = flags.has('--force')
const INTERACTIVE = Boolean(process.stdin.isTTY && process.stdout.isTTY) && !ASSUME_YES

// ---------------------------------------------------------------------------
// tiny helpers
// ---------------------------------------------------------------------------
const log = (m = '') => console.log(m)
const ok = (m) => console.log(`[OK] ${m}`)
const warn = (m) => console.log(`[!]  ${m}`)
const fail = (m) => console.log(`[X]  ${m}`)

function ask(question, defaultAnswer) {
  if (!INTERACTIVE) return Promise.resolve(defaultAnswer)
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
    rl.question(question, (answer) => {
      rl.close()
      resolve(answer)
    })
  })
}

function readEnvFile(file) {
  const out = {}
  try {
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      if (line.trim().startsWith('#')) continue
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/)
      if (m) out[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2')
    }
  } catch {}
  return out
}

/** Same rules as isSandboxEnabled() in lib/sandbox/index.ts */
function isSandboxEnabled(envLocal) {
  const raw = process.env.SANDBOX_ENABLED !== undefined ? process.env.SANDBOX_ENABLED : envLocal.SANDBOX_ENABLED
  if (raw !== undefined) {
    const v = String(raw).trim().toLowerCase()
    return v === 'true' || v === '1'
  }
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'appconfig.json'), 'utf8'))
    if (typeof cfg.sandboxEnabled === 'boolean') return cfg.sandboxEnabled
    if (cfg.sandbox && typeof cfg.sandbox.enabled === 'boolean') return cfg.sandbox.enabled
  } catch {}
  return true
}

// ---------------------------------------------------------------------------
// Python detection
// ---------------------------------------------------------------------------
function probePython(cmd, args = []) {
  const code = 'import sys;print(sys.version_info[0],sys.version_info[1],sys.version_info[2]);print(sys.executable)'
  const r = spawnSync(cmd, [...args, '-c', code], { encoding: 'utf8', timeout: 15000, windowsHide: true })
  if (r.error || r.status !== 0 || !r.stdout) return null
  const lines = r.stdout.trim().split(/\r?\n/)
  const parts = (lines[0] || '').split(' ').map(Number)
  if (parts.length < 3 || parts.some(Number.isNaN)) return null
  return { cmd, args, version: parts, executable: (lines[1] || cmd).trim() }
}

const versionText = (v) => v.join('.')
const isNewEnough = (v) => v[0] > MIN_PY[0] || (v[0] === MIN_PY[0] && v[1] >= MIN_PY[1])

/** Returns { python, tooOld } where python is the first interpreter that is new enough. */
function findSystemPython() {
  const list = IS_WIN
    ? [['python', []], ['py', ['-3']], ['python3', []]]
    : [['python3', []], ['python', []]]
  let tooOld = null
  for (const [cmd, args] of list) {
    const found = probePython(cmd, args)
    if (!found) continue
    if (found.version[0] === 3 && isNewEnough(found.version)) return { python: found, tooOld }
    if (found.version[0] === 3 && !tooOld) tooOld = found
  }
  return { python: null, tooOld }
}

function installInstructions() {
  const lines = []
  if (IS_WIN) {
    lines.push(
      '  - Download Python 3.9 or newer: https://www.python.org/downloads/windows/',
      '    IMPORTANT: tick "Add python.exe to PATH" in the installer.',
      '  - Or in a terminal:  winget install -e --id Python.Python.3.12'
    )
  } else if (process.platform === 'darwin') {
    lines.push('  - brew install python        (needs Homebrew: https://brew.sh)', '  - Or download: https://www.python.org/downloads/macos/')
  } else if ((process.env.PREFIX || '').includes('com.termux')) {
    lines.push('  - pkg install python')
  } else {
    let distro = ''
    try {
      const osr = fs.readFileSync('/etc/os-release', 'utf8')
      distro = ((osr.match(/^ID=(.*)$/m) || [])[1] || '') + ' ' + ((osr.match(/^ID_LIKE=(.*)$/m) || [])[1] || '')
      distro = distro.replace(/"/g, '').toLowerCase()
    } catch {}
    if (/debian|ubuntu|mint|pop/.test(distro)) {
      lines.push('  - sudo apt update && sudo apt install -y python3 python3-venv python3-pip')
    } else if (/fedora|rhel|centos|rocky|alma/.test(distro)) {
      lines.push('  - sudo dnf install -y python3 python3-pip')
    } else if (/arch|manjaro/.test(distro)) {
      lines.push('  - sudo pacman -S python python-pip')
    } else if (/alpine/.test(distro)) {
      lines.push('  - sudo apk add python3 py3-pip')
    } else {
      lines.push('  - Install "python3" (3.9+) with your package manager, or from https://www.python.org/downloads/')
    }
  }
  return lines.join('\n')
}

// ---------------------------------------------------------------------------
// Steps
// ---------------------------------------------------------------------------
function venvPythonPath() {
  return IS_WIN ? path.join(VENV_DIR, 'Scripts', 'python.exe') : path.join(VENV_DIR, 'bin', 'python')
}

async function ensurePython() {
  for (;;) {
    const { python, tooOld } = findSystemPython()
    if (python) {
      ok(`Python ${versionText(python.version)} found (${python.executable})`)
      return python
    }

    log('')
    if (tooOld) {
      fail(`Python ${versionText(tooOld.version)} was found, but SuperChat's sandbox needs Python ${MIN_PY.join('.')} or newer.`)
    } else {
      fail('Python 3 is not installed (or is not on your PATH).')
    }
    log('    The sandbox needs it to run Python code written by the AI agent.')
    log('')
    log('    How to install it:')
    log(installInstructions())
    log('')

    if (!INTERACTIVE) {
      warn('Continuing without Python. Python tools will show an error until it is installed.')
      return null
    }
    const answer = await ask("    Install Python, then press Enter to check again (or type 'skip' to continue without it): ", '')
    if (answer.trim().toLowerCase() === 'skip') {
      warn('Skipping. Python tools will show an error until Python is installed.')
      return null
    }
    log('')
  }
}

async function ensureVenv(systemPython) {
  const vpy = venvPythonPath()

  for (;;) {
    if (fs.existsSync(vpy) && probePython(vpy)) {
      ok(`Sandbox environment ready (${path.relative(ROOT, VENV_DIR) || VENV_DIR})`)
      return vpy
    }

    if (fs.existsSync(VENV_DIR)) {
      warn('Existing sandbox environment is broken (maybe Python was upgraded). Recreating it...')
      fs.rmSync(VENV_DIR, { recursive: true, force: true })
    }

    log('Creating sandbox environment (.sandbox-venv)...')
    const r = spawnSync(systemPython.cmd, [...systemPython.args, '-m', 'venv', VENV_DIR], { stdio: 'inherit' })
    if (r.status === 0 && fs.existsSync(vpy)) {
      ok('Sandbox environment created.')
      return vpy
    }

    fail('Could not create the virtual environment.')
    if (!IS_WIN && process.platform !== 'darwin') {
      log('    On Debian/Ubuntu this usually means the venv module is missing:')
      log('      sudo apt install -y python3-venv')
    }
    if (!INTERACTIVE) {
      warn('Continuing without the sandbox environment. SuperChat will use the system Python instead.')
      return null
    }
    const answer = await ask("    Fix it, then press Enter to retry (or type 'skip'): ", '')
    if (answer.trim().toLowerCase() === 'skip') return null
  }
}

function readRequirementNames() {
  try {
    return fs
      .readFileSync(REQ_FILE, 'utf8')
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#'))
      .map((l) => l.split(/[<>=!~;\[ ]/)[0])
  } catch {
    return []
  }
}

async function ensurePackages(vpy) {
  if (!fs.existsSync(REQ_FILE)) {
    warn('sandbox-requirements.txt not found, skipping package install.')
    return
  }

  const hash = crypto.createHash('sha256').update(fs.readFileSync(REQ_FILE)).digest('hex')
  let installedHash = ''
  try {
    installedHash = fs.readFileSync(HASH_FILE, 'utf8').trim()
  } catch {}
  if (installedHash === hash) {
    ok('Python packages are up to date.')
    return
  }

  log('')
  log(`Python packages for the sandbox: ${readRequirementNames().join(', ')}`)
  const answer = await ask('Install them now? (needs internet, a few hundred MB) [Y/n]: ', 'y')
  if (/^n/i.test(answer.trim())) {
    warn('Skipped. Run "node scripts/setup-sandbox.js" any time to install them later.')
    return
  }

  log('')
  spawnSync(vpy, ['-m', 'pip', 'install', '--upgrade', '--disable-pip-version-check', 'pip'], { stdio: 'inherit' })
  const r = spawnSync(vpy, ['-m', 'pip', 'install', '--disable-pip-version-check', '-r', REQ_FILE], { stdio: 'inherit' })
  if (r.status === 0) {
    fs.writeFileSync(HASH_FILE, hash)
    ok('Python packages installed.')
  } else {
    warn('Some packages failed to install. SuperChat will still start; the agent can pip install what it needs.')
  }
}

async function main() {
  const envLocal = readEnvFile(path.join(ROOT, '.env.local'))

  if (!FORCE && !isSandboxEnabled(envLocal)) {
    log('Sandbox is disabled in your config, skipping Python setup.')
    return
  }

  log('')
  log('--- Sandbox check (Python code runner) ---')

  // Bring-your-own environment: just verify it
  const custom = (process.env.PYTHON_BIN || envLocal.PYTHON_BIN || '').trim()
  if (custom) {
    const found = probePython(custom)
    if (found && found.version[0] === 3) {
      ok(`Using PYTHON_BIN: Python ${versionText(found.version)} (${found.executable})`)
    } else {
      fail(`PYTHON_BIN is set to "${custom}" but that interpreter could not be run.`)
      log('    Fix the path in .env.local, or remove PYTHON_BIN to use the built-in sandbox environment.')
    }
    return
  }

  const systemPython = await ensurePython()
  if (!systemPython) return

  const vpy = await ensureVenv(systemPython)
  if (!vpy) return

  await ensurePackages(vpy)
  log('')
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    fail(`Sandbox setup failed: ${err && err.message ? err.message : err}`)
    process.exit(1)
  })
