import fs from 'node:fs'
import path from 'node:path'
import { ToolDefinition, ToolContext, ToolResult, PresentedFile } from './types'
import { resolveSandboxPath } from '../../sandbox/paths'

export const presentFilesTool: ToolDefinition = {
  name: 'present_files',
  aliases: ['show_files', 'publish_files'],
  description:
    'Presents one or more generated final files to the user as interactive download/preview cards in chat. Files must already exist in the workspace. Files are NOT moved and remain accessible in their original locations.',
  parameters: {
    type: 'object',
    properties: {
      files: {
        type: 'array',
        description:
          'List of relative file paths (e.g. ["outputs/report.pdf", "data.xlsx"]) or objects with path and title.',
        items: {
          type: 'string',
        },
      },
    },
    required: ['files'],
  },
  execute: async (
    context: ToolContext,
    args: { files: Array<string | { path: string; title?: string }> }
  ): Promise<ToolResult> => {
    const { userEmail, chatId, sessionDir } = context
    const rawFiles = args.files

    if (!Array.isArray(rawFiles) || rawFiles.length === 0) {
      return {
        success: false,
        output: 'Error: present_files requires a non-empty array of file paths in the "files" parameter.',
        error: 'Empty files array',
      }
    }

    const missingFiles: string[] = []
    const presented: PresentedFile[] = []

    for (const item of rawFiles) {
      const rawPath = typeof item === 'string' ? item : item?.path
      const rawTitle = typeof item === 'object' && item !== null && item.title ? item.title : ''

      if (!rawPath || typeof rawPath !== 'string') continue

      const cleanRel = rawPath.trim()
      if (!cleanRel) continue

      try {
        const fullPath = resolveSandboxPath(userEmail, chatId, cleanRel)

        // Safety: Cannot present files inside .agent
        if (fullPath.includes('/.agent/') || fullPath.endsWith('/.agent')) {
          missingFiles.push(`${cleanRel} (forbidden internal path)`)
          continue
        }

        if (!fs.existsSync(fullPath)) {
          missingFiles.push(cleanRel)
          continue
        }

        const stat = fs.statSync(fullPath)
        if (!stat.isFile()) {
          missingFiles.push(`${cleanRel} (is a directory, not a file)`)
          continue
        }

        const relPath = path.relative(sessionDir, fullPath)
        const defaultTitle = path.basename(relPath)
        const title = (rawTitle && rawTitle.trim()) || defaultTitle

        // Enforce 5-word limit on title per UI constraints
        const words = title.split(/\s+/).filter(Boolean)
        const safeTitle = words.length > 5 ? words.slice(0, 5).join(' ') : title

        presented.push({ path: relPath, title: safeTitle })
      } catch (err: any) {
        missingFiles.push(`${cleanRel} (${err?.message || 'Access error'})`)
      }
    }

    if (missingFiles.length > 0) {
      return {
        success: false,
        output:
          `Error: The following file(s) could not be presented because they do not exist or are invalid:\n` +
          missingFiles.map((f) => `- ${f}`).join('\n') +
          `\n\nEnsure that you create or write the file in your workspace before calling present_files.`,
        error: 'Missing file(s) for presentation',
      }
    }

    if (presented.length === 0) {
      return {
        success: false,
        output: 'Error: No valid files were provided to present_files.',
        error: 'No valid files',
      }
    }

    let summary =
      `Successfully presented ${presented.length} file(s) to the user:\n` +
      presented.map((p) => `- ${p.path} ("${p.title}")`).join('\n')

    // Check if any presented document or image files have not been previewed
    try {
      const previewMetaPath = path.join(sessionDir, '.agent', 'preview', '.previewed.json')
      let previewedMap: Record<string, any> = {}
      if (fs.existsSync(previewMetaPath)) {
        try {
          previewedMap = JSON.parse(fs.readFileSync(previewMetaPath, 'utf-8'))
        } catch {}
      }

      const previewableExts = new Set(['.pdf', '.pptx', '.docx', '.png', '.jpg', '.jpeg', '.webp'])
      const unpreviewed = presented.filter((p) => {
        const ext = path.extname(p.path).toLowerCase()
        return previewableExts.has(ext) && !previewedMap[p.path]
      })

      if (unpreviewed.length > 0) {
        summary +=
          `\n\nCatatan: File berikut belum di-preview dengan tool preview_file:\n` +
          unpreviewed.map((f) => `- ${f.path}`).join('\n') +
          `\nDisarankan memanggil preview_file untuk memeriksa tata letak dan kualitas sebelum present_files.`
      }
    } catch {}

    return {
      success: true,
      output: summary,
      filePath: presented[0].path,
      fileTitle: presented[0].title,
      presentedFiles: presented,
    }
  },
}
