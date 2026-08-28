import { tmpdir } from 'os'
import { join } from 'path'
import { readFileSync, existsSync, readdirSync, statSync } from 'fs'
import { exportWorkspace } from '../src/main/export/exporter'
import { createEmptyProject, type ArtemisElement, type ElementKind } from '../src/shared/project'
import {
  BLOCK_DEFAULTS,
  ITEM_DEFAULTS,
  ORE_DEFAULTS,
  PLANT_DEFAULTS,
  LIQUID_DEFAULTS,
  TREE_DEFAULTS,
  STRUCTURE_DEFAULTS,
  RECIPE_DEFAULTS,
  MOB_DEFAULTS,
  BIOME_DEFAULTS,
  DIMENSION_DEFAULTS
} from '../src/shared/generator/props'
import { textureSlotsFor } from '../src/shared/generator/textures'
import { png16DataUrl } from './_canvas'
import { walkFiles } from './_harness'

const PX = png16DataUrl()

const project = createEmptyProject('Test Mod', 'testmod')
project.meta.authors = ['Colin']
project.meta.description = 'Everything Artemis can emit, in one mod.'

const now = '2026-08-26T00:00:00Z'
let n = 0
const add = (kind: ElementKind, name: string, properties: Record<string, unknown>): void => {
  project.elements.push({ id: `e${n++}`, kind, name, properties, createdAt: now, updatedAt: now })
}

const addDetaching = (
  kind: ElementKind,
  name: string,
  properties: Record<string, unknown>,
  detached: string[]
): void => {
  project.elements.push({
    id: `e${n++}`,
    kind,
    name,
    properties,
    detached,
    createdAt: now,
    updatedAt: now
  })
}

add('item', 'ruby', {
  ...ITEM_DEFAULTS,
  displayName: 'Ruby',
  generateSet: true,
  set: { ...ITEM_DEFAULTS.set }
})
add('item', 'ash_pile', {
  ...ITEM_DEFAULTS,
  displayName: 'Ash Pile',
  stackSize: 16,
  category: 'misc'
})

addDetaching(
  'item',
  'onyx',
  { ...ITEM_DEFAULTS, displayName: 'Onyx', generateSet: true, set: { ...ITEM_DEFAULTS.set } },
  ['onyx_pickaxe', 'onyx_helmet']
)
add('item', 'onyx_pickaxe', {
  ...ITEM_DEFAULTS,
  displayName: 'Onyx Pickaxe',
  generateSet: false,
  piece: 'pickaxe',
  set: { ...ITEM_DEFAULTS.set, durability: 1024, efficiency: 12, miningLevel: 3, damage: 6 }
})
add('item', 'onyx_helmet', {
  ...ITEM_DEFAULTS,
  displayName: 'Onyx Helmet',
  generateSet: false,
  piece: 'helmet',
  set: { ...ITEM_DEFAULTS.set, armorDurability: 900, totalProtection: 0.4 }
})

add('block', 'marble', { ...BLOCK_DEFAULTS, displayName: 'Marble', description: 'A pale stone.' })
add('block', 'spire_stone', {
  ...BLOCK_DEFAULTS,
  displayName: 'Spire Stone',
  textureMode: 'topBottomSides',
  drops: 'nothing',
  harvestLevel: 2,
  luminance: 7,
  notInCreativeMenu: false,
  tags: ['mineableByPickaxe', 'preventMobSpawns']
})
add('block', 'ruby_ore', {
  ...BLOCK_DEFAULTS,
  displayName: 'Ruby Ore',
  hardness: 3,
  resistance: 5,
  harvestLevel: 2,
  drops: 'item',
  dropItem: 'ruby',
  dropCountMin: 1,
  dropCountMax: 3
})
add('block', 'shale', {
  ...BLOCK_DEFAULTS,
  displayName: 'Shale',
  hardness: 3,
  resistance: 5
})

add('ore', 'ruby_ore_veins', {
  ...ORE_DEFAULTS,
  displayName: 'Ruby Ore Veins',
  blockRef: 'ruby_ore',
  biomes: ['ashen_highlands', 'biome:OVERWORLD_FOREST']
})
add('ore', 'shale_veins', {
  ...ORE_DEFAULTS,
  displayName: 'Shale Veins',
  blockRef: 'shale',
  veinSize: 16,
  minY: 20,
  maxY: 70
})

add('ore', 'extra_coal_veins', {
  ...ORE_DEFAULTS,
  displayName: 'Extra Coal Veins',
  blockRef: 'block:ORE_COAL_STONE'
})
add('ore', 'unfinished_veins', { ...ORE_DEFAULTS, displayName: 'Unfinished Veins' })

add('plant', 'moonbell', {
  ...PLANT_DEFAULTS,
  displayName: 'Moonbell',
  luminance: 5,
  growsOn: ['block:GRASS', 'block:DIRT', 'marble'],
  patchesPerChunk: 4,
  biomes: ['ashen_highlands']
})
add('plant', 'ash_reed', {
  ...PLANT_DEFAULTS,
  displayName: 'Ash Reed',
  growsOn: ['block:SAND', 'shale'],
  maxHeight: 4,
  shearsOnly: true,
  drops: 'item',
  dropItem: 'ash_pile',
  dropCountMin: 1,
  dropCountMax: 2
})
add('liquid', 'quicksilver', { ...LIQUID_DEFAULTS, displayName: 'Quicksilver', materialKind: 'water' })

add('tree', 'silverwood', {
  ...TREE_DEFAULTS,
  displayName: 'Silverwood',
  logBlock: 'marble',
  leavesBlock: 'block:LEAVES_OAK',
  biomes: ['ashen_highlands', 'biome:OVERWORLD_BIRCH_FOREST']
})

add('tree', 'gnarled_oak', {
  ...TREE_DEFAULTS,
  displayName: 'Gnarled Oak',
  design: 'built',
  variants: [
    {
      id: 'v1',
      name: 'Stout',
      blocks: {
        '0,0,0': 'block:LOG_OAK',
        '0,1,0': 'block:LOG_OAK',
        '0,2,0': 'block:LEAVES_OAK',
        '1,2,0': 'block:LEAVES_OAK',
        '-1,2,0': 'block:LEAVES_OAK',
        '0,2,1': 'marble',
        '0,2,-1': 'block:LEAVES_OAK',
        '0,3,0': 'block:LEAVES_OAK'
      }
    },
    { id: 'v2', name: 'Sapling-ish', blocks: { '0,0,0': 'block:LOG_OAK', '0,1,0': 'block:LEAVES_OAK' } },

    { id: 'v3', name: 'Empty', blocks: {} }
  ],
  treesPerChunk: 2,
  biomes: ['ashen_highlands']
})

add('structure', 'watch_cairn', {
  ...STRUCTURE_DEFAULTS,
  displayName: 'Watch Cairn',
  oneInChunks: 6,
  variants: [
    {
      id: 's1',
      name: 'Standing',
      blocks: {
        '0,0,0': 'block:COBBLE_STONE',
        '0,1,0': 'block:COBBLE_STONE',
        '0,2,0': 'block:TORCH_COAL',
        '1,0,0': 'marble',
        '-1,0,0': 'block:COBBLE_STONE_MOSSY'
      }
    },
    { id: 's2', name: 'Toppled', blocks: { '0,0,0': 'block:COBBLE_STONE', '1,0,0': 'block:COBBLE_STONE' } }
  ],
  biomes: ['ashen_highlands', 'biome:OVERWORLD_PLAINS']
})

add('structure', 'buried_vault', {
  ...STRUCTURE_DEFAULTS,
  displayName: 'Buried Vault',
  placement: 'buried',
  oneInChunks: 40,
  minY: 12,
  maxY: 30,
  variants: [
    {
      id: 's3',
      name: 'Vault',
      blocks: {
        '0,0,0': 'block:PLANKS_OAK',
        '1,0,0': 'block:PLANKS_OAK',
        '0,1,0': 'block:BLOCK_GOLD',
        '1,1,0': 'block:PLANKS_OAK'
      }
    }
  ]
})

add('structure', 'empty_folly', { ...STRUCTURE_DEFAULTS, displayName: 'Empty Folly' })

add('recipe', 'marble_from_rubies', {
  ...RECIPE_DEFAULTS,
  recipeType: 'shaped',
  grid: ['ruby', 'ruby', '', 'ruby', 'ruby', '', '', '', ''],
  output: 'marble',
  outputCount: 4
})
add('recipe', 'ruby_from_ore', {
  ...RECIPE_DEFAULTS,
  recipeType: 'shapeless',
  inputs: ['shale', 'item:COAL'],
  output: 'ruby',
  outputCount: 1
})
add('recipe', 'smelt_ruby', {
  ...RECIPE_DEFAULTS,
  recipeType: 'furnace',
  inputs: ['ruby_ore'],
  output: 'ruby',
  outputCount: 1
})

add('mob', 'dust_wraith', {
  ...MOB_DEFAULTS,
  displayName: 'Dust Wraith',
  shape: 'humanoid',
  hostile: true,
  attackDamage: 4,
  health: 20,
  dropItem: 'ruby',
  spawnWeight: 12,
  spawnBiomes: ['ashen_highlands', 'biome:OVERWORLD_DESERT']
})
add('mob', 'hill_ox', {
  ...MOB_DEFAULTS,
  displayName: 'Hill Ox',
  shape: 'quadruped',
  hostile: false,
  health: 14,
  dropItem: 'item:LEATHER',
  spawnWeight: 6,
  spawnBiomes: []
})

add('biome', 'ashen_highlands', {
  ...BIOME_DEFAULTS,
  displayName: 'Ashen Highlands',

  mapColor: '8f7f6a',
  skyColor: 'ffc287',
  waterColor: '3f76e4',
  grassColor: 'a8b06a',
  blockedWeathers: ['snow', 'fog'],

  topBlock: 'marble',
  fillerBlock: 'block:STONE'
})

add('biome', 'plain_meadow', {
  ...BIOME_DEFAULTS,
  displayName: 'Plain Meadow',
  hostBiome: 'biome:OVERWORLD_PLAINS',
  vanillaTrees: false,
  topBlock: 'block:GRASS',
  fillerBlock: 'block:DIRT'
})

add('biome', 'glimmer_flats', {
  ...BIOME_DEFAULTS,
  displayName: 'Glimmer Flats',
  placement: 'dimension',
  mapColor: '7fe0d0',
  skyColor: '88f0e0',
  topBlock: 'marble',
  fillerBlock: 'block:STONE'
})

add('dimension', 'hollow', {
  ...DIMENSION_DEFAULTS,
  displayName: 'The Hollow',
  biomes: ['glimmer_flats'],
  portalFrame: 'marble'
})

add('dimension', 'shatterlands', {
  ...DIMENSION_DEFAULTS,
  displayName: 'Shatterlands',
  biomes: ['ashen_highlands', 'glimmer_flats', 'biome:OVERWORLD_DESERT'],

  portalFrame: 'block:BRICK_CLAY'
})

project.textures = [{ id: 't1', name: 'checker', data: PX, createdAt: now, updatedAt: now }]
for (const slot of textureSlotsFor(project)) project.textureAssignments[slot.key] = 't1'

const root = join(tmpdir(), `artemis-export-test-${Date.now()}`)

async function main(): Promise<void> {
  const log: string[] = []
  await exportWorkspace(project, root, log)
  console.log('=== LOG ===')
  console.log(log.join('\n'))
  console.log('\n=== FILE TREE ===')
  console.log(walkFiles(root).sort().join('\n'))

  const lang = join(root, 'src/main/resources/assets/testmod/lang/en_US/testmod.lang')
  console.log('\n=== lang file ===', existsSync(lang) ? '' : 'MISSING')
  if (existsSync(lang)) console.log(readFileSync(lang, 'utf-8'))

  console.log('=== fabric.mod.json ===')
  console.log(readFileSync(join(root, 'src/main/resources/fabric.mod.json'), 'utf-8'))

  console.log(`\nWorkspace: ${root}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
