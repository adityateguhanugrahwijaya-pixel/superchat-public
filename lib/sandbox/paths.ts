import fs from 'node:fs'
import path from 'node:path'

const EMAIL_REGEX = /^[A-Za-z0-9._@-]+$/
const CHAT_ID_REGEX = /^[A-Za-z0-9_-]+$/

/**
 * Validates user email and conversation chatId strictly.
 * Rejects path traversal markers ('.', '..'), path separators, or invalid characters.
 */
export function validateSessionIds(userEmail: string, chatId: string): { safeEmail: string; safeChatId: string } {
  const safeEmail = (userEmail || '').trim().toLowerCase()
  const safeChatId = (chatId || '').trim()

  if (!safeEmail || safeEmail === '.' || safeEmail === '..' || !EMAIL_REGEX.test(safeEmail)) {
    throw new Error(`Security Violation: Invalid user identifier ('${userEmail}')`)
  }
  if (!safeChatId || safeChatId === '.' || safeChatId === '..' || !CHAT_ID_REGEX.test(safeChatId)) {
    throw new Error(`Security Violation: Invalid chat identifier ('${chatId}')`)
  }

  return { safeEmail, safeChatId }
}

/**
 * Root folder that holds every sandbox.
 * Default: <project>/sandbox (or custom SANDBOX_ROOT)
 */
export function getSandboxRoot(): string {
  const custom = process.env.SANDBOX_ROOT?.trim()
  return custom ? path.resolve(custom) : path.join(process.cwd(), 'sandbox')
}

/**
 * Root folder holding skills.
 */
export function getSkillsDir(): string {
  const custom = process.env.SKILLS_DIR?.trim()
  return custom ? path.resolve(custom) : path.join(process.cwd(), 'skills')
}

/**
 * Returns the absolute path for a session's sandbox directory:
 * {sandboxRoot}/{safeEmail}/{chatId}
 * Initializes standard subdirectories (uploads, outputs, .agent) if initSubdirs is true.
 */
export function getSessionDir(userEmail: string, chatId: string, initSubdirs: boolean = true): string {
  const { safeEmail, safeChatId } = validateSessionIds(userEmail, chatId)
  const root = path.join(getSandboxRoot(), safeEmail, safeChatId)

  if (fs.existsSync(root)) {
    const stat = fs.lstatSync(root)
    if (stat.isSymbolicLink()) {
      throw new Error(`Security Violation: Session root directory cannot be a symbolic link`)
    }
  } else if (initSubdirs) {
    fs.mkdirSync(root, { recursive: true })
  }

  if (initSubdirs && fs.existsSync(root)) {
    const subdirs = ['uploads', 'outputs', '.agent']
    for (const sub of subdirs) {
      const p = path.join(root, sub)
      if (!fs.existsSync(p)) {
        try {
          fs.mkdirSync(p, { recursive: true })
        } catch {}
      }
    }
  }

  return root
}

/** Legacy alias for getSessionDir */
export const getSandboxDir = getSessionDir

/**
 * Virtual path prefixes recognized for compatibility with various LLM training data.
 */
const VIRTUAL_UPLOADS = /^\/mnt\/user-data\/uploads(?:\/|$)/i
const VIRTUAL_OUTPUTS = /^\/mnt\/user-data\/outputs(?:\/|$)/i
const VIRTUAL_CLAUDE = /^\/home\/claude(?:\/|$)/i
const VIRTUAL_SKILLS = /^\/?skills(?:\/|$)/i
const LEGACY_LLM_PREFIX =
  /^(?:\/mnt\/user-data\/|\/mnt\/data\/|\/var\/tmp\/|\/tmp\/|\/root\/|\/workspace\/|[a-zA-Z]:[\\\/])/i

export type ResolveOptions = {
  forWrite?: boolean
  allowFallback?: boolean
  allowInternalAgent?: boolean
}

function isPathInside(parentReal: string, targetReal: string): boolean {
  const rel = path.relative(parentReal, targetReal)
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))
}

/**
 * Resolves an ancestor's realpath by traversing up until an existing path is found.
 */
function findExistingAncestorRealpath(targetPath: string): { existingPath: string; realpath: string } {
  let curr = targetPath
  while (curr && !fs.existsSync(curr)) {
    const parent = path.dirname(curr)
    if (parent === curr) break
    curr = parent
  }
  if (!fs.existsSync(curr)) {
    throw new Error(`Security Violation: Unable to resolve path ancestor (${targetPath})`)
  }
  return { existingPath: curr, realpath: fs.realpathSync(curr) }
}

/**
 * Sanitizes and securely resolves a target file path within the specified sandbox directory.
 * Enforces realpath ancestor check to block symlink escapes.
 */
export function resolveSandboxPath(
  userEmail: string,
  chatId: string,
  targetPath: string,
  options: ResolveOptions | boolean = true
): string {
  const opts: ResolveOptions =
    typeof options === 'boolean' ? { allowFallback: options } : options || {}
  const { forWrite = false, allowFallback = true, allowInternalAgent = false } = opts

  const sessionRoot = getSessionDir(userEmail, chatId, forWrite)
  const realSessionRoot = fs.existsSync(sessionRoot) ? fs.realpathSync(sessionRoot) : sessionRoot

  let clean = (targetPath || '').trim()

  // 1. Virtual mapping handlers
  if (VIRTUAL_SKILLS.test(clean)) {
    if (forWrite) {
      throw new Error(`Security Violation: /skills directory is read-only`)
    }
    const sub = clean.replace(VIRTUAL_SKILLS, '').replace(/^[\/\\]+/, '')
    const skillsDir = getSkillsDir()
    const resolvedSkills = path.resolve(skillsDir, path.normalize(sub || '.'))
    const realSkillsDir = fs.existsSync(skillsDir) ? fs.realpathSync(skillsDir) : skillsDir
    const { realpath: ancestorReal } = findExistingAncestorRealpath(resolvedSkills)
    if (!isPathInside(realSkillsDir, ancestorReal)) {
      throw new Error(`Security Violation: Access denied outside /skills boundary (${targetPath})`)
    }
    return resolvedSkills
  }

  let mappedRelative = ''
  if (VIRTUAL_UPLOADS.test(clean)) {
    const sub = clean.replace(VIRTUAL_UPLOADS, '').replace(/^[\/\\]+/, '')
    mappedRelative = path.join('uploads', sub)
  } else if (VIRTUAL_OUTPUTS.test(clean)) {
    const sub = clean.replace(VIRTUAL_OUTPUTS, '').replace(/^[\/\\]+/, '')
    mappedRelative = path.join('outputs', sub)
  } else if (VIRTUAL_CLAUDE.test(clean)) {
    mappedRelative = clean.replace(VIRTUAL_CLAUDE, '').replace(/^[\/\\]+/, '')
  } else {
    clean = clean.replace(LEGACY_LLM_PREFIX, '')
    // If it's still an absolute path at this point, reject it
    if (path.isAbsolute(clean)) {
      throw new Error(`Security Violation: Absolute path outside sandbox boundary is forbidden (${targetPath})`)
    }
    clean = clean.replace(/^[\/\\]+/, '')
    mappedRelative = clean || '.'
  }

  const normalized = path.normalize(mappedRelative)
  const resolved = path.resolve(sessionRoot, normalized)

  // String containment check against sessionRoot
  const relFromRoot = path.relative(sessionRoot, resolved)
  if (relFromRoot === '..' || relFromRoot.startsWith('..' + path.sep) || path.isAbsolute(relFromRoot)) {
    throw new Error(`Security Violation: Access denied outside sandbox boundary (${targetPath})`)
  }

  // Realpath ancestor verification: protects against symlinks pointing outside
  const { realpath: ancestorReal } = findExistingAncestorRealpath(resolved)
  if (!isPathInside(realSessionRoot, ancestorReal)) {
    throw new Error(`Security Violation: Symlink escape detected outside sandbox boundary (${targetPath})`)
  }

  if (fs.existsSync(resolved)) {
    const realTarget = fs.realpathSync(resolved)
    if (!isPathInside(realSessionRoot, realTarget)) {
      throw new Error(`Security Violation: Symlink target outside sandbox boundary (${targetPath})`)
    }
  }

  // 2. Proteksi folder uploads/ (read-only untuk tool penulisan)
  const uploadsDir = path.join(sessionRoot, 'uploads')
  if (forWrite && (resolved === uploadsDir || resolved.startsWith(uploadsDir + path.sep))) {
    throw new Error(`Security Violation: uploads/ folder is read-only`)
  }

  // 3. Proteksi folder .agent/ (internal agent metadata/logs)
  const agentInternalDir = path.join(sessionRoot, '.agent')
  if (!allowInternalAgent && (resolved === agentInternalDir || resolved.startsWith(agentInternalDir + path.sep))) {
    throw new Error(`Security Violation: Access to internal .agent directory is forbidden`)
  }

  // 4. Fallback jika membaca file: cek root, outputs/, uploads/
  if (allowFallback && !forWrite && !fs.existsSync(resolved)) {
    const filename = path.basename(normalized)
    if (filename && filename !== '.' && filename !== '..') {
      const candidates = [
        path.join(sessionRoot, filename),
        path.join(sessionRoot, 'outputs', filename),
        path.join(sessionRoot, 'uploads', filename),
      ]
      for (const candidate of candidates) {
        if (fs.existsSync(candidate)) {
          const { realpath: fbReal } = findExistingAncestorRealpath(candidate)
          if (isPathInside(realSessionRoot, fbReal)) {
            return candidate
          }
        }
      }
    }
  }

  return resolved
}

/**
 * Returns relative path from session root.
 */
export function getRelativeSandboxPath(userEmail: string, chatId: string, fullPath: string): string {
  const sessionDir = getSessionDir(userEmail, chatId, false)
  return path.relative(sessionDir, fullPath)
}

/**
 * Checks whether the Sandbox system is globally enabled in appconfig.json or environment variables.
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
    } catch {}
  }

  return true
}

/**
 * Checks whether Sandbox is active for a specific user ID.
 */
export function isUserSandboxEnabled(userId: string): boolean {
  if (!isSandboxEnabled()) {
    return false
  }

  try {
    const { db } = require('../db')
    const row = db
      .prepare('SELECT sandbox_enabled as sandboxEnabled FROM user_settings WHERE user_id = ?')
      .get(userId) as { sandboxEnabled?: number } | undefined

    if (row && row.sandboxEnabled === 0) {
      return false
    }
  } catch {}

  return true
}
