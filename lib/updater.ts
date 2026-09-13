import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { spawn } from 'node:child_process'

const GITHUB_REPO = 'adityateguhanugrahwijaya-pixel/superchat-public'
const RELEASES_API_URL = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`

export type UpdateCheckResult = {
  hasUpdate: boolean
  currentVersion: string
  latestVersion: string
  releaseName: string
  releaseNotes: string
  publishedAt: string
  downloadUrl: string
  downloadSize: number
  isDifferential: boolean
  checksumSha256?: string
}

function parseSemVer(versionStr: string): number[] {
  const clean = versionStr.replace(/^v/i, '').split('-')[0]
  const parts = clean.split('.').map((p) => parseInt(p, 10) || 0)
  while (parts.length < 3) parts.push(0)
  return parts
}

function compareSemVer(v1: string, v2: string): number {
  const p1 = parseSemVer(v1)
  const p2 = parseSemVer(v2)
  for (let i = 0; i < 3; i++) {
    if (p1[i] < p2[i]) return -1
    if (p1[i] > p2[i]) return 1
  }
  return 0
}

function calculateVersionDifference(v1: string, v2: string): number {
  const p1 = parseSemVer(v1)
  const p2 = parseSemVer(v2)
  if (p1[0] !== p2[0] || p1[1] !== p2[1]) {
    return 2 // Major or minor change (2+ versions behind)
  }
  return Math.max(0, p2[2] - p1[2])
}

export function getCurrentVersion(): string {
  try {
    const pkgPath = path.join(process.cwd(), 'package.json')
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'))
      return pkg.version || '1.0.0'
    }
  } catch {}
  return '1.0.0'
}

export async function checkLatestUpdate(): Promise<UpdateCheckResult> {
  const currentVersion = getCurrentVersion()

  const response = await fetch(RELEASES_API_URL, {
    headers: {
      'User-Agent': 'SuperChat-AutoUpdater',
      Accept: 'application/vnd.github.v3+json',
    },
    cache: 'no-store',
  })

  if (!response.ok) {
    throw new Error(`GitHub API returned status ${response.status}`)
  }

  const releaseData = await response.json()
  const rawTag = String(releaseData.tag_name || '')
  const latestVersion = rawTag.replace(/^v/i, '')
  const hasUpdate = compareSemVer(currentVersion, latestVersion) < 0
  const versionDiff = calculateVersionDifference(currentVersion, latestVersion)

  let downloadUrl = ''
  let downloadSize = 0
  let isDifferential = true
  let checksumSha256: string | undefined

  const assets = Array.isArray(releaseData.assets) ? releaseData.assets : []
  const manifestAsset = assets.find((a: any) => a.name === 'update-manifest.json')

  // If 2+ versions behind or no manifest, default to full package, else differential update patch
  const targetPatchName = versionDiff >= 2 ? `-full.zip` : `-update.zip`
  let chosenAsset = assets.find((a: any) => a.name.includes(targetPatchName))

  if (!chosenAsset && assets.length > 0) {
    chosenAsset = assets.find((a: any) => a.name.endsWith('.zip')) || assets[0]
  }

  if (chosenAsset) {
    downloadUrl = chosenAsset.browser_download_url
    downloadSize = chosenAsset.size || 0
    isDifferential = chosenAsset.name.includes('-update.zip')
    if (chosenAsset.digest && chosenAsset.digest.startsWith('sha256:')) {
      checksumSha256 = chosenAsset.digest.replace('sha256:', '')
    }
  }

  return {
    hasUpdate,
    currentVersion,
    latestVersion,
    releaseName: releaseData.name || `SuperChat ${rawTag}`,
    releaseNotes: releaseData.body || 'New features and security improvements.',
    publishedAt: releaseData.published_at || new Date().toISOString(),
    downloadUrl,
    downloadSize,
    isDifferential,
    checksumSha256,
  }
}

export async function executeUpdateProcess(downloadUrl: string, expectedChecksum?: string): Promise<{ success: boolean; message: string }> {
  if (!downloadUrl) {
    throw new Error('Download URL is empty.')
  }

  const updatesDir = path.join(process.cwd(), '.updates')
  if (!fs.existsSync(updatesDir)) {
    fs.mkdirSync(updatesDir, { recursive: true })
  }

  const zipPath = path.join(updatesDir, 'latest.zip')

  // 1. Download Release Archive
  const res = await fetch(downloadUrl, {
    headers: { 'User-Agent': 'SuperChat-AutoUpdater' },
  })

  if (!res.ok || !res.body) {
    throw new Error(`Failed to download update package (HTTP ${res.status})`)
  }

  const buffer = Buffer.from(await res.arrayBuffer())
  fs.writeFileSync(zipPath, buffer)

  // 2. Verify SHA256 Checksum if provided
  if (expectedChecksum) {
    const hash = crypto.createHash('sha256').update(buffer).digest('hex')
    if (hash.toLowerCase() !== expectedChecksum.toLowerCase()) {
      fs.unlinkSync(zipPath)
      throw new Error(`Checksum mismatch! Downloaded file SHA256 does not match expected release hash.`)
    }
  }

  // 3. Determine OS Launcher Script
  const isWindows = process.platform === 'win32'
  const scriptName = isWindows ? 'update.bat' : 'update.sh'
  const scriptPath = path.join(process.cwd(), scriptName)

  if (!fs.existsSync(scriptPath)) {
    throw new Error(`Updater launcher script (${scriptName}) not found in root workspace.`)
  }

  // Ensure script is executable on Unix
  if (!isWindows) {
    try {
      fs.chmodSync(scriptPath, 0o755)
    } catch {}
  }

  // 4. Spawn Detached Process
  const child = isWindows
    ? spawn('cmd.exe', ['/c', scriptPath], {
        cwd: process.cwd(),
        detached: true,
        stdio: 'ignore',
      })
    : spawn('/bin/sh', [scriptPath], {
        cwd: process.cwd(),
        detached: true,
        stdio: 'ignore',
      })

  child.unref()

  // 5. Exit Main Node.js Process to release file locks
  setTimeout(() => {
    process.exit(0)
  }, 600)

  return { success: true, message: 'Update script spawned successfully. Application restarting...' }
}
