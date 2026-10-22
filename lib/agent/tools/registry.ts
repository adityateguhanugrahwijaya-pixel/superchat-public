import { ToolDefinition, ToolResult, ToolContext } from './types'
import { validateToolArgs } from './validator'
import { getSessionDir } from '../../sandbox/paths'
import { shellTool } from './shell'
import { pythonTool } from './python'
import { nodeTool } from './node'
import { readFileTool, writeFileTool, editFileTool, listDirTool, deleteFileTool } from './fs'
import { presentFilesTool } from './present'

class ToolRegistry {
  private toolsByName = new Map<string, ToolDefinition>()
  private allTools: ToolDefinition[] = []

  register(tool: ToolDefinition) {
    this.allTools.push(tool)
    this.toolsByName.set(tool.name.toLowerCase(), tool)

    if (tool.aliases) {
      for (const alias of tool.aliases) {
        this.toolsByName.set(alias.toLowerCase(), tool)
      }
    }
  }

  get(name: string): ToolDefinition | undefined {
    return this.toolsByName.get((name || '').trim().toLowerCase())
  }

  getAll(): ToolDefinition[] {
    return [...this.allTools]
  }

  /**
   * Generates standard OpenAI tools schema format:
   * [{ type: 'function', function: { name, description, parameters } }]
   */
  getOpenAISchema(): Array<{
    type: 'function'
    function: { name: string; description: string; parameters: any }
  }> {
    return this.allTools.map((t) => ({
      type: 'function',
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      },
    }))
  }

  /**
   * Generates human/prompt-readable documentation of all registered tools
   */
  getPromptDocumentation(): string {
    const lines: string[] = ['AVAILABLE TOOLS & FORMATS:']
    for (const tool of this.allTools) {
      const paramList = Object.entries(tool.parameters.properties || {})
        .map(([k, v]) => `"${k}": "${v.description || v.type}"`)
        .join(', ')
      lines.push(`- ${tool.name}: {"tool": "${tool.name}", "params": {${paramList}}} — ${tool.description}`)
    }
    return lines.join('\n')
  }

  async execute(
    userEmail: string,
    chatId: string,
    toolName: string,
    rawArgs: any,
    signal?: AbortSignal,
    approved?: boolean
  ): Promise<ToolResult> {
    const tool = this.get(toolName)
    if (!tool) {
      return {
        success: false,
        output: `Unknown tool: '${toolName}'. Available tools: [${this.allTools.map((t) => t.name).join(', ')}]`,
        error: `Unknown tool: ${toolName}`,
      }
    }

    // Schema argument validation
    const validation = validateToolArgs(tool.parameters, rawArgs)
    if (!validation.valid) {
      return {
        success: false,
        output: `Schema Validation Error for tool '${tool.name}': ${validation.error}`,
        error: validation.error,
      }
    }

    const sessionDir = getSessionDir(userEmail, chatId, true)
    const context: ToolContext = {
      userEmail,
      chatId,
      sessionDir,
      signal,
      approved,
    }

    try {
      return await tool.execute(context, validation.args || {})
    } catch (err: any) {
      const message = err?.message || 'Tool execution failure'
      return {
        success: false,
        output: `Execution Error in tool '${tool.name}': ${message}`,
        error: message,
      }
    }
  }
}

// Global registry instance
export const toolRegistry = new ToolRegistry()

// Register standard tools
toolRegistry.register(shellTool)
toolRegistry.register(pythonTool)
toolRegistry.register(nodeTool)
toolRegistry.register(readFileTool)
toolRegistry.register(writeFileTool)
toolRegistry.register(editFileTool)
toolRegistry.register(listDirTool)
toolRegistry.register(deleteFileTool)
toolRegistry.register(presentFilesTool)

export const executeTool = toolRegistry.execute.bind(toolRegistry)
export const getTool = toolRegistry.get.bind(toolRegistry)
export const getAllTools = toolRegistry.getAll.bind(toolRegistry)
export const getOpenAISchema = toolRegistry.getOpenAISchema.bind(toolRegistry)
export const getPromptDocumentation = toolRegistry.getPromptDocumentation.bind(toolRegistry)
