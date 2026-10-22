/**
 * Skill System Type Definitions (Agent v2)
 */

export interface SkillMetadata {
  name: string
  description: string
  triggers: string[]
  dependencies: string[]
  skillDir: string
  skillFile: string
}

export interface SkillCatalogItem {
  name: string
  description: string
  triggers: string[]
  dependencies: string[]
  skillPath: string
}
