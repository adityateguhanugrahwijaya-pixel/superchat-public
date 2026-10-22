import { executeTool } from '../agent/tools/registry'
import { ToolResult } from '../agent/tools/types'

export type ToolExecutionResult = {
  success: boolean
  output: string
  error?: string
  filePath?: string
  fileTitle?: string
  presentedFiles?: Array<{ path: string; title: string }>
}

/**
 * Executes a tool in the specified chat sandbox directory.
 * Migrated in Phase 3 to delegate to the unified Tool Registry (Agent v2).
 */
export async function executeSandboxTool(
  userEmail: string,
  chatId: string,
  toolName: string,
  params: Record<string, any>,
  signal?: AbortSignal
): Promise<ToolExecutionResult> {
  const res: ToolResult = await executeTool(userEmail, chatId, toolName, params, signal)
  return {
    success: res.success,
    output: res.output,
    error: res.error,
    filePath: res.filePath,
    fileTitle: res.fileTitle,
    presentedFiles: res.presentedFiles,
  }
}
