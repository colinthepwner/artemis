export const ELEMENT_KINDS = [
  'block',
  'liquid',
  'ore',
  'plant',
  'tree',
  'recipe',
  'mob',
  'biome'
] as const

export type ElementKind = (typeof ELEMENT_KINDS)[number]

export interface ArtemisElement<P = Record<string, unknown>> {
  id: string
  kind: ElementKind

  name: string
  properties: P
  createdAt: string
  updatedAt: string
}

export interface ProjectMeta {
  name: string

  modId: string
  version: string
  authors: string[]
  description: string

  targetBta: string

  obfuscate: boolean
}

export interface ProjectTexture {
  id: string
  name: string

  data: string

  kind?: 'block' | 'item'
  createdAt: string
  updatedAt: string
}

export interface ArtemisProject {
  formatVersion: 1
  meta: ProjectMeta
  elements: ArtemisElement[]

  textures: ProjectTexture[]

  textureAssignments: Record<string, string>
}

export function createEmptyProject(name: string, modId: string): ArtemisProject {
  return {
    formatVersion: 1,
    meta: {
      name,
      modId,
      version: '1.0.0',
      authors: [],
      description: '',
      targetBta: '8.0.1',
      obfuscate: true
    },
    elements: [],
    textures: [],
    textureAssignments: {}
  }
}

export function toRegistryName(display: string): string {
  return display
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_{2,}/g, '_')
}

export function toPascalCase(registryName: string): string {
  return registryName
    .split('_')
    .filter(Boolean)
    .map((s) => s[0].toUpperCase() + s.slice(1))
    .join('')
}

export function toConstantCase(registryName: string): string {
  return registryName.toUpperCase()
}
