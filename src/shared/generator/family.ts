import type { ArtemisElement } from '../project'
import type { AnySetProps, OreProps } from './props'

export const TOOL_KINDS = ['sword', 'pickaxe', 'axe', 'shovel', 'hoe'] as const
export const ARMOR_KINDS = ['helmet', 'chestplate', 'leggings', 'boots'] as const

export type ToolKind = (typeof TOOL_KINDS)[number]
export type ArmorKind = (typeof ARMOR_KINDS)[number]

export interface OreFamily {

  base: string

  dropsItem: boolean

  tools: string[]

  armor: string[]
}

export function oreBaseName(el: ArtemisElement): string {
  const p = el.properties as Partial<OreProps>
  return (p.dropItemName || el.name.replace(/_ore$/, '')).trim()
}

export function oreFamily(el: ArtemisElement): OreFamily | null {
  if (el.kind !== 'ore') return null
  const p = el.properties as Partial<OreProps>
  const base = oreBaseName(el)
  const dropsItem = p.dropMode !== 'block'
  const set: Partial<AnySetProps> = p.generateSet ? (p.set ?? {}) : {}
  const tools = p.generateSet && set.tools !== false ? TOOL_KINDS.map((t) => `${base}_${t}`) : []
  const armor = p.generateSet && set.armor !== false ? ARMOR_KINDS.map((a) => `${base}_${a}`) : []
  return { base, dropsItem, tools, armor }
}
