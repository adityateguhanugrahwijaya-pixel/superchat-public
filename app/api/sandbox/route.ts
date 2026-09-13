import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/session'
import { assessToolSafety } from '@/lib/sandbox/safety'
import { executeSandboxTool } from '@/lib/sandbox/executor'
import { isUserSandboxEnabled } from '@/lib/sandbox'

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser()

    if (!isUserSandboxEnabled(user.id)) {
      return NextResponse.json(
        { error: 'Isolated Sandbox system is disabled for your account or by server administrator.' },
        { status: 403 }
      )
    }

    const body = await request.json().catch(() => ({}))

    const { chatId, toolName, params, approved } = body

    if (!chatId || !toolName) {
      return NextResponse.json({ error: 'Missing chatId or toolName' }, { status: 400 })
    }

    const safety = assessToolSafety(toolName, params || {})

    // Strictly block forbidden commands like sudo / privilege elevation
    if (safety.blocked) {
      return NextResponse.json(
        { error: safety.reason || 'Security Violation: Elevating privileges with sudo or root commands is strictly forbidden.' },
        { status: 403 }
      )
    }

    // If file removal or high risk action and not approved by user yet, require 1-min user confirmation
    if (safety.requiresApproval && !approved) {
      return NextResponse.json({
        requiresApproval: true,
        riskLevel: safety.riskLevel,
        reason: safety.reason,
        toolName,
        params,
        timeoutSeconds: 60,
      })
    }

    // Execute tool inside user's chat sandbox
    const result = await executeSandboxTool(user.email, chatId, toolName, params || {})
    return NextResponse.json(result)
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Unauthorized or execution error' }, { status: 500 })
  }
}
