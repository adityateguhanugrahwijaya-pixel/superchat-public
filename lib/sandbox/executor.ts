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
    switch (toolName) {
      case 'read_file': {
        const filePath = String(params.path || params.filename || '')
        const fullPath = resolveSandboxPath(userEmail, chatId, filePath)
        if (!fs.existsSync(fullPath)) {
          return { success: false, output: `File not found: ${filePath}` }
        }
        const content = fs.readFileSync(fullPath, 'utf-8')
        return { success: true, output: content, filePath, fileTitle: path.basename(filePath) }
      }

      case 'write_file': {
        const filePath = String(params.path || params.filename || '')
        const content = String(params.content || '')
        const fullPath = resolveSandboxPath(userEmail, chatId, filePath)
        const parentDir = path.dirname(fullPath)
        if (!fs.existsSync(parentDir)) {
          fs.mkdirSync(parentDir, { recursive: true })
        }
        fs.writeFileSync(fullPath, content, 'utf-8')
        const relPath = path.relative(sandboxDir, fullPath)
        return {
          success: true,
          output: `Successfully written ${content.length} bytes to ${relPath}`,
          filePath: relPath,
          fileTitle: path.basename(relPath),
        }
      }

      case 'edit_file': {
        const filePath = String(params.path || params.filename || '')
        const target = String(params.target || params.targetContent || '')
        const replacement = String(params.replacement || params.replacementContent || '')
        const fullPath = resolveSandboxPath(userEmail, chatId, filePath)

        if (!fs.existsSync(fullPath)) {
          return { success: false, output: `File not found: ${filePath}` }
        }
        let content = fs.readFileSync(fullPath, 'utf-8')
        if (target && !content.includes(target)) {
          return { success: false, output: `Target content snippet not found in ${filePath}` }
        }
        content = target ? content.replace(target, replacement) : replacement
        fs.writeFileSync(fullPath, content, 'utf-8')
        const relPath = path.relative(sandboxDir, fullPath)
        return {
          success: true,
          output: `Successfully updated ${relPath}`,
          filePath: relPath,
          fileTitle: path.basename(relPath),
        }
      }

      case 'list_dir': {
        const dirPath = String(params.path || '.')
        const fullPath = resolveSandboxPath(userEmail, chatId, dirPath)
        if (!fs.existsSync(fullPath)) {
          return { success: false, output: `Directory not found: ${dirPath}` }
        }
        const items = fs.readdirSync(fullPath, { withFileTypes: true })
        const list = items.map((i) => `${i.isDirectory() ? '[DIR]' : '[FILE]'} ${i.name}`).join('\n')
        return { success: true, output: list || '(empty directory)' }
      }

      case 'delete_file': {
        const filePath = String(params.path || params.filename || '')
        const fullPath = resolveSandboxPath(userEmail, chatId, filePath)
        if (fs.existsSync(fullPath)) {
          fs.rmSync(fullPath, { recursive: true, force: true })
          return { success: true, output: `Deleted ${filePath}` }
        }
        return { success: false, output: `File not found: ${filePath}` }
      }

      case 'run_python': {
        const code = String(params.code || params.script || '')
        const tempFile = path.join(sandboxDir, `_temp_${Date.now()}.py`)
        fs.writeFileSync(tempFile, code, 'utf-8')
        return new Promise((resolve) => {
          exec(`python3 "${tempFile}" || python "${tempFile}"`, { cwd: sandboxDir, timeout: 30000 }, (err, stdout, stderr) => {
            try { fs.unlinkSync(tempFile) } catch {}
            if (err) {
              resolve({ success: false, output: stdout || '', error: stderr || err.message })
            } else {
              resolve({ success: true, output: stdout || stderr || 'Python script executed successfully with no output.' })
            }
          })
        })
      }

      case 'run_node': {
        const code = String(params.code || params.script || '')
        const tempFile = path.join(sandboxDir, `_temp_${Date.now()}.js`)
        fs.writeFileSync(tempFile, code, 'utf-8')
        return new Promise((resolve) => {
          exec(`node "${tempFile}"`, { cwd: sandboxDir, timeout: 30000 }, (err, stdout, stderr) => {
            try { fs.unlinkSync(tempFile) } catch {}
            if (err) {
              resolve({ success: false, output: stdout || '', error: stderr || err.message })
            } else {
              resolve({ success: true, output: stdout || stderr || 'Node.js script executed successfully with no output.' })
            }
          })
        })
      }

      case 'execute_command':
      case 'run_shell': {
        const command = String(params.command || params.cmd || '')
        return new Promise((resolve) => {
          exec(command, { cwd: sandboxDir, timeout: 60000 }, (err, stdout, stderr) => {
            const combined = `${stdout}\n${stderr}`.trim()
            if (err) {
              resolve({ success: false, output: combined, error: err.message })
            } else {
              resolve({ success: true, output: combined || 'Command executed successfully.' })
            }
          })
        })
      }

      default:
        return { success: false, output: `Unknown tool: ${toolName}` }
    }
  } catch (err: any) {
    return { success: false, output: '', error: err.message || 'Execution error' }
  }
}
