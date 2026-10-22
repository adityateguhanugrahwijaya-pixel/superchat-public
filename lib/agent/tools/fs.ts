import fs from 'node:fs'
import path from 'node:path'
import { ToolDefinition, ToolContext, ToolResult } from './types'
import { resolveSandboxPath } from '../../sandbox/paths'
import { clipOutput } from './helpers'

// ---------------------------------------------------------------------------
// 1. read_file
// ---------------------------------------------------------------------------
export const readFileTool: ToolDefinition = {
  name: 'read_file',
  aliases: ['view', 'cat'],
  description:
    'Reads the contents of a file in the workspace. Supports pagination with offset and limit parameters to inspect large files without exhausting token limits.',
  parameters: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Relative path to the file in the workspace (e.g. "data.csv" or "src/app.py").',
      },
      offset: {
        type: 'integer',
        description: 'The 1-based starting line number to read from (default: 1).',
        default: 1,
      },
      limit: {
        type: 'integer',
        description: 'Maximum number of lines to read (default: 1000).',
        default: 1000,
      },
    },
    required: ['path'],
  },
  execute: async (context: ToolContext, args: { path: string; offset?: number; limit?: number }): Promise<ToolResult> => {
    const { userEmail, chatId, sessionDir } = context
    const reqPath = String(args.path || '').trim()

    if (!reqPath || reqPath === '.' || reqPath === './') {
      const fullPath = resolveSandboxPath(userEmail, chatId, '.')
      const items = fs.readdirSync(fullPath, { withFileTypes: true })
      const list = items
        .filter((i) => !i.name.startsWith('.') && i.name !== 'node_modules')
        .map((i) => `${i.isDirectory() ? '[DIR]' : '[FILE]'} ${i.name}`)
        .join('\n')
      return {
        success: true,
        output: `📁 Workspace Directory Listing (${items.length} items):\n${list || '(empty directory)'}`,
      }
    }

    const fullPath = resolveSandboxPath(userEmail, chatId, reqPath)
    if (!fs.existsSync(fullPath)) {
      return { success: false, output: `File not found: ${reqPath}`, error: 'File not found' }
    }

    const stat = fs.statSync(fullPath)
    if (stat.isDirectory()) {
      const items = fs.readdirSync(fullPath, { withFileTypes: true })
      const list = items
        .filter((i) => !i.name.startsWith('.') && i.name !== 'node_modules')
        .map((i) => `${i.isDirectory() ? '[DIR]' : '[FILE]'} ${i.name}`)
        .join('\n')
      return {
        success: true,
        output: `📁 Directory Listing for '${reqPath}' (${items.length} items):\n${list || '(empty directory)'}`,
      }
    }

    const content = fs.readFileSync(fullPath, 'utf-8')
    const lines = content.split('\n')
    const totalLines = lines.length

    const offset = Math.max(1, Number(args.offset || 1))
    const limit = Math.max(1, Math.min(5000, Number(args.limit || 1000)))

    const relPath = path.relative(sessionDir, fullPath)

    if (totalLines > limit || offset > 1) {
      const startIdx = offset - 1
      const endIdx = Math.min(startIdx + limit, totalLines)
      const sliced = lines.slice(startIdx, endIdx).join('\n')
      const nextOffset = endIdx + 1

      const header =
        `[File: ${relPath} (Showing lines ${offset}-${endIdx} of ${totalLines})]\n` +
        (nextOffset <= totalLines
          ? `[To view subsequent lines, call read_file with offset: ${nextOffset}]\n\n`
          : '\n')

      return {
        success: true,
        output: clipOutput(header + sliced),
        filePath: relPath,
        fileTitle: path.basename(relPath),
      }
    }

    return {
      success: true,
      output: clipOutput(content),
      filePath: relPath,
      fileTitle: path.basename(relPath),
    }
  },
}

// ---------------------------------------------------------------------------
// 2. write_file
// ---------------------------------------------------------------------------
export const writeFileTool: ToolDefinition = {
  name: 'write_file',
  aliases: ['create_file'],
  description:
    'Writes or overwrites a file in the workspace. Automatically creates parent subdirectories if needed. Use relative paths (e.g. "report.md" or "outputs/data.csv").',
  parameters: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Relative destination path for the file.',
      },
      content: {
        type: 'string',
        description: 'The complete text content to write into the file.',
      },
    },
    required: ['path', 'content'],
  },
  execute: async (context: ToolContext, args: { path: string; content: string }): Promise<ToolResult> => {
    const { userEmail, chatId, sessionDir } = context
    const reqPath = String(args.path || '').trim()
    const content = String(args.content ?? '')

    if (!reqPath) {
      return { success: false, output: 'Error: path parameter is required for write_file.', error: 'Empty path' }
    }

    const fullPath = resolveSandboxPath(userEmail, chatId, reqPath, false)

    if (fs.existsSync(fullPath) && fs.statSync(fullPath).isDirectory()) {
      return {
        success: false,
        output: `Error: Cannot write to '${reqPath}' because it is an existing directory.`,
        error: 'Target is a directory',
      }
    }

    const parentDir = path.dirname(fullPath)
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true })
    }

    fs.writeFileSync(fullPath, content, 'utf-8')
    const relPath = path.relative(sessionDir, fullPath)
    const bytes = Buffer.byteLength(content, 'utf-8')

    return {
      success: true,
      output: `Successfully written ${bytes} bytes to ${relPath}`,
      filePath: relPath,
      fileTitle: path.basename(relPath),
    }
  },
}

// ---------------------------------------------------------------------------
// 3. edit_file
// ---------------------------------------------------------------------------
export const editFileTool: ToolDefinition = {
  name: 'edit_file',
  aliases: ['str_replace'],
  description:
    'Performs exact string search-and-replace in an existing file. If target is empty, overwrites the full file content.',
  parameters: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Relative path of the file to edit.',
      },
      target: {
        type: 'string',
        description: 'The exact character sequence to replace. If left empty, replaces the entire file.',
      },
      replacement: {
        type: 'string',
        description: 'The new replacement content.',
      },
      replaceAll: {
        type: 'boolean',
        description: 'Whether to replace all occurrences of target instead of just the first (default: false).',
        default: false,
      },
    },
    required: ['path', 'replacement'],
  },
  execute: async (
    context: ToolContext,
    args: { path: string; target?: string; replacement: string; replaceAll?: boolean }
  ): Promise<ToolResult> => {
    const { userEmail, chatId, sessionDir } = context
    const reqPath = String(args.path || '').trim()
    const target = String(args.target ?? '')
    const replacement = String(args.replacement ?? '')
    const replaceAll = Boolean(args.replaceAll)

    if (!reqPath) {
      return { success: false, output: 'Error: path parameter is required for edit_file.', error: 'Empty path' }
    }

    const fullPath = resolveSandboxPath(userEmail, chatId, reqPath)
    if (!fs.existsSync(fullPath)) {
      return { success: false, output: `Error: File not found: ${reqPath}`, error: 'File not found' }
    }

    const stat = fs.statSync(fullPath)
    if (stat.isDirectory()) {
      return { success: false, output: `Error: '${reqPath}' is a directory, not a file.`, error: 'Is directory' }
    }

    let content = fs.readFileSync(fullPath, 'utf-8')
    const relPath = path.relative(sessionDir, fullPath)

    if (!target) {
      fs.writeFileSync(fullPath, replacement, 'utf-8')
      return {
        success: true,
        output: `Successfully updated entire content of ${relPath} (${replacement.length} characters).`,
        filePath: relPath,
        fileTitle: path.basename(relPath),
      }
    }

    if (!content.includes(target)) {
      const trimmedTarget = target.trim()
      if (trimmedTarget && content.includes(trimmedTarget)) {
        const count = content.split(trimmedTarget).length - 1
        content = replaceAll
          ? content.replaceAll(trimmedTarget, replacement)
          : content.replace(trimmedTarget, replacement)
        fs.writeFileSync(fullPath, content, 'utf-8')
        return {
          success: true,
          output: `Successfully updated ${relPath} (Replaced ${replaceAll ? count : 1} occurrence(s) using trimmed match).`,
          filePath: relPath,
          fileTitle: path.basename(relPath),
        }
      }

      const lines = content.split('\n')
      const snippetPreview = lines.slice(0, 10).map((l, idx) => `${idx + 1}: ${l}`).join('\n')
      return {
        success: false,
        output: `Error: Target snippet not found in ${reqPath}.\nTarget searched:\n\`\`\`\n${target.slice(0, 300)}\n\`\`\`\n\nFile preview (${lines.length} lines total):\n\`\`\`\n${snippetPreview}\n\`\`\`\n\nPlease check the exact characters to replace or read the file first.`,
        error: 'Target snippet not found',
      }
    }

    const count = content.split(target).length - 1
    content = replaceAll ? content.replaceAll(target, replacement) : content.replace(target, replacement)
    fs.writeFileSync(fullPath, content, 'utf-8')

    return {
      success: true,
      output: `Successfully edited ${relPath} (Replaced ${replaceAll ? `${count} occurrence(s)` : '1 occurrence'}).`,
      filePath: relPath,
      fileTitle: path.basename(relPath),
    }
  },
}

// ---------------------------------------------------------------------------
// 4. list_dir
// ---------------------------------------------------------------------------
export const listDirTool: ToolDefinition = {
  name: 'list_dir',
  aliases: ['ls'],
  description:
    'Lists contents of a directory in the workspace with item types and file sizes.',
  parameters: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Relative path to directory (default: ".").',
        default: '.',
      },
      depth: {
        type: 'integer',
        description: 'Maximum depth of subdirectories to inspect (default: 1).',
        default: 1,
      },
    },
  },
  execute: async (context: ToolContext, args: { path?: string; depth?: number }): Promise<ToolResult> => {
    const { userEmail, chatId } = context
    const reqPath = String(args.path || '.').trim()
    const maxDepth = Math.max(1, Math.min(5, Number(args.depth || 1)))

    const fullPath = resolveSandboxPath(userEmail, chatId, reqPath)
    if (!fs.existsSync(fullPath)) {
      return { success: false, output: `Directory not found: ${reqPath}`, error: 'Directory not found' }
    }

    const results: string[] = []
    function walk(currentDir: string, currentDepth: number, prefix = '') {
      if (currentDepth > maxDepth) return
      let entries: fs.Dirent[]
      try {
        entries = fs.readdirSync(currentDir, { withFileTypes: true })
      } catch {
        return
      }

      for (const entry of entries) {
        if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === '__pycache__') continue
        const itemPath = path.join(currentDir, entry.name)
        if (entry.isDirectory()) {
          results.push(`${prefix}[DIR]  ${entry.name}/`)
          walk(itemPath, currentDepth + 1, `${prefix}  `)
        } else if (entry.isFile()) {
          try {
            const st = fs.statSync(itemPath)
            results.push(`${prefix}[FILE] ${entry.name} (${st.size} bytes)`)
          } catch {
            results.push(`${prefix}[FILE] ${entry.name}`)
          }
        }
      }
    }

    walk(fullPath, 1)

    return {
      success: true,
      output: results.length > 0 ? results.join('\n') : '(empty directory)',
    }
  },
}

// ---------------------------------------------------------------------------
// 5. delete_file
// ---------------------------------------------------------------------------
export const deleteFileTool: ToolDefinition = {
  name: 'delete_file',
  aliases: ['rm'],
  isRisky: true,
  description: 'Deletes a file or directory from the workspace. Irreversible action.',
  parameters: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Relative path of the file or directory to delete.',
      },
    },
    required: ['path'],
  },
  execute: async (context: ToolContext, args: { path: string }): Promise<ToolResult> => {
    const { userEmail, chatId, sessionDir } = context
    const reqPath = String(args.path || '').trim()

    if (!reqPath) {
      return { success: false, output: 'Error: path parameter is required for delete_file.', error: 'Empty path' }
    }

    const fullPath = resolveSandboxPath(userEmail, chatId, reqPath, false)
    if (!fs.existsSync(fullPath)) {
      return { success: false, output: `File not found: ${reqPath}`, error: 'File not found' }
    }

    // Safety: never delete root session directory or .agent directory
    if (fullPath === sessionDir || fullPath.endsWith('/.agent') || fullPath.includes('/.agent/')) {
      return {
        success: false,
        output: 'Security Violation: Cannot delete root or internal .agent directory.',
        error: 'Forbidden path',
      }
    }

    fs.rmSync(fullPath, { recursive: true, force: true })
    return {
      success: true,
      output: `Successfully deleted ${reqPath}`,
    }
  },
}
