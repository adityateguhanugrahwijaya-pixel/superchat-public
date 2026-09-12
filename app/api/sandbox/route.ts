import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/session'
import { assessToolSafety } from '@/lib/sandbox/safety'
import { executeSandboxTool } from '@/lib/sandbox/executor'

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser()
    const body = await request.json().catch(() => ({}))

    const { chatId, toolName, params, approved } = body

    if (!chatId || !toolName) {
      return NextResponse.json({ error: 'Missing chatId or toolName' }, { status: 400 })
    }

    const safety = assessToolSafety(toolName, params || {})

    // If command is high risk and not approved by user yet, require approval
    if (safety.requiresApproval && !approved) {
      return NextResponse.json({
        requiresApproval: true,
        riskLevel: safety.riskLevel,
        reason: safety.reason,
        toolName,
        params,
      })
    }

    // Execute tool inside user's chat sandbox
    const result = await executeSandboxTool(user.email, chatId, toolName, params || {})
    return NextResponse.json(result)
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Unauthorized or execution error' }, { status: 500 })
  }
}
