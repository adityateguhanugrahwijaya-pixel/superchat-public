import { JSONSchemaObject } from './types'

export interface ValidationOutcome {
  valid: boolean
  error?: string
  args?: Record<string, any>
}

const COMMON_ALIASES: Record<string, string[]> = {
  path: ['path', 'filepath', 'file_path', 'filename', 'file', 'name', 'target', 'dest'],
  command: ['command', 'cmd', 'exec', 'input', 'code', 'script'],
  code: [
    'code',
    'script',
    'python',
    'javascript',
    'js',
    'source',
    'source_code',
    'sourceCode',
    'python_code',
    'pythonCode',
    'script_content',
    'program',
    'input',
    'text',
    'command',
  ],
  content: ['content', 'text', 'code', 'data', 'body'],
  target: ['target', 'targetContent', 'oldText', 'old_text', 'oldContent', 'search', 'find'],
  replacement: ['replacement', 'replacementContent', 'newText', 'new_text', 'newContent', 'replace'],
  files: ['files', 'paths', 'fileList', 'file_list', 'filenames'],
}

/**
 * Normalizes aliases and validates tool arguments against a JSON Schema.
 */
export function validateToolArgs(schema: JSONSchemaObject, rawArgs: any): ValidationOutcome {
  if (rawArgs === null || rawArgs === undefined) {
    if (schema.required && schema.required.length > 0) {
      return {
        valid: false,
        error: `Tool arguments missing. Required fields: [${schema.required.join(', ')}].`,
      }
    }
    return { valid: true, args: {} }
  }

  // If a string was passed for a single-parameter tool (e.g. "print(1)" for run_python)
  let input = rawArgs
  if (typeof input === 'string') {
    const required = schema.required || Object.keys(schema.properties)
    if (required.length === 1) {
      input = { [required[0]]: input }
    } else {
      return {
        valid: false,
        error: `Invalid arguments: expected an object, received string. Required fields: [${required.join(', ')}].`,
      }
    }
  }

  if (typeof input !== 'object' || Array.isArray(input)) {
    return {
      valid: false,
      error: `Invalid arguments: expected a JSON object, received ${Array.isArray(input) ? 'array' : typeof input}.`,
    }
  }

  const normalized: Record<string, any> = { ...input }

  // 1. Resolve aliases for expected properties
  for (const [propName, propDef] of Object.entries(schema.properties)) {
    if (normalized[propName] === undefined) {
      const aliasList = COMMON_ALIASES[propName] || []
      for (const alias of aliasList) {
        if (normalized[alias] !== undefined) {
          normalized[propName] = normalized[alias]
          break
        }
      }
    }

    // Apply default value if present and value is undefined
    if (normalized[propName] === undefined && propDef.default !== undefined) {
      normalized[propName] = propDef.default
    }
  }

  // 2. Validate required properties
  if (schema.required) {
    for (const req of schema.required) {
      const val = normalized[req]
      if (val === undefined || val === null || (typeof val === 'string' && val.trim() === '')) {
        return {
          valid: false,
          error: `Missing required parameter '${req}'. Parameters received: [${Object.keys(input).join(', ')}].`,
        }
      }
    }
  }

  // 3. Validate types for supplied properties
  for (const [propName, propDef] of Object.entries(schema.properties)) {
    const val = normalized[propName]
    if (val === undefined || val === null) continue

    switch (propDef.type) {
      case 'string':
        if (typeof val !== 'string') {
          normalized[propName] = String(val)
        }
        break

      case 'number':
      case 'integer': {
        const num = Number(val)
        if (isNaN(num)) {
          return {
            valid: false,
            error: `Parameter '${propName}' must be a valid number, received: ${JSON.stringify(val)}.`,
          }
        }
        normalized[propName] = propDef.type === 'integer' ? Math.floor(num) : num
        break
      }

      case 'boolean':
        if (typeof val !== 'boolean') {
          normalized[propName] = Boolean(val)
        }
        break

      case 'array':
        if (!Array.isArray(val)) {
          if (typeof val === 'string') {
            // Support single string to array conversion
            normalized[propName] = [val]
          } else {
            return {
              valid: false,
              error: `Parameter '${propName}' must be an array, received: ${typeof val}.`,
            }
          }
        }
        break

      case 'object':
        if (typeof val !== 'object' || Array.isArray(val)) {
          return {
            valid: false,
            error: `Parameter '${propName}' must be an object, received: ${Array.isArray(val) ? 'array' : typeof val}.`,
          }
        }
        break
    }
  }

  return { valid: true, args: normalized }
}
