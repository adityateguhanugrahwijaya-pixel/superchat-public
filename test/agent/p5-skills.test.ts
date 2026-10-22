import test from 'node:test'
import assert from 'node:assert/strict'
import {
  scanSkillsDir,
  getSkillsCatalog,
  getSkill,
  formatSkillsCatalogPrompt,
} from '../../lib/agent/skills/loader'
import { executeTool } from '../../lib/agent/tools/registry'
import { getSessionDir, getSandboxRoot } from '../../lib/sandbox/paths'
import fs from 'node:fs'
import path from 'node:path'

const TEST_EMAIL = 'p5_test@example.com'
const TEST_CHAT_ID = 'chat_p5_skills_001'

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
// 1. Skill Discovery & Frontmatter Parsing
// ---------------------------------------------------------------------------
test('P5.1: scanSkillsDir discovers all 5 bundled skills with accurate metadata', () => {
  const skills = scanSkillsDir(true)
  assert.ok(skills.size >= 5)

  const expectedSkills = ['pdf', 'xlsx', 'docx', 'pptx', 'data-analysis']
  for (const name of expectedSkills) {
    const skill = skills.get(name)
    assert.ok(skill, `Expected skill '${name}' to be discovered`)
    assert.equal(skill.name, name)
    assert.ok(skill.description.length > 20)
    assert.ok(Array.isArray(skill.triggers) && skill.triggers.length > 0)
    assert.ok(Array.isArray(skill.dependencies) && skill.dependencies.length > 0)
    assert.ok(fs.existsSync(skill.skillFile))
  }
})

test('P5.2: getSkillsCatalog and getSkill return structured items', () => {
  const catalog = getSkillsCatalog()
  assert.equal(catalog.length, 5)

  const pdfSkill = getSkill('pdf')
  assert.ok(pdfSkill)
  assert.ok(pdfSkill.dependencies.includes('reportlab'))
  assert.ok(pdfSkill.triggers.includes('invoice'))

  const xlsxSkill = getSkill('xlsx')
  assert.ok(xlsxSkill)
  assert.ok(xlsxSkill.dependencies.includes('openpyxl'))

  const dataSkill = getSkill('data-analysis')
  assert.ok(dataSkill)
  assert.ok(dataSkill.dependencies.includes('matplotlib'))
})

// ---------------------------------------------------------------------------
// 2. Progressive Disclosure Catalog Prompt
// ---------------------------------------------------------------------------
test('P5.3: formatSkillsCatalogPrompt generates concise progressive disclosure prompt', () => {
  const prompt = formatSkillsCatalogPrompt()
  assert.ok(prompt.includes('[System Skills Catalog & Progressive Disclosure]'))
  assert.ok(prompt.includes('AVAILABLE SKILLS:'))
  assert.ok(prompt.includes('read_file'))

  // Check each skill listed
  assert.ok(prompt.includes('/skills/pdf/SKILL.md'))
  assert.ok(prompt.includes('/skills/xlsx/SKILL.md'))
  assert.ok(prompt.includes('/skills/docx/SKILL.md'))
  assert.ok(prompt.includes('/skills/pptx/SKILL.md'))
  assert.ok(prompt.includes('/skills/data-analysis/SKILL.md'))

  // Keep catalog prompt compact (under ~400 words / ~600 tokens)
  const wordCount = prompt.split(/\s+/).length
  assert.ok(wordCount < 400, `Catalog prompt word count (${wordCount}) should be compact`)
})

// ---------------------------------------------------------------------------
// 3. Progressive Loading via read_file Tool
// ---------------------------------------------------------------------------
test('P5.4: read_file loads skill content on demand with absolute and relative paths', async () => {
  setupTestDir()
  try {
    // 1. Absolute virtual path: /skills/pdf/SKILL.md
    const pdfRes = await executeTool(TEST_EMAIL, TEST_CHAT_ID, 'read_file', {
      path: '/skills/pdf/SKILL.md',
    })
    assert.equal(pdfRes.success, true)
    assert.ok(pdfRes.output.includes('SimpleDocTemplate'))
    assert.ok(pdfRes.output.includes('reportlab'))

    // 2. Relative virtual path: skills/xlsx/SKILL.md
    const xlsxRes = await executeTool(TEST_EMAIL, TEST_CHAT_ID, 'read_file', {
      path: 'skills/xlsx/SKILL.md',
    })
    assert.equal(xlsxRes.success, true)
    assert.ok(xlsxRes.output.includes('openpyxl'))
    assert.ok(xlsxRes.output.includes('freeze_panes'))

    // 3. Data analysis skill: /skills/data-analysis/SKILL.md
    const dataRes = await executeTool(TEST_EMAIL, TEST_CHAT_ID, 'read_file', {
      path: '/skills/data-analysis/SKILL.md',
    })
    assert.equal(dataRes.success, true)
    assert.ok(dataRes.output.includes("matplotlib.use('Agg')"))
  } finally {
    cleanupTestDir()
  }
})

// ---------------------------------------------------------------------------
// 4. Skills Directory Read-Only Protection
// ---------------------------------------------------------------------------
test('P5.5: /skills directory is strictly read-only and blocks write/delete operations', async () => {
  setupTestDir()
  try {
    // write_file into /skills rejected
    const writeRes = await executeTool(TEST_EMAIL, TEST_CHAT_ID, 'write_file', {
      path: '/skills/pdf/SKILL.md',
      content: 'malicious overwrite',
    })
    assert.equal(writeRes.success, false)
    assert.ok(writeRes.output.includes('read-only') || writeRes.output.includes('Security Violation'))

    // delete_file inside /skills rejected
    const delRes = await executeTool(TEST_EMAIL, TEST_CHAT_ID, 'delete_file', {
      path: '/skills/docx/SKILL.md',
    })
    assert.equal(delRes.success, false)
    assert.ok(delRes.output.includes('read-only') || delRes.output.includes('Security Violation'))
  } finally {
    cleanupTestDir()
  }
})
