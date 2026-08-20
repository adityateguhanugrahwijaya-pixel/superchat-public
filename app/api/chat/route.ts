import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { db } from '@/lib/db'
import { sql } from 'drizzle-orm'

export async function POST(request: NextRequest) {
  const body = await request.json()
  const chatId = String(body.chatId || '')
  const content = String(body.content || '').trim()
  const model = String(body.model || '')
  if (!chatId || !content || !model) return NextResponse.json({ error: 'chatId, content, and model are required' }, { status: 400 })

  const chatResult = await db.execute(sql`SELECT system_prompt as "systemPrompt" FROM chats WHERE id = ${chatId}`)
  const systemPrompt = String((chatResult.rows[0] as { systemPrompt?: string } | undefined)?.systemPrompt || '')
  const history = await db.execute(sql`SELECT role, content FROM messages WHERE chat_id = ${chatId} ORDER BY created_at ASC`)
  const messages = [
    ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
    ...history.rows.map((message) => ({ role: String(message.role), content: String(message.content) })),
    { role: 'user', content },
  ]

  await db.execute(sql`INSERT INTO messages (id, chat_id, role, content) VALUES (${randomUUID()}, ${chatId}, 'user', ${content})`)
  await db.execute(sql`UPDATE chats SET updated_at = NOW() WHERE id = ${chatId}`)

  const upstream = await fetch('https://router.bynara.id/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.BYNARA_API_KEY}` },
    body: JSON.stringify({ model, messages, stream: true }),
  })
  if (!upstream.ok || !upstream.body) return NextResponse.json({ error: 'The model router could not respond' }, { status: upstream.status || 502 })

  const encoder = new TextEncoder()
  const decoder = new TextDecoder()
  let assistant = ''
  const stream = new ReadableStream({
    async start(controller) {
      const reader = upstream.body!.getReader()
      let buffer = ''
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() || ''
          for (const line of lines) {
            if (!line.startsWith('data:')) continue
            const data = line.slice(5).trim()
            if (data === '[DONE]') continue
            try {
              const token = JSON.parse(data).choices?.[0]?.delta?.content || ''
              if (token) { assistant += token; controller.enqueue(encoder.encode(token)) }
            } catch { /* ignore keep-alive and malformed chunks */ }
          }
        }
        if (assistant) await db.execute(sql`INSERT INTO messages (id, chat_id, role, content) VALUES (${randomUUID()}, ${chatId}, 'assistant', ${assistant})`)
        await db.execute(sql`UPDATE chats SET updated_at = NOW() WHERE id = ${chatId}`)
        controller.close()
      } catch (error) { controller.error(error) }
    },
  })
  return new Response(stream, { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' } })
}
