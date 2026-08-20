import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { db } from '@/lib/db'
import { sql } from 'drizzle-orm'
import { requireUser } from '@/lib/session'

async function userId() { return (await requireUser()).id }

export async function GET() {
  const owner = await userId()
  const chats = await db.execute(sql`SELECT id, title, system_prompt as "systemPrompt", model, archived, created_at as "createdAt", updated_at as "updatedAt" FROM chats WHERE user_id = ${owner} ORDER BY updated_at DESC`)
  return NextResponse.json(chats.rows)
}

export async function POST(request: NextRequest) {
  const owner = await userId()
  const body = await request.json()
  const id = randomUUID()
  const title = typeof body.title === 'string' && body.title.trim() ? body.title.trim().slice(0, 80) : 'New conversation'
  const model = typeof body.model === 'string' ? body.model : 'deepseek/deepseek-chat'
  await db.execute(sql`INSERT INTO chats (id, user_id, title, system_prompt, model) VALUES (${id}, ${owner}, ${title}, ${typeof body.systemPrompt === 'string' ? body.systemPrompt : ''}, ${model})`)
  return NextResponse.json({ id, title, systemPrompt: body.systemPrompt ?? '', model }, { status: 201 })
}

export async function PATCH(request: NextRequest) {
  const owner = await userId()
  const body = await request.json()
  if (!body.id) return NextResponse.json({ error: 'Chat id is required' }, { status: 400 })
  if (body.title !== undefined) await db.execute(sql`UPDATE chats SET title = ${String(body.title).trim().slice(0, 80)}, updated_at = NOW() WHERE id = ${body.id} AND user_id = ${owner}`)
  if (body.systemPrompt !== undefined) await db.execute(sql`UPDATE chats SET system_prompt = ${String(body.systemPrompt)}, updated_at = NOW() WHERE id = ${body.id} AND user_id = ${owner}`)
  if (body.model !== undefined) await db.execute(sql`UPDATE chats SET model = ${String(body.model)}, updated_at = NOW() WHERE id = ${body.id} AND user_id = ${owner}`)
  return NextResponse.json({ ok: true })
}

export async function DELETE(request: NextRequest) {
  const owner = await userId()
  const id = new URL(request.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Chat id is required' }, { status: 400 })
  await db.execute(sql`DELETE FROM messages WHERE chat_id = ${id} AND user_id = ${owner}`)
  await db.execute(sql`DELETE FROM chats WHERE id = ${id} AND user_id = ${owner}`)
  return NextResponse.json({ ok: true })
}
