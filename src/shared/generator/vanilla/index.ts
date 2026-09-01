import * as bta801 from './bta-8.0.1'
import { VANILLA_BLOCK_IDS as ids801, type VanillaBlockId } from './blockIds-8.0.1'

export type { VanillaBlockId }

export interface VanillaEntry {

  field: string
  name: string
}

export interface VanillaBiomeEntry extends VanillaEntry {
  realm: 'Overworld' | 'Nether' | 'Other'
}

export interface VanillaRegistry {
  blocks: VanillaEntry[]
  items: VanillaEntry[]
  biomes: VanillaBiomeEntry[]
}

const REGISTRIES: Record<string, VanillaRegistry> = {
  '8.0.1': {
    blocks: bta801.VANILLA_BLOCKS,
    items: bta801.VANILLA_ITEMS,
    biomes: bta801.VANILLA_BIOMES
  }
}

const BLOCK_IDS: Record<string, VanillaBlockId[]> = { '8.0.1': ids801 }

export function getVanillaRegistry(btaVersion: string): VanillaRegistry {
  return REGISTRIES[btaVersion] ?? Object.values(REGISTRIES)[0]
}

export function getVanillaBlockIds(btaVersion: string): VanillaBlockId[] {
  return BLOCK_IDS[btaVersion] ?? Object.values(BLOCK_IDS)[0]
}
