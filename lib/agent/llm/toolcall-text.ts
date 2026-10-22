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

export interface ToolCallStreamFilter {
  push(chunk: string): string
  flush(): string
}

/**
 * Creates a streaming filter that buffers and suppresses tool_call code blocks
 * (both ```tool_call...``` and <tool_call>...</tool_call>) from being emitted to the client,
 * while passing through regular conversational text and non-tool code blocks (e.g. ```python).
 */
export function createToolCallFilter(): ToolCallStreamFilter {
  let buffer = ''
  let inToolCall = false
  let toolCallType: 'fenced' | 'xml' | null = null

  return {
    push(chunk: string): string {
      buffer += chunk
      let output = ''

      while (buffer.length > 0) {
        if (!inToolCall) {
          const fenceIndex = buffer.indexOf('```')
          const xmlIndex = buffer.search(/<tool_call\b/i)

          if (fenceIndex === -1 && xmlIndex === -1) {
            const partialFenceMatch = buffer.match(/`{1,2}$/)
            const partialXmlMatch = buffer.match(/<t?(?:o(?:o(?:l(?:_(?:c(?:a(?:l(?:l)?)?)?)?)?)?)?)?$/i)

            const holdLen = Math.max(
              partialFenceMatch ? partialFenceMatch[0].length : 0,
              partialXmlMatch ? partialXmlMatch[0].length : 0
            )

            if (holdLen > 0) {
              const safeEmit = buffer.slice(0, buffer.length - holdLen)
              buffer = buffer.slice(buffer.length - holdLen)
              output += safeEmit
            } else {
              output += buffer
              buffer = ''
            }
            break
          }

          let earliestIndex = -1
          let matchType: 'fenced' | 'xml' = 'fenced'

          if (fenceIndex !== -1 && xmlIndex !== -1) {
            if (fenceIndex <= xmlIndex) {
              earliestIndex = fenceIndex
              matchType = 'fenced'
            } else {
              earliestIndex = xmlIndex
              matchType = 'xml'
            }
          } else if (fenceIndex !== -1) {
            earliestIndex = fenceIndex
            matchType = 'fenced'
          } else {
            earliestIndex = xmlIndex
            matchType = 'xml'
          }

          if (earliestIndex > 0) {
            output += buffer.slice(0, earliestIndex)
            buffer = buffer.slice(earliestIndex)
          }

          if (matchType === 'fenced') {
            const afterFence = buffer.slice(3)
            if (afterFence.length === 0) {
              break
            }

            const tagMatch = afterFence.match(/^([a-zA-Z0-9_-]*)/)
            const tag = tagMatch ? tagMatch[1].toLowerCase() : ''
            const hasDelimiter = /[\s\r\n]/.test(afterFence.slice(tag.length, tag.length + 1))
            const possibleToolPrefix = tag.length > 0 && ('tool_call'.startsWith(tag) || 'toolcall'.startsWith(tag))

            if (tag === 'tool_call' || tag === 'toolcall' || tag === 'tool') {
              inToolCall = true
              toolCallType = 'fenced'
              const matchLen = 3 + tag.length
              const rest = buffer.slice(matchLen).replace(/^[\r\n]+/, '')
              buffer = rest
            } else if (possibleToolPrefix && !hasDelimiter && afterFence.length < 10) {
              break
            } else {
              output += buffer.slice(0, 3)
              buffer = buffer.slice(3)
            }
          } else {
            const closeBracket = buffer.indexOf('>')
            if (closeBracket === -1) {
              break
            }
            inToolCall = true
            toolCallType = 'xml'
            buffer = buffer.slice(closeBracket + 1).replace(/^[\r\n]+/, '')
          }
        } else {
          if (toolCallType === 'fenced') {
            const endFence = buffer.indexOf('```')
            if (endFence === -1) {
              if (buffer.length > 2) {
                buffer = buffer.slice(buffer.length - 2)
              }
              break
            }
            inToolCall = false
            toolCallType = null
            buffer = buffer.slice(endFence + 3).replace(/^[\r\n]+/, '')
          } else {
            const endXml = buffer.search(/<\/tool_call>/i)
            if (endXml === -1) {
              if (buffer.length > 12) {
                buffer = buffer.slice(buffer.length - 12)
              }
              break
            }
            inToolCall = false
            toolCallType = null
            buffer = buffer.slice(endXml + '</tool_call>'.length).replace(/^[\r\n]+/, '')
          }
        }
      }

      return output
    },

    flush(): string {
      if (inToolCall) {
        buffer = ''
        inToolCall = false
        toolCallType = null
        return ''
      }
      const remaining = buffer
      buffer = ''
      return remaining
    },
  }
}

/**
 * Strips router errors and Execution Error tool headers so they never enter message.content,
 * without touching legitimate model conversational text (such as "Error", "Traceback", or code blocks).
 */
export function stripErrorPatterns(rawText: string): string {
  if (!rawText) return ''
  return rawText
    .replace(/\[Router Error[^\]]*\]/gi, '')
    .replace(/(?:^|\n)>?\s*(?:❌\s*)?\*\*Execution Error:\*\*[^\r\n]*/gi, '')
    .replace(/(?:^|\n)>?\s*Execution Error:[^\r\n]*/gi, '')
}

/**
 * Robustly strips raw tool calls, tool execution indicators, and tool outputs from assistant text,
 * correctly handling nested code fences (such as SKILL.md containing ```python code blocks).
 */
export function cleanAssistantContent(rawText: string): string {
  if (!rawText) return ''

  // 1. Strip raw tool call blocks (both fenced and XML), router errors, stack traces, and feedback headers
  let text = stripErrorPatterns(rawText)
    .replace(/(?:```(?:tool_call|toolcall|tool)\s*[\s\S]*?(?:```|$)|<tool_call>\s*[\s\S]*?(?:<\/tool_call>|$))/gi, '')
    .replace(/<!-- approval_required:[\s\S]*?-->/gi, '')
    .replace(/\[System Tool Execution Feedback\][\s\S]*?(?=\n\n|$)/gi, '')
    .replace(/\[System File Verification Error\][\s\S]*?(?=\n\n|$)/gi, '')

  // 2. Line-by-line tool execution and output stripper with nested fence balancing
  const lines = text.split('\n')
  const keptLines: string[] = []
  let inOutputBlock = false
  let fenceLevel = 0
  let skipUntilEmptyOrMarker = false

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const trimmed = line.trim()

    // Check for Executing Tool marker
    if (/^>?\s*🛠️\s*\*\*Executing Tool:\*\*/i.test(trimmed)) {
      skipUntilEmptyOrMarker = true
      continue
    }

    // Check for Output/Error header
    if (
      /^>?\s*(?:✅|❌)?\s*\*\*(?:Output|Command executed successfully\.|Execution Error|Error):\*\*/i.test(trimmed) ||
      /^>?\s*(?:Output|Execution Error|Command executed successfully):/i.test(trimmed)
    ) {
      inOutputBlock = true
      fenceLevel = 0
      skipUntilEmptyOrMarker = false
      continue
    }

    // Check for Notice / Approval Required marker
    if (/^>?\s*⚠️\s*\*\*(?:Notice|Approval Required):\*\*/i.test(trimmed)) {
      continue
    }

    if (inOutputBlock) {
      if (trimmed.startsWith('```')) {
        if (fenceLevel === 0) {
          // Opening fence of output block
          fenceLevel = 1
          continue
        } else if (trimmed === '```') {
          fenceLevel--
          if (fenceLevel === 0) {
            inOutputBlock = false
          }
          continue
        } else {
          // Nested fence opening (e.g. ```python)
          fenceLevel++
          continue
        }
      }

      if (fenceLevel > 0) {
        // Inside fenced output block, skip line
        continue
      }

      // If fenceLevel is 0 but inOutputBlock is true (unfenced output)
      // Stop on empty line, next tool marker, or file tag
      if (!trimmed || trimmed.startsWith('>') || trimmed.startsWith('<file')) {
        inOutputBlock = false
        if (trimmed.startsWith('<file')) {
          keptLines.push(line)
        }
        continue
      }
      // Skip unfenced output lines
      continue
    }

    if (skipUntilEmptyOrMarker) {
      if (!trimmed || trimmed.startsWith('>') || trimmed.startsWith('<file') || trimmed.startsWith('```')) {
        skipUntilEmptyOrMarker = false
        if (trimmed.startsWith('<file')) {
          keptLines.push(line)
        }
      }
      continue
    }

    keptLines.push(line)
  }

  return keptLines.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}
