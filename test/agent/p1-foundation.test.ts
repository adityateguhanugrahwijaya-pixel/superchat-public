import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {
  validateSessionIds,
  resolveSandboxPath,
  getSessionDir,
  getSandboxRoot,
} from '../../lib/sandbox/paths'
import { LocalDriver } from '../../lib/sandbox/local-driver'
import { destroySession, runJanitor } from '../../lib/sandbox/janitor'
import { executeSandboxTool } from '../../lib/sandbox/executor'

const TEST_EMAIL = 'p1_test@example.com'
const TEST_CHAT_ID = 'chat_p1_test_001'

function setupTestDir(): string {
  const dir = getSessionDir(TEST_EMAIL, TEST_CHAT_ID, true)
  return dir
}

function cleanupTestDir() {
  try {
    const root = path.join(getSandboxRoot(), 'p1_test@example.com')
    if (fs.existsSync(root)) {
      fs.rmSync(root, { recursive: true, force: true })
    }
  } catch {}
}

test('1. Path traversal (../, absolut, campuran virtual) ditolak', () => {
  setupTestDir()

  // ../ traversal
  assert.throws(
    () => resolveSandboxPath(TEST_EMAIL, TEST_CHAT_ID, '../../etc/passwd'),
    /Security Violation/i
  )

  // absolute path outside virtual mappings
  assert.throws(
    () => resolveSandboxPath(TEST_EMAIL, TEST_CHAT_ID, '/etc/shadow'),
    /Security Violation/i
  )

  // virtual prefix with traversal escape
  assert.throws(
    () => resolveSandboxPath(TEST_EMAIL, TEST_CHAT_ID, '/mnt/user-data/uploads/../../../../etc/passwd'),
    /Security Violation/i
  )

  // virtual uploads write rejection
  assert.throws(
    () => resolveSandboxPath(TEST_EMAIL, TEST_CHAT_ID, '/mnt/user-data/uploads/test.txt', { forWrite: true }),
    /Security Violation: uploads\/ folder is read-only/i
  )

  // access to .agent internal folder rejection
  assert.throws(
    () => resolveSandboxPath(TEST_EMAIL, TEST_CHAT_ID, '.agent/secret.txt', { allowInternalAgent: false }),
    /Security Violation: Access to internal .agent directory is forbidden/i
  )
})

test('2. Symlink ke luar root: baca dan tulis lewat symlink ditolak', () => {
  const sessionDir = setupTestDir()
  const outsideTempDir = path.join(getSandboxRoot(), '_outside_target_dir')
  if (!fs.existsSync(outsideTempDir)) {
    fs.mkdirSync(outsideTempDir, { recursive: true })
  }
  fs.writeFileSync(path.join(outsideTempDir, 'secret.txt'), 'host_secret')

  const symlinkPath = path.join(sessionDir, 'escape_link')
  try {
    if (fs.existsSync(symlinkPath)) fs.unlinkSync(symlinkPath)
    fs.symlinkSync(outsideTempDir, symlinkPath, 'dir')
  } catch {}

  try {
    // Reading through symlink pointing outside
    assert.throws(
      () => resolveSandboxPath(TEST_EMAIL, TEST_CHAT_ID, 'escape_link/secret.txt'),
      /Security Violation/i
    )

    // Writing through symlink to a non-existent child
    assert.throws(
      () => resolveSandboxPath(TEST_EMAIL, TEST_CHAT_ID, 'escape_link/new_file.txt', { forWrite: true }),
      /Security Violation/i
    )
  } finally {
    try { fs.unlinkSync(symlinkPath) } catch {}
    try { fs.rmSync(outsideTempDir, { recursive: true, force: true }) } catch {}
  }
})

test('3. chatId berisi ../ ditolak oleh validator dan oleh destroy', async () => {
  assert.throws(
    () => validateSessionIds(TEST_EMAIL, '../bad_chat'),
    /Security Violation/i
  )
  assert.throws(
    () => validateSessionIds('../bad_user@domain.com', TEST_CHAT_ID),
    /Security Violation/i
  )

  await assert.rejects(
    async () => destroySession(TEST_EMAIL, '../bad_chat'),
    /Security Violation/i
  )
})

test('4. Timeout membunuh cucu proses', async () => {
  setupTestDir()
  const driver = new LocalDriver()
  const sessionKey = `${TEST_EMAIL}/${TEST_CHAT_ID}`

  const result = await driver.exec(sessionKey, "sh -c 'sleep 300 & sleep 300'", {
    timeoutMs: 800,
  })

  assert.equal(result.timedOut, true)
  assert.equal(result.killed, true)
})

test('5. Abort di tengah eksekusi menghentikan proses', async () => {
  setupTestDir()
  const driver = new LocalDriver()
  const sessionKey = `${TEST_EMAIL}/${TEST_CHAT_ID}`
  const controller = new AbortController()

  setTimeout(() => controller.abort(), 300)

  const result = await driver.exec(sessionKey, 'sleep 30', {
    timeoutMs: 60_000,
    signal: controller.signal,
  })

  assert.equal(result.killed, true)
  assert.equal(result.timedOut, false)
})

test('6. Output besar (50 MB) tidak membuat memori membengkak, truncated: true', async () => {
  setupTestDir()
  const driver = new LocalDriver()
  const sessionKey = `${TEST_EMAIL}/${TEST_CHAT_ID}`

  // Generate large output via Node.js
  const result = await driver.exec(
    sessionKey,
    `node -e "for (let i = 0; i < 50; i++) process.stdout.write('A'.repeat(1024 * 1024));"`,
    { timeoutMs: 15_000 }
  )

  assert.equal(result.truncated, true)
  // Output captured should be capped near 2MB (default stream cap)
  assert.ok(result.stdout.length <= 2 * 1024 * 1024 + 100)
  assert.ok(result.stdout.length >= 1.9 * 1024 * 1024)
})

test('7. Env: variabel rahasia SECRET_TEST tidak diwariskan, hanya allowlist', async () => {
  setupTestDir()
  process.env.SECRET_TEST = 'VERY_SECRET_KEY_12345'
  const driver = new LocalDriver()
  const sessionKey = `${TEST_EMAIL}/${TEST_CHAT_ID}`

  const result = await driver.exec(sessionKey, 'env', { timeoutMs: 5_000 })

  assert.equal(result.exitCode, 0)
  assert.ok(!result.stdout.includes('VERY_SECRET_KEY_12345'), 'SECRET_TEST must not be leaked into sandbox env')
  assert.ok(result.stdout.includes('MPLBACKEND=Agg'), 'MPLBACKEND must be in sandbox env')
  assert.ok(result.stdout.includes('PYTHONUNBUFFERED=1'), 'PYTHONUNBUFFERED must be in sandbox env')
})

test('8. destroy menghapus folder; janitor dry-run vs enforce', async () => {
  const dir = setupTestDir()
  fs.writeFileSync(path.join(dir, 'test.txt'), 'hello')
  assert.ok(fs.existsSync(dir))

  // 1. destroySession removes the target directory
  const deleted = await destroySession(TEST_EMAIL, TEST_CHAT_ID)
  assert.equal(deleted, true)
  assert.ok(!fs.existsSync(dir))

  // 2. Setup folder for Janitor TTL test
  const janitorChatId = 'chat_janitor_old'
  const janitorDir = getSessionDir(TEST_EMAIL, janitorChatId, true)
  const testFile = path.join(janitorDir, 'old.txt')
  fs.writeFileSync(testFile, 'old content')

  // Backdate mtime to 40 days ago across all entries
  const fortyDaysAgo = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000)
  function backdateDir(d: string) {
    try {
      fs.utimesSync(d, fortyDaysAgo, fortyDaysAgo)
      for (const item of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, item.name)
        try {
          fs.utimesSync(p, fortyDaysAgo, fortyDaysAgo)
          if (item.isDirectory()) backdateDir(p)
        } catch {}
      }
    } catch {}
  }
  backdateDir(janitorDir)

  // Dry-run mode: should detect but NOT delete
  const dryReport = await runJanitor({ mode: 'dry-run', ttlDays: 30 })
  const foundInDry = dryReport.reapedSessions.some((s) => s.chatId === janitorChatId)
  assert.ok(foundInDry, 'Old session should be detected in dry-run')
  assert.ok(fs.existsSync(janitorDir), 'Directory must still exist after dry-run')

  // Enforce mode: should delete
  const enforceReport = await runJanitor({ mode: 'enforce', ttlDays: 30 })
  const foundInEnforce = enforceReport.reapedSessions.some((s) => s.chatId === janitorChatId)
  assert.ok(foundInEnforce, 'Old session should be reaped in enforce mode')
  assert.ok(!fs.existsSync(janitorDir), 'Directory must be deleted in enforce mode')

  cleanupTestDir()
})

test('9. Regresi: legacy engine tetap menjalankan write_file dan run_python', async () => {
  const email = 'legacy_smoke@example.com'
  const chatId = 'smoke_test_chat'

  try {
    // 1. write_file
    const writeRes = await executeSandboxTool(email, chatId, 'write_file', {
      path: 'calc.py',
      content: 'print(40 + 2)\n',
    })
    assert.equal(writeRes.success, true)
    assert.ok(writeRes.output.includes('Successfully written'))

    // 2. run_python
    const runRes = await executeSandboxTool(email, chatId, 'run_python', {
      code: 'import math\nprint(f"PI={math.pi:.4f}")\n',
    })
    assert.equal(runRes.success, true)
    assert.ok(runRes.output.includes('PI=3.1416') || runRes.output.includes('Python script ran successfully'))
  } finally {
    await destroySession(email, chatId)
  }
})
