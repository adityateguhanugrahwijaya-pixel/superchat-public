import { NextResponse } from 'next/server'
import { requireUser, isAuthError } from '@/lib/session'
import { getChat, saveChat } from '@/lib/chats'

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const user = await requireUser()
    const chat = getChat(user.email, id)
    if (!chat) return NextResponse.json({ messages: [], isAgentRunning: false })

    const searchParams = new URL(req.url).searchParams
    if (searchParams.get('raw') === 'array') {
      return NextResponse.json(chat.messages)
    }

    if (chat.isAgentRunning || (chat.activity && chat.activity !== 'idle')) {
      const globalJobs = (globalThis as any).__superchatActiveAgentJobs as Map<string, any> | undefined
      const hasInMemoryJob = globalJobs ? globalJobs.has(chat.id) : false
      const updatedMs = chat.updatedAt ? new Date(chat.updatedAt).getTime() : 0
      const ageMs = updatedMs ? Date.now() - updatedMs : Infinity
      // Reset stale running state if server restarted (!hasInMemoryJob and >3s old) or if no heartbeat for >60s
      if ((!hasInMemoryJob && ageMs > 3000) || ageMs > 60000) {
        chat.isAgentRunning = false
        chat.activity = 'idle'
        chat.updatedAt = new Date().toISOString()
        saveChat(user.email, chat)
      }
    }

    return NextResponse.json({
      id: chat.id,
      schema: chat.schema,
      title: chat.title,
      messages: chat.messages,
      isAgentRunning: Boolean(chat.isAgentRunning),
      activity: chat.activity || 'idle',
      runStatus: chat.runStatus || null,
      updatedAt: chat.updatedAt,
    })
  } catch (err: any) {
    if (isAuthError(err)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return NextResponse.json({ error: err?.message || 'Server error' }, { status: 500 })
  }
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const user = await requireUser()
    const chat = getChat(user.email, id)
    if (chat) {
      // If msg id is passed or full chat delete
      saveChat(user.email, { ...chat, messages: [] })
    }
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    if (isAuthError(err)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return NextResponse.json({ error: err?.message || 'Server error' }, { status: 500 })
  }
}
