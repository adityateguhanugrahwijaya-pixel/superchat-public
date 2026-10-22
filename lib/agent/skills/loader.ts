import fs from 'node:fs'
import path from 'node:path'
import { SkillMetadata, SkillCatalogItem } from './types'
import { getSkillsDir } from '../../sandbox/paths'

let cachedSkills: Map<string, SkillMetadata> | null = null

/**
 * Lightweight parser for YAML frontmatter block between `---` lines.
 */
function parseFrontmatter(content: string): {
  frontmatter: Record<string, any>
  body: string
} {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/)
  if (!match) {
    return { frontmatter: {}, body: content }
  }

  const rawYaml = match[1]
  const body = match[2] || ''
  const frontmatter: Record<string, any> = {}

  let currentArrayKey: string | null = null

  for (const rawLine of rawYaml.split('\n')) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue

    // Handle array items: "- item"
    if (line.startsWith('-') && currentArrayKey) {
      const itemVal = line.slice(1).trim().replace(/^['"]|['"]$/g, '')
      if (itemVal) {
        if (!Array.isArray(frontmatter[currentArrayKey])) {
          frontmatter[currentArrayKey] = []
        }
        frontmatter[currentArrayKey].push(itemVal)
      }
      continue
    }

    const colonIdx = line.indexOf(':')
    if (colonIdx === -1) continue

    const key = line.slice(0, colonIdx).trim()
    const val = line.slice(colonIdx + 1).trim()

    // Handle inline array: "[a, b, c]"
    if (val.startsWith('[') && val.endsWith(']')) {
      const items = val
        .slice(1, -1)
        .split(',')
        .map((s) => s.trim().replace(/^['"]|['"]$/g, ''))
        .filter(Boolean)
      frontmatter[key] = items
      currentArrayKey = null
    } else if (!val) {
      // Empty value indicates following lines are array items
      currentArrayKey = key
      frontmatter[key] = []
    } else {
      currentArrayKey = null
      const cleanVal = val.replace(/^['"]|['"]$/g, '')
      frontmatter[key] = cleanVal
    }
  }

  return { frontmatter, body }
}

/**
 * Scans the skills directory, reading SKILL.md files and caching metadata in memory.
 */
export function scanSkillsDir(forceReload = false): Map<string, SkillMetadata> {
  if (cachedSkills && !forceReload) {
    return cachedSkills
  }

  const skillsDir = getSkillsDir()
  const map = new Map<string, SkillMetadata>()

  if (!fs.existsSync(skillsDir)) {
    cachedSkills = map
    return map
  }

  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(skillsDir, { withFileTypes: true })
  } catch {
    cachedSkills = map
    return map
  }

  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue

    const skillDirPath = path.join(skillsDir, entry.name)
    const skillFilePath = path.join(skillDirPath, 'SKILL.md')

    if (fs.existsSync(skillFilePath)) {
      try {
        const raw = fs.readFileSync(skillFilePath, 'utf-8')
        const { frontmatter } = parseFrontmatter(raw)

        const name = String(frontmatter.name || entry.name).trim()
        const description = String(frontmatter.description || '').trim()
        const triggers = Array.isArray(frontmatter.triggers) ? frontmatter.triggers : []
        const dependencies = Array.isArray(frontmatter.dependencies) ? frontmatter.dependencies : []

        map.set(name.toLowerCase(), {
          name,
          description,
          triggers,
          dependencies,
          skillDir: skillDirPath,
          skillFile: skillFilePath,
        })
      } catch {}
    }
  }

  cachedSkills = map
  return map
}

export function invalidateSkillsCache(): void {
  cachedSkills = null
}

export function getSkillsCatalog(): SkillCatalogItem[] {
  const skills = scanSkillsDir()
  return Array.from(skills.values()).map((s) => ({
    name: s.name,
    description: s.description,
    triggers: s.triggers,
    dependencies: s.dependencies,
    skillPath: `/skills/${s.name}/SKILL.md`,
  }))
}

export function getSkill(name: string): SkillMetadata | undefined {
  const skills = scanSkillsDir()
  return skills.get((name || '').trim().toLowerCase())
}

/**
 * Formats a concise progressive disclosure skills catalog prompt (~200-300 tokens).
 */
export function formatSkillsCatalogPrompt(): string {
  const catalog = getSkillsCatalog()
  if (catalog.length === 0) return ''

  const lines: string[] = [
    `[System Skills Catalog & Progressive Disclosure]`,
    `You have access to specialized domain skills stored in '/skills/'. Detailed recipes and implementation patterns are NOT pre-loaded into context.`,
    `When working on tasks matching these skills, invoke the \`read_file\` tool with path '/skills/<name>/SKILL.md' to load full code recipes, guidelines, and common pitfalls.`,
    ``,
    `AVAILABLE SKILLS:`,
  ]

  for (const skill of catalog) {
    const triggerList = skill.triggers.length > 0 ? ` (Triggers: ${skill.triggers.join(', ')})` : ''
    const depList = skill.dependencies.length > 0 ? ` [Requires: ${skill.dependencies.join(', ')}]` : ''
    lines.push(`- **${skill.name}**: ${skill.description}${triggerList}${depList}`)
    lines.push(`  Path: \`${skill.skillPath}\``)
  }

  lines.push(``)
  lines.push(
    `RULE: Whenever a user requests documents, slides, spreadsheets, or charts, check the skill path above and call read_file('/skills/<name>/SKILL.md') before writing the script.`
  )

  return lines.join('\n')
}
