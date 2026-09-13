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

function snapshotSandboxFiles(sandboxDir: string): Map<string, number> {
  const fileMap = new Map<string, number>()
  try {
    const listFiles = (dir: string) => {
      const items = fs.readdirSync(dir, { withFileTypes: true })
      for (const item of items) {
        if (item.name.startsWith('_temp_')) continue
        const full = path.join(dir, item.name)
        if (item.isDirectory()) {
          listFiles(full)
        } else if (item.isFile()) {
          const rel = path.relative(sandboxDir, full)
          try {
            fileMap.set(rel, fs.statSync(full).mtimeMs)
          } catch {}
        }
      }
    }
    listFiles(sandboxDir)
  } catch {}
  return fileMap
}

function detectNewOrModifiedFiles(sandboxDir: string, beforeMap: Map<string, number>): string[] {
  const result: string[] = []
  try {
    const listFiles = (dir: string) => {
      const items = fs.readdirSync(dir, { withFileTypes: true })
      for (const item of items) {
        if (item.name.startsWith('_temp_')) continue
        const full = path.join(dir, item.name)
        if (item.isDirectory()) {
          listFiles(full)
        } else if (item.isFile()) {
          const rel = path.relative(sandboxDir, full)
          try {
            const mtime = fs.statSync(full).mtimeMs
            if (!beforeMap.has(rel) || beforeMap.get(rel) !== mtime) {
              result.push(rel)
            }
          } catch {}
        }
      }
    }
    listFiles(sandboxDir)
  } catch {}
  return result
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
          output: `Successfully written ${content.length} bytes to ${relPath}`,
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
        let code = String(params.code || params.script || params.python || params.content || '')

        // Intercept hardcoded absolute paths commonly used by LLMs (e.g. /mnt/data/ -> ./)
        code = code
          .replace(/(['"])(\/mnt\/data\/|\/tmp\/|\/var\/tmp\/|\/root\/)/gi, '$1./')
          .replace(/(open\s*\(\s*['"])\/mnt\/data\//gi, '$1./')
          .replace(/(open\s*\(\s*['"])\/tmp\//gi, '$1./')

        const tempFile = path.join(sandboxDir, `_temp_${Date.now()}.py`)
        fs.writeFileSync(tempFile, code, 'utf-8')

        const beforeFiles = snapshotSandboxFiles(sandboxDir)

        return new Promise((resolve) => {
          const pyCmd = process.platform === 'win32' ? `python "${tempFile}"` : `python3 "${tempFile}"`
          exec(
            pyCmd,
            {
              cwd: sandboxDir,
              timeout: 45000,
              env: { ...process.env, PYTHONUNBUFFERED: '1', PYTHONIOENCODING: 'utf-8' },
            },
            (err, stdout, stderr) => {
              try { fs.unlinkSync(tempFile) } catch {}

              const createdFiles = detectNewOrModifiedFiles(sandboxDir, beforeFiles)
              const combinedOutput = [stdout, stderr].filter(Boolean).join('\n').trim()

              // Detect errors even if exit code was 0
              const hasPythonError =
                Boolean(err) ||
                /Traceback \(most recent call last\):/i.test(combinedOutput) ||
                /ModuleNotFoundError:/i.test(combinedOutput) ||
                /ImportError:/i.test(combinedOutput) ||
                /SyntaxError:/i.test(combinedOutput) ||
                /NameError:/i.test(combinedOutput) ||
                /TypeError:/i.test(combinedOutput) ||
                /AttributeError:/i.test(combinedOutput) ||
                /FileNotFoundError:/i.test(combinedOutput) ||
                /Failed to (?:save|create|generate|write)/i.test(combinedOutput)

              if (hasPythonError) {
                const errorText = stderr || stdout || err?.message || 'Python execution failed'
                let errHelp = ''
                if (/ModuleNotFoundError:\s*No module named ['"]([^'"]+)['"]/i.test(combinedOutput)) {
                  const missingMod = combinedOutput.match(/ModuleNotFoundError:\s*No module named ['"]([^'"]+)['"]/i)?.[1]
                  if (missingMod) {
                    errHelp = `\n\n💡 **Action Required:** Missing Python package '${missingMod}'. Use execute_command tool: {"command": "pip install ${missingMod}"} to install it.`
                  }
                }
                resolve({
                  success: false,
                  output: `❌ Python Script Failed:\n${combinedOutput || 'Script exited with error'}${errHelp}`,
                  error: errorText,
                })
              } else {
                let outMsg = combinedOutput || 'Python script executed successfully.'
                if (createdFiles.length > 0) {
                  outMsg += `\n\n📁 **Workspace Files Created/Updated:**\n` + createdFiles.map((f) => `- ${f}`).join('\n')
                } else {
                  outMsg += `\n\n⚠️ **Notice:** No new output files were created in the workspace. If you intended to generate a file (e.g. PDF/CSV/PNG), ensure your script opens and writes to disk (e.g. \`with open('filename.ext', 'wb') as f: ...\`).`
                }
                resolve({
                  success: true,
                  output: outMsg,
                  filePath: createdFiles[0] || undefined,
                  fileTitle: createdFiles[0] ? path.basename(createdFiles[0]) : undefined,
                })
              }
            }
          )
        })
      }

      case 'run_node': {
        const code = String(params.code || params.script || '')
        const tempFile = path.join(sandboxDir, `_temp_${Date.now()}.js`)
        fs.writeFileSync(tempFile, code, 'utf-8')

        const beforeFiles = snapshotSandboxFiles(sandboxDir)

        return new Promise((resolve) => {
          exec(
            `node "${tempFile}"`,
            {
              cwd: sandboxDir,
              timeout: 45000,
              env: { ...process.env, NODE_ENV: 'development' },
            },
            (err, stdout, stderr) => {
              try { fs.unlinkSync(tempFile) } catch {}

              const createdFiles = detectNewOrModifiedFiles(sandboxDir, beforeFiles)
              const combinedOutput = [stdout, stderr].filter(Boolean).join('\n').trim()

              const hasNodeError =
                Boolean(err) ||
                /Error:\s*Cannot find module/i.test(combinedOutput) ||
                /SyntaxError:/i.test(combinedOutput) ||
                /ReferenceError:/i.test(combinedOutput) ||
                /TypeError:/i.test(combinedOutput)

              if (hasNodeError) {
                const errorText = stderr || stdout || err?.message || 'Node.js execution error'
                let errHelp = ''
                if (/Cannot find module ['"]([^'"]+)['"]/i.test(combinedOutput)) {
                  const missingMod = combinedOutput.match(/Cannot find module ['"]([^'"]+)['"]/i)?.[1]
                  if (missingMod) {
                    errHelp = `\n\n💡 **Action Required:** Missing Node.js package '${missingMod}'. Use execute_command tool: {"command": "npm install ${missingMod}"} to install it.`
                  }
                }
                resolve({
                  success: false,
                  output: `❌ Node.js Script Failed:\n${combinedOutput || 'Script exited with error'}${errHelp}`,
                  error: errorText,
                })
              } else {
                let outMsg = combinedOutput || 'Node.js script executed successfully.'
                if (createdFiles.length > 0) {
                  outMsg += `\n\n📁 **Workspace Files Created/Updated:**\n` + createdFiles.map((f) => `- ${f}`).join('\n')
                } else {
                  outMsg += `\n\n⚠️ **Notice:** No new output files were created in the workspace. If you intended to generate a file, ensure your script writes to disk.`
                }
                resolve({
                  success: true,
                  output: outMsg,
                  filePath: createdFiles[0] || undefined,
                  fileTitle: createdFiles[0] ? path.basename(createdFiles[0]) : undefined,
                })
              }
            }
          )
        })
      }

      case 'execute_command':
      case 'run_shell': {
        const command = String(params.command || params.cmd || '').trim()
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
          exec(command, { cwd: sandboxDir, timeout: 60000 }, (err, stdout, stderr) => {
            const createdFiles = detectNewOrModifiedFiles(sandboxDir, beforeFiles)
            const combined = `${stdout}\n${stderr}`.trim()

            if (err) {
              resolve({
                success: false,
                output: combined ? `❌ Command Failed:\n${combined}` : `❌ Command Error: ${err.message}`,
                error: err.message,
              })
            } else {
              let outMsg = combined || 'Command executed successfully.'
              if (createdFiles.length > 0) {
                outMsg += `\n\n📁 **Workspace Files Created/Updated:**\n` + createdFiles.map((f) => `- ${f}`).join('\n')
              }
              resolve({
                success: true,
                output: outMsg,
                filePath: createdFiles[0] || undefined,
                fileTitle: createdFiles[0] ? path.basename(createdFiles[0]) : undefined,
              })
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
