import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { sql } from 'drizzle-orm'

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const result = await db.execute(sql`SELECT id, role, content, created_at as "createdAt" FROM messages WHERE chat_id = ${id} ORDER BY created_at ASC`)
  return NextResponse.json(result.rows)
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  await db.execute(sql`DELETE FROM messages WHERE id = ${id}`)
  return NextResponse.json({ ok: true })
}
