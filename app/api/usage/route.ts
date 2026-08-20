import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { sql } from 'drizzle-orm'
import { requireUser } from '@/lib/session'

export async function GET() { const user = await requireUser(); const result = await db.execute(sql`SELECT COALESCE(SUM(u.tokens_used), 0)::bigint AS used, COALESCE(p.daily_token_limit, 2000000)::bigint AS "dailyLimit", COALESCE(p.name, 'Free') AS plan FROM usage_logs u LEFT JOIN "user" usr ON usr.id = u.user_id LEFT JOIN packages p ON p.id = usr.package_id WHERE u.user_id = ${user.id} AND u.usage_date = CURRENT_DATE GROUP BY p.daily_token_limit, p.name`); return NextResponse.json(result.rows[0] ?? { used: 0, dailyLimit: 2000000, plan: 'Free' }) }
