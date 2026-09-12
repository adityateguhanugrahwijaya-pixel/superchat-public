import fs from 'node:fs'
import path from 'node:path'

/**
 * Returns the absolute path for a conversation's sandbox directory.
 * Path: sandbox/{userEmail}/{conversationId}
 */
export function getSandboxDir(userEmail: string, conversationId: string): string {
  const safeEmail = (userEmail || 'anonymous').trim().toLowerCase().replace(/[^a-z0-9@._-]/gi, '_')
  const safeId = (conversationId || 'default').trim().replace(/[^a-z0-9_-]/gi, '_')
  const dir = path.join(process.cwd(), 'sandbox', safeEmail, safeId)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  return dir
}

/**
 * Sanitizes and resolves a target file path within the specified sandbox directory.
 * Throws an error if the resolved path escapes the sandbox directory (Path Traversal Protection).
 */
export function resolveSandboxPath(userEmail: string, conversationId: string, targetPath: string): string {
  const sandboxDir = getSandboxDir(userEmail, conversationId)
  const normalizedTarget = path.normalize(targetPath.trim().replace(/^[\/\\]+/, ''))
  const resolvedPath = path.resolve(sandboxDir, normalizedTarget)

  if (!resolvedPath.startsWith(sandboxDir)) {
    throw new Error(`Security Violation: Access denied outside sandbox boundary (${targetPath})`)
  }
  return resolvedPath
}

/**
 * Returns relative path from sandbox root.
 */
export function getRelativeSandboxPath(userEmail: string, conversationId: string, fullPath: string): string {
  const sandboxDir = getSandboxDir(userEmail, conversationId)
  return path.relative(sandboxDir, fullPath)
}

/**
 * Checks whether the Sandbox system is enabled in appconfig.json or environment variables.
 * Defaults to true if unspecified.
 */
export function isSandboxEnabled(): boolean {
  if (process.env.SANDBOX_ENABLED !== undefined) {
    const val = process.env.SANDBOX_ENABLED.trim().toLowerCase()
    return val === 'true' || val === '1'
  }

  const configPath = path.join(process.cwd(), 'appconfig.json')
  if (fs.existsSync(configPath)) {
    try {
      const fileContent = JSON.parse(fs.readFileSync(configPath, 'utf8'))
      if (typeof fileContent.sandboxEnabled === 'boolean') {
        return fileContent.sandboxEnabled
      }
      if (typeof fileContent.sandbox?.enabled === 'boolean') {
        return fileContent.sandbox.enabled
      }
    } catch {
      // Ignore parse error
    }
  }

  return true
}
