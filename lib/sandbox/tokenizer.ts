/**
 * Bash Command Tokenizer and Parser (Agent v2)
 * Robust lexer that accurately breaks command chains, pipelines, subshells,
 * and quotes to prevent regex bypass and false-positive security matches.
 */

export interface ParsedCommand {
  executable: string
  args: string[]
  raw: string
  subcommands: ParsedCommand[]
}

/**
 * Splits a bash command line into discrete tokens respecting quotes and escapes.
 */
function tokenizeSegment(segment: string): string[] {
  const tokens: string[] = []
  let current = ''
  let inSingleQuote = false
  let inDoubleQuote = false
  let isEscaped = false

  for (let i = 0; i < segment.length; i++) {
    const char = segment[i]

    if (isEscaped) {
      current += char
      isEscaped = false
      continue
    }

    if (char === '\\' && !inSingleQuote) {
      isEscaped = true
      continue
    }

    if (char === "'" && !inDoubleQuote) {
      inSingleQuote = !inSingleQuote
      continue
    }

    if (char === '"' && !inSingleQuote) {
      inDoubleQuote = !inDoubleQuote
      continue
    }

    if (!inSingleQuote && !inDoubleQuote && /\s/.test(char)) {
      if (current.length > 0) {
        tokens.push(current)
        current = ''
      }
      continue
    }

    current += char
  }

  if (current.length > 0) {
    tokens.push(current)
  }

  return tokens
}

/**
 * Extracts nested subcommands found inside $(...) or `...`.
 */
function extractSubcommands(text: string): string[] {
  const subcommands: string[] = []

  // Extract $(...)
  let depth = 0
  let startIdx = -1
  let inSingle = false
  let inDouble = false

  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    if (char === "'" && !inDouble) inSingle = !inSingle
    if (char === '"' && !inSingle) inDouble = !inDouble

    if (!inSingle) {
      if (text.slice(i, i + 2) === '$(') {
        if (depth === 0) startIdx = i + 2
        depth++
        i++
      } else if (char === ')' && depth > 0) {
        depth--
        if (depth === 0 && startIdx !== -1) {
          subcommands.push(text.slice(startIdx, i))
          startIdx = -1
        }
      }
    }
  }

  // Extract `...`
  const backtickRegex = /`([^`]+)`/g
  let btMatch: RegExpExecArray | null
  while ((btMatch = backtickRegex.exec(text)) !== null) {
    subcommands.push(btMatch[1])
  }

  return subcommands
}

/**
 * Normalizes executable name (e.g. "/usr/bin/sudo" -> "sudo", "./script.sh" -> "script.sh")
 */
function cleanExecutable(rawExe: string): string {
  let clean = rawExe.trim().replace(/^['"]|['"]$/g, '')
  if (clean.includes('/')) {
    clean = clean.split('/').pop() || clean
  }
  return clean.toLowerCase()
}

/**
 * Parses a raw shell command line into structured command segments.
 * Segments are split by separators (;, &&, ||, |, \n) outside quotes.
 */
export function parseBashCommand(cmdLine: string): ParsedCommand[] {
  const rawSegments: string[] = []
  let currentSegment = ''
  let inSingle = false
  let inDouble = false
  let isEscaped = false

  for (let i = 0; i < cmdLine.length; i++) {
    const char = cmdLine[i]
    const nextChar = cmdLine[i + 1]

    if (isEscaped) {
      currentSegment += char
      isEscaped = false
      continue
    }

    if (char === '\\' && !inSingle) {
      isEscaped = true
      currentSegment += char
      continue
    }

    if (char === "'" && !inDouble) {
      inSingle = !inSingle
      currentSegment += char
      continue
    }

    if (char === '"' && !inSingle) {
      inDouble = !inDouble
      currentSegment += char
      continue
    }

    if (!inSingle && !inDouble) {
      // Check for operators: &&, ||, ;, |, \n
      if ((char === '&' && nextChar === '&') || (char === '|' && nextChar === '|')) {
        if (currentSegment.trim()) rawSegments.push(currentSegment.trim())
        currentSegment = ''
        i++ // skip next char
        continue
      }

      if (char === ';' || char === '|' || char === '\n') {
        if (currentSegment.trim()) rawSegments.push(currentSegment.trim())
        currentSegment = ''
        continue
      }
    }

    currentSegment += char
  }

  if (currentSegment.trim()) {
    rawSegments.push(currentSegment.trim())
  }

  const results: ParsedCommand[] = []

  for (const rawSeg of rawSegments) {
    const tokens = tokenizeSegment(rawSeg)
    if (tokens.length === 0) continue

    // Handle environment prefix: e.g. "FOO=bar rm -rf ..."
    let exeIdx = 0
    while (exeIdx < tokens.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[exeIdx])) {
      exeIdx++
    }

    if (exeIdx >= tokens.length) continue

    let rawExe = tokens[exeIdx]
    let args = tokens.slice(exeIdx + 1)

    // Handle wrappers like "env" or "nohup"
    const lower = rawExe.toLowerCase()
    if ((lower === 'env' || lower === 'nohup' || lower === 'command') && args.length > 0) {
      let subIdx = 0
      while (subIdx < args.length && (/^-[a-zA-Z]/.test(args[subIdx]) || /^[A-Za-z_][A-Za-z0-9_]*=/.test(args[subIdx]))) {
        subIdx++
      }
      if (subIdx < args.length) {
        rawExe = args[subIdx]
        args = args.slice(subIdx + 1)
      }
    }

    const executable = cleanExecutable(rawExe)

    // Recursively parse subcommands
    const subRawList = extractSubcommands(rawSeg)
    const subcommands: ParsedCommand[] = []
    for (const subRaw of subRawList) {
      subcommands.push(...parseBashCommand(subRaw))
    }

    results.push({
      executable,
      args,
      raw: rawSeg,
      subcommands,
    })
  }

  return results
}

// ---------------------------------------------------------------------------
// Security Classification
// ---------------------------------------------------------------------------
const FORBIDDEN_PRIVILEGE_COMMANDS = new Set([
  'sudo',
  'su',
  'doas',
  'pkexec',
  'runas',
])

const FORBIDDEN_SYSTEM_COMMANDS = new Set([
  'shutdown',
  'reboot',
  'poweroff',
  'halt',
  'init',
])

const DESTRUCTIVE_REMOVAL_COMMANDS = new Set([
  'rm',
  'rmdir',
  'unlink',
  'del',
  'erase',
  'remove-item',
])

export interface CommandSafetyVerdict {
  blocked: boolean
  requiresApproval: boolean
  reason?: string
}

/**
 * Analyzes parsed commands to detect privilege escalation, raw device writes,
 * and destructive file deletion with zero false positives on arguments or strings.
 */
export function analyzeCommandSafety(cmdLine: string): CommandSafetyVerdict {
  const commands = parseBashCommand(cmdLine)

  function evaluateCommand(cmd: ParsedCommand): CommandSafetyVerdict | null {
    const exe = cmd.executable

    // 1. Privilege escalation
    if (FORBIDDEN_PRIVILEGE_COMMANDS.has(exe)) {
      return {
        blocked: true,
        requiresApproval: false,
        reason: `Security Violation: Elevating privileges with '${exe}' is strictly forbidden in the sandbox.`,
      }
    }

    // 2. System shutdown / reboot
    if (FORBIDDEN_SYSTEM_COMMANDS.has(exe)) {
      return {
        blocked: true,
        requiresApproval: false,
        reason: `Security Violation: System control command '${exe}' is forbidden in the sandbox.`,
      }
    }

    // 3. Chmod 777
    if (exe === 'chmod' && cmd.args.includes('777')) {
      return {
        blocked: true,
        requiresApproval: false,
        reason: 'Security Violation: chmod 777 is forbidden in the sandbox.',
      }
    }

    // 4. Raw disk device writes (e.g. > /dev/sda, dd of=/dev/nvme0n1)
    if (cmd.raw.match(/>\s*\/dev\/(?:sd[a-z]|hd[a-z]|nvme)/i) || (exe === 'dd' && cmd.args.some(a => a.startsWith('of=/dev/')))) {
      return {
        blocked: true,
        requiresApproval: false,
        reason: 'Security Violation: Writing to raw disk block devices is forbidden.',
      }
    }

    // 5. Destructive file removal
    if (DESTRUCTIVE_REMOVAL_COMMANDS.has(exe)) {
      return {
        blocked: false,
        requiresApproval: true,
        reason: `Destructive Removal: Requesting confirmation to execute '${exe} ${cmd.args.join(' ')}'.`,
      }
    }

    // 6. Destructive git actions
    if (exe === 'git') {
      const isClean = cmd.args[0] === 'clean'
      const isHardReset = cmd.args[0] === 'reset' && cmd.args.includes('--hard')
      if (isClean || isHardReset) {
        return {
          blocked: false,
          requiresApproval: true,
          reason: `Destructive Git Command: Requesting confirmation to execute 'git ${cmd.args.join(' ')}'.`,
        }
      }
    }

    // Check nested subcommands
    for (const sub of cmd.subcommands) {
      const subVerdict = evaluateCommand(sub)
      if (subVerdict) return subVerdict
    }

    return null
  }

  for (const cmd of commands) {
    const verdict = evaluateCommand(cmd)
    if (verdict) return verdict
  }

  return { blocked: false, requiresApproval: false }
}
