import type { ArtemisElement } from '../project'
import type { GearSetProps } from './props'

export const TOOL_KINDS = ['sword', 'pickaxe', 'axe', 'shovel', 'hoe'] as const
export const ARMOR_KINDS = ['helmet', 'chestplate', 'leggings', 'boots'] as const

export type ToolKind = (typeof TOOL_KINDS)[number]
export type ArmorKind = (typeof ARMOR_KINDS)[number]

export interface KitFamily {

  base: string

  tools: string[]

  armor: string[]
}

export interface KitPiece {
  kind: ToolKind | ArmorKind

  name: string
  slot: 'tools' | 'armor'
}

export function kitPieces(el: ArtemisElement): KitPiece[] {
  if (el.kind !== 'gearset') return []
  const set = el.properties as Partial<GearSetProps>
  const gone = new Set(el.detached ?? [])
  const out: KitPiece[] = []
  if (set.tools !== false) {
    for (const kind of TOOL_KINDS) out.push({ kind, name: `${el.name}_${kind}`, slot: 'tools' })
  }
  if (set.armor !== false) {
    for (const kind of ARMOR_KINDS) out.push({ kind, name: `${el.name}_${kind}`, slot: 'armor' })
  }
  return out.filter((piece) => !gone.has(piece.name))
}

export function kitFamily(el: ArtemisElement): KitFamily | null {
  if (el.kind !== 'gearset') return null
  const pieces = kitPieces(el)
  return {
    base: el.name,
    tools: pieces.filter((piece) => piece.slot === 'tools').map((piece) => piece.name),
    armor: pieces.filter((piece) => piece.slot === 'armor').map((piece) => piece.name)
  }
}
