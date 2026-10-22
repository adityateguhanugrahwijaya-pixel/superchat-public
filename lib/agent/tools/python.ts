import fs from 'node:fs'
import path from 'node:path'
import { ToolDefinition, ToolContext, ToolResult } from './types'
import { LocalDriver } from '../../sandbox/local-driver'
import { detectPython } from '../../sandbox/runtime'
import { snapshotSandboxFiles, detectNewOrModifiedFiles, stripCodeFences, clipOutput, filesSection } from './helpers'

const driver = new LocalDriver()

export const pythonTool: ToolDefinition = {
  name: 'run_python',
  description:
    'Executes Python 3 code in the isolated sandbox workspace. Supports installed packages (pandas, openpyxl, reportlab, etc.). Always saves output files with relative paths.',
  parameters: {
    type: 'object',
    properties: {
      code: {
        type: 'string',
        description: 'The Python 3 code to execute in the workspace.',
      },
    },
    required: ['code'],
  },
  execute: async (context: ToolContext, args: { code: string }): Promise<ToolResult> => {
    const { userEmail, chatId, sessionDir, signal } = context
    let code = stripCodeFences(String(args.code || '').trim())

    if (!code) {
      return {
        success: false,
        output: 'Error: run_python received empty code. Provide python code in the "code" parameter.',
        error: 'Empty code',
      }
    }

    const py = detectPython()
    if (!py.found) {
      return {
        success: false,
        output: py.message || 'Python 3 is not available on host system.',
        error: 'Python not available',
      }
    }

    // Remap virtual paths that models often hallucinate
    code = code.replace(
      /(['"])\/(?:mnt\/user-data\/outputs|mnt\/user-data|mnt\/data|var\/tmp|tmp|root|workspace|home\/claude)(?=[\/'"])/gi,
      '$1.'
    )

    const beforeFiles = snapshotSandboxFiles(sessionDir)
    const tempFile = path.join(sessionDir, `_temp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.py`)
    fs.writeFileSync(tempFile, code, 'utf-8')

    const sessionId = `${userEmail}/${chatId}`
    const cmd = `${py.commandLine} "${path.basename(tempFile)}"`

    try {
      const execRes = await driver.exec(sessionId, cmd, { signal })
      const createdFiles = detectNewOrModifiedFiles(sessionDir, beforeFiles)
      const combined = [execRes.stdout, execRes.stderr].filter(Boolean).join('\n').trim()

      if (execRes.timedOut) {
        return {
          success: false,
          output: clipOutput(`⏱️ Python script timed out after hitting the execution time limit.\n${combined}`),
          error: 'Execution timed out',
        }
      }

      if (execRes.exitCode !== 0) {
        const missingMod = combined.match(/ModuleNotFoundError:\s*No module named ['"]([^'"]+)['"]/i)?.[1]
        const help = missingMod
          ? `\n\n💡 **Action Required:** Missing Python package '${missingMod.split('.')[0]}'. Use execute_command tool: {"command": "${py.commandLine.replace(/"/g, '\\"')} -m pip install ${missingMod.split('.')[0]}"} to install it.`
          : ''

        return {
          success: false,
          output: clipOutput(`❌ Python Script Failed:\n${combined || `Script exited with code ${execRes.exitCode}`}${help}`),
          error: combined || 'Python script failed',
          filePath: createdFiles[0] || undefined,
          fileTitle: createdFiles[0] ? path.basename(createdFiles[0]) : undefined,
        }
      }

      let outMsg = combined || 'Python script ran successfully but printed nothing.'
      outMsg += filesSection(createdFiles)
      if (createdFiles.length === 0) {
        outMsg += `\n\n⚠️ **Notice:** No new or changed files in the workspace. If you expected a file, make sure the script writes it using a relative path.`
      }

      const firstCreated = createdFiles[0] || undefined
      return {
        success: true,
        output: clipOutput(outMsg),
        filePath: firstCreated,
        fileTitle: firstCreated ? path.basename(firstCreated) : undefined,
      }
    } finally {
      try {
        if (fs.existsSync(tempFile)) {
          fs.unlinkSync(tempFile)
        }
      } catch {}
    }
  },
}
