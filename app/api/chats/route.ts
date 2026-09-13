import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/session'
import { listUserChats, createChatFile, updateChatFile, deleteChatFile, deleteAllUserChats, exportUserChats } from '@/lib/chats'

export async function GET(request: NextRequest) {
  const user = await requireUser()
  const searchParams = new URL(request.url).searchParams
  const isExport = searchParams.get('export') === 'true'

  if (isExport) {
    const fullChats = exportUserChats(user.email)
    const jsonString = JSON.stringify(fullChats, null, 2)
    const dateStr = new Date().toISOString().split('T')[0]
    const fileName = `superchat_export_${dateStr}.json`

    return new Response(jsonString, {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="${fileName}"`,
      },
    })
  }

  const chats = listUserChats(user.email)
  return NextResponse.json(chats)
}

export async function POST(request: NextRequest) {
  const user = await requireUser()
  const body = await request.json().catch(() => ({}))
  const title = typeof body.title === 'string' && body.title.trim() ? body.title.trim().slice(0, 80) : 'New conversation'
  const model = typeof body.model === 'string' ? body.model : 'deepseek/deepseek-chat'
  const systemPrompt = typeof body.systemPrompt === 'string' ? body.systemPrompt : ''
  const id = typeof body.id === 'string' && body.id.trim() ? body.id.trim() : crypto.randomUUID()

  const chat = createChatFile(user.email, { id, title, model, systemPrompt })
  return NextResponse.json({ id: chat.id, title: chat.title, systemPrompt: chat.systemPrompt, model: chat.model }, { status: 201 })
}

export async function PATCH(request: NextRequest) {
  const user = await requireUser()
  const body = await request.json().catch(() => ({}))
  if (!body.id) return NextResponse.json({ error: 'Chat id is required' }, { status: 400 })

  const patch: Record<string, any> = {}
  if (body.title !== undefined) patch.title = String(body.title).trim().slice(0, 80)
  if (body.systemPrompt !== undefined) patch.systemPrompt = String(body.systemPrompt)
  if (body.model !== undefined) patch.model = String(body.model)
  if (Array.isArray(body.messages)) patch.messages = body.messages

  const updated = updateChatFile(user.email, String(body.id), patch)
  if (!updated) return NextResponse.json({ error: 'Chat not found' }, { status: 404 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(request: NextRequest) {
  const user = await requireUser()
  const searchParams = new URL(request.url).searchParams
  const isAll = searchParams.get('all') === 'true'
  const id = searchParams.get('id')

  if (isAll) {
    const deletedCount = deleteAllUserChats(user.email)
    return NextResponse.json({ ok: true, deletedCount })
  }

  if (!id) return NextResponse.json({ error: 'Chat id is required' }, { status: 400 })

  deleteChatFile(user.email, id)
  return NextResponse.json({ ok: true })
}
