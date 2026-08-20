import { NextResponse } from 'next/server'

export async function GET() {
  const response = await fetch('https://router.bynara.id/v1/models', {
    headers: { Authorization: `Bearer ${process.env.BYNARA_API_KEY}` },
    next: { revalidate: 300 },
  })
  if (!response.ok) return NextResponse.json({ error: 'Unable to load models' }, { status: response.status })
  const data = await response.json()
  return NextResponse.json((data.data ?? []).map((model: { id: string; name?: string }) => ({ id: model.id, name: model.name ?? model.id })))
}
