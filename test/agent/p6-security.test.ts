import test from 'node:test'
import assert from 'node:assert/strict'
import { parseBashCommand, analyzeCommandSafety } from '../../lib/sandbox/tokenizer'
import { assessToolSafety } from '../../lib/sandbox/safety'
import {
  isDomainAllowed,
  getNetworkEnv,
  startSandboxProxy,
  stopSandboxProxy,
} from '../../lib/sandbox/network'
import http from 'node:http'

// ---------------------------------------------------------------------------
// 1. Bash AST Lexer / Tokenizer Tests
// ---------------------------------------------------------------------------
test('P6.1: parseBashCommand handles pipes, chains, and semicolons', () => {
  const cmd = 'echo "hello" | grep hello && ls -la ; pwd'
  const parsed = parseBashCommand(cmd)

  assert.equal(parsed.length, 4)
  assert.equal(parsed[0].executable, 'echo')
  assert.deepEqual(parsed[0].args, ['hello'])

  assert.equal(parsed[1].executable, 'grep')
  assert.deepEqual(parsed[1].args, ['hello'])

  assert.equal(parsed[2].executable, 'ls')
  assert.deepEqual(parsed[2].args, ['-la'])

  assert.equal(parsed[3].executable, 'pwd')
  assert.deepEqual(parsed[3].args, [])
})

test('P6.2: parseBashCommand handles env var prefixes and wrappers', () => {
  const cmd1 = 'NODE_ENV=production FOO=bar node server.js'
  const parsed1 = parseBashCommand(cmd1)
  assert.equal(parsed1.length, 1)
  assert.equal(parsed1[0].executable, 'node')
  assert.deepEqual(parsed1[0].args, ['server.js'])

  const cmd2 = 'env -i VAR=val rm file.txt'
  const parsed2 = parseBashCommand(cmd2)
  assert.equal(parsed2.length, 1)
  assert.equal(parsed2[0].executable, 'rm')
  assert.deepEqual(parsed2[0].args, ['file.txt'])
})

test('P6.3: parseBashCommand extracts subcommands in $() and backticks', () => {
  const cmd = 'echo $(cat secret.txt) `whoami`'
  const parsed = parseBashCommand(cmd)

  assert.equal(parsed.length, 1)
  assert.equal(parsed[0].executable, 'echo')
  assert.equal(parsed[0].subcommands.length, 2)
  assert.equal(parsed[0].subcommands[0].executable, 'cat')
  assert.equal(parsed[0].subcommands[1].executable, 'whoami')
})

// ---------------------------------------------------------------------------
// 2. Command Safety & False-Positive Prevention Tests
// ---------------------------------------------------------------------------
test('P6.4: Zero false-positives on strings and commit messages containing "rm" or "del"', () => {
  const falsePositiveCases = [
    'git commit -m "del model weights and update rm utils"',
    'echo "rm -rf / will delete everything"',
    'python process.py --mode="rm" --query="del item"',
    'grep "del" report.txt',
  ]

  for (const cmd of falsePositiveCases) {
    const verdict = analyzeCommandSafety(cmd)
    assert.equal(verdict.blocked, false, `Expected not blocked: ${cmd}`)
    assert.equal(verdict.requiresApproval, false, `Expected no approval needed: ${cmd}`)

    const safety = assessToolSafety('execute_command', { command: cmd })
    assert.equal(safety.requiresApproval, false, `Expected assessToolSafety to not require approval for: ${cmd}`)
  }
})

test('P6.5: Destructive removal commands accurately require approval', () => {
  const removalCases = [
    'rm -rf ./cache',
    'rm temp.txt',
    'rmdir old_dir',
    'del obsolete.log',
    'git clean -fd',
    'git reset --hard HEAD~1',
  ]

  for (const cmd of removalCases) {
    const verdict = analyzeCommandSafety(cmd)
    assert.equal(verdict.blocked, false, `Expected not strictly blocked: ${cmd}`)
    assert.equal(verdict.requiresApproval, true, `Expected requiresApproval for: ${cmd}`)

    const safety = assessToolSafety('execute_command', { command: cmd })
    assert.equal(safety.requiresApproval, true, `assessToolSafety should flag approval for: ${cmd}`)
    assert.equal(safety.riskLevel, 'high')
  }

  // delete_file tool call
  const deleteToolSafety = assessToolSafety('delete_file', { path: 'file.txt' })
  assert.equal(deleteToolSafety.requiresApproval, true)
  assert.equal(deleteToolSafety.riskLevel, 'high')
})

test('P6.6: Strictly forbidden commands are blocked with clear security reasons', () => {
  const forbiddenCases = [
    'sudo apt update',
    'su root',
    'doas ls',
    'pkexec bash',
    'reboot',
    'shutdown -r now',
    'chmod 777 script.sh',
    'dd if=/dev/zero of=/dev/sda bs=1M',
    'echo payload > /dev/nvme0n1',
    'echo test && sudo rm -rf /',
    'echo $(sudo cat /etc/shadow)',
  ]

  for (const cmd of forbiddenCases) {
    const verdict = analyzeCommandSafety(cmd)
    assert.equal(verdict.blocked, true, `Expected blocked for: ${cmd}`)
    assert.ok(verdict.reason?.includes('Security Violation'), `Expected reason for: ${cmd}`)

    const safety = assessToolSafety('execute_command', { command: cmd })
    assert.equal(safety.blocked, true, `assessToolSafety should flag blocked for: ${cmd}`)
  }

  // Harmless /dev/null redirect must NOT be blocked
  const nullRedirect = 'ls -la 2>/dev/null'
  const verdictNull = analyzeCommandSafety(nullRedirect)
  assert.equal(verdictNull.blocked, false, 'Redirect to /dev/null must not be blocked')
})

// ---------------------------------------------------------------------------
// 3. Network Policy & Allowlist Tests
// ---------------------------------------------------------------------------
test('P6.7: isDomainAllowed validates external domains vs private/LAN targets', () => {
  // Allowed public domains
  assert.equal(isDomainAllowed('pypi.org'), true)
  assert.equal(isDomainAllowed('files.pythonhosted.org'), true)
  assert.equal(isDomainAllowed('registry.npmjs.org'), true)
  assert.equal(isDomainAllowed('github.com'), true)
  assert.equal(isDomainAllowed('raw.githubusercontent.com'), true)

  // Disallowed public domains
  assert.equal(isDomainAllowed('evil-phishing.com'), false)
  assert.equal(isDomainAllowed('example.org'), false)

  // Forbidden local / internal / cloud metadata IPs
  assert.equal(isDomainAllowed('localhost'), false)
  assert.equal(isDomainAllowed('127.0.0.1'), false)
  assert.equal(isDomainAllowed('169.254.169.254'), false) // AWS / GCP metadata
  assert.equal(isDomainAllowed('10.0.0.15'), false)
  assert.equal(isDomainAllowed('192.168.1.100'), false)
  assert.equal(isDomainAllowed('172.16.0.5'), false)
  assert.equal(isDomainAllowed('service.internal'), false)
  assert.equal(isDomainAllowed('cluster.local'), false)
})

test('P6.8: getNetworkEnv configures proxy isolation or full network off', () => {
  // Default open
  const openEnv = getNetworkEnv('open')
  assert.deepEqual(openEnv, {})

  // Policy off -> sets proxy null routes
  const offEnv = getNetworkEnv('off')
  assert.equal(offEnv.HTTP_PROXY, 'http://127.0.0.1:0')
  assert.equal(offEnv.HTTPS_PROXY, 'http://127.0.0.1:0')
  assert.equal(offEnv.ALL_PROXY, 'socks5://127.0.0.1:0')
})

test('P6.9: Sandbox HTTP forward proxy enforces domain filtering', async () => {
  const port = await startSandboxProxy(['example.com'])
  assert.ok(port > 0)

  // Verify proxy env generated with active port
  const proxyEnv = getNetworkEnv('proxy')
  assert.equal(proxyEnv.HTTP_PROXY, `http://127.0.0.1:${port}`)

  // Test 1: Requesting unauthorized domain via proxy returns 403 Forbidden
  const blockedRes = await new Promise<{ statusCode?: number; body: string }>((resolve, reject) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path: 'http://unauthorized.org/data',
        method: 'GET',
        headers: { Host: 'unauthorized.org' },
      },
      (res) => {
        let data = ''
        res.on('data', (c) => (data += c))
        res.on('end', () => resolve({ statusCode: res.statusCode, body: data }))
      }
    )
    req.on('error', reject)
    req.end()
  })

  assert.equal(blockedRes.statusCode, 403)
  assert.ok(blockedRes.body.includes('not in the allowlist'))

  stopSandboxProxy()
})
