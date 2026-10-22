import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {
  toolRegistry,
  executeTool,
  getTool,
  getOpenAISchema,
  getPromptDocumentation,
} from '../../lib/agent/tools/registry'
import { validateToolArgs } from '../../lib/agent/tools/validator'
import { executeSandboxTool } from '../../lib/sandbox/executor'
import { getSessionDir, getSandboxRoot } from '../../lib/sandbox/paths'

const TEST_EMAIL = 'p3_test@example.com'
const TEST_CHAT_ID = 'chat_p3_tools_001'

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
// 1. Tool Registry & Metadata
// ---------------------------------------------------------------------------
test('P3.1: Tool registry resolves tools by canonical names and aliases', () => {
  assert.ok(getTool('execute_command'))
  assert.ok(getTool('run_shell'))
  assert.ok(getTool('bash'))
  assert.equal(getTool('bash')?.name, 'execute_command')

  assert.ok(getTool('run_python'))
  assert.ok(getTool('run_node'))
  assert.ok(getTool('read_file'))
  assert.ok(getTool('view'))
  assert.ok(getTool('write_file'))
  assert.ok(getTool('edit_file'))
  assert.ok(getTool('str_replace'))
  assert.ok(getTool('list_dir'))
  assert.ok(getTool('delete_file'))
  assert.ok(getTool('present_files'))
  assert.ok(getTool('show_files'))
})

test('P3.2: getOpenAISchema returns valid OpenAI tools format', () => {
  const schemas = getOpenAISchema()
  assert.ok(Array.isArray(schemas))
  assert.ok(schemas.length >= 8)

  for (const s of schemas) {
    assert.equal(s.type, 'function')
    assert.ok(s.function.name)
    assert.ok(s.function.description)
    assert.equal(s.function.parameters.type, 'object')
  }

  const promptDoc = getPromptDocumentation()
  assert.ok(promptDoc.includes('AVAILABLE TOOLS & FORMATS:'))
  assert.ok(promptDoc.includes('present_files'))
  assert.ok(promptDoc.includes('execute_command'))
})

// ---------------------------------------------------------------------------
// 2. Schema Validation & Alias Resolution
// ---------------------------------------------------------------------------
test('P3.3: validateToolArgs enforces required fields and normalizes aliases', () => {
  const schema = getTool('write_file')!.parameters

  // Missing required parameter 'path'
  const invalid1 = validateToolArgs(schema, { content: 'hello' })
  assert.equal(invalid1.valid, false)
  assert.ok(invalid1.error?.includes('path'))

  // Alias 'filepath' normalized to 'path'
  const valid1 = validateToolArgs(schema, { filepath: 'notes.txt', content: 'hello' })
  assert.equal(valid1.valid, true)
  assert.equal(valid1.args?.path, 'notes.txt')
  assert.equal(valid1.args?.content, 'hello')

  // Alias 'cmd' for execute_command normalized to 'command'
  const shellSchema = getTool('execute_command')!.parameters
  const validShell = validateToolArgs(shellSchema, { cmd: 'echo test' })
  assert.equal(validShell.valid, true)
  assert.equal(validShell.args?.command, 'echo test')

  // Single string auto-wrapped for single-required tool
  const validString = validateToolArgs(shellSchema, 'echo test')
  assert.equal(validString.valid, true)
  assert.equal(validString.args?.command, 'echo test')
})

// ---------------------------------------------------------------------------
// 3. File Tools (write, read with pagination, edit, list, delete)
// ---------------------------------------------------------------------------
test('P3.4: write_file creates file and parent subdirectories, blocks .agent', async () => {
  setupTestDir()
  try {
    // Normal write with subdirectories
    const res = await executeTool(TEST_EMAIL, TEST_CHAT_ID, 'write_file', {
      path: 'sub/folder/hello.txt',
      content: 'Line 1\nLine 2\nLine 3',
    })
    assert.equal(res.success, true)
    assert.equal(res.filePath, 'sub/folder/hello.txt')

    // Block write to .agent
    const agentRes = await executeTool(TEST_EMAIL, TEST_CHAT_ID, 'write_file', {
      path: '.agent/secret.json',
      content: '{"bad": true}',
    })
    assert.equal(agentRes.success, false)
  } finally {
    cleanupTestDir()
  }
})

test('P3.5: read_file supports pagination offset and limit for large files', async () => {
  const dir = setupTestDir()
  try {
    const lines = Array.from({ length: 150 }, (_, i) => `Line ${i + 1}`).join('\n')
    fs.writeFileSync(path.join(dir, 'large.txt'), lines, 'utf-8')

    // Read with limit 50, offset 1
    const chunk1 = await executeTool(TEST_EMAIL, TEST_CHAT_ID, 'read_file', {
      path: 'large.txt',
      offset: 1,
      limit: 50,
    })
    assert.equal(chunk1.success, true)
    assert.ok(chunk1.output.includes('Showing lines 1-50 of 150'))
    assert.ok(chunk1.output.includes('Line 1'))
    assert.ok(chunk1.output.includes('Line 50'))
    assert.ok(!chunk1.output.includes('Line 51'))

    // Read next chunk: offset 51, limit 50
    const chunk2 = await executeTool(TEST_EMAIL, TEST_CHAT_ID, 'read_file', {
      path: 'large.txt',
      offset: 51,
      limit: 50,
    })
    assert.equal(chunk2.success, true)
    assert.ok(chunk2.output.includes('Showing lines 51-100 of 150'))
    assert.ok(chunk2.output.includes('Line 51'))
    assert.ok(!chunk2.output.includes('Line 50'))
  } finally {
    cleanupTestDir()
  }
})

test('P3.6: edit_file replaces target exact match or trimmed snippet', async () => {
  const dir = setupTestDir()
  try {
    fs.writeFileSync(path.join(dir, 'code.py'), 'def add(a, b):\n    return a - b\n', 'utf-8')

    const res = await executeTool(TEST_EMAIL, TEST_CHAT_ID, 'edit_file', {
      path: 'code.py',
      target: 'return a - b',
      replacement: 'return a + b',
    })
    assert.equal(res.success, true)

    const updated = fs.readFileSync(path.join(dir, 'code.py'), 'utf-8')
    assert.ok(updated.includes('return a + b'))
  } finally {
    cleanupTestDir()
  }
})

test('P3.7: delete_file removes files and protects root and .agent', async () => {
  const dir = setupTestDir()
  try {
    fs.writeFileSync(path.join(dir, 'temp.txt'), 'remove me', 'utf-8')
    const delRes = await executeTool(TEST_EMAIL, TEST_CHAT_ID, 'delete_file', { path: 'temp.txt' }, undefined, true)
    assert.equal(delRes.success, true)
    assert.ok(!fs.existsSync(path.join(dir, 'temp.txt')))

    // Try deleting root session dir
    const rootDel = await executeTool(TEST_EMAIL, TEST_CHAT_ID, 'delete_file', { path: '.' }, undefined, true)
    assert.equal(rootDel.success, false)
  } finally {
    cleanupTestDir()
  }
})

// ---------------------------------------------------------------------------
// 4. present_files Tool
// ---------------------------------------------------------------------------
test('P3.8: present_files verifies existing files, leaves them in place, and caps title length', async () => {
  const dir = setupTestDir()
  try {
    // Create outputs/report.pdf and summary.csv
    fs.mkdirSync(path.join(dir, 'outputs'), { recursive: true })
    fs.writeFileSync(path.join(dir, 'outputs', 'report.pdf'), 'PDF-CONTENT', 'utf-8')
    fs.writeFileSync(path.join(dir, 'summary.csv'), 'a,b,c', 'utf-8')

    // Call present_files with 2 files (one with title > 5 words)
    const res = await executeTool(TEST_EMAIL, TEST_CHAT_ID, 'present_files', {
      files: [
        { path: 'outputs/report.pdf', title: 'Q4 Annual Report' },
        { path: 'summary.csv', title: 'One Two Three Four Five Six Seven Eight' },
      ],
    })

    assert.equal(res.success, true)
    assert.equal(res.presentedFiles?.length, 2)
    assert.equal(res.presentedFiles?.[0].path, 'outputs/report.pdf')
    assert.equal(res.presentedFiles?.[0].title, 'Q4 Annual Report')
    // Title > 5 words capped to 5 words
    assert.equal(res.presentedFiles?.[1].title, 'One Two Three Four Five')

    // Files are NOT moved
    assert.ok(fs.existsSync(path.join(dir, 'outputs', 'report.pdf')))
    assert.ok(fs.existsSync(path.join(dir, 'summary.csv')))

    // Presenting non-existent file fails
    const failRes = await executeTool(TEST_EMAIL, TEST_CHAT_ID, 'present_files', {
      files: ['non_existent_file.pdf'],
    })
    assert.equal(failRes.success, false)
    assert.ok(failRes.output.includes('non_existent_file.pdf'))
  } finally {
    cleanupTestDir()
  }
})

// ---------------------------------------------------------------------------
// 5. Execution Tools & Legacy executor.ts delegation
// ---------------------------------------------------------------------------
test('P3.9: executeSandboxTool delegates to tool registry with full parity', async () => {
  const dir = setupTestDir()
  try {
    const res = await executeSandboxTool(TEST_EMAIL, TEST_CHAT_ID, 'write_file', {
      path: 'delegation.txt',
      content: 'Delegated via executor.ts',
    })
    assert.equal(res.success, true)
    assert.equal(res.filePath, 'delegation.txt')
    assert.ok(fs.existsSync(path.join(dir, 'delegation.txt')))

    // execute_command through legacy executor
    const cmdRes = await executeSandboxTool(TEST_EMAIL, TEST_CHAT_ID, 'execute_command', {
      command: 'echo "hello from shell"',
    })
    assert.equal(cmdRes.success, true)
    assert.ok(cmdRes.output.includes('hello from shell'))
  } finally {
    cleanupTestDir()
  }
})

test('P3.10: execute_command blocks dangerous sudo commands via safety rules', async () => {
  setupTestDir()
  try {
    const res = await executeTool(TEST_EMAIL, TEST_CHAT_ID, 'execute_command', {
      command: 'sudo rm -rf /',
    })
    assert.equal(res.success, false)
    assert.ok(res.output.includes('Security Violation'))
  } finally {
    cleanupTestDir()
  }
})
