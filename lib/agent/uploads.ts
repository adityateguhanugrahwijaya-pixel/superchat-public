import fs from 'node:fs'
import path from 'node:path'
import * as XLSX from 'xlsx'
import { getSessionDir } from '../sandbox/paths'

export interface UploadedAttachment {
  filename: string
  relPath: string
  size: number
  mimeType: string
}

export interface AttachmentProcessingResult {
  processedContent: string
  attachments: UploadedAttachment[]
}

const MIME_MAP: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.xls': 'application/vnd.ms-excel',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.csv': 'text/csv; charset=utf-8',
  '.tsv': 'text/tab-separated-values; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.ts': 'application/typescript; charset=utf-8',
  '.py': 'text/x-python; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.zip': 'application/zip',
  '.tar': 'application/x-tar',
  '.gz': 'application/gzip',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.mp4': 'video/mp4',
}

/**
 * Detects MIME type using magic bytes from binary header if available, falling back to extension.
 */
export function detectMimeType(filePath: string, buffer?: Buffer): string {
  const ext = path.extname(filePath).toLowerCase()

  if (buffer && buffer.length >= 4) {
    // PDF: %PDF-
    if (buffer.subarray(0, 5).toString('ascii') === '%PDF-') {
      return 'application/pdf'
    }
    // PNG: \x89PNG
    if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
      return 'image/png'
    }
    // JPEG: \xFF\xD8\xFF
    if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
      return 'image/jpeg'
    }
    // GIF: GIF87a or GIF89a
    if (buffer.subarray(0, 3).toString('ascii') === 'GIF') {
      return 'image/gif'
    }
    // WEBP: RIFF....WEBP
    if (
      buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
      buffer.length >= 12 &&
      buffer.subarray(8, 12).toString('ascii') === 'WEBP'
    ) {
      return 'image/webp'
    }
    // ZIP / OOXML (docx, xlsx, pptx): PK\x03\x04
    if (buffer[0] === 0x50 && buffer[1] === 0x4b && buffer[2] === 0x03 && buffer[3] === 0x04) {
      if (ext === '.xlsx') return MIME_MAP['.xlsx']
      if (ext === '.docx') return MIME_MAP['.docx']
      if (ext === '.pptx') return MIME_MAP['.pptx']
      return 'application/zip'
    }
    // SQLite format 3
    if (buffer.subarray(0, 15).toString('ascii') === 'SQLite format 3') {
      return 'application/x-sqlite3'
    }
  }

  return MIME_MAP[ext] || 'application/octet-stream'
}

/**
 * Generates an informative text preview of uploaded file without bloating LLM context.
 */
export function generateFilePreview(filename: string, buffer: Buffer): string {
  const ext = path.extname(filename).toLowerCase()

  if (ext === '.xlsx' || ext === '.xls') {
    try {
      const workbook = XLSX.read(buffer, { type: 'buffer' })
      const firstSheet = workbook.SheetNames[0]
      if (firstSheet && workbook.Sheets[firstSheet]) {
        const csv = XLSX.utils.sheet_to_csv(workbook.Sheets[firstSheet])
        const previewLines = csv.split('\n').slice(0, 10).join('\n')
        return `[Excel Sheet: "${firstSheet}" (First 10 rows)]:\n${previewLines}`
      }
    } catch {
      return '[Excel Spreadsheet - Binary]'
    }
  }

  if (ext === '.pdf') {
    return `[Binary PDF Document - Size: ${(buffer.length / 1024).toFixed(1)} KB. You can process or extract text using Python (e.g. pypdf / pdfplumber) in the sandbox]`
  }

  if (ext === '.png' || ext === '.jpg' || ext === '.jpeg' || ext === '.webp' || ext === '.gif') {
    return `[Image File: ${detectMimeType(filename, buffer)} - Size: ${(buffer.length / 1024).toFixed(1)} KB]`
  }

  // Text files
  const isLikelyText =
    ext === '.txt' ||
    ext === '.csv' ||
    ext === '.tsv' ||
    ext === '.md' ||
    ext === '.json' ||
    ext === '.py' ||
    ext === '.js' ||
    ext === '.ts' ||
    ext === '.html' ||
    ext === '.css' ||
    ext === '.xml' ||
    ext === '.sh'

  if (isLikelyText) {
    try {
      const text = buffer.toString('utf-8')
      const lines = text.split('\n')
      if (lines.length > 50) {
        return `[Text preview (First 50 of ${lines.length} lines)]:\n${lines.slice(0, 50).join('\n')}\n... [${lines.length - 50} more lines]`
      }
      return text.slice(0, 3000)
    } catch {
      return '[Binary File]'
    }
  }

  return `[Binary File - Size: ${(buffer.length / 1024).toFixed(1)} KB]`
}

/**
 * Intercepts user prompt text, extracts any attached files, writes them intact to
 * `sandbox/{safeEmail}/{chatId}/uploads/`, and substitutes prompt with clean metadata.
 */
export function processUserAttachments(
  userEmail: string,
  chatId: string,
  rawContent: string
): AttachmentProcessingResult {
  if (!rawContent || !rawContent.includes('[Attached File:')) {
    return { processedContent: rawContent, attachments: [] }
  }

  const sessionRoot = getSessionDir(userEmail, chatId, true)
  const uploadsDir = path.join(sessionRoot, 'uploads')
  fs.mkdirSync(uploadsDir, { recursive: true })

  const attachments: UploadedAttachment[] = []
  const attachmentRegex = /\[Attached File:\s*([^\n\]]+)\]\s*\n```([a-zA-Z0-9_-]*)\n([\s\S]*?)\n```/gi

  const processedContent = rawContent.replace(
    attachmentRegex,
    (_fullMatch, rawFilename, _lang, rawPayload) => {
      const cleanFilename = path.basename(rawFilename.trim())
      if (!cleanFilename) return ''

      const payload = rawPayload.trim()
      let buffer: Buffer

      if (payload.startsWith('data:')) {
        // Data URL: data:application/pdf;base64,JVBERi...
        const commaIdx = payload.indexOf(',')
        const base64Str = commaIdx !== -1 ? payload.slice(commaIdx + 1) : payload
        buffer = Buffer.from(base64Str, 'base64')
      } else if (
        // Check if raw payload is base64 for binary file extensions
        /\.(pdf|png|jpg|jpeg|gif|webp|xlsx|xls|docx|pptx|zip|tar|gz|mp3|wav|mp4)$/i.test(cleanFilename) &&
        /^[A-Za-z0-9+/=\s]+$/.test(payload) &&
        payload.length % 4 === 0
      ) {
        try {
          buffer = Buffer.from(payload.replace(/\s+/g, ''), 'base64')
        } catch {
          buffer = Buffer.from(payload, 'utf-8')
        }
      } else {
        buffer = Buffer.from(payload, 'utf-8')
      }

      // Write binary intact into uploads directory
      const destPath = path.join(uploadsDir, cleanFilename)
      fs.writeFileSync(destPath, buffer)

      const mimeType = detectMimeType(cleanFilename, buffer)
      const relPath = path.join('uploads', cleanFilename)
      const formattedSize =
        buffer.length > 1024 * 1024
          ? `${(buffer.length / (1024 * 1024)).toFixed(2)} MB`
          : `${(buffer.length / 1024).toFixed(1)} KB`

      attachments.push({
        filename: cleanFilename,
        relPath,
        size: buffer.length,
        mimeType,
      })

      const preview = generateFilePreview(cleanFilename, buffer)

      return (
        `[User Attached Workspace File: ${relPath}]\n` +
        `- Path: ${relPath}\n` +
        `- MIME Type: ${mimeType}\n` +
        `- File Size: ${formattedSize}\n` +
        `- Preview:\n${preview}\n\n` +
        `Note: This file is stored in your sandbox workspace at '${relPath}' (read-only). You can read it, process it with code, or present it to the user.`
      )
    }
  )

  return { processedContent, attachments }
}
