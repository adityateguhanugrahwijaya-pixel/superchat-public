import { exec } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { getSandboxDir, resolveSandboxPath } from './index'

export type ToolExecutionResult = {
  success: boolean
  output: string
  error?: string
  filePath?: string
  fileTitle?: string
}

// ---------------------------------------------------------------------------
// Limits (tweak these if you need more room)
// ---------------------------------------------------------------------------
const SCRIPT_TIMEOUT_MS = 120_000 // python / node scripts (was 45s)
const COMMAND_TIMEOUT_MS = 120_000 // shell commands (was 60s)
const MAX_BUFFER_BYTES = 50 * 1024 * 1024 // stdout+stderr cap per stream (Node default is only 1 MB)
const MAX_OUTPUT_CHARS = 200_000 // cap on what is sent back to the model

/**
 * Optional: set PYTHON_BIN in .env.local to use a specific interpreter,
 * e.g. the Python from your cloned conda env / venv:
 *   PYTHON_BIN=/home/me/miniconda3/envs/new_env/bin/python
 *   PYTHON_BIN=C:\Users\me\venvs\new_env\Scripts\python.exe
 */
function getPythonBin(): string {
  const custom = process.env.PYTHON_BIN?.trim()
  if (custom) return custom
  return process.platform === 'win32' ? 'python' : 'python3'
}

// ---------------------------------------------------------------------------
// File snapshot helpers
// ---------------------------------------------------------------------------
type FileStamp = { mtimeMs: number; size: number }

function snapshotSandboxFiles(sandboxDir: string): Map<string, FileStamp> {
  const fileMap = new Map<string, FileStamp>()
  const walk = (dir: string) => {
    let items: fs.Dirent[]
    try {
      items = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const item of items) {
      if (item.name.startsWith('_temp_')) continue
      const full = path.join(dir, item.name)
      try {
        // statSync follows symlinks, so symlinked files/dirs are handled too
        const st = fs.statSync(full)
        if (st.isDirectory()) {
          if (item.name === 'node_modules' || item.name === '__pycache__' || item.name === '.git') continue
          walk(full)
        } else if (st.isFile()) {
          fileMap.set(path.relative(sandboxDir, full), { mtimeMs: st.mtimeMs, size: st.size })
        }
      } catch {}
    }
  }
  walk(sandboxDir)
  return fileMap
}

function detectNewOrModifiedFiles(sandboxDir: string, before: Map<string, FileStamp>): string[] {
  const after = snapshotSandboxFiles(sandboxDir)
  const result: string[] = []
  for (const [rel, stamp] of after) {
    const prev = before.get(rel)
    if (!prev || prev.mtimeMs !== stamp.mtimeMs || prev.size !== stamp.size) {
      result.push(rel)
    }
  }
  return result
}

// ---------------------------------------------------------------------------
// Small utilities
// ---------------------------------------------------------------------------
function pickParam(params: Record<string, any>, keys: string[]): string {
  for (const key of keys) {
    const v = params[key]
    if (typeof v === 'string' && v.trim()) return v
  }
  return ''
}

/** Removes ```python ... ``` fences if the model wrapped the code in markdown. */
function stripCodeFences(code: string): string {
  const match = code.trim().match(/^```[a-zA-Z0-9_-]*\s*\n([\s\S]*?)\n?```\s*$/)
  return match ? match[1] : code
}

/** Keeps the start and end of very long output so nothing important (like a traceback) is lost. */
function clipOutput(text: string): string {
  if (text.length <= MAX_OUTPUT_CHARS) return text
  const half = Math.floor(MAX_OUTPUT_CHARS / 2)
  const omitted = text.length - MAX_OUTPUT_CHARS
  return `${text.slice(0, half)}\n\n... [${omitted} characters omitted] ...\n\n${text.slice(-half)}`
}

function filesSection(createdFiles: string[]): string {
  return createdFiles.length > 0
    ? `\n\n📁 **Workspace Files Created/Updated:**\n` + createdFiles.map((f) => `- ${f}`).join('\n')
    : ''
}

function describeExecError(err: any): string {
  if (err?.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER') {
    return '\n\n📦 Output exceeded the buffer limit, so it was cut off. Print less, or write the results to a file.'
  }
  if (err?.killed && (err?.signal === 'SIGTERM' || err?.signal === 'SIGKILL')) {
    return `\n\n⏱️ The process was killed after hitting the ${Math.round(SCRIPT_TIMEOUT_MS / 1000)}s time limit. Make the script faster or split the work into steps.`
  }
  if (err?.code === 127) {
    return '\n\n🔎 Command not found. If this is Python, set PYTHON_BIN in .env.local to the full path of your interpreter.'
  }
  return ''
}

/**
 * Runs a script file with the given command, then reports output + files.
 * Shared by run_python and run_node.
 */
function runScript(opts: {
  command: string
  tempFile: string
  sandboxDir: string
  label: 'Python' | 'Node.js'
  env: NodeJS.ProcessEnv
  missingModuleHelp: (output: string) => string
}): Promise<ToolExecutionResult> {
  const { command, tempFile, sandboxDir, label, env, missingModuleHelp } = opts
  const beforeFiles = snapshotSandboxFiles(sandboxDir)

  return new Promise((resolve) => {
    exec(
      command,
      { cwd: sandboxDir, timeout: SCRIPT_TIMEOUT_MS, maxBuffer: MAX_BUFFER_BYTES, env },
      (err, stdout, stderr) => {
        try { fs.unlinkSync(tempFile) } catch {}

        const createdFiles = detectNewOrModifiedFiles(sandboxDir, beforeFiles)
        const combinedOutput = [stdout, stderr].filter(Boolean).join('\n').trim()

        // Trust the real exit status. The old version scanned the text for words like
        // "TypeError:" which marked healthy scripts as failed.
        if (err) {
          const errorText = stderr || stdout || err.message || `${label} execution failed`
          const body = combinedOutput || err.message || 'Script exited with error'
          resolve({
            success: false,
            output: clipOutput(
              `❌ ${label} Script Failed:\n${body}${describeExecError(err)}${missingModuleHelp(combinedOutput)}`
            ),
            error: errorText,
            filePath: createdFiles[0] || undefined,
            fileTitle: createdFiles[0] ? path.basename(createdFiles[0]) : undefined,
          })
          return
        }

        let outMsg = combinedOutput || `${label} script ran successfully but printed nothing.`
        outMsg += filesSection(createdFiles)
        if (createdFiles.length === 0) {
          outMsg += `\n\n⚠️ **Notice:** No new or changed files in the workspace. If you expected a file, make sure the script saves it (e.g. \`df.to_csv('out.csv')\`, \`plt.savefig('chart.png')\`) using a relative path.`
        }

        resolve({
          success: true,
          output: clipOutput(outMsg),
          filePath: createdFiles[0] || undefined,
          fileTitle: createdFiles[0] ? path.basename(createdFiles[0]) : undefined,
        })
      }
    )
  })
}

/**
 * Executes a tool in the specified chat sandbox directory.
 */
export async function executeSandboxTool(
  userEmail: string,
  chatId: string,
  toolName: string,
  params: Record<string, any>
): Promise<ToolExecutionResult> {
  const sandboxDir = getSandboxDir(userEmail, chatId)

  try {
    // Make sure the sandbox folder exists before any tool touches it
    fs.mkdirSync(sandboxDir, { recursive: true })

    switch (toolName) {
      case 'read_file': {
        const filePath = String(
          params.path || params.filepath || params.file_path || params.filename || params.file || params.name || params.target || ''
        ).trim()

        if (!filePath || filePath === '.' || filePath === './') {
          const fullPath = resolveSandboxPath(userEmail, chatId, '.')
          const items = fs.readdirSync(fullPath, { withFileTypes: true })
          const list = items.map((i) => `${i.isDirectory() ? '[DIR]' : '[FILE]'} ${i.name}`).join('\n')
          return {
            success: true,
            output: `📁 Workspace Directory Listing (${items.length} items):\n${list || '(empty directory)'}`,
          }
        }

        const fullPath = resolveSandboxPath(userEmail, chatId, filePath)
        if (!fs.existsSync(fullPath)) {
          return { success: false, output: `File not found: ${filePath}` }
        }
        const stat = fs.statSync(fullPath)
        if (stat.isDirectory()) {
          const items = fs.readdirSync(fullPath, { withFileTypes: true })
          const list = items.map((i) => `${i.isDirectory() ? '[DIR]' : '[FILE]'} ${i.name}`).join('\n')
          return {
            success: true,
            output: `📁 Directory Listing for '${filePath}' (${items.length} items):\n${list || '(empty directory)'}`,
          }
        }
        const content = fs.readFileSync(fullPath, 'utf-8')
        return { success: true, output: content, filePath, fileTitle: path.basename(filePath) }
      }

      case 'write_file': {
        const filePath = String(
          params.path || params.filepath || params.file_path || params.filename || params.file || params.name || params.target || params.dest || ''
        ).trim()
        const content = String(params.content || params.text || params.code || params.data || params.body || '')
        if (!filePath) {
          return { success: false, output: 'Error: Path parameter is required for write_file tool.' }
        }

        const fullPath = resolveSandboxPath(userEmail, chatId, filePath)
        if (fs.existsSync(fullPath) && fs.statSync(fullPath).isDirectory()) {
          return { success: false, output: `Error: Cannot write to '${filePath}' because it is a directory.` }
        }
        const parentDir = path.dirname(fullPath)
        if (!fs.existsSync(parentDir)) {
          fs.mkdirSync(parentDir, { recursive: true })
        }
        fs.writeFileSync(fullPath, content, 'utf-8')
        const relPath = path.relative(sandboxDir, fullPath)
        return {
          success: true,
          output: `Successfully written ${Buffer.byteLength(content, 'utf-8')} bytes to ${relPath}`,
          filePath: relPath,
          fileTitle: path.basename(relPath),
        }
      }

      case 'edit_file': {
        const filePath = String(
          params.path || params.filepath || params.file_path || params.filename || params.file || params.name || params.target || ''
        ).trim()
        if (!filePath) {
          return { success: false, output: 'Error: Path parameter is required for edit_file tool.' }
        }

        const target = String(
          params.target ||
          params.targetContent ||
          params.oldText ||
          params.old_text ||
          params.oldContent ||
          params.search ||
          params.find ||
          ''
        )
        const replacement = String(
          params.replacement ||
          params.replacementContent ||
          params.newText ||
          params.new_text ||
          params.newContent ||
          params.replace ||
          ''
        )
        const replaceAll = Boolean(params.replaceAll || params.all || params.global)

        const fullPath = resolveSandboxPath(userEmail, chatId, filePath)

        if (!fs.existsSync(fullPath)) {
          return { success: false, output: `Error: File not found: ${filePath}` }
        }
        const stat = fs.statSync(fullPath)
        if (stat.isDirectory()) {
          return { success: false, output: `Error: '${filePath}' is a directory, not a file.` }
        }

        let content = fs.readFileSync(fullPath, 'utf-8')

        if (!target) {
          fs.writeFileSync(fullPath, replacement, 'utf-8')
          const relPath = path.relative(sandboxDir, fullPath)
          return {
            success: true,
            output: `Successfully updated entire content of ${relPath} (${replacement.length} bytes)`,
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
            const relPath = path.relative(sandboxDir, fullPath)
            return {
              success: true,
              output: `Successfully updated ${relPath} (Replaced ${replaceAll ? count : 1} occurrence(s) using trimmed snippet match)`,
              filePath: relPath,
              fileTitle: path.basename(relPath),
            }
          }

          const lines = content.split('\n')
          const snippetPreview = lines.slice(0, 10).map((l, idx) => `${idx + 1}: ${l}`).join('\n')
          return {
            success: false,
            output: `Error: Target snippet not found in ${filePath}.\nTarget searched:\n\`\`\`\n${target.slice(0, 300)}\n\`\`\`\n\nFile preview (${lines.length} lines total):\n\`\`\`\n${snippetPreview}\n\`\`\`\n\nPlease verify the exact text to replace or read the file first.`,
          }
        }

        const count = content.split(target).length - 1
        content = replaceAll ? content.replaceAll(target, replacement) : content.replace(target, replacement)
        fs.writeFileSync(fullPath, content, 'utf-8')

        const relPath = path.relative(sandboxDir, fullPath)
        return {
          success: true,
          output: `Successfully edited ${relPath} (Replaced ${replaceAll ? `${count} occurrence(s)` : '1 occurrence'}).`,
          filePath: relPath,
          fileTitle: path.basename(relPath),
        }
      }

      case 'list_dir': {
        const dirPath = String(params.path || params.dir || '.')
        const fullPath = resolveSandboxPath(userEmail, chatId, dirPath)
        if (!fs.existsSync(fullPath)) {
          return { success: false, output: `Directory not found: ${dirPath}` }
        }
        const items = fs.readdirSync(fullPath, { withFileTypes: true })
        const list = items.map((i) => `${i.isDirectory() ? '[DIR]' : '[FILE]'} ${i.name}`).join('\n')
        return { success: true, output: list || '(empty directory)' }
      }

      case 'delete_file': {
        const filePath = String(params.path || params.filename || params.file || '')
        const fullPath = resolveSandboxPath(userEmail, chatId, filePath)
        if (fs.existsSync(fullPath)) {
          fs.rmSync(fullPath, { recursive: true, force: true })
          return { success: true, output: `Deleted ${filePath}` }
        }
        return { success: false, output: `File not found: ${filePath}` }
      }

      case 'run_python': {
        // Accept the code under many different parameter names
        let code = pickParam(params, [
          'code', 'script', 'python', 'content', 'source', 'source_code', 'sourceCode',
          'python_code', 'pythonCode', 'script_content', 'program', 'input', 'text', 'command',
        ])
        code = stripCodeFences(code)

        // Guard: an empty script "runs successfully" and produces nothing, which is very confusing
        if (!code.trim()) {
          return {
            success: false,
            output: `Error: run_python received no code. Parameter keys received: [${Object.keys(params).join(', ')}]. Send the Python source in the "code" parameter.`,
            error: 'Empty code',
          }
        }

        // Redirect absolute paths LLMs like to use (/mnt/data, /tmp, ...) into the sandbox.
        // Handles both "/tmp/file.csv" and a bare "/tmp".
        code = code.replace(
          /(['"])\/(?:mnt\/user-data\/outputs|mnt\/user-data|mnt\/data|var\/tmp|tmp|root|workspace|home\/claude)(?=[\/'"])/gi,
          '$1.'
        )

        const tempFile = path.join(sandboxDir, `_temp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.py`)
        fs.writeFileSync(tempFile, code, 'utf-8')

        const pyBin = getPythonBin()
        return runScript({
          command: `"${pyBin}" "${tempFile}"`,
          tempFile,
          sandboxDir,
          label: 'Python',
          env: { ...process.env, PYTHONUNBUFFERED: '1', PYTHONIOENCODING: 'utf-8', MPLBACKEND: 'Agg' },
          missingModuleHelp: (output) => {
            const missingMod = output.match(/ModuleNotFoundError:\s*No module named ['"]([^'"]+)['"]/i)?.[1]
            if (!missingMod) return ''
            const pkg = missingMod.split('.')[0]
            return `\n\n💡 **Action Required:** Missing Python package '${pkg}'. Use execute_command tool: {"command": "\\"${pyBin}\\" -m pip install ${pkg}"} to install it into the same Python that runs your scripts.`
          },
        })
      }

      case 'run_node': {
        const code = stripCodeFences(pickParam(params, ['code', 'script', 'source', 'content', 'javascript', 'js', 'input']))

        if (!code.trim()) {
          return {
            success: false,
            output: `Error: run_node received no code. Parameter keys received: [${Object.keys(params).join(', ')}]. Send the JavaScript source in the "code" parameter.`,
            error: 'Empty code',
          }
        }

        const tempFile = path.join(sandboxDir, `_temp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.js`)
        fs.writeFileSync(tempFile, code, 'utf-8')

        return runScript({
          command: `node "${tempFile}"`,
          tempFile,
          sandboxDir,
          label: 'Node.js',
          env: { ...process.env, NODE_ENV: 'development' },
          missingModuleHelp: (output) => {
            const missingMod = output.match(/Cannot find module ['"]([^'"]+)['"]/i)?.[1]
            return missingMod
              ? `\n\n💡 **Action Required:** Missing Node.js package '${missingMod}'. Use execute_command tool: {"command": "npm install ${missingMod}"} to install it.`
              : ''
          },
        })
      }

      case 'execute_command':
      case 'run_shell': {
        const command = String(params.command || params.cmd || '').trim()
        if (!command) {
          return { success: false, output: 'Error: command parameter is required.', error: 'Empty command' }
        }

        const { assessToolSafety } = require('./safety')
        const safety = assessToolSafety(toolName, params)
        if (safety.blocked) {
          return {
            success: false,
            output: `Security Violation: Elevating privileges with 'sudo' or root commands is strictly forbidden in the sandbox.`,
            error: `Security Violation: Command blocked (sudo/root forbidden).`,
          }
        }

        const beforeFiles = snapshotSandboxFiles(sandboxDir)

        return new Promise((resolve) => {
          exec(
            command,
            { cwd: sandboxDir, timeout: COMMAND_TIMEOUT_MS, maxBuffer: MAX_BUFFER_BYTES },
            (err, stdout, stderr) => {
              const createdFiles = detectNewOrModifiedFiles(sandboxDir, beforeFiles)
              const combined = [stdout, stderr].filter(Boolean).join('\n').trim()

              if (err) {
                const e = err as any
                let reason = ''
                if (e.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER') {
                  reason = '\n\n📦 Output exceeded the buffer limit and was cut off.'
                } else if (e.killed) {
                  reason = `\n\n⏱️ Command was killed after hitting the ${Math.round(COMMAND_TIMEOUT_MS / 1000)}s time limit.`
                }
                resolve({
                  success: false,
                  output: clipOutput(
                    combined ? `❌ Command Failed:\n${combined}${reason}` : `❌ Command Error: ${err.message}${reason}`
                  ),
                  error: err.message,
                })
              } else {
                resolve({
                  success: true,
                  output: clipOutput((combined || 'Command executed successfully.') + filesSection(createdFiles)),
                  filePath: createdFiles[0] || undefined,
                  fileTitle: createdFiles[0] ? path.basename(createdFiles[0]) : undefined,
                })
              }
            }
          )
        })
      }

      default:
        return { success: false, output: `Unknown tool: ${toolName}` }
    }
  } catch (err: any) {
    const message = err?.message || 'Execution error'
    return { success: false, output: `Execution error: ${message}`, error: message }
  }
}
