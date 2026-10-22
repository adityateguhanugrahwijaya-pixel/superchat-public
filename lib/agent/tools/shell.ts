import path from 'node:path'
import { ToolDefinition, ToolContext, ToolResult } from './types'
import { LocalDriver } from '../../sandbox/local-driver'
import { assessToolSafety } from '../../sandbox/safety'
import { snapshotSandboxFiles, detectNewOrModifiedFiles, clipOutput, filesSection } from './helpers'

const driver = new LocalDriver()

export const shellTool: ToolDefinition = {
  name: 'execute_command',
  aliases: ['run_shell', 'bash'],
  description:
    'Executes a shell command in the sandbox workspace directory. Use this to install packages, run scripts, compile code, or inspect files.',
  parameters: {
    type: 'object',
    properties: {
      command: {
        type: 'string',
        description: 'The shell command line to execute (e.g. "pip install reportlab" or "ls -la").',
      },
    },
    required: ['command'],
  },
  execute: async (context: ToolContext, args: { command: string }): Promise<ToolResult> => {
    const { userEmail, chatId, sessionDir, signal } = context
    const command = String(args.command || '').trim()

    if (!command) {
      return { success: false, output: 'Error: command parameter cannot be empty.', error: 'Empty command' }
    }

    // Safety check
    const safety = assessToolSafety('execute_command', { command })
    if (safety.blocked) {
      return {
        success: false,
        output: safety.reason || 'Security Violation: Command blocked by sandbox safety rules.',
        error: safety.reason || 'Security Violation: Command blocked.',
      }
    }

    const beforeFiles = snapshotSandboxFiles(sessionDir)
    const sessionId = `${userEmail}/${chatId}`

    const execRes = await driver.exec(sessionId, command, { signal })

    const createdFiles = detectNewOrModifiedFiles(sessionDir, beforeFiles)
    const combined = [execRes.stdout, execRes.stderr].filter(Boolean).join('\n').trim()

    if (execRes.timedOut) {
      return {
        success: false,
        output: clipOutput(
          `⏱️ Command timed out after hitting the execution time limit.\n${combined}`
        ),
        error: 'Execution timed out',
      }
    }

    if (execRes.exitCode !== 0) {
      const errDetail = combined || `Command exited with code ${execRes.exitCode}`
      return {
        success: false,
        output: clipOutput(`❌ Command Failed (exit code ${execRes.exitCode}):\n${errDetail}`),
        error: errDetail,
      }
    }

    const firstCreated = createdFiles[0] || undefined
    const outMsg = (combined || 'Command executed successfully.') + filesSection(createdFiles)

    return {
      success: true,
      output: clipOutput(outMsg),
      filePath: firstCreated,
      fileTitle: firstCreated ? path.basename(firstCreated) : undefined,
    }
  },
}
