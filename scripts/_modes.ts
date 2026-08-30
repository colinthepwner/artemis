import { createEmptyProject, type ArtemisProject, type ElementKind } from '../src/shared/project'
import { KIND_DEFAULTS } from '../src/shared/generator/props'
import { getVanillaRegistry } from '../src/shared/generator/vanilla'

export const reg = getVanillaRegistry('8.0.1')
const has = (list: { field: string }[], f: string): boolean => list.some((b) => b.field === f)

function pick(list: { field: string }[], ns: string, prefer: string[]): string {
  for (const f of prefer) if (has(list, f)) return `${ns}:${f}`
  throw new Error(`probe: none of ${prefer.join(', ')} exist in the ${ns} registry`)
}
const B = (...p: string[]): string => pick(reg.blocks, 'block', p)
const I = (...p: string[]): string => pick(reg.items, 'item', p)
const BI = (...p: string[]): string => pick(reg.biomes, 'biome', p)

export const V = {
  stone: B('STONE'),
  cobble: B('COBBLE_STONE'),
  dirt: B('DIRT'),
  sand: B('SAND'),
  obsidian: B('OBSIDIAN'),
  log: B('LOG_OAK'),
  leaves: B('LEAVES_OAK'),
  leaves2: B('LEAVES_PINE', 'LEAVES_BIRCH', 'LEAVES_SPRUCE'),
  iron: I('INGOT_IRON'),
  forest: BI('OVERWORLD_FOREST'),
  desert: BI('OVERWORLD_DESERT')
}

export const variant = (id: string, name: string, blocks: Record<string, string>): unknown => ({
  id,
  name,
  blocks
})

export const MODES: Record<ElementKind, Record<string, Record<string, unknown>>> = {
  block: {
    'drops an item': {
      displayName: 'Test Block',
      drops: 'item',
      dropItem: 'probe_item',
      dropCountMin: 1,
      dropCountMax: 3
    },
    'drops itself': { displayName: 'Test Block', drops: 'self' },
    'drops nothing': { displayName: 'Test Block', drops: 'nothing' },
    'three-face texture': { displayName: 'Test Block', textureMode: 'topBottomSides' },

    'six-face texture': { displayName: 'Test Block', textureMode: 'perFace' },

    'powers redstone': { displayName: 'Test Block', emitsRedstone: true },
    'powers redstone and drops nothing': {
      displayName: 'Test Block',
      emitsRedstone: true,
      drops: 'nothing'
    }
  },

  gearset: {
    'tools and armor': { displayName: 'Test Set', tools: true, armor: true },
    'tools only': { displayName: 'Test Set', tools: true, armor: false },
    'armor only': { displayName: 'Test Set', tools: false, armor: true }
  },
  item: {
    'plain material': { displayName: 'Test Item' },
    'promoted kit piece': { displayName: 'Test Item', piece: 'pickaxe' },
    'promoted armor piece': { displayName: 'Test Item', piece: 'helmet' },

    'wears out': {
      displayName: 'Test Chisel',
      durability: 128,
      stackSize: 64,
      blockUseCost: 1,
      blockUses: [{ target: 'block:STONE', becomes: 'block:COBBLE_STONE', drops: '', dropCount: 1 }]
    },

    'right-click rules': {
      displayName: 'Test Chisel',
      blockUseCost: 1,
      blockUses: [
        {
          target: 'block:STONE',
          becomes: 'block:STONE_CARVED',
          drops: '',
          dropCount: 1,
          particle: 'smoke',
          particleCount: 6,
          sound: 'block.clang'
        },
        {
          target: 'block:STONE_CARVED',
          becomes: 'block:STONE',
          drops: 'probe_item',
          dropCount: 2,
          particle: '',
          particleCount: 8,
          sound: ''
        }
      ]
    }
  },
  liquid: {
    water: { displayName: 'Test Liquid', materialKind: 'water' },
    lava: { displayName: 'Test Liquid', materialKind: 'lava' }
  },
  ore: {
    'wired veins': {
      displayName: 'Test Ore',
      blockRef: 'probe_block',
      biomes: [V.forest]
    },
    'every biome': { displayName: 'Test Ore', blockRef: 'probe_block', biomes: [] }
  },
  plant: {
    'tall, generating, drops an item': {
      displayName: 'Test Plant',
      growsOn: [V.dirt, 'probe_block'],
      drops: 'item',
      dropItem: 'probe_item',
      dropCountMin: 1,
      dropCountMax: 2,
      maxHeight: 3,
      patchesPerChunk: 4,
      biomes: [V.forest]
    },
    'single, shears only, crafted only': {
      displayName: 'Test Plant',
      growsOn: [V.dirt],
      drops: 'self',
      shearsOnly: true,
      maxHeight: 1,
      patchesPerChunk: 0,
      biomes: []
    }
  },
  tree: {
    grown: {
      displayName: 'Test Tree',
      design: 'grown',
      minHeight: 4,
      maxHeight: 7,
      logBlock: 'probe_block',
      leavesBlock: V.leaves,
      treesPerChunk: 3,
      biomes: [V.forest]
    },
    built: {
      displayName: 'Test Tree',
      design: 'built',
      logBlock: 'probe_block',
      leavesBlock: V.leaves,
      treesPerChunk: 3,
      biomes: [V.forest],
      variants: [
        variant('v1', 'One', { '0,0,0': V.log, '0,1,0': V.log, '0,2,0': V.leaves }),
        variant('v2', 'Two', { '0,0,0': 'probe_block', '0,1,0': V.leaves })
      ]
    },
    'claims a mod biome': {
      displayName: 'Test Tree',
      design: 'grown',
      logBlock: 'probe_block',
      leavesBlock: V.leaves,
      treesPerChunk: 2,
      biomes: ['probe_biome']
    }
  },
  structure: {
    surface: {
      displayName: 'Test Structure',
      placement: 'surface',
      oneInChunks: 12,
      biomes: [V.forest],
      variants: [variant('s1', 'Hut', { '0,0,0': V.cobble, '1,0,0': 'probe_block' })]
    },
    buried: {
      displayName: 'Test Structure',
      placement: 'buried',
      oneInChunks: 12,
      minY: 10,
      maxY: 40,
      biomes: [V.forest],
      variants: [variant('s1', 'Hut', { '0,0,0': V.cobble, '1,0,0': 'probe_block' })]
    }
  },
  recipe: {
    shaped: {
      displayName: 'Test Recipe',
      recipeType: 'shaped',
      output: 'probe_item',
      outputCount: 2,
      grid: [V.stone, V.stone, V.stone, '', 'probe_item', '', '', '', ''],
      inputs: []
    },
    shapeless: {
      displayName: 'Test Recipe',
      recipeType: 'shapeless',
      output: 'probe_item',
      outputCount: 1,
      grid: ['', '', '', '', '', '', '', '', ''],
      inputs: [V.stone, 'probe_item']
    },
    furnace: {
      displayName: 'Test Recipe',
      recipeType: 'furnace',
      output: 'probe_item',
      outputCount: 1,
      grid: ['', '', '', '', '', '', '', '', ''],
      inputs: [V.cobble]
    }
  },
  mob: {
    hostile: {
      displayName: 'Test Mob',
      hostile: true,
      attackDamage: 3,
      dropItem: 'probe_item',
      dropCountMax: 2,
      spawnWeight: 8,
      spawnBiomes: [V.forest]
    },
    passive: {
      displayName: 'Test Mob',
      hostile: false,
      dropItem: 'probe_item',
      spawnWeight: 8,
      spawnBiomes: []
    }
  },
  biome: {
    'substituted into a host': {
      displayName: 'Test Biome',
      generateInOverworld: true,
      generationStyle: 'substitute',
      hostBiome: V.forest,
      topBlock: 'probe_block',
      fillerBlock: V.dirt,
      skyColor: '223344',
      waterColor: '3355aa',
      grassColor: '55aa33'
    },
    'climate window': {
      displayName: 'Test Biome',
      generateInOverworld: true,
      generationStyle: 'climate',
      topBlock: 'probe_block',
      fillerBlock: V.dirt
    },
    'dimension only': {
      displayName: 'Test Biome',
      generateInOverworld: false,
      topBlock: 'probe_block',
      fillerBlock: V.dirt
    },
    'no vanilla trees': {
      displayName: 'Test Biome',
      generateInOverworld: true,
      vanillaTrees: false,
      topBlock: 'probe_block'
    }
  },
  dimension: {
    'one biome': {
      displayName: 'Test Dimension',
      biomes: ['probe_biome'],
      portalFrame: 'probe_block'
    },
    'several biomes': {
      displayName: 'Test Dimension',
      biomes: ['probe_biome', V.forest, V.desert],
      portalFrame: V.obsidian
    }
  }
}

export function buildProject(subject: ElementKind, mode: Record<string, unknown>): ArtemisProject {
  const project = createEmptyProject('Probe Mod', 'probemod')
  project.meta.authors = ['Colin']
  let n = 0
  const add = (kind: ElementKind, name: string, properties: Record<string, unknown>): void => {
    project.elements.push({
      id: `probe-${n++}`,
      kind,
      name,
      properties: { ...(KIND_DEFAULTS[kind] ?? {}), ...properties },
      createdAt: '2026-08-27T00:00:00Z',
      updatedAt: '2026-08-27T00:00:00Z'
    })
  }

  add('block', 'probe_block', { displayName: 'Probe Block' })
  add('item', 'probe_item', { displayName: 'Probe Item' })
  add('mob', 'probe_mob', { displayName: 'Probe Mob', spawnWeight: 0 })
  add('biome', 'probe_biome', {
    displayName: 'Probe Biome',
    generateInOverworld: false,
    topBlock: V.dirt,
    fillerBlock: V.stone
  })
  add(subject, `subject_${subject}`, mode)
  return project
}
