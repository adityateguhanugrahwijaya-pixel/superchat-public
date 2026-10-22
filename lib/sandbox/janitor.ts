import fs from 'node:fs'
import path from 'node:path'
import { getSandboxRoot, validateSessionIds } from './paths'
import { getChat } from '../chats'

const DEFAULT_TTL_DAYS = 30
const DEFAULT_USER_QUOTA_BYTES = 500 * 1024 * 1024 // 500 MB

export type JanitorMode = 'dry-run' | 'enforce'

export interface JanitorReport {
  mode: JanitorMode
  scannedSessions: number
  reapedSessions: Array<{
    userEmail: string
    chatId: string
    path: string
    sizeBytes: number
    reason: 'ttl_expired' | 'quota_exceeded'
  }>
  skippedActiveSessions: number
  totalBytesFreed: number
}

/**
 * Permanently removes a session sandbox directory.
 * Rigorously checks that the target path is exactly two levels deep within SANDBOX_ROOT
 * and is not a symlink.
 */
export async function destroySession(userEmail: string, chatId: string): Promise<boolean> {
  const { safeEmail, safeChatId } = validateSessionIds(userEmail, chatId)
  const sandboxRoot = getSandboxRoot()
  const targetDir = path.join(sandboxRoot, safeEmail, safeChatId)

  // Verify exact depth: relative path must be exactly 'safeEmail/safeChatId'
  const rel = path.relative(sandboxRoot, targetDir)
  const segments = rel.split(path.sep)
  if (segments.length !== 2 || segments[0] !== safeEmail || segments[1] !== safeChatId) {
    throw new Error(`Security Violation: Irregular session path in destroySession (${targetDir})`)
  }

  if (!fs.existsSync(targetDir)) {
    return false
  }

  const stat = fs.lstatSync(targetDir)
  if (stat.isSymbolicLink()) {
    throw new Error(`Security Violation: Cannot destroy symlinked session directory (${targetDir})`)
  }

  fs.rmSync(targetDir, { recursive: true, force: true })
  return true
}

function calculateDirStats(dirPath: string): { sizeBytes: number; latestMtimeMs: number } {
  let sizeBytes = 0
  let latestMtimeMs = 0

  function walk(current: string) {
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(current, { withFileTypes: true })
    } catch {
      return
    }

    for (const entry of entries) {
      const full = path.join(current, entry.name)
      try {
        const lstat = fs.lstatSync(full)
        if (lstat.mtimeMs > latestMtimeMs) {
          latestMtimeMs = lstat.mtimeMs
        }
        if (lstat.isDirectory() && !lstat.isSymbolicLink()) {
          walk(full)
        } else if (lstat.isFile()) {
          sizeBytes += lstat.size
        }
      } catch {}
    }
  }

  walk(dirPath)
  return { sizeBytes, latestMtimeMs }
}

/**
 * Runs cleanup on abandoned and oversized sandboxes according to TTL and quota rules.
 */
export async function runJanitor(options?: {
  mode?: JanitorMode
  ttlDays?: number
  maxUserQuotaBytes?: number
}): Promise<JanitorReport> {
  const mode: JanitorMode =
    options?.mode || (process.env.JANITOR_MODE === 'enforce' ? 'enforce' : 'dry-run')
  const ttlDays = options?.ttlDays ?? DEFAULT_TTL_DAYS
  const ttlMs = ttlDays * 24 * 60 * 60 * 1000
  const maxQuota = options?.maxUserQuotaBytes ?? DEFAULT_USER_QUOTA_BYTES
  const now = Date.now()

  const sandboxRoot = getSandboxRoot()
  const report: JanitorReport = {
    mode,
    scannedSessions: 0,
    reapedSessions: [],
    skippedActiveSessions: 0,
    totalBytesFreed: 0,
  }

  if (!fs.existsSync(sandboxRoot)) {
    return report
  }

  let userDirs: string[]
  try {
    userDirs = fs.readdirSync(sandboxRoot)
  } catch {
    return report
  }

  for (const userDirName of userDirs) {
    const userDirPath = path.join(sandboxRoot, userDirName)
    try {
      const userStat = fs.lstatSync(userDirPath)
      if (!userStat.isDirectory() || userStat.isSymbolicLink()) continue
    } catch {
      continue
    }

    let chatDirs: string[]
    try {
      chatDirs = fs.readdirSync(userDirPath)
    } catch {
      continue
    }

    type SessionInfo = {
      chatId: string
      fullPath: string
      sizeBytes: number
      latestMtimeMs: number
      isActive: boolean
    }
    const sessions: SessionInfo[] = []

    for (const chatDirName of chatDirs) {
      const chatDirPath = path.join(userDirPath, chatDirName)
      let chatStat: fs.Stats
      try {
        chatStat = fs.lstatSync(chatDirPath)
        if (!chatStat.isDirectory() || chatStat.isSymbolicLink()) continue
      } catch {
        continue
      }

      report.scannedSessions++

      // Check if session is currently active
      let isActive = false
      try {
        const chat = getChat(userDirName, chatDirName)
        if (chat?.isAgentRunning) {
          isActive = true
        }
      } catch {}

      if (isActive) {
        report.skippedActiveSessions++
        continue
      }

      const { sizeBytes, latestMtimeMs } = calculateDirStats(chatDirPath)
      sessions.push({
        chatId: chatDirName,
        fullPath: chatDirPath,
        sizeBytes,
        latestMtimeMs: latestMtimeMs || chatStat.mtimeMs,
        isActive: false,
      })
    }

    // 1. Check TTL expiration
    const remainingSessions: SessionInfo[] = []
    for (const session of sessions) {
      const ageMs = now - session.latestMtimeMs
      if (ageMs > ttlMs) {
        report.reapedSessions.push({
          userEmail: userDirName,
          chatId: session.chatId,
          path: session.fullPath,
          sizeBytes: session.sizeBytes,
          reason: 'ttl_expired',
        })
        report.totalBytesFreed += session.sizeBytes
        if (mode === 'enforce') {
          try {
            await destroySession(userDirName, session.chatId)
          } catch {}
        }
      } else {
        remainingSessions.push(session)
      }
    }

    // 2. Check user disk quota (delete oldest sessions if total size exceeds quota)
    remainingSessions.sort((a, b) => a.latestMtimeMs - b.latestMtimeMs) // oldest first
    let currentUsage = remainingSessions.reduce((sum, s) => sum + s.sizeBytes, 0)

    for (const session of remainingSessions) {
      if (currentUsage <= maxQuota) break

      report.reapedSessions.push({
        userEmail: userDirName,
        chatId: session.chatId,
        path: session.fullPath,
        sizeBytes: session.sizeBytes,
        reason: 'quota_exceeded',
      })
      report.totalBytesFreed += session.sizeBytes
      currentUsage -= session.sizeBytes

      if (mode === 'enforce') {
        try {
          await destroySession(userDirName, session.chatId)
        } catch {}
      }
    }
  }

  return report
}
