import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import {
  createToolCallFilter,
  cleanAssistantContent,
  extractTextToolCalls,
} from '../../lib/agent/llm/toolcall-text'
import { runAgent } from '../../lib/agent/engine'
import { AgentEvent } from '../../lib/agent/events'
import { getSessionDir } from '../../lib/sandbox/paths'

// ---------------------------------------------------------------------------
// 1. Streaming Tool Call Filter Tests
// ---------------------------------------------------------------------------

test('P9.1: createToolCallFilter suppresses single-chunk tool_call block', () => {
  const filter = createToolCallFilter()
  const raw = 'I will read the file.\n```tool_call\n{"tool": "read_file", "params": {"path": "test.txt"}}\n```\nHere is your result.'
  const output = filter.push(raw) + filter.flush()
  assert.equal(output.includes('```tool_call'), false)
  assert.equal(output.includes('read_file'), false)
  assert.equal(output.includes('I will read the file.'), true)
  assert.equal(output.includes('Here is your result.'), true)
})

test('P9.2: createToolCallFilter suppresses multi-chunk streaming tool_call block across boundaries', () => {
  const filter = createToolCallFilter()
  const chunks = [
    'Let me check.\n\n',
    '``',
    '`tool',
    '_call\n',
    '{"tool":',
    ' "pdf"',
    ', "params": {"file": "doc.pdf"}}',
    '\n``',
    '`\n\n',
    'Finished checking.',
  ]

  let output = ''
  for (const chunk of chunks) {
    output += filter.push(chunk)
  }
  output += filter.flush()

  assert.equal(output.includes('```tool_call'), false)
  assert.equal(output.includes('"tool": "pdf"'), false)
  assert.equal(output.includes('Let me check.'), true)
  assert.equal(output.includes('Finished checking.'), true)
})

test('P9.3: createToolCallFilter preserves regular non-tool code blocks and inline code', () => {
  const filter = createToolCallFilter()
  const raw =
    'Here is some Python code:\n```python\nimport os\nprint("hello")\n```\nAnd check `config.json` for details.'
  const output = filter.push(raw) + filter.flush()

  assert.equal(output, raw)
})

test('P9.4: createToolCallFilter suppresses XML <tool_call> tags', () => {
  const filter = createToolCallFilter()
  const raw =
    'Processing now... <tool_call>\n{"tool": "execute_command", "params": {"command": "ls"}}\n</tool_call>\nDone!'
  const output = filter.push(raw) + filter.flush()

  assert.equal(output.includes('<tool_call>'), false)
  assert.equal(output.includes('execute_command'), false)
  assert.equal(output.includes('Processing now...'), true)
  assert.equal(output.includes('Done!'), true)
})

test('P9.5: createToolCallFilter discards unclosed tool call at EOF', () => {
  const filter = createToolCallFilter()
  const raw = 'Starting task: ```tool_call\n{"tool": "run_python", "code": "print(1'
  const output = filter.push(raw) + filter.flush()

  assert.equal(output.includes('```tool_call'), false)
  assert.equal(output.includes('run_python'), false)
  assert.equal(output.trim(), 'Starting task:')
})

// ---------------------------------------------------------------------------
// 2. Delimiter-Aware cleanAssistantContent Tests
// ---------------------------------------------------------------------------

test('P9.6: cleanAssistantContent strips nested code blocks in tool outputs (User Request 8 leak case)', () => {
  const rawWithNestedFences = `\`\`\`tool_call
{
  "tool": "read_file",
  "params": {
    "path": "/skills/pdf/SKILL.md"
  }
}
\`\`\`

> 🛠️ **Executing Tool:** \`read_file\`...

> ✅ **Output:**
\`\`\`
---
name: pdf
description: Use this skill...
---

# PDF Guide

\`\`\`python
from pypdf import PdfReader, PdfWriter
reader = PdfReader("document.pdf")
\`\`\`

\`\`\`python
from reportlab.lib.pagesizes import letter
c = canvas.Canvas("hello.pdf")
\`\`\`
\`\`\`

\`\`\`tool_call
{
  "tool": "execute_command",
  "params": {
    "command": "python -c 'print(1)'"
  }
}
\`\`\`

> 🛠️ **Executing Tool:** \`execute_command\`...

> ✅ **Output:**
\`\`\`
1
\`\`\`

I have read the PDF documentation and generated your document.
<file path="hello.pdf">Hello PDF</file>`

  const cleaned = cleanAssistantContent(rawWithNestedFences)

  // Verify none of the leaked tool calls or skill markdown remains
  assert.equal(cleaned.includes('```tool_call'), false)
  assert.equal(cleaned.includes('Executing Tool'), false)
  assert.equal(cleaned.includes('from pypdf import PdfReader'), false)
  assert.equal(cleaned.includes('from reportlab.lib.pagesizes import letter'), false)
  assert.equal(cleaned.includes('PDF Guide'), false)
  assert.equal(cleaned.includes('Output:'), false)

  // Verify conversational text and file tag remain intact
  assert.equal(cleaned.includes('I have read the PDF documentation and generated your document.'), true)
  assert.equal(cleaned.includes('<file path="hello.pdf">Hello PDF</file>'), true)
})

test('P9.7: cleanAssistantContent preserves assistant conversational code blocks', () => {
  const assistantResponse = `Here is how you write a basic HTTP server in Node.js:

\`\`\`javascript
import http from 'node:http'
const server = http.createServer((req, res) => res.end('ok'))
server.listen(3000)
\`\`\`

Let me know if you need further adjustments!`

  const cleaned = cleanAssistantContent(assistantResponse)
  assert.equal(cleaned, assistantResponse.trim())
})

// ---------------------------------------------------------------------------
// 3. Engine End-to-End Leak Prevention Tests
// ---------------------------------------------------------------------------

test('P9.8: runAgent stream never emits tool_call code blocks in text-delta', async () => {
  let turnCount = 0
  const server = http.createServer((req, res) => {
    turnCount++
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    })

    if (turnCount === 1) {
      // Model emits conversational text followed by a text tool call
      const chunk1 = JSON.stringify({
        choices: [
          {
            delta: {
              content:
                'I am going to create the file for you.\n\n```tool_call\n{"tool": "write_file", "params": {"path": "p9_test.txt", "content": "clean stream"}}\n```\n',
            },
          },
        ],
      })
      res.write(`data: ${chunk1}\n\n`)
      res.write('data: [DONE]\n\n')
      res.end()
    } else {
      // Second turn: model presents file
      const chunk2 = JSON.stringify({
        choices: [
          {
            delta: {
              content: 'Here is your file:\n<file path="p9_test.txt">Clean Test</file>',
            },
          },
        ],
      })
      res.write(`data: ${chunk2}\n\n`)
      res.write('data: [DONE]\n\n')
      res.end()
    }
  })

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()))
  const port = (server.address() as any).port
  const endpointUrl = `http://127.0.0.1:${port}/chat/completions`

  const testEmail = 'p9_leak_test@example.com'
  const testChatId = 'chat_p9_leak'
  getSessionDir(testEmail, testChatId, true)

  const textDeltas: string[] = []
  const toolCalls: AgentEvent[] = []

  try {
    const generator = runAgent({
      userEmail: testEmail,
      chatId: testChatId,
      model: 'mock-model',
      endpointUrl,
      apiKey: 'test',
      systemMessages: ['You are a helpful assistant.'],
      history: [],
      userMessage: 'Please write p9_test.txt',
      sandboxActive: true,
      maxTurns: 3,
      capabilities: {
        toolMode: 'text',
        contextWindow: 32768,
        supportsVision: false,
        supportsUsage: true,
      },
    })

    for await (const event of generator) {
      if (event.type === 'text-delta') {
        textDeltas.push(event.text)
      } else if (event.type === 'tool-call') {
        toolCalls.push(event)
      }
    }

    const fullStreamedText = textDeltas.join('')

    // Verify tool was executed
    assert.equal(toolCalls.length, 1)
    assert.equal((toolCalls[0] as any).name, 'write_file')

    // CRITICAL ASSERTION: The streamed text-delta must NOT contain ```tool_call or raw tool json
    assert.equal(fullStreamedText.includes('```tool_call'), false)
    assert.equal(fullStreamedText.includes('"tool": "write_file"'), false)
    assert.equal(fullStreamedText.includes('I am going to create the file for you.'), true)
    assert.equal(fullStreamedText.includes('Here is your file:'), true)
  } finally {
    server.close()
  }
})

test('P9.9: runAgent executes native toolCallsDelta chunks and feeds role: tool message back', async () => {
  let turnCount = 0
  let receivedTurn2Body: any = null

  const server = http.createServer((req, res) => {
    turnCount++
    let body = ''
    req.on('data', (d) => (body += d))
    req.on('end', () => {
      if (turnCount === 2) {
        try {
          receivedTurn2Body = JSON.parse(body)
        } catch {}
      }

      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      })

      if (turnCount === 1) {
        // Stream native tool call deltas
        const c1 = JSON.stringify({
          choices: [
            {
              delta: {
                content: 'I will create p9_native.txt.',
                tool_calls: [
                  {
                    index: 0,
                    id: 'call_native_999',
                    type: 'function',
                    function: { name: 'write_file', arguments: '{"path": "p9_native.txt", ' },
                  },
                ],
              },
            },
          ],
        })
        const c2 = JSON.stringify({
          choices: [
            {
              delta: {
                tool_calls: [
                  {
                    index: 0,
                    function: { arguments: '"content": "native call success"}' },
                  },
                ],
              },
            },
          ],
        })
        res.write(`data: ${c1}\n\n`)
        res.write(`data: ${c2}\n\n`)
        res.write('data: [DONE]\n\n')
        res.end()
      } else {
        // Turn 2: response
        const c3 = JSON.stringify({
          choices: [
            {
              delta: {
                content: 'File created successfully!\n<file path="p9_native.txt">Native File</file>',
              },
            },
          ],
        })
        res.write(`data: ${c3}\n\n`)
        res.write('data: [DONE]\n\n')
        res.end()
      }
    })
  })

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()))
  const port = (server.address() as any).port
  const endpointUrl = `http://127.0.0.1:${port}/chat/completions`

  const testEmail = 'p9_native_test@example.com'
  const testChatId = 'chat_p9_native'
  getSessionDir(testEmail, testChatId, true)

  const events: AgentEvent[] = []
  try {
    const generator = runAgent({
      userEmail: testEmail,
      chatId: testChatId,
      model: 'mock-native-model',
      endpointUrl,
      apiKey: 'test',
      systemMessages: ['You are a helpful assistant.'],
      history: [],
      userMessage: 'Write p9_native.txt',
      sandboxActive: true,
      maxTurns: 3,
      capabilities: {
        toolMode: 'native',
        contextWindow: 32768,
        supportsVision: false,
        supportsUsage: true,
      },
    })

    for await (const event of generator) {
      events.push(event)
    }

    const toolCalls = events.filter((e) => e.type === 'tool-call')
    assert.equal(toolCalls.length, 1)
    assert.equal((toolCalls[0] as any).id, 'call_native_999')
    assert.equal((toolCalls[0] as any).name, 'write_file')

    const toolResults = events.filter((e) => e.type === 'tool-result')
    assert.equal(toolResults.length, 1)
    assert.equal((toolResults[0] as any).ok, true)

    // Check that Turn 2 messages sent to API contained role: tool with tool_call_id
    assert.ok(receivedTurn2Body, 'Turn 2 body received')
    const messages = receivedTurn2Body.messages
    const toolMsg = messages.find((m: any) => m.role === 'tool')
    assert.ok(toolMsg, 'A message with role: tool must be sent in turn 2')
    assert.equal(toolMsg.tool_call_id, 'call_native_999')
    assert.equal(toolMsg.name, 'write_file')
  } finally {
    server.close()
  }
})

test('P9.10: runAgent dynamically falls back from native to text mode when router rejects tools', async () => {
  let reqCount = 0

  const server = http.createServer((req, res) => {
    reqCount++
    let body = ''
    req.on('data', (d) => (body += d))
    req.on('end', () => {
      const parsed = JSON.parse(body)
      if (parsed.tools && parsed.tools.length > 0) {
        // Reject native tools with HTTP 400
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: { message: 'Tools are not supported by this model' } }))
        return
      }

      // Text mode succeeds
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      })
      const c1 = JSON.stringify({
        choices: [
          {
            delta: {
              content:
                'Fallback succeeded!\n```tool_call\n{"tool": "write_file", "params": {"path": "p9_fb.txt", "content": "ok"}}\n```\n',
            },
          },
        ],
      })
      res.write(`data: ${c1}\n\n`)
      res.write('data: [DONE]\n\n')
      res.end()
    })
  })

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()))
  const port = (server.address() as any).port
  const endpointUrl = `http://127.0.0.1:${port}/chat/completions`

  const testEmail = 'p9_fallback_test@example.com'
  const testChatId = 'chat_p9_fallback'
  getSessionDir(testEmail, testChatId, true)

  const textDeltas: string[] = []
  const toolCalls: AgentEvent[] = []
  try {
    const generator = runAgent({
      userEmail: testEmail,
      chatId: testChatId,
      model: 'mock-reject-tools',
      endpointUrl,
      apiKey: 'test',
      systemMessages: ['You are a helpful assistant.'],
      history: [],
      userMessage: 'Write p9_fb.txt',
      sandboxActive: true,
      maxTurns: 1,
      capabilities: {
        toolMode: 'native',
        contextWindow: 32768,
        supportsVision: false,
        supportsUsage: true,
      },
    })

    for await (const event of generator) {
      if (event.type === 'text-delta') textDeltas.push(event.text)
      if (event.type === 'tool-call') toolCalls.push(event)
    }

    assert.equal(reqCount, 2, 'Should retry without tools after 400')
    assert.equal(toolCalls.length, 1)
    assert.equal(textDeltas.join('').includes('```tool_call'), false)
    assert.equal(textDeltas.join('').includes('Fallback succeeded!'), true)
  } finally {
    server.close()
  }
})
