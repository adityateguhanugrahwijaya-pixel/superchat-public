import test from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { getSessionDir, getSandboxRoot } from '../../lib/sandbox/paths'
import { processUserAttachments } from '../../lib/agent/uploads'
import { executeTool } from '../../lib/agent/tools/registry'
import { encodeSSEEvent, createSSEEventStream } from '../../lib/agent/stream/sse'
import { encodeLegacyEvent } from '../../lib/agent/stream/legacy'
import { AgentEvent } from '../../lib/agent/events'

const TEST_EMAIL = 'p7_test@example.com'
const TEST_CHAT_ID = 'chat_p7_cutover_001'

function setupTestDir(): string {
  return getSessionDir(TEST_EMAIL, TEST_CHAT_ID, true)
}

function cleanupTestDir() {
  try {
    const root = path.join(getSandboxRoot(), TEST_EMAIL)
    if (fs.existsSync(root)) {
      fs.rmSync(root, { recursive: true, force: true })
    }
  } catch {}
}

// ---------------------------------------------------------------------------
// 1. Binary Upload Hash Equality (Byte-for-byte fidelity)
// ---------------------------------------------------------------------------
test('P7.1: Binary PDF upload preserves byte-for-byte SHA256 integrity in uploads/ folder', async () => {
  cleanupTestDir()
  const sessionDir = setupTestDir()

  // Generate 64 KB of pseudorandom binary payload prefixed with %PDF-1.4 header
  const header = Buffer.from('%PDF-1.4\n%âãÏÓ\n')
  const randomBytes = crypto.randomBytes(65536)
  const fullPdfBuffer = Buffer.concat([header, randomBytes])
  const expectedHash = crypto.createHash('sha256').update(fullPdfBuffer).digest('hex')

  const base64Data = `data:application/pdf;base64,${fullPdfBuffer.toString('base64')}`
  const userContent = `[Attached File: sample_report.pdf]\n\`\`\`\n${base64Data}\n\`\`\`\n\nPlease analyze this document.`

  // Process through uploads pipeline
  const result = await processUserAttachments(TEST_EMAIL, TEST_CHAT_ID, userContent)

  const savedFilePath = path.join(sessionDir, 'uploads', 'sample_report.pdf')
  assert.ok(fs.existsSync(savedFilePath), 'File must exist in sandbox uploads/ directory')

  const savedBuffer = fs.readFileSync(savedFilePath)
  const actualHash = crypto.createHash('sha256').update(savedBuffer).digest('hex')

  assert.equal(actualHash, expectedHash, 'SHA256 checksum must match input bytes exactly')
  assert.equal(savedBuffer.length, fullPdfBuffer.length, 'Byte length must be identical')
  assert.ok(result.processedContent.includes('[User Attached Workspace File: uploads/sample_report.pdf'))
})

test('P7.2: Binary PNG image upload preserves byte-for-byte SHA256 integrity in uploads/ folder', async () => {
  const sessionDir = setupTestDir()

  // Generate PNG magic bytes followed by random data
  const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const randomPayload = crypto.randomBytes(32768)
  const pngBuffer = Buffer.concat([pngHeader, randomPayload])
  const expectedHash = crypto.createHash('sha256').update(pngBuffer).digest('hex')

  const base64Data = `data:image/png;base64,${pngBuffer.toString('base64')}`
  const userContent = `[Attached File: diagram.png]\n\`\`\`\n${base64Data}\n\`\`\`\n\nDiagram for reference.`

  await processUserAttachments(TEST_EMAIL, TEST_CHAT_ID, userContent)

  const savedFilePath = path.join(sessionDir, 'uploads', 'diagram.png')
  assert.ok(fs.existsSync(savedFilePath))

  const savedBuffer = fs.readFileSync(savedFilePath)
  const actualHash = crypto.createHash('sha256').update(savedBuffer).digest('hex')

  assert.equal(actualHash, expectedHash, 'PNG SHA256 checksum must match input bytes')
  assert.equal(savedBuffer.length, pngBuffer.length)
})

// ---------------------------------------------------------------------------
// 2. High-Risk Tool Approval Broker & Execution Lifecycle
// ---------------------------------------------------------------------------
test('P7.3: Destructive removal requires approval before execution', async () => {
  const sessionDir = setupTestDir()
  const targetFile = path.join(sessionDir, 'obsolete.txt')
  fs.writeFileSync(targetFile, 'temporary data to delete')

  // Step A: Attempt execution without approval -> blocked requiring confirmation
  const unapprovedResult = await executeTool(
    TEST_EMAIL,
    TEST_CHAT_ID,
    'execute_command',
    { command: 'rm obsolete.txt' },
    undefined,
    false // approved: false
  )

  assert.equal(unapprovedResult.success, false)
  assert.equal(unapprovedResult.requiresApproval, true)
  assert.ok(unapprovedResult.approvalReason?.includes('Destructive Removal'))
  assert.ok(fs.existsSync(targetFile), 'Target file must NOT be deleted without approval')

  // Step B: Attempt delete_file tool without approval
  const unapprovedDeleteTool = await executeTool(
    TEST_EMAIL,
    TEST_CHAT_ID,
    'delete_file',
    { path: 'obsolete.txt' },
    undefined,
    false
  )

  assert.equal(unapprovedDeleteTool.success, false)
  assert.equal(unapprovedDeleteTool.requiresApproval, true)
  assert.ok(fs.existsSync(targetFile), 'Target file must still exist')

  // Step C: Execution with user approval (`approved = true`) -> succeeds
  const approvedResult = await executeTool(
    TEST_EMAIL,
    TEST_CHAT_ID,
    'delete_file',
    { path: 'obsolete.txt' },
    undefined,
    true // approved: true
  )

  assert.equal(approvedResult.success, true)
  assert.ok(!fs.existsSync(targetFile), 'Target file must now be deleted')
})

test('P7.4: Legacy stream encoder serializes approval-required marker for frontend ApprovalCard', () => {
  const event: AgentEvent = {
    type: 'approval-required',
    toolName: 'execute_command',
    params: { command: 'rm -rf ./build' },
    reason: 'Destructive Removal: Requesting confirmation to execute rm -rf ./build',
  }

  const encoded = encodeLegacyEvent(event)
  assert.ok(encoded.includes('<!-- approval_required:'))
  assert.ok(encoded.includes('"toolName":"execute_command"'))
  assert.ok(encoded.includes('> ⚠️ **Approval Required:**'))
})

// ---------------------------------------------------------------------------
// 3. Server-Sent Events (SSE) Stream Formatter & Protocol Tests
// ---------------------------------------------------------------------------
test('P7.5: encodeSSEEvent conforms to W3C Server-Sent Events standard', () => {
  const textEvent: AgentEvent = {
    type: 'text-delta',
    text: 'Hello world from SSE!',
  }
  const sseChunk = encodeSSEEvent(textEvent)
  assert.equal(sseChunk, 'event: text-delta\ndata: {"type":"text-delta","text":"Hello world from SSE!"}\n\n')

  const toolEvent: AgentEvent = {
    type: 'tool-call',
    id: 'call_123',
    name: 'read_file',
    args: { path: 'data.txt' },
  }
  const toolChunk = encodeSSEEvent(toolEvent)
  assert.ok(toolChunk.startsWith('event: tool-call\n'))
  assert.ok(toolChunk.endsWith('\n\n'))
  assert.ok(toolChunk.includes('"call_123"'))

  const approvalEvent: AgentEvent = {
    type: 'approval-required',
    toolName: 'delete_file',
    params: { path: 'temp.log' },
    reason: 'Confirm deletion',
  }
  const approvalChunk = encodeSSEEvent(approvalEvent)
  assert.ok(approvalChunk.startsWith('event: approval-required\n'))
  assert.ok(approvalChunk.includes('"toolName":"delete_file"'))
})

test('P7.6: createSSEEventStream streams events asynchronously to client', async () => {
  async function* mockEvents(): AsyncGenerator<AgentEvent, void, unknown> {
    yield { type: 'turn-start', turn: 1 }
    yield { type: 'text-delta', text: 'Processing your request...' }
    yield { type: 'done', reason: 'completed' }
  }

  const sseStream = createSSEEventStream(mockEvents())
  const reader = sseStream.getReader()
  const decoder = new TextDecoder()
  let output = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    output += decoder.decode(value)
  }

  assert.ok(output.includes('event: turn-start\n'))
  assert.ok(output.includes('event: text-delta\n'))
  assert.ok(output.includes('event: done\n'))
  assert.ok(output.includes('"reason":"completed"'))
})
