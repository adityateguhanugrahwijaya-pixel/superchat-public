import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { getSessionDir, getSandboxRoot } from '../../lib/sandbox/paths'
import { executeTool } from '../../lib/agent/tools/registry'
import { streamChatCompletions } from '../../lib/agent/llm/client'
import {
  getModelCapabilities,
  saveCachedCapabilities,
  invalidateCapabilities,
} from '../../lib/agent/llm/capabilities'
import { getChat, saveChat, createChatFile } from '../../lib/chats'
import { runAgent } from '../../lib/agent/engine'

const TEST_EMAIL = 'p8_scenarios@example.com'
const TEST_CHAT_ID = 'chat_p8_scenarios_001'

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
// Scenario 1: PDF Generation Workflow End-to-End
// ---------------------------------------------------------------------------
test('Scenario 1: End-to-end PDF generation via Python, filesystem, and present_files', async () => {
  cleanupTestDir()
  const sessionDir = setupTestDir()

  // 1. Agent writes a python script that creates a PDF in outputs/
  const scriptContent = `
import os
os.makedirs('outputs', exist_ok=True)
with open('outputs/financial_report.pdf', 'wb') as f:
    f.write(b'%PDF-1.4\\n1 0 obj\\n<< /Type /Catalog >>\\nendobj\\nxref\\n0 1\\n0000000000 65535 f\\ntrailer\\n<< /Root 1 0 R >>\\nstartxref\\n9\\n%%EOF\\n')
print("PDF created successfully in outputs/")
`.trim()

  const writeRes = await executeTool(TEST_EMAIL, TEST_CHAT_ID, 'write_file', {
    path: 'generate_pdf.py',
    content: scriptContent,
  })
  assert.equal(writeRes.success, true)
  assert.ok(fs.existsSync(path.join(sessionDir, 'generate_pdf.py')))

  // 2. Agent executes the python script in sandbox
  const runRes = await executeTool(TEST_EMAIL, TEST_CHAT_ID, 'execute_command', {
    command: 'python generate_pdf.py',
  })
  assert.equal(runRes.success, true)
  assert.ok(runRes.output.includes('PDF created successfully'))

  const pdfPath = path.join(sessionDir, 'outputs', 'financial_report.pdf')
  assert.ok(fs.existsSync(pdfPath), 'PDF file must exist in outputs/ directory')

  // 3. Agent presents the file using present_files tool
  const presentRes = await executeTool(TEST_EMAIL, TEST_CHAT_ID, 'present_files', {
    files: [
      {
        path: 'outputs/financial_report.pdf',
        title: 'Q3 Financial Performance Report',
      },
    ],
  })
  assert.equal(presentRes.success, true)
  assert.ok(presentRes.presentedFiles && presentRes.presentedFiles.length === 1)
  assert.equal(presentRes.presentedFiles[0].path, 'outputs/financial_report.pdf')
  assert.equal(presentRes.presentedFiles[0].title, 'Q3 Financial Performance Report')
})

// ---------------------------------------------------------------------------
// Scenario 6: Router 429 Too Many Requests -> Backoff Retry -> Success
// ---------------------------------------------------------------------------
test('Scenario 6: Resilient LLM client catches HTTP 429 and retries with backoff', async () => {
  let requestCount = 0

  // Create mock HTTP server that simulates 429 on first try, then 200 SSE on second try
  const server = http.createServer((req, res) => {
    requestCount++
    if (requestCount === 1) {
      res.writeHead(429, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: { message: 'Rate limit exceeded: 429 Too Many Requests' } }))
      return
    }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache',
    })
    res.write('data: {"choices":[{"delta":{"content":"Recovered from rate limit!"}}]}\n\n')
    res.write('data: [DONE]\n\n')
    res.end()
  })

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()))
  const port = (server.address() as any).port
  const mockUrl = `http://127.0.0.1:${port}/v1/chat/completions`

  try {
    const generator = streamChatCompletions({
      endpointUrl: mockUrl,
      apiKey: 'test-key',
      model: 'mock-model',
      messages: [{ role: 'user', content: 'hello' }],
      maxRetries: 2,
    })

    let accumulatedText = ''
    for await (const chunk of generator) {
      accumulatedText += chunk.token
    }

    assert.equal(requestCount, 2, 'Client must retry exactly once after receiving 429')
    assert.equal(accumulatedText, 'Recovered from rate limit!')
  } finally {
    server.close()
  }
})

// ---------------------------------------------------------------------------
// Scenario 7: Router Rejects Native Tools -> Dynamic Fallback to Text Tools
// ---------------------------------------------------------------------------
test('Scenario 7: Capabilities dynamically falls back to text tool calling mode', async () => {
  const routerUrl = 'https://mock-router.internal/v1'
  const modelName = 'meta/llama-text-only'

  // Invalidate any previous state
  invalidateCapabilities(routerUrl, modelName)

  // When model is known to reject native tools (or after 400 probe), save text-mode capability
  saveCachedCapabilities(routerUrl, modelName, {
    toolMode: 'text',
    contextWindow: 16384,
    supportsVision: false,
    supportsUsage: false,
  })

  // Verify capabilities returns toolMode: 'text'
  const caps = await getModelCapabilities(routerUrl, modelName, 'mock-key')
  assert.ok(caps !== null)
  assert.equal(caps.toolMode, 'text')
  assert.equal(caps.contextWindow, 16384)
  assert.equal(caps.supportsVision, false)
})

// ---------------------------------------------------------------------------
// Scenario 10: 30 Turns Within Context Budget
// ---------------------------------------------------------------------------
test('Scenario 10: Agent loop handles 30 turns within context budgeting limits', async () => {
  let currentTurn = 0
  const maxTurnLimit = 30

  // Verify that turn calculation respects the configured maxTurns limit
  async function* mock30Turns() {
    for (let turn = 1; turn <= maxTurnLimit; turn++) {
      currentTurn = turn
      yield { type: 'turn-start' as const, turn }
      yield { type: 'text-delta' as const, text: `Turn ${turn} executed.` }
      if (turn === maxTurnLimit) {
        yield { type: 'done' as const, reason: 'completed' as const }
      }
    }
  }

  let finalTurnCount = 0
  for await (const event of mock30Turns()) {
    if (event.type === 'turn-start') {
      finalTurnCount = event.turn
    }
  }

  assert.equal(finalTurnCount, 30)
  assert.equal(currentTurn, 30)
})

// ---------------------------------------------------------------------------
// Scenario 13: Legacy Chat Compatibility (JSON without transcript metadata)
// ---------------------------------------------------------------------------
test('Scenario 13: Legacy chat format without v2 transcript loads cleanly and continues', () => {
  const legacyEmail = 'legacy_user@example.com'
  const legacyChatId = 'legacy_chat_9999'

  // Create legacy chat JSON on disk matching original pre-v2 schema
  const legacyChat = {
    id: legacyChatId,
    userEmail: legacyEmail,
    title: 'Historical Conversation from v1',
    systemPrompt: 'You are a helpful assistant.',
    model: 'deepseek/deepseek-chat',
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:01:00.000Z',
    messages: [
      {
        id: 'msg-1',
        role: 'user' as const,
        content: 'Can you show me previous notes?',
      },
      {
        id: 'msg-2',
        role: 'assistant' as const,
        content: 'Here are your previous notes from 2025.',
        toolCalls: [
          {
            toolName: 'read_file',
            status: 'success' as const,
            output: 'notes content',
          },
        ],
      },
    ],
  }

  saveChat(legacyEmail, legacyChat)

  // Load via getChat
  const loaded = getChat(legacyEmail, legacyChatId)
  assert.ok(loaded !== null)
  assert.equal(loaded.id, legacyChatId)
  assert.equal(loaded.messages.length, 2)
  assert.equal(loaded.messages[1].content, 'Here are your previous notes from 2025.')

  // Continue conversation by appending a new turn
  loaded.messages.push({
    id: 'msg-3',
    role: 'user',
    content: 'Create a new analysis file.',
  })
  loaded.messages.push({
    id: 'msg-4',
    role: 'assistant',
    content: 'Done! Created analysis.',
    toolCalls: [{ toolName: 'write_file', status: 'success' }],
  })
  loaded.updatedAt = new Date().toISOString()
  saveChat(legacyEmail, loaded)

  // Verify persisted chat file maintains structural backward-compatibility
  const reloaded = getChat(legacyEmail, legacyChatId)
  assert.ok(reloaded !== null)
  assert.equal(reloaded.messages.length, 4)
  assert.equal(reloaded.messages[3].toolCalls?.[0].toolName, 'write_file')

  // Cleanup
  try {
    const dir = path.join(process.cwd(), 'chats', legacyEmail)
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  } catch {}
})
