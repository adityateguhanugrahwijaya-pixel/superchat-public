import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/session'
import { checkLatestUpdate, executeUpdateProcess, getCurrentVersion } from '@/lib/updater'

export async function GET() {
  try {
    await requireUser()
    const updateInfo = await checkLatestUpdate()
    return NextResponse.json(updateInfo)
  } catch (err: any) {
    return NextResponse.json(
      {
        hasUpdate: false,
        currentVersion: getCurrentVersion(),
        latestVersion: getCurrentVersion(),
        error: err?.message || 'Failed to check for updates',
      },
      { status: 200 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser()
    if (user.role !== 'admin') {
      return NextResponse.json({ error: 'Only admin users can trigger application updates.' }, { status: 403 })
    }

    const body = await request.json().catch(() => ({}))
    let downloadUrl = String(body.downloadUrl || '').trim()
    const checksumSha256 = body.checksumSha256 ? String(body.checksumSha256).trim() : undefined

    if (!downloadUrl) {
      const updateInfo = await checkLatestUpdate()
      downloadUrl = updateInfo.downloadUrl
    }

    if (!downloadUrl) {
      return NextResponse.json({ error: 'No download URL available for update.' }, { status: 400 })
    }

    const result = await executeUpdateProcess(downloadUrl, checksumSha256)
    return NextResponse.json(result)
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to execute update' }, { status: 500 })
  }
}
