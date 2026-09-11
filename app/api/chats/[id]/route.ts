import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/session'
import { getChat, saveChat } from '@/lib/chats'

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await requireUser()
  const chat = getChat(user.email, id)
  if (!chat) return NextResponse.json([])
  return NextResponse.json(chat.messages)
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
