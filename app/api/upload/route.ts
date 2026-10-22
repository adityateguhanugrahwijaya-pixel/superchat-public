import { NextRequest, NextResponse } from 'next/server'
import path from 'node:path'
import fs from 'node:fs'
import { requireUser, isAuthError } from '@/lib/session'
import { getSessionDir, isValidChatId } from '@/lib/sandbox/paths'
import { detectMimeType } from '@/lib/agent/uploads'

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser()

    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const chatId = (formData.get('chatId') as string) || ''

    if (!file) {
      return NextResponse.json({ error: 'Missing file in form data' }, { status: 400 })
    }

    if (!chatId || !isValidChatId(chatId)) {
      return NextResponse.json({ error: 'Missing or invalid chatId' }, { status: 400 })
    }

    const sessionRoot = getSessionDir(user.email, chatId, true)
    const uploadsDir = path.join(sessionRoot, 'uploads')
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true, mode: 0o755 })
    }

    const rawName = file.name || 'uploaded_file'
    const safeFilename = path.basename(rawName).replace(/[^A-Za-z0-9._-]/g, '_')
    const targetPath = path.join(uploadsDir, safeFilename)

    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    const mimeType = detectMimeType(safeFilename, buffer)

    fs.writeFileSync(targetPath, buffer)

    return NextResponse.json({
      success: true,
      filename: safeFilename,
      path: `uploads/${safeFilename}`,
      size: buffer.length,
      mimeType,
    })
  } catch (err: any) {
    if (isAuthError(err)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return NextResponse.json({ error: err?.message || 'File upload failed' }, { status: 500 })
  }
}
