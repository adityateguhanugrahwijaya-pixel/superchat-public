/**
 * Text-based Tool Call Parser (Agent v2)
 * Robust parser for text-based tool_call codeblocks and XML tags.
 * Supports single objects, array of tool calls, and handles trailing commas and unescaped characters.
 */

export interface ParsedToolCall {
  tool: string
  params: Record<string, any>
}

const KNOWN_TOOLS = new Set([
  'run_python',
  'run_node',
  'execute_command',
  'run_shell',
  'bash',
  'write_file',
  'create_file',
  'read_file',
  'view',
  'edit_file',
  'str_replace',
  'list_dir',
  'delete_file',
  'present_files',
])

function extractToolAndParams(data: any): ParsedToolCall | null {
  if (!data || typeof data !== 'object') return null

  // 1. Determine tool name
  let tool = String(
    data.tool ||
    data.name ||
    data.action ||
    data.function?.name ||
    ''
  ).trim()

  // If tool name not found in top-level property, check if a known tool is the key itself
  if (!tool) {
    for (const key of Object.keys(data)) {
      const lower = key.toLowerCase().trim()
      if (KNOWN_TOOLS.has(lower)) {
        tool = lower
        const val = data[key]
        if (typeof val === 'string') {
          return { tool, params: { code: val, command: val, content: val, path: val } }
        } else if (val && typeof val === 'object') {
          return { tool, params: val }
        }
      }
    }
  }

  if (!tool) return null

  const lowerTool = tool.toLowerCase()
  if (KNOWN_TOOLS.has(lowerTool)) {
    tool = lowerTool
  }

  // 2. Extract params
  let rawParams =
    data.params ??
    data.parameters ??
    data.input ??
    data.arguments ??
    data.function?.arguments

  if (typeof rawParams === 'string') {
    const trimmed = rawParams.trim()
    try {
      rawParams = JSON.parse(trimmed)
    } catch {
      rawParams = { code: trimmed, command: trimmed, content: trimmed, path: trimmed }
    }
  }

  let params: Record<string, any> =
    rawParams && typeof rawParams === 'object' && !Array.isArray(rawParams)
      ? { ...rawParams }
      : {}

  // Merge in top-level fields
  const {
    tool: _t,
    name: _n,
    action: _a,
    type: _ty,
    function: _f,
    id: _id,
    params: _p,
    arguments: _args,
    parameters: _params,
    input: _in,
    ...topLevelFields
  } = data

  params = { ...topLevelFields, ...params }

  return { tool, params }
}

function sanitizeJsonString(str: string): string {
  let sanitized = ''
  let inString = false
  let isEscaped = false

  for (let i = 0; i < str.length; i++) {
    const char = str[i]
    if (char === '"' && !isEscaped) {
      inString = !inString
      sanitized += char
      isEscaped = false
      continue
    }

    if (inString) {
      if (char === '\n') {
        sanitized += '\\n'
      } else if (char === '\r') {
        sanitized += '\\r'
      } else if (char === '\t') {
        sanitized += '\\t'
      } else {
        sanitized += char
      }
    } else {
      sanitized += char
    }

    if (char === '\\' && !isEscaped) {
      isEscaped = true
    } else {
      isEscaped = false
    }
  }

  // Remove trailing commas before closing braces/brackets
  sanitized = sanitized.replace(/,\s*([}\]])/g, '$1')
  return sanitized
}

export function parseToolCallJson(rawStr: string): ParsedToolCall[] {
  const trimmed = (rawStr || '').trim()
  if (!trimmed) return []

  const results: ParsedToolCall[] = []

  // Attempt 1: Direct JSON parse
  try {
    const data = JSON.parse(trimmed)
    if (Array.isArray(data)) {
      for (const item of data) {
        const res = extractToolAndParams(item)
        if (res) results.push(res)
      }
      if (results.length > 0) return results
    } else {
      const res = extractToolAndParams(data)
      if (res) return [res]
    }
  } catch {}

  // Attempt 2: Sanitized parse (fixes unescaped newlines and trailing commas)
  try {
    const sanitized = sanitizeJsonString(trimmed)
    const data = JSON.parse(sanitized)
    if (Array.isArray(data)) {
      for (const item of data) {
        const res = extractToolAndParams(item)
        if (res) results.push(res)
      }
      if (results.length > 0) return results
    } else {
      const res = extractToolAndParams(data)
      if (res) return [res]
    }
  } catch {}

  // Attempt 3: Regex fallback extraction
  try {
    const toolMatch = trimmed.match(/["']?(?:tool|name|action)["']?\s*:\s*["']([^"']+)["']/i)
    if (toolMatch) {
      const tool = toolMatch[1].trim()
      const codeMatch = trimmed.match(/["']?(?:code|script|content|command)["']?\s*:\s*["']([\s\S]*?)(?:["']\s*[,}]|$)/i)
      const pathMatch = trimmed.match(/["']?(?:path|filename|filepath|file)["']?\s*:\s*["']([^"']+)["']/i)
      return [
        {
          tool,
          params: {
            code: codeMatch ? codeMatch[1] : '',
            command: codeMatch ? codeMatch[1] : '',
            content: codeMatch ? codeMatch[1] : '',
            path: pathMatch ? pathMatch[1] : '',
          },
        },
      ]
    }
  } catch {}

  return []
}

/**
 * Extracts all tool calls from a raw model turn output text.
 */
export function extractTextToolCalls(turnText: string): ParsedToolCall[] {
  const toolCallRegex = /(?:```(?:tool_call|toolcall|tool)\s*([\s\S]*?)\s*```|<tool_call>\s*([\s\S]*?)\s*<\/tool_call>)/gi
  const allCalls: ParsedToolCall[] = []
  let match: RegExpExecArray | null

  while ((match = toolCallRegex.exec(turnText)) !== null) {
    const jsonStr = (match[1] || match[2] || '').trim()
    const parsedList = parseToolCallJson(jsonStr)
    allCalls.push(...parsedList)
  }

  return allCalls
}
