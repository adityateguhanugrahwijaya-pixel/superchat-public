import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireUser } from '@/lib/session'

export async function GET() {
  try {
    const user = await requireUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user settings to determine active router URL
    const settings = db
      .prepare('SELECT api_mode as apiMode, custom_router_url as customRouterUrl FROM user_settings WHERE user_id = ?')
      .get(user.id) as { apiMode?: string; customRouterUrl?: string } | undefined

    const isCustom = settings?.apiMode === 'byo' && Boolean(settings?.customRouterUrl?.trim())
    const defaultRouterUrl = 'https://router.bynara.id/v1'
    const activeRouterUrl = isCustom ? settings!.customRouterUrl!.trim() : defaultRouterUrl

    // Tokens used today on active router
    const todayRow = db
      .prepare(
        `SELECT COALESCE(SUM(tokens_used), 0) AS used FROM usage_logs WHERE user_id = ? AND usage_date = DATE('now') AND (router_url = ? OR (router_url IS NULL AND ? = ?))`
      )
      .get(user.id, activeRouterUrl, activeRouterUrl, defaultRouterUrl) as { used?: number } | undefined

    // Total tokens used all time
    const totalRow = db
      .prepare(`SELECT COALESCE(SUM(tokens_used), 0) AS total FROM usage_logs WHERE user_id = ?`)
      .get(user.id) as { total?: number } | undefined

    // Historical usage (last 14 days)
    const history = db
      .prepare(
        `SELECT usage_date as date, SUM(tokens_used) as tokens, COUNT(*) as requests FROM usage_logs WHERE user_id = ? GROUP BY usage_date ORDER BY usage_date DESC LIMIT 14`
      )
      .all(user.id) as { date: string; tokens: number; requests: number }[]

    // Model usage breakdown
    const models = db
      .prepare(
        `SELECT COALESCE(model, 'default') as model, SUM(tokens_used) as tokens, COUNT(*) as requests FROM usage_logs WHERE user_id = ? GROUP BY model ORDER BY tokens DESC LIMIT 10`
      )
      .all(user.id) as { model: string; tokens: number; requests: number }[]

    // User package daily token limit
    const userPkg = db
      .prepare(
        `SELECT p.daily_token_limit FROM "user" u LEFT JOIN packages p ON u.package_id = p.id OR u.packageId = p.id WHERE u.id = ?`
      )
      .get(user.id) as { daily_token_limit?: number } | undefined

    const dailyLimit = userPkg?.daily_token_limit || null
    const planName = isCustom ? 'Custom Router' : 'Standard Router'

    return NextResponse.json({
      used: todayRow?.used || 0,
      totalUsed: totalRow?.total || 0,
      dailyLimit,
      plan: planName,
      routerUrl: activeRouterUrl,
      isCustom,
      history: history || [],
      models: models || [],
      userName: user.name || '',
      userEmail: user.email || '',
    })
  } catch (err: any) {
    console.error('[API /api/usage Error]', err)
    if (err?.message === 'Unauthorized' || err?.status === 401) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return NextResponse.json(
      {
        used: 0,
        totalUsed: 0,
        dailyLimit: null,
        plan: 'Standard Router',
        routerUrl: 'https://router.bynara.id/v1',
        isCustom: false,
        history: [],
        models: [],
        error: err?.message || 'Failed to load usage statistics',
      },
      { status: 500 }
    )
  }
}
