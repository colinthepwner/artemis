import { LATEST_BTA } from './generator/mappings'

export const ELEMENT_KINDS = [
  'block',
  'item',
  'gearset',
  'liquid',
  'ore',
  'plant',
  'tree',
  'structure',
  'recipe',
  'mob',
  'biome',
  'dimension'
] as const

export type ElementKind = (typeof ELEMENT_KINDS)[number]

export interface ArtemisElement<P = Record<string, unknown>> {
  id: string
  kind: ElementKind

  name: string
  properties: P

  detached?: string[]
  createdAt: string
  updatedAt: string
}

export interface ModDependency {

  modId: string

  version: string

  optional: boolean
}

export interface ProjectMeta {
  name: string

  modId: string
  version: string
  authors: string[]
  description: string

  targetBta: string

  obfuscate: boolean

  icon?: string

  dependencies?: ModDependency[]
}

export interface TextureLayer {
  name: string
  visible: boolean

  opacity: number
  hue: number
  saturation: number
  brightness: number

  emissive?: boolean

  data: string
}

export interface ProjectSound {
  id: string

  name: string

  event: string

  format?: 'ogg' | 'wav'

  audio: string

  bytes: number
  createdAt: string
  updatedAt: string
}

export interface ProjectTexture {
  id: string
  name: string

  data: string

  layers?: TextureLayer[]

  emissive?: string

  kind?: 'block' | 'item'
  createdAt: string
  updatedAt: string
}

export interface ElementGroup {
  id: string

  name: string

  shelf: string

  members: string[]

  color: string

  kind?: ElementKind

  props?: Record<string, unknown>
}

export interface ArtemisProject {
  formatVersion: 1
  meta: ProjectMeta
  elements: ArtemisElement[]

  groups?: ElementGroup[]

  textures: ProjectTexture[]

  sounds?: ProjectSound[]

  textureAssignments: Record<string, string>

  codeOverrides: Record<string, string>
}

export function createEmptyProject(
  name: string,
  modId: string,
  targetBta: string = LATEST_BTA
): ArtemisProject {
  return {
    formatVersion: 1,
    meta: {
      name,
      modId,
      version: '1.0.0',
      authors: [],
      description: '',
      targetBta,
      obfuscate: true
    },
    elements: [],
    groups: [],
    textures: [],

    sounds: [],
    textureAssignments: {},
    codeOverrides: {}
  }
}

export function groupOfElement(
  project: Pick<ArtemisProject, 'groups'>,
  elementId: string
): ElementGroup | undefined {
  return (project.groups ?? []).find((g) => g.members.includes(elementId))
}

export function effectiveProperties(
  project: Pick<ArtemisProject, 'groups'>,
  element: Pick<ArtemisElement, 'id' | 'properties'>
): Record<string, unknown> {
  const shared = groupOfElement(project, element.id)?.props
  if (!shared || Object.keys(shared).length === 0) return element.properties
  return { ...element.properties, ...shared }
}

export function groupedElementIds(project: Pick<ArtemisProject, 'groups'>): Set<string> {
  const out = new Set<string>()
  for (const g of project.groups ?? []) for (const id of g.members) out.add(id)
  return out
}

export function toRegistryName(display: string): string {
  return display
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_{2,}/g, '_')
}

export function resolveTextureName(
  desired: string,
  kind: 'block' | 'item',
  textures: ProjectTexture[],
  selfId: string | null
): string | null {
  const wanted = desired.trim()
  if (!wanted) return null

  const others = textures.filter((t) => t.id !== selfId)
  const taken = new Set(others.map((t) => t.name.toLowerCase()))
  if (!taken.has(wanted.toLowerCase())) return wanted

  const clash = others.find((t) => t.name.toLowerCase() === wanted.toLowerCase())
  if (kind !== 'item' || (clash?.kind ?? 'block') !== 'block') return null

  const base = `${wanted}_drop`
  if (!taken.has(base.toLowerCase())) return base

  for (let n = 2; n <= 99; n++) {
    const candidate = `${base}_${n}`
    if (!taken.has(candidate.toLowerCase())) return candidate
  }
  return null
}

export function titleCase(registryName: string): string {
  return registryName
    .split('_')
    .filter(Boolean)
    .map((s) => s[0].toUpperCase() + s.slice(1))
    .join(' ')
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

export function capitalizeWords(value: string): string {
  return value.replace(/\S+/g, (word) =>
    word === word.toLowerCase() ? word.charAt(0).toUpperCase() + word.slice(1) : word
  )
}
