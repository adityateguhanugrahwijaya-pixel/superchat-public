export type RiskLevel = 'low' | 'medium' | 'high'

export type SafetyAssessment = {
  riskLevel: RiskLevel
  requiresApproval: boolean
  blocked?: boolean
  reason?: string
}

// Strictly forbidden commands (privilege elevation / system shutdown)
const BLOCKED_PATTERNS = [
  /^\s*sudo\b/i,
  /\bsudo\s+/i,
  /^\s*su\b/i,
  /\bsu\s+root\b/i,
  /\bdoas\b/i,
  /\bpkexec\b/i,
  /\brunas\b/i,
  /\bshutdown\b/i,
  /\breboot\b/i,
  /\bpoweroff\b/i,
  /\bchmod\s+777\b/i,
  />\s*\/dev\/(sda|hda|nvme|null)/i,
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
  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(cmd)) {
      return {
        riskLevel: 'high',
        requiresApproval: false,
        blocked: true,
        reason: `Security Violation: Elevating privileges with 'sudo' or root commands is strictly forbidden in the sandbox.`,
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
