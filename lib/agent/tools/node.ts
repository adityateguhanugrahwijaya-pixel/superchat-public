import fs from 'node:fs'
import path from 'node:path'
import { ToolDefinition, ToolContext, ToolResult } from './types'
import { LocalDriver } from '../../sandbox/local-driver'
import { snapshotSandboxFiles, detectNewOrModifiedFiles, stripCodeFences, clipOutput, filesSection } from './helpers'

const driver = new LocalDriver()

export const nodeTool: ToolDefinition = {
  name: 'run_node',
  description: 'Executes Node.js (JavaScript) code in the isolated sandbox workspace.',
  parameters: {
    type: 'object',
    properties: {
      code: {
        type: 'string',
        description: 'The JavaScript code to execute using Node.js.',
      },
    },
    required: ['code'],
  },
  execute: async (context: ToolContext, args: { code: string }): Promise<ToolResult> => {
    const { userEmail, chatId, sessionDir, signal } = context
    const code = stripCodeFences(String(args.code || '').trim())

    if (!code) {
      return {
        success: false,
        output: 'Error: run_node received empty code. Provide JavaScript code in the "code" parameter.',
        error: 'Empty code',
      }
    }

    const beforeFiles = snapshotSandboxFiles(sessionDir)
    const tempFile = path.join(sessionDir, `_temp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.js`)
    fs.writeFileSync(tempFile, code, 'utf-8')

    const sessionId = `${userEmail}/${chatId}`
    const cmd = `node "${path.basename(tempFile)}"`

    try {
      const execRes = await driver.exec(sessionId, cmd, { signal })
      const createdFiles = detectNewOrModifiedFiles(sessionDir, beforeFiles)
      const combined = [execRes.stdout, execRes.stderr].filter(Boolean).join('\n').trim()

      if (execRes.timedOut) {
        return {
          success: false,
          output: clipOutput(`⏱️ Node.js script timed out after hitting the execution time limit.\n${combined}`),
          error: 'Execution timed out',
        }
      }

      if (execRes.exitCode !== 0) {
        const missingMod = combined.match(/Cannot find module ['"]([^'"]+)['"]/i)?.[1]
        const help = missingMod
          ? `\n\n💡 **Action Required:** Missing Node.js module '${missingMod}'. Use execute_command tool: {"command": "npm install ${missingMod}"} to install it.`
          : ''

        return {
          success: false,
          output: clipOutput(`❌ Node.js Script Failed:\n${combined || `Script exited with code ${execRes.exitCode}`}${help}`),
          error: combined || 'Node.js script failed',
          filePath: createdFiles[0] || undefined,
          fileTitle: createdFiles[0] ? path.basename(createdFiles[0]) : undefined,
        }
      }

      let outMsg = combined || 'Node.js script ran successfully but printed nothing.'
      outMsg += filesSection(createdFiles)
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
