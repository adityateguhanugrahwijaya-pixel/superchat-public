export type RiskLevel = 'low' | 'medium' | 'high'

export type SafetyAssessment = {
  riskLevel: RiskLevel
  requiresApproval: boolean
  blocked?: boolean
  reason?: string
}

type BlockRule = { pattern: RegExp; reason: string }

const SUDO_REASON = `Security Violation: Elevating privileges with 'sudo' or root commands is strictly forbidden in the sandbox.`

// Strictly forbidden commands (privilege elevation / system shutdown)
const BLOCK_RULES: BlockRule[] = [
  { pattern: /^\s*sudo\b/i, reason: SUDO_REASON },
  { pattern: /(?:^|[;&|(]\s*)sudo\s+/i, reason: SUDO_REASON },
  { pattern: /^\s*su\b/i, reason: SUDO_REASON },
  { pattern: /\bsu\s+root\b/i, reason: SUDO_REASON },
  { pattern: /\bdoas\b/i, reason: SUDO_REASON },
  { pattern: /\bpkexec\b/i, reason: SUDO_REASON },
  { pattern: /\brunas\b/i, reason: SUDO_REASON },
  // Only block these when they are used AS a command (start of line or after ; && | ),
  // so things like `git commit -m "fix reboot bug"` are not blocked.
  {
    pattern: /(?:^|[;&|(]\s*)(?:shutdown|reboot|poweroff)\b/i,
    reason: 'Security Violation: System shutdown/reboot commands are forbidden in the sandbox.',
  },
  { pattern: /\bchmod\s+777\b/i, reason: 'Security Violation: chmod 777 is forbidden in the sandbox.' },
  // Writing to raw disks. NOTE: "> /dev/null" is harmless and common (e.g. `cmd 2>/dev/null`),
  // so it is intentionally NOT blocked anymore.
  { pattern: />\s*\/dev\/(?:sd[a-z]|hd[a-z]|nvme)/i, reason: 'Security Violation: Writing to raw disk devices is forbidden.' },
]

// Destructive file/directory removal commands requiring 1-minute user confirmation
const REMOVAL_PATTERNS = [
  /\brm\s+/i,
  /\brmdir\b/i,
  /\bdel\s+/i,
  /\berase\b/i,
  /\bunlink\b/i,
  /\bremove-item\b/i,
  /\bgit\s+reset\s+--hard\b/i,
  /\bgit\s+clean\b/i,
]

/**
 * Assesses the safety risk level of a tool call or shell command.
 */
export function assessToolSafety(toolName: string, params: Record<string, any>): SafetyAssessment {
  const cmd = String(params.command || params.cmd || '').trim()

  // 1. Check for strictly blocked commands (e.g. sudo)
  for (const rule of BLOCK_RULES) {
    if (rule.pattern.test(cmd)) {
      return {
        riskLevel: 'high',
        requiresApproval: false,
        blocked: true,
        reason: rule.reason,
      }
    }
  }

  // 2. Check for delete_file tool or file removal commands -> require 1-min user confirmation
  if (toolName === 'delete_file') {
    const target = params.path || params.filename || 'file'
    return {
      riskLevel: 'high',
      requiresApproval: true,
      reason: `Destructive File Removal: Requesting confirmation to delete file "${target}".`,
    }
  }

  if (toolName === 'execute_command' || toolName === 'run_shell') {
    for (const pattern of REMOVAL_PATTERNS) {
      if (pattern.test(cmd)) {
        return {
          riskLevel: 'high',
          requiresApproval: true,
          reason: `Destructive Removal Command: Requesting confirmation to execute removal command "${cmd}".`,
        }
      }
    }
  }

  if (toolName === 'write_file' || toolName === 'edit_file') {
    return {
      riskLevel: 'medium',
      requiresApproval: false,
    }
  }

  return {
    riskLevel: 'low',
    requiresApproval: false,
  }
}
