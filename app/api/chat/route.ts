import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { db } from '@/lib/db'
import { sql } from 'drizzle-orm'
import { requireUser } from '@/lib/session'

export async function POST(request: NextRequest) {
  const owner = (await requireUser()).id
  const body = await request.json()
  const chatId = String(body.chatId || '')
  const content = String(body.content || '').trim()
  const model = String(body.model || '')
  if (!chatId || !content || !model) return NextResponse.json({ error: 'chatId, content, and model are required' }, { status: 400 })

  const chatResult = await db.execute(sql`SELECT system_prompt as "systemPrompt" FROM chats WHERE id = ${chatId} AND user_id = ${owner}`)
  const systemPrompt = String((chatResult.rows[0] as { systemPrompt?: string } | undefined)?.systemPrompt || '')
  const settings = await db.execute(sql`SELECT api_mode as "apiMode" FROM user_settings WHERE user_id = ${owner}`)
  const apiMode = String((settings.rows[0] as { apiMode?: string } | undefined)?.apiMode || 'superchat')
  if (apiMode !== 'byo') {
    const limits = await db.execute(sql`SELECT COALESCE(p.daily_token_limit, 2000000)::bigint AS "dailyLimit", COALESCE(p.allowed_models, '[]'::jsonb) AS "allowedModels", COALESCE(SUM(u.tokens_used), 0)::bigint AS used FROM "user" usr LEFT JOIN packages p ON p.id = usr.package_id LEFT JOIN usage_logs u ON u.user_id = usr.id AND u.usage_date = CURRENT_DATE WHERE usr.id = ${owner} GROUP BY p.daily_token_limit, p.allowed_models`)
    const limit = limits.rows[0] as { dailyLimit?: string; allowedModels?: string[]; used?: string } | undefined
    const allowed = Array.isArray(limit?.allowedModels) ? limit.allowedModels : []
    if (allowed.length && !allowed.includes(model)) return NextResponse.json({ error: 'This model is not included in your current package.' }, { status: 403 })
    if (Number(limit?.used || 0) >= Number(limit?.dailyLimit || 2000000)) return NextResponse.json({ error: 'Daily token limit reached. Switch to BYO mode or try again tomorrow.' }, { status: 429 })
  }
  const history = await db.execute(sql`SELECT role, content FROM messages WHERE chat_id = ${chatId} AND user_id = ${owner} ORDER BY created_at ASC`)
  const messages = [
    ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
    ...history.rows.map((message) => ({ role: String(message.role), content: String(message.content) })),
    { role: 'user', content },
  ]

  await db.execute(sql`INSERT INTO messages (id, chat_id, user_id, role, content) VALUES (${randomUUID()}, ${chatId}, ${owner}, 'user', ${content})`)
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
        if (assistant) { await db.execute(sql`INSERT INTO messages (id, chat_id, user_id, role, content) VALUES (${randomUUID()}, ${chatId}, ${owner}, 'assistant', ${assistant})`); const estimatedTokens = Math.max(1, Math.ceil((content.length + assistant.length) / 4)); await db.execute(sql`INSERT INTO usage_logs (id, user_id, usage_date, tokens_used, model) VALUES (${randomUUID()}, ${owner}, CURRENT_DATE, ${estimatedTokens}, ${model})`) }
        await db.execute(sql`UPDATE chats SET updated_at = NOW() WHERE id = ${chatId}`)
        controller.close()
      } catch (error) { controller.error(error) }
    },
  })
  return new Response(stream, { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' } })
}
