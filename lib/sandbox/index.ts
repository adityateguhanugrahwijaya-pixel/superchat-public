import fs from 'node:fs'
import path from 'node:path'

/**
 * Root folder that holds every sandbox.
 * Default: <project>/sandbox
 * Optional: set SANDBOX_ROOT in .env.local to keep it OUTSIDE the project folder.
 * (Recommended with `npm run dev`, so files the agent writes can't trigger
 * the dev server's file watcher and restart a request mid-run.)
 */
function getSandboxRoot(): string {
  const custom = process.env.SANDBOX_ROOT?.trim()
  return custom ? path.resolve(custom) : path.join(process.cwd(), 'sandbox')
}

/**
 * Returns the absolute path for a conversation's sandbox directory.
 * Path: {sandboxRoot}/{userEmail}/{conversationId}
 */
export function getSandboxDir(userEmail: string, conversationId: string): string {
  const safeEmail = (userEmail || 'anonymous').trim().toLowerCase().replace(/[^a-z0-9@._-]/gi, '_')
  const safeId = (conversationId || 'default').trim().replace(/[^a-z0-9_-]/gi, '_')
  const dir = path.join(getSandboxRoot(), safeEmail, safeId)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  return dir
}

// Absolute prefixes LLMs like to use. They are mapped into the sandbox root.
const LLM_PATH_PREFIX =
  /^(?:\/mnt\/user-data\/outputs\/|\/mnt\/user-data\/|\/mnt\/data\/|\/var\/tmp\/|\/tmp\/|\/root\/|\/workspace\/|\/home\/claude\/|[a-zA-Z]:[\\\/])/i

/**
 * Sanitizes and resolves a target file path within the specified sandbox directory.
 * Throws an error if the resolved path escapes the sandbox directory (Path Traversal Protection).
 *
 * allowFallback (default true): if the exact path doesn't exist but a file with the same
 * name exists in the sandbox root, return that one. This is handy for READING, but must be
 * turned off (false) for writes and deletes, otherwise writing "reports/out.csv" could
 * silently overwrite an existing "out.csv" in the root.
 */
export function resolveSandboxPath(
  userEmail: string,
  conversationId: string,
  targetPath: string,
  allowFallback: boolean = true
): string {
  const sandboxDir = getSandboxDir(userEmail, conversationId)
  let cleanPath = (targetPath || '').trim()

  cleanPath = cleanPath.replace(LLM_PATH_PREFIX, '')
  cleanPath = cleanPath.replace(/^[\/\\]+/, '')

  const normalizedTarget = path.normalize(cleanPath || '.')
  const resolvedPath = path.resolve(sandboxDir, normalizedTarget)

  // Containment check. A plain startsWith(sandboxDir) is not safe: ".../chat1" is a
  // string prefix of ".../chat10", which would let one chat reach into another.
  const rel = path.relative(sandboxDir, resolvedPath)
  if (rel === '..' || rel.startsWith('..' + path.sep) || path.isAbsolute(rel)) {
    throw new Error(`Security Violation: Access denied outside sandbox boundary (${targetPath})`)
  }

  if (allowFallback && !fs.existsSync(resolvedPath)) {
    const filename = path.basename(cleanPath)
    if (filename) {
      const fallbackPath = path.join(sandboxDir, filename)
      if (fs.existsSync(fallbackPath)) {
        return fallbackPath
      }
    }
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

/**
 * Checks whether Sandbox is active for a specific user ID.
 * If global appconfig.json / env disables sandbox, returns false immediately.
 * Otherwise, returns the user's sandbox_enabled setting from user_settings (defaults to true/1).
 */
export function isUserSandboxEnabled(userId: string): boolean {
  if (!isSandboxEnabled()) {
    return false
  }

  try {
    const { db } = require('@/lib/db')
    const row = db
      .prepare('SELECT sandbox_enabled as sandboxEnabled FROM user_settings WHERE user_id = ?')
      .get(userId) as { sandboxEnabled?: number } | undefined

    if (row && row.sandboxEnabled === 0) {
      return false
    }
  } catch {
    // Default to enabled if column or database query fails
  }

  return true
}
