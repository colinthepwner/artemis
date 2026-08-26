import * as bta801 from './bta-8.0.1'

export interface VanillaEntry {

  field: string
  name: string
}

export interface VanillaRegistry {
  blocks: VanillaEntry[]
  items: VanillaEntry[]
}

const REGISTRIES: Record<string, VanillaRegistry> = {
  '8.0.1': { blocks: bta801.VANILLA_BLOCKS, items: bta801.VANILLA_ITEMS }
}

export function getVanillaRegistry(btaVersion: string): VanillaRegistry {
  return REGISTRIES[btaVersion] ?? Object.values(REGISTRIES)[0]
}
