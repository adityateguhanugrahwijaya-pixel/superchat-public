import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import * as XLSX from 'xlsx'
import {
  processUserAttachments,
  detectMimeType,
  generateFilePreview,
} from '../../lib/agent/uploads'
import { executeTool } from '../../lib/agent/tools/registry'
import { resolveSandboxPath, getSessionDir, getSandboxRoot } from '../../lib/sandbox/paths'

const TEST_EMAIL = 'p4_test@example.com'
const TEST_CHAT_ID = 'chat_p4_binary_001'

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
// 1. Magic Bytes & MIME Type Detection
// ---------------------------------------------------------------------------
test('P4.1: detectMimeType detects magic bytes accurately for binary formats', () => {
  // PDF
  const pdfHeader = Buffer.from('%PDF-1.5 test content')
  assert.equal(detectMimeType('document.pdf', pdfHeader), 'application/pdf')
  assert.equal(detectMimeType('unknown_file', pdfHeader), 'application/pdf')

  // PNG
  const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  assert.equal(detectMimeType('chart.png', pngHeader), 'image/png')

  // JPEG
  const jpegHeader = Buffer.from([0xff, 0xd8, 0xff, 0xe0])
  assert.equal(detectMimeType('photo.jpg', jpegHeader), 'image/jpeg')

  // ZIP / XLSX
  const zipHeader = Buffer.from([0x50, 0x4b, 0x03, 0x04])
  assert.equal(detectMimeType('archive.zip', zipHeader), 'application/zip')
  assert.equal(
    detectMimeType('sheet.xlsx', zipHeader),
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  )

  // SQLite
  const sqliteHeader = Buffer.from('SQLite format 3\0')
  assert.equal(detectMimeType('db.sqlite', sqliteHeader), 'application/x-sqlite3')
})

// ---------------------------------------------------------------------------
// 2. Binary Upload Pipeline (Base64 preservation & Excel extraction)
// ---------------------------------------------------------------------------
test('P4.2: processUserAttachments saves binary PDF undamaged without corrupting bytes', () => {
  const dir = setupTestDir()
  try {
    const rawPdfBytes = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Title (Test Document) >>\nendobj\ntrailer\n%%EOF')
    const base64Data = rawPdfBytes.toString('base64')

    const userMessage =
      `[Attached File: contract.pdf]\n` +
      `\`\`\`base64\n` +
      `data:application/pdf;base64,${base64Data}\n` +
      `\`\`\`\n\n` +
      `Please review this attached contract.`

    const result = processUserAttachments(TEST_EMAIL, TEST_CHAT_ID, userMessage)

    assert.equal(result.attachments.length, 1)
    assert.equal(result.attachments[0].filename, 'contract.pdf')
    assert.equal(result.attachments[0].mimeType, 'application/pdf')
    assert.equal(result.attachments[0].size, rawPdfBytes.length)

    // Verify binary intact on disk
    const savedFile = path.join(dir, 'uploads', 'contract.pdf')
    assert.ok(fs.existsSync(savedFile))
    const diskBytes = fs.readFileSync(savedFile)
    assert.deepEqual(diskBytes, rawPdfBytes)

    // Verify prompt substituted with clean metadata
    assert.ok(result.processedContent.includes('[User Attached Workspace File: uploads/contract.pdf]'))
    assert.ok(result.processedContent.includes('MIME Type: application/pdf'))
    assert.ok(!result.processedContent.includes(base64Data))
  } finally {
    cleanupTestDir()
  }
})

test('P4.3: processUserAttachments extracts Excel spreadsheet preview and saves binary workbook', () => {
  const dir = setupTestDir()
  try {
    // Generate valid in-memory Excel workbook
    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.aoa_to_sheet([
      ['Product', 'Q1 Sales', 'Q2 Sales'],
      ['Widget A', 100, 150],
      ['Widget B', 200, 250],
    ])
    XLSX.utils.book_append_sheet(wb, ws, 'SalesSummary')
    const excelBuffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
    const base64 = excelBuffer.toString('base64')

    const userMessage =
      `[Attached File: sales.xlsx]\n` +
      `\`\`\`\n` +
      `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${base64}\n` +
      `\`\`\`\n\n` +
      `Analyze the sales numbers.`

    const result = processUserAttachments(TEST_EMAIL, TEST_CHAT_ID, userMessage)
    assert.equal(result.attachments.length, 1)
    assert.equal(result.attachments[0].filename, 'sales.xlsx')

    // Verify disk workbook is readable by XLSX
    const savedPath = path.join(dir, 'uploads', 'sales.xlsx')
    assert.ok(fs.existsSync(savedPath))
    const readWb = XLSX.readFile(savedPath)
    assert.equal(readWb.SheetNames[0], 'SalesSummary')

    // Verify structured preview in prompt
    assert.ok(result.processedContent.includes('SalesSummary'))
    assert.ok(result.processedContent.includes('Widget A'))
  } finally {
    cleanupTestDir()
  }
})

// ---------------------------------------------------------------------------
// 3. uploads/ Read-Only Protection for Agent Tools
// ---------------------------------------------------------------------------
test('P4.4: uploads/ directory is strictly read-only for write_file, edit_file, delete_file', async () => {
  const dir = setupTestDir()
  try {
    fs.mkdirSync(path.join(dir, 'uploads'), { recursive: true })
    fs.writeFileSync(path.join(dir, 'uploads', 'source.txt'), 'Original upload', 'utf-8')

    // write_file into uploads/ rejected
    const writeRes = await executeTool(TEST_EMAIL, TEST_CHAT_ID, 'write_file', {
      path: 'uploads/new.txt',
      content: 'Hacked',
    })
    assert.equal(writeRes.success, false)
    assert.ok(writeRes.output.includes('read-only'))

    // edit_file inside uploads/ rejected
    const editRes = await executeTool(TEST_EMAIL, TEST_CHAT_ID, 'edit_file', {
      path: 'uploads/source.txt',
      target: 'Original',
      replacement: 'Modified',
    })
    assert.equal(editRes.success, false)
    assert.ok(editRes.output.includes('read-only'))

    // delete_file inside uploads/ rejected
    const delRes = await executeTool(TEST_EMAIL, TEST_CHAT_ID, 'delete_file', {
      path: 'uploads/source.txt',
    })
    assert.equal(delRes.success, false)
    assert.ok(delRes.output.includes('read-only'))

    // BUT read_file CAN read from uploads/
    const readRes = await executeTool(TEST_EMAIL, TEST_CHAT_ID, 'read_file', {
      path: 'uploads/source.txt',
    })
    assert.equal(readRes.success, true)
    assert.ok(readRes.output.includes('Original upload'))
  } finally {
    cleanupTestDir()
  }
})

// ---------------------------------------------------------------------------
// 4. File Path Fallback Resolution (root, outputs/, uploads/)
// ---------------------------------------------------------------------------
test('P4.5: resolveSandboxPath falls back to outputs/ and uploads/ seamlessly', () => {
  const dir = setupTestDir()
  try {
    fs.mkdirSync(path.join(dir, 'outputs'), { recursive: true })
    fs.mkdirSync(path.join(dir, 'uploads'), { recursive: true })

    fs.writeFileSync(path.join(dir, 'outputs', 'final_report.pdf'), 'PDF', 'utf-8')
    fs.writeFileSync(path.join(dir, 'uploads', 'user_input.csv'), 'CSV', 'utf-8')
    fs.writeFileSync(path.join(dir, 'root_file.txt'), 'TXT', 'utf-8')

    // Candidate 1 in outputs/: requested as "final_report.pdf"
    const p1 = resolveSandboxPath(TEST_EMAIL, TEST_CHAT_ID, 'final_report.pdf', {
      allowFallback: true,
      forWrite: false,
    })
    assert.equal(p1, path.join(dir, 'outputs', 'final_report.pdf'))

    // Candidate 2 in uploads/: requested as "user_input.csv"
    const p2 = resolveSandboxPath(TEST_EMAIL, TEST_CHAT_ID, 'user_input.csv', {
      allowFallback: true,
      forWrite: false,
    })
    assert.equal(p2, path.join(dir, 'uploads', 'user_input.csv'))

    // Candidate 3 in root: requested as "outputs/root_file.txt"
    const p3 = resolveSandboxPath(TEST_EMAIL, TEST_CHAT_ID, 'outputs/root_file.txt', {
      allowFallback: true,
      forWrite: false,
    })
    assert.equal(p3, path.join(dir, 'root_file.txt'))
  } finally {
    cleanupTestDir()
  }
})
