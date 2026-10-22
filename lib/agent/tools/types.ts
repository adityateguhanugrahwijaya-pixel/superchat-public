/**
 * Tool Registry Type Definitions (Agent v2)
 */

export interface JSONSchemaProperty {
  type: 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'object'
  description?: string
  enum?: string[]
  items?: JSONSchemaProperty | Record<string, any>
  default?: any
}

export interface JSONSchemaObject {
  type: 'object'
  properties: Record<string, JSONSchemaProperty>
  required?: string[]
  additionalProperties?: boolean
}

export interface ToolContext {
  userEmail: string
  chatId: string
  sessionDir: string
  signal?: AbortSignal
}

export interface PresentedFile {
  path: string
  title: string
}

export interface ToolResult {
  success: boolean
  output: string
  error?: string
  filePath?: string
  fileTitle?: string
  presentedFiles?: PresentedFile[]
}

export interface ToolDefinition {
  name: string
  description: string
  parameters: JSONSchemaObject
  isRisky?: boolean
  aliases?: string[]
  execute: (context: ToolContext, args: any) => Promise<ToolResult>
}
