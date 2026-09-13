import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/session'
import { getChat, saveChat } from '@/lib/chats'

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await requireUser()
  const chat = getChat(user.email, id)
  if (!chat) return NextResponse.json({ messages: [], isAgentRunning: false })

  const searchParams = new URL(req.url).searchParams
  if (searchParams.get('raw') === 'array') {
    return NextResponse.json(chat.messages)
  }

  return NextResponse.json({
    id: chat.id,
    title: chat.title,
    messages: chat.messages,
    isAgentRunning: Boolean(chat.isAgentRunning),
  })
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await requireUser()
  const chat = getChat(user.email, id)
  if (chat) {
    // If msg id is passed or full chat delete
    saveChat(user.email, { ...chat, messages: [] })
  }
  return NextResponse.json({ ok: true })
}
