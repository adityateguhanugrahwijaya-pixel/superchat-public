import { analyzeCommandSafety } from './tokenizer'

export type RiskLevel = 'low' | 'medium' | 'high'

export type SafetyAssessment = {
  riskLevel: RiskLevel
  requiresApproval: boolean
  blocked?: boolean
  reason?: string
}

/**
 * Assesses the safety risk level of a tool call or shell command
 * using AST tokenization to eliminate false positives and catch nested escapes.
 */
export function assessToolSafety(toolName: string, params: Record<string, any>): SafetyAssessment {
  const normTool = (toolName || '').toLowerCase().trim()

  // 1. delete_file tool is always high risk requiring approval
  if (normTool === 'delete_file') {
    const target = params.path || params.filename || 'file'
    return {
      riskLevel: 'high',
      requiresApproval: true,
      reason: `Destructive File Removal: Requesting confirmation to delete file "${target}".`,
    }
  }

  // 2. Analyze shell commands via AST tokenizer
  const cmd = String(params.command || params.cmd || '').trim()
  if (cmd && (normTool === 'execute_command' || normTool === 'run_shell' || normTool === 'bash')) {
    const verdict = analyzeCommandSafety(cmd)
    if (verdict.blocked) {
      return {
        riskLevel: 'high',
        requiresApproval: false,
        blocked: true,
        reason: verdict.reason,
      }
    }
    if (verdict.requiresApproval) {
      return {
        riskLevel: 'high',
        requiresApproval: true,
        reason: verdict.reason,
      }
    }
  }

  if (normTool === 'write_file' || normTool === 'edit_file') {
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
