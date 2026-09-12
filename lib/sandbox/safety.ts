export type RiskLevel = 'low' | 'medium' | 'high'

export type SafetyAssessment = {
  riskLevel: RiskLevel
  requiresApproval: boolean
  reason?: string
}

const DANGEROUS_PATTERNS = [
  /\brm\b/i,
  /\brmdir\b/i,
  /\bdel\b/i,
  /\bformat\b/i,
  /\bchmod\b/i,
  /\bchown\b/i,
  /\bsudo\b/i,
  /\bsu\b/i,
  /\bshutdown\b/i,
  /\breboot\b/i,
  /\bgit\s+reset\s+--hard\b/i,
  /\bgit\s+clean\b/i,
  />\s*\/dev\/(null|zero|random|sda)/i,
  /\bkill\b/i,
  /\bkillall\b/i,
  /\bpkill\b/i,
]

/**
 * Assesses the safety risk level of a tool call or shell command.
 */
export function assessToolSafety(toolName: string, params: Record<string, any>): SafetyAssessment {
  if (toolName === 'delete_file') {
    return {
      riskLevel: 'high',
      requiresApproval: true,
      reason: `Destructive action: Deleting file "${params.path || params.filename || 'target'}"`,
    }
  }

  if (toolName === 'execute_command' || toolName === 'run_shell') {
    const cmd = String(params.command || params.cmd || '').trim()

    for (const pattern of DANGEROUS_PATTERNS) {
      if (pattern.test(cmd)) {
        return {
          riskLevel: 'high',
          requiresApproval: true,
          reason: `Potentially dangerous command detected: "${cmd}"`,
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
