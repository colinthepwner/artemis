import * as bta801 from './bta-8.0.1'

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

export function getVanillaRegistry(btaVersion: string): VanillaRegistry {
  return REGISTRIES[btaVersion] ?? Object.values(REGISTRIES)[0]
}
