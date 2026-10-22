import { NextRequest, NextResponse } from 'next/server'
import { requireUser, isAuthError } from '@/lib/session'
import { resolveSandboxPath, isUserSandboxEnabled } from '@/lib/sandbox'
import { detectMimeType } from '@/lib/agent/uploads'
import fs from 'node:fs'
import path from 'node:path'
import * as XLSX from 'xlsx'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Max bytes returned as text by ?parse=1 (keeps huge files from freezing the UI / server)
const MAX_PARSE_BYTES = 5 * 1024 * 1024

const MIME_TYPES: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.xls': 'application/vnd.ms-excel',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.csv': 'text/csv; charset=utf-8',
  '.tsv': 'text/tab-separated-values; charset=utf-8',
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
  '.css': 'text/css; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.zip': 'application/zip',
}

function getMimeType(filePath: string, sampleBuffer?: Buffer): string {
  return detectMimeType(filePath, sampleBuffer)
}

/** Content-Disposition with a safe ASCII fallback plus the real UTF-8 name (RFC 5987). */
function contentDisposition(kind: 'attachment' | 'inline', filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_')
  return `${kind}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`
}

/** Reads at most maxBytes from the start of a file as UTF-8 text. */
function readTextSlice(fullPath: string, size: number, maxBytes: number): { text: string; truncated: boolean } {
  if (size <= maxBytes) {
    return { text: fs.readFileSync(fullPath, 'utf-8'), truncated: false }
  }
  const fd = fs.openSync(fullPath, 'r')
  try {
    const buf = Buffer.alloc(maxBytes)
    const bytesRead = fs.readSync(fd, buf, 0, maxBytes, 0)
    return { text: buf.subarray(0, bytesRead).toString('utf-8'), truncated: true }
  } finally {
    fs.closeSync(fd)
  }
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser()
    if (!isUserSandboxEnabled(user.id)) {
      return NextResponse.json(
        { error: 'Sandbox file serving is disabled for your account or by server administrator.' },
        { status: 403 }
      )
    }

    const url = new URL(request.url)
    const chatId = url.searchParams.get('chatId')
    const filePath = url.searchParams.get('path')
    const isDownload = url.searchParams.get('download') === '1'
    const isParse = url.searchParams.get('parse') === '1'

    if (!chatId || !filePath) {
      return NextResponse.json({ error: 'Missing chatId or path parameter' }, { status: 400 })
    }

    let fullPath: string
    try {
      fullPath = resolveSandboxPath(user.email, chatId, filePath, {
        allowFallback: true,
        forWrite: false,
        allowInternalAgent: false,
      })
    } catch (err: any) {
      return NextResponse.json({ error: err?.message || 'Access denied' }, { status: 403 })
    }

    if (!fs.existsSync(fullPath)) {
      return NextResponse.json({ error: `File not found: ${filePath}` }, { status: 404 })
    }

    const stat = fs.statSync(fullPath)
    if (stat.isDirectory()) {
      return NextResponse.json({ error: 'Path points to a directory' }, { status: 400 })
    }

    const filename = path.basename(fullPath)
    const ext = path.extname(fullPath).toLowerCase()
    const sampleHeader = Buffer.alloc(32)
    let headerBytes = 0
    try {
      const fd = fs.openSync(fullPath, 'r')
      headerBytes = fs.readSync(fd, sampleHeader, 0, 32, 0)
      fs.closeSync(fd)
    } catch {}
    const mimeType = getMimeType(fullPath, sampleHeader.subarray(0, headerBytes))

    // If parse requested, ALWAYS return a valid JSON response
    if (isParse) {
      if (ext === '.xlsx' || ext === '.xls') {
        let csvText = ''
        try {
          const fileBuffer = fs.readFileSync(fullPath)
          const workbook = XLSX.read(fileBuffer, { type: 'buffer' })
          const firstSheetName = workbook.SheetNames[0]
          if (firstSheetName && workbook.Sheets[firstSheetName]) {
            csvText = XLSX.utils.sheet_to_csv(workbook.Sheets[firstSheetName])
          }
        } catch (err: any) {
          csvText = `Error parsing Excel spreadsheet: ${err?.message || 'Invalid format'}`
        }
        return NextResponse.json({
          filename,
          ext,
          size: stat.size,
          content: csvText,
          isExcel: true,
        })
      }

      let text = ''
      let truncated = false
      try {
        const slice = readTextSlice(fullPath, stat.size, MAX_PARSE_BYTES)
        text = slice.text
        truncated = slice.truncated
      } catch {
        text = ''
      }
      const isBinaryPdf = ext === '.pdf' && text.startsWith('%PDF-')
      return NextResponse.json({
        filename,
        ext,
        size: stat.size,
        content: isBinaryPdf ? '[Binary PDF Document]' : text,
        isBinaryPdf,
        truncated,
      })
    }

    const fileBuffer = fs.readFileSync(fullPath)
    const headers = new Headers()
    headers.set('Content-Type', mimeType)
    headers.set('Content-Length', stat.size.toString())
    headers.set('Content-Disposition', contentDisposition(isDownload ? 'attachment' : 'inline', filename))
    headers.set('X-Content-Type-Options', 'nosniff')
    headers.set('Cache-Control', 'private, no-cache')

    // SECURITY: files here are written by the AI agent (and can be influenced by web content it
    // read). Served inline from this origin, an HTML/SVG file with a <script> could otherwise call
    // SuperChat's APIs using the logged-in user's session. The CSP "sandbox" gives the document an
    // opaque origin (no cookies, no same-origin API access) while still letting scripts run.
    if (!isDownload && (ext === '.html' || ext === '.htm' || ext === '.svg')) {
      headers.set('Content-Security-Policy', 'sandbox allow-scripts')
    }

    return new NextResponse(fileBuffer, {
      status: 200,
      headers,
    })
  } catch (err: any) {
    if (isAuthError(err)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return NextResponse.json({ error: err?.message || 'Unauthorized or file access error' }, { status: 500 })
  }
}
