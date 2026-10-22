import fs from 'node:fs'
import path from 'node:path'

export const MAX_OUTPUT_CHARS = 200_000

export type FileStamp = { mtimeMs: number; size: number }

export function snapshotSandboxFiles(sandboxDir: string): Map<string, FileStamp> {
  const fileMap = new Map<string, FileStamp>()

  const walk = (dir: string) => {
    let items: fs.Dirent[]
    try {
      items = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }

    for (const item of items) {
      if (item.name.startsWith('_temp_') || item.name === '.agent') continue
      const full = path.join(dir, item.name)
      try {
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

  if (fs.existsSync(sandboxDir)) {
    walk(sandboxDir)
  }

  return fileMap
}

export function detectNewOrModifiedFiles(
  sandboxDir: string,
  before: Map<string, FileStamp>
): string[] {
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

export function stripCodeFences(code: string): string {
  if (!code) return ''
  const match = code.trim().match(/^```[a-zA-Z0-9_-]*\s*\n([\s\S]*?)\n?```\s*$/)
  return match ? match[1] : code
}

export function clipOutput(text: string, maxChars = MAX_OUTPUT_CHARS): string {
  if (!text) return ''
  if (text.length <= maxChars) return text
  const half = Math.floor(maxChars / 2)
  const omitted = text.length - maxChars
  return `${text.slice(0, half)}\n\n... [${omitted} characters omitted] ...\n\n${text.slice(-half)}`
}

export function filesSection(createdFiles: string[]): string {
  return createdFiles.length > 0
    ? `\n\n📁 **Workspace Files Created/Updated:**\n` + createdFiles.map((f) => `- ${f}`).join('\n')
    : ''
}
