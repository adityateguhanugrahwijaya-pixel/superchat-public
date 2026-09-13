import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/session'
import { resolveSandboxPath, isUserSandboxEnabled } from '@/lib/sandbox'
import fs from 'node:fs'
import path from 'node:path'
import * as XLSX from 'xlsx'

function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase()
  switch (ext) {
    case '.pdf':
      return 'application/pdf'
    case '.xlsx':
      return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    case '.xls':
      return 'application/vnd.ms-excel'
    case '.csv':
      return 'text/csv'
    case '.png':
      return 'image/png'
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg'
    case '.svg':
      return 'image/svg+xml'
    case '.webp':
      return 'image/webp'
    case '.html':
    case '.htm':
      return 'text/html'
    case '.json':
      return 'application/json'
    case '.js':
      return 'application/javascript'
    case '.css':
      return 'text/css'
    default:
      return 'text/plain'
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

    const fullPath = resolveSandboxPath(user.email, chatId, filePath)

    if (!fs.existsSync(fullPath)) {
      return NextResponse.json({ error: `File not found: ${filePath}` }, { status: 404 })
    }

    const stat = fs.statSync(fullPath)
    if (stat.isDirectory()) {
      return NextResponse.json({ error: 'Path points to a directory' }, { status: 400 })
    }

    const filename = path.basename(fullPath)
    const ext = path.extname(fullPath).toLowerCase()
    const mimeType = getMimeType(fullPath)

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
      try {
        text = fs.readFileSync(fullPath, 'utf-8')
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
      })
    }

    const fileBuffer = fs.readFileSync(fullPath)
    const headers = new Headers()
    headers.set('Content-Type', mimeType)
    headers.set('Content-Length', stat.size.toString())

    if (isDownload) {
      headers.set('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`)
    } else {
      headers.set('Content-Disposition', `inline; filename="${encodeURIComponent(filename)}"`)
    }

    return new NextResponse(fileBuffer, {
      status: 200,
      headers,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Unauthorized or file access error' }, { status: 500 })
  }
}
