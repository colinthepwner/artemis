import { createEmptyProject, type ArtemisProject, type ElementKind } from '../src/shared/project'
import { KIND_DEFAULTS } from '../src/shared/generator/props'
import { migrateProject } from '../src/shared/migrate'

export interface Scenario {
  name: string
  build: () => ArtemisProject
}

let seq = 0
function mk(modId: string): {
  project: ArtemisProject
  add: (kind: ElementKind, name: string, props: Record<string, unknown>) => void
} {
  const project = createEmptyProject(modId, modId)
  project.meta.authors = ['Colin']
  const add = (kind: ElementKind, name: string, props: Record<string, unknown>): void => {
    project.elements.push({
      id: `d${seq++}`,
      kind,
      name,
      properties: { ...(KIND_DEFAULTS[kind] ?? {}), ...props },
      createdAt: '2026-08-27T00:00:00Z',
      updatedAt: '2026-08-27T00:00:00Z'
    })
  }
  return { project, add }
}

export function scenario(name: string): Scenario {
  const found = SCENARIOS.find((s) => s.name === name)
  if (!found) throw new Error(`no fixture named "${name}"`)
  return found
}

export const SCENARIOS: Scenario[] = [
  {

    name: 'ordinary mod',
    build: () => {
      const { project, add } = mk('plainmod')
      add('item', 'ruby', { displayName: 'Ruby' })
      add('block', 'ruby_ore', { displayName: 'Ruby Ore', drops: 'item', dropItem: 'ruby' })
      add('ore', 'ruby_veins', { displayName: 'Ruby Veins', blockRef: 'ruby_ore', veinsPerChunk: 8 })
      add('recipe', 'ruby_block', {
        recipeType: 'shaped',
        output: 'ruby_ore',
        grid: ['ruby', 'ruby', 'ruby', 'ruby', 'ruby', 'ruby', 'ruby', 'ruby', 'ruby']
      })
      return project
    }
  },
  {

    name: 'one block, three dependants',
    build: () => {
      const { project, add } = mk('sharedmod')
      add('block', 'ashwood_log', { displayName: 'Ashwood Log' })
      add('block', 'ashwood_leaves', { displayName: 'Ashwood Leaves' })
      add('tree', 'ashwood', {
        displayName: 'Ashwood',
        logBlock: 'ashwood_log',
        leavesBlock: 'ashwood_leaves',
        treesPerChunk: 2
      })
      add('structure', 'ash_shrine', {
        displayName: 'Ash Shrine',
        variants: [
          { id: 'v1', name: 'A', blocks: { '0,0,0': 'ashwood_log', '0,1,0': 'ashwood_leaves' } }
        ]
      })
      add('ore', 'ashwood_veins', { blockRef: 'ashwood_log', veinsPerChunk: 1 })
      return project
    }
  },
  {

    name: 'two trees claiming one mod biome',
    build: () => {
      const { project, add } = mk('claimmod')
      add('block', 'gloom_log', {})
      add('block', 'gloom_leaves', {})
      add('biome', 'gloomwood', {
        displayName: 'Gloomwood',
        hostBiome: 'biome:OVERWORLD_FOREST',
        topBlock: 'block:GRASS',
        fillerBlock: 'block:DIRT'
      })
      add('tree', 'gloom_tree', {
        logBlock: 'gloom_log',
        leavesBlock: 'gloom_leaves',
        biomes: ['gloomwood'],
        treesPerChunk: 4
      })
      add('tree', 'pale_tree', {
        logBlock: 'gloom_log',
        leavesBlock: 'gloom_leaves',
        biomes: ['gloomwood', 'biome:OVERWORLD_DESERT'],
        treesPerChunk: 2
      })

      add('tree', 'moor_tree', {
        logBlock: 'gloom_log',
        leavesBlock: 'gloom_leaves',
        biomes: ['biome:OVERWORLD_GRASSLANDS'],
        treesPerChunk: 3
      })
      return project
    }
  },
  {

    name: 'kit with a promoted piece',
    build: () => {
      const { project, add } = mk('kitmod')
      project.elements.push({
        id: `d${seq++}`,
        kind: 'item',
        name: 'ruby',
        properties: { ...KIND_DEFAULTS.item, displayName: 'Ruby', generateSet: true },
        detached: ['ruby_pickaxe'],
        createdAt: '2026-08-27T00:00:00Z',
        updatedAt: '2026-08-27T00:00:00Z'
      })
      add('item', 'ruby_pickaxe', { displayName: 'Ruby Pickaxe', piece: 'pickaxe' })
      return project
    }
  },
  {

    name: 'four tinted biomes',
    build: () => {
      const { project, add } = mk('tintmod')
      for (const [i, n] of ['aurora', 'ember', 'mire', 'frost'].entries()) {
        add('biome', n, {
          displayName: n,
          hostBiome: 'biome:OVERWORLD_FOREST',
          waterColor: `00${(i + 1).toString(16).padStart(2, '0')}ff`,
          grassColor: `${(i + 1).toString(16).padStart(2, '0')}ff00`,
          skyColor: 'aabbcc',
          blockedWeathers: ['rain'],
          topBlock: 'block:GRASS',
          fillerBlock: 'block:DIRT'
        })
      }
      return project
    }
  },
  {

    name: 'two dimensions',
    build: () => {
      const { project, add } = mk('dimmod')
      add('block', 'void_stone', {})
      add('biome', 'void_flats', {
        generateInOverworld: false,
        topBlock: 'void_stone',
        fillerBlock: 'void_stone'
      })
      add('dimension', 'the_hollow', { biomes: ['void_flats'], portalFrame: 'void_stone' })

      add('dimension', 'the_deep', {
        biomes: ['void_flats', 'biome:OVERWORLD_FOREST'],
        portalFrame: 'block:BRICK_CLAY'
      })
      return project
    }
  },
  {

    name: 'a bog reached two ways',
    build: () => {
      const { project, add } = mk('bogmod')
      add('liquid', 'brine', { displayName: 'Brine', materialKind: 'water' })
      add('item', 'peat', { displayName: 'Peat', stackSize: 32, category: 'material' })

      add('item', 'bog_iron', { displayName: 'Bog Iron', generateSet: true })
      add('block', 'bog_mud', {
        displayName: 'Bog Mud',
        material: 'clay',
        sound: 'gravel',
        tags: ['mineableByShovel'],
        drops: 'item',
        dropItem: 'peat',
        dropCountMin: 1,
        dropCountMax: 3
      })
      add('block', 'sunken_stone', {
        displayName: 'Sunken Stone',
        harvestLevel: 3,
        hardness: 30,
        resistance: 1200,
        drops: 'nothing',
        notInCreativeMenu: true
      })
      add('plant', 'marsh_reed', {
        displayName: 'Marsh Reed',
        growsOn: ['bog_mud'],
        maxHeight: 4,
        shearsOnly: true,
        drops: 'item',
        dropItem: 'peat',
        patchesPerChunk: 6,
        biomes: ['sunken_bog']
      })
      add('mob', 'bog_lurker', {
        displayName: 'Bog Lurker',
        shape: 'quadruped',
        hostile: true,
        health: 18,
        attackDamage: 4,
        dropItem: 'bog_mud',
        dropCountMax: 2,
        spawnWeight: 6,
        spawnBiomes: ['sunken_bog']
      })
      add('biome', 'sunken_bog', {
        displayName: 'Sunken Bog',
        generationStyle: 'climate',
        generateInOverworld: true,
        temperature: 0.85,
        humidity: 0.95,
        variance: 0.2,
        vanillaTrees: false,
        topBlock: 'bog_mud',
        fillerBlock: 'brine',
        mapColor: '3a5f3a',
        blockedWeathers: ['snow']
      })
      add('ore', 'peat_seams', {
        displayName: 'Peat Seams',
        blockRef: 'bog_mud',
        biomes: ['sunken_bog'],
        veinSize: 12,
        veinsPerChunk: 4,
        minY: 40,
        maxY: 72
      })
      add('structure', 'drowned_hut', {
        displayName: 'Drowned Hut',
        placement: 'buried',
        oneInChunks: 40,
        minY: 20,
        maxY: 40,
        biomes: ['sunken_bog'],
        variants: [
          {
            id: 'h1',
            name: 'A',
            blocks: {
              '0,0,0': 'block:MUD',
              '1,0,0': 'block:LOG_OAK_MOSSY',
              '0,1,0': 'block:MOSS_STONE'
            }
          }
        ]
      })
      add('dimension', 'the_marsh', {
        displayName: 'The Marsh',
        biomes: ['sunken_bog'],
        portalFrame: 'bog_mud'
      })
      add('recipe', 'bog_shovel', {
        recipeType: 'shaped',
        output: 'bog_iron_shovel',
        grid: ['peat', '', '', '', 'item:STICK', '', '', '', '']
      })
      add('recipe', 'baked_mud', {
        recipeType: 'furnace',
        output: 'block:MUD_BAKED',
        inputs: ['bog_mud']
      })
      return project
    }
  },
  {

    name: 'two climates over one ridge',
    build: () => {
      const { project, add } = mk('ridgemod')
      add('item', 'rime_shard', { displayName: 'Rime Shard' })
      add('block', 'slate', { displayName: 'Slate', hardness: 2.5, drops: 'self' })
      add('block', 'rime_stone', {
        displayName: 'Rime Stone',
        hardness: 1.5,
        drops: 'item',
        dropItem: 'rime_shard',
        dropCountMin: 1,
        dropCountMax: 2
      })
      add('biome', 'alpine_shelf', {
        displayName: 'Alpine Shelf',
        generationStyle: 'climate',
        generateInOverworld: true,
        temperature: 0.75,
        humidity: 0.5,
        rarity: 0.7,
        variance: 0.4,
        topBlock: 'slate',
        fillerBlock: 'block:STONE',
        mapColor: '8a8f96',
        skyColor: 'c8d8ff'
      })

      add('biome', 'rime_flats', {
        displayName: 'Rime Flats',
        generationStyle: 'climate',
        generateInOverworld: true,
        temperature: 0.75,
        humidity: 0.5,
        rarity: 0.25,
        variance: 0.2,
        vanillaTrees: false,
        topBlock: 'rime_stone',
        fillerBlock: 'slate',
        mapColor: 'd8e4ee',
        blockedWeathers: ['rain']
      })

      add('biome', 'slate_downs', {
        displayName: 'Slate Downs',
        hostBiome: 'biome:OVERWORLD_GRASSLANDS',
        rarity: 0.5,
        topBlock: 'slate',
        fillerBlock: 'block:DIRT',
        grassColor: '9fb08a'
      })
      add('ore', 'rime_seams', {
        displayName: 'Rime Seams',
        blockRef: 'rime_stone',
        biomes: ['rime_flats'],
        veinSize: 8,
        veinsPerChunk: 6,
        minY: 60,
        maxY: 110
      })
      add('recipe', 'slate_from_rime', {
        recipeType: 'furnace',
        output: 'slate',
        inputs: ['rime_stone']
      })
      return project
    }
  },
  {

    name: 'a mod that lives through a portal',
    build: () => {
      const { project, add } = mk('hollowmod')

      project.elements.push({
        id: `d${seq++}`,
        kind: 'item',
        name: 'hollow_steel',
        properties: {
          ...KIND_DEFAULTS.item,
          displayName: 'Hollow Steel',
          generateSet: true
        },
        detached: ['hollow_steel_pickaxe'],
        createdAt: '2026-08-27T00:00:00Z',
        updatedAt: '2026-08-27T00:00:00Z'
      })
      add('item', 'hollow_steel_pickaxe', {
        displayName: 'Hollow Steel Pickaxe',
        piece: 'pickaxe'
      })
      add('block', 'hollow_stone', { displayName: 'Hollow Stone', hardness: 2, drops: 'self' })
      add('block', 'hollow_ore', {
        displayName: 'Hollow Ore',
        hardness: 3,
        harvestLevel: 2,
        drops: 'item',
        dropItem: 'hollow_steel'
      })
      add('block', 'pale_log', { displayName: 'Pale Log' })
      add('block', 'pale_leaves', { displayName: 'Pale Leaves' })

      add('biome', 'hollow_reach', {
        displayName: 'Hollow Reach',
        generateInOverworld: false,
        topBlock: 'hollow_stone',
        fillerBlock: 'hollow_stone',

        vanillaTrees: false,
        mapColor: '4a4458',
        skyColor: '2b2233'
      })

      add('biome', 'ash_barrens', {
        displayName: 'Ash Barrens',
        generateInOverworld: false,
        topBlock: 'hollow_ore',
        fillerBlock: 'hollow_stone',
        mapColor: '6b6258',
        blockedWeathers: ['rain', 'snow']
      })
      add('tree', 'pale_stalk', {
        displayName: 'Pale Stalk',
        logBlock: 'pale_log',
        leavesBlock: 'pale_leaves',

        biomes: ['hollow_reach'],
        treesPerChunk: 3,
        minHeight: 5,
        maxHeight: 9
      })
      add('ore', 'hollow_seams', {
        displayName: 'Hollow Seams',
        blockRef: 'hollow_ore',
        biomes: ['hollow_reach', 'ash_barrens'],
        veinSize: 10,
        veinsPerChunk: 12,
        minY: 8,
        maxY: 120
      })
      add('plant', 'ash_tuft', {
        displayName: 'Ash Tuft',
        growsOn: ['hollow_stone', 'hollow_ore'],
        maxHeight: 2,
        patchesPerChunk: 5,
        drops: 'self',
        biomes: ['ash_barrens']
      })
      add('structure', 'sunk_vault', {
        displayName: 'Sunk Vault',
        placement: 'buried',
        oneInChunks: 24,
        minY: 16,
        maxY: 60,
        biomes: ['hollow_reach'],
        variants: [
          {
            id: 'v1',
            name: 'A',
            blocks: { '0,0,0': 'hollow_stone', '1,0,0': 'hollow_ore', '0,1,0': 'pale_log' }
          }
        ]
      })
      add('mob', 'hollow_stalker', {
        displayName: 'Hollow Stalker',
        shape: 'biped',
        hostile: true,
        health: 24,
        attackDamage: 5,
        dropItem: 'hollow_steel',
        dropCountMax: 2,
        spawnWeight: 10,

        spawnBiomes: ['hollow_reach', 'ash_barrens']
      })
      add('dimension', 'the_hollow', {
        displayName: 'The Hollow',
        biomes: ['hollow_reach', 'ash_barrens'],
        portalFrame: 'hollow_stone'
      })

      add('recipe', 'steel_pickaxe', {
        recipeType: 'shaped',
        output: 'hollow_steel_pickaxe',
        grid: [
          'hollow_steel',
          'hollow_steel',
          'hollow_steel',
          '',
          'item:STICK',
          '',
          '',
          'item:STICK',
          ''
        ]
      })

      add('recipe', 'steel_from_pickaxe', {
        recipeType: 'furnace',
        output: 'hollow_steel',
        inputs: ['hollow_steel_pickaxe']
      })
      return project
    }
  },
  {

    name: 'a world reachable three ways',
    build: () => {
      const { project, add } = mk('crossmod')
      add('item', 'ember_shard', { displayName: 'Ember Shard' })
      add('block', 'glass_sand', { displayName: 'Glass Sand', hardness: 0.5, drops: 'self' })
      add('block', 'ember_stone', {
        displayName: 'Ember Stone',
        hardness: 2,
        luminance: 7,
        drops: 'item',
        dropItem: 'ember_shard'
      })
      add('block', 'ember_log', { displayName: 'Ember Log' })
      add('block', 'ember_leaves', { displayName: 'Ember Leaves' })
      add('block', 'quartz_shale', { displayName: 'Quartz Shale', hardness: 3, drops: 'self' })

      add('biome', 'ember_wastes', {
        displayName: 'Ember Wastes',
        generationStyle: 'climate',
        generateInOverworld: true,

        temperature: 0.75,
        humidity: 0.5,
        rarity: 1,
        variance: 0.6,

        vanillaTrees: false,
        topBlock: 'ember_stone',
        fillerBlock: 'ember_stone',
        mapColor: 'a4442a',
        skyColor: 'ffb27a'
      })

      add('biome', 'glass_flats', {
        displayName: 'Glass Flats',
        generationStyle: 'substitute',
        generateInOverworld: true,
        hostBiome: 'biome:OVERWORLD_PLAINS',
        rarity: 1,
        temperature: 0.4,
        humidity: 0.3,
        topBlock: 'glass_sand',
        fillerBlock: 'glass_sand',
        mapColor: 'd9e6ee',
        waterColor: '7fd4e8'
      })

      add('biome', 'ash_hollow', {
        displayName: 'Ash Hollow',
        generateInOverworld: false,
        topBlock: 'ember_stone',
        fillerBlock: 'ember_stone',
        mapColor: '5a4a42'
      })
      add('biome', 'quartz_deep', {
        displayName: 'Quartz Deep',
        generateInOverworld: false,
        topBlock: 'quartz_shale',
        fillerBlock: 'quartz_shale',
        mapColor: 'bfc7d4',
        blockedWeathers: ['rain', 'snow']
      })
      add('tree', 'ember_spire', {
        displayName: 'Ember Spire',
        logBlock: 'ember_log',
        leavesBlock: 'ember_leaves',

        biomes: ['ember_wastes'],
        treesPerChunk: 4,
        minHeight: 5,
        maxHeight: 10
      })
      add('mob', 'ash_wraith', {
        displayName: 'Ash Wraith',
        shape: 'biped',
        hostile: true,
        health: 20,
        attackDamage: 4,
        dropItem: 'ember_shard',
        dropCountMax: 3,
        spawnWeight: 8,

        spawnBiomes: ['ember_wastes']
      })
      add('ore', 'glass_seams', {
        displayName: 'Glass Seams',
        blockRef: 'quartz_shale',

        biomes: ['glass_flats'],
        veinSize: 8,
        veinsPerChunk: 10,
        minY: 12,
        maxY: 96
      })
      add('plant', 'ember_tuft', {
        displayName: 'Ember Tuft',
        growsOn: ['ember_stone'],
        maxHeight: 1,
        patchesPerChunk: 4,
        drops: 'self',
        biomes: ['ember_wastes']
      })
      add('dimension', 'the_kiln', {
        displayName: 'The Kiln',
        biomes: ['glass_flats', 'ash_hollow'],
        portalFrame: 'ember_stone'
      })

      add('dimension', 'the_vault', {
        displayName: 'The Vault',
        biomes: ['glass_flats', 'quartz_deep'],
        portalFrame: 'quartz_shale'
      })
      add('recipe', 'ember_stone_from_shards', {
        recipeType: 'shaped',
        output: 'ember_stone',
        grid: [
          'ember_shard', 'ember_shard', 'ember_shard',
          'ember_shard', 'ember_shard', 'ember_shard',
          'ember_shard', 'ember_shard', 'ember_shard'
        ]
      })
      return project
    }
  },
  {

    name: 'two doors, one frame',
    build: () => {
      const { project, add } = mk('framemod')
      add('block', 'slate', { displayName: 'Slate', hardness: 2, drops: 'self' })
      add('block', 'slate_brick', { displayName: 'Slate Brick', hardness: 2, drops: 'self' })
      add('biome', 'slate_barrens', {
        displayName: 'Slate Barrens',
        generateInOverworld: false,
        topBlock: 'slate',
        fillerBlock: 'slate',
        mapColor: '6b6f76'
      })
      add('biome', 'slate_deep', {
        displayName: 'Slate Deep',
        generateInOverworld: false,
        topBlock: 'slate_brick',
        fillerBlock: 'slate_brick',
        mapColor: '4a4e55'
      })

      add('dimension', 'the_quarry', {
        displayName: 'The Quarry',
        biomes: ['slate_barrens', 'biome:OVERWORLD_FOREST'],
        portalFrame: 'slate'
      })

      add('dimension', 'the_shaft', {
        displayName: 'The Shaft',
        biomes: ['slate_deep'],
        portalFrame: 'block:BRICK_CLAY'
      })
      add('dimension', 'the_drift', {
        displayName: 'The Drift',
        biomes: ['slate_barrens'],
        portalFrame: 'slate_brick'
      })
      return project
    }
  },
  {

    name: 'two worlds, one biome',
    build: () => {
      const { project, add } = mk('twinmod')
      add('block', 'chalk', { displayName: 'Chalk', hardness: 1, drops: 'self' })
      add('block', 'chalk_brick', { displayName: 'Chalk Brick', hardness: 2, drops: 'self' })
      add('biome', 'chalk_flats', {
        displayName: 'Chalk Flats',
        generateInOverworld: false,
        topBlock: 'chalk',
        fillerBlock: 'chalk',
        mapColor: 'd8d5c8'
      })

      add('ore', 'chalk_nodules', {
        displayName: 'Chalk Nodules',
        blockRef: 'chalk_brick',
        veinsPerChunk: 6,
        biomes: ['chalk_flats']
      })
      add('dimension', 'the_pale', {
        displayName: 'The Pale',
        biomes: ['chalk_flats'],
        portalFrame: 'chalk'
      })
      add('dimension', 'the_hush', {
        displayName: 'The Hush',
        biomes: ['chalk_flats'],
        portalFrame: 'chalk_brick'
      })
      return project
    }
  },
  {

    name: 'kitchen sink',
    build: () => {
      const { project, add } = mk('sinkmod')
      add('item', 'ruby', { displayName: 'Ruby', generateSet: true })
      add('item', 'ash', { displayName: 'Ash', stackSize: 16, category: 'misc' })
      add('block', 'marble', { displayName: 'Marble' })

      add('block', 'kiln', { displayName: 'Kiln', textureMode: 'perFace' })
      add('block', 'ruby_ore', { displayName: 'Ruby Ore', drops: 'item', dropItem: 'ruby' })
      add('liquid', 'tar', { displayName: 'Tar', materialKind: 'lava' })
      add('ore', 'ruby_veins', { blockRef: 'ruby_ore', biomes: ['ashen'] })
      add('plant', 'emberbloom', {
        displayName: 'Emberbloom',
        growsOn: ['block:GRASS', 'marble'],
        drops: 'item',
        dropItem: 'ash',
        maxHeight: 3,
        patchesPerChunk: 3,
        biomes: ['ashen']
      })
      add('tree', 'ashwood', {
        logBlock: 'marble',
        leavesBlock: 'block:LEAVES_OAK',
        biomes: ['ashen'],
        treesPerChunk: 2
      })
      add('tree', 'built_pine', {
        design: 'built',
        treesPerChunk: 1,
        biomes: ['biome:OVERWORLD_DESERT'],
        variants: [
          { id: 'b1', name: 'A', blocks: { '0,0,0': 'marble', '0,1,0': 'block:LEAVES_OAK' } },
          { id: 'b2', name: 'B', blocks: { '0,0,0': 'marble' } }
        ]
      })
      add('structure', 'ash_hut', {
        placement: 'buried',
        oneInChunks: 30,
        variants: [{ id: 's1', name: 'A', blocks: { '0,0,0': 'marble', '1,0,0': 'ruby_ore' } }]
      })
      add('recipe', 'ruby_from_ash', { recipeType: 'furnace', output: 'ruby', inputs: ['ash'] })
      add('recipe', 'ash_pile', { recipeType: 'shapeless', output: 'ash', inputs: ['ruby', 'ruby'] })
      add('mob', 'wisp', { displayName: 'Wisp', hostile: true, attackDamage: 3, dropItem: 'ash', spawnBiomes: ['ashen'] })
      add('mob', 'grazer', { displayName: 'Grazer', shape: 'quadruped', spawnWeight: 0 })
      add('biome', 'ashen', {
        displayName: 'Ashen Highlands',
        hostBiome: 'biome:OVERWORLD_FOREST',
        topBlock: 'marble',
        fillerBlock: 'block:DIRT',
        waterColor: '112233',
        grassColor: '445566',
        skyColor: '778899'
      })
      add('biome', 'hollow', {
        generateInOverworld: false,
        topBlock: 'marble',
        fillerBlock: 'marble'
      })
      add('dimension', 'the_hollow', { biomes: ['hollow'], portalFrame: 'marble' })
      return project
    }
  },
  {

    name: 'a mod from before the element rework',
    build: () => {
      const project = createEmptyProject('legacymod', 'legacymod')
      project.meta.authors = ['Colin']
      const at = '2026-08-27T00:00:00Z'
      const legacy = (kind: ElementKind, name: string, properties: Record<string, unknown>): void => {
        project.elements.push({ id: `d${seq++}`, kind, name, properties, createdAt: at, updatedAt: at })
      }

      legacy('ore', 'silver_ore', {
        displayName: 'Silver Ore',
        hardness: 3,
        resistance: 5,
        harvestLevel: 2,
        dropMode: 'item',
        dropItemName: 'silver',
        veinSize: 9,
        veinsPerChunk: 7,
        minY: 4,
        maxY: 40,
        generateSet: true,
        set: { tools: true, armor: true, durability: 700, efficiency: 6, miningLevel: 2, damage: 3 }
      })
      legacy('block', 'silver_log', { displayName: 'Silver Log', hardness: 2 })
      legacy('block', 'silver_leaves', { displayName: 'Silver Leaves', hardness: 0.2 })
      legacy('plant', 'moss_bell', { displayName: 'Moss Bell', growsOn: 'moss', patchesPerChunk: 4 })
      legacy('mob', 'wisp', { displayName: 'Wisp', hostile: true, attackDamage: 3, health: 12 })
      legacy('mob', 'stray_calf', { displayName: 'Stray Calf', shape: 'quadruped', health: 10 })
      legacy('tree', 'silverwood', {
        displayName: 'Silverwood',
        logBlock: 'silver_log',
        leavesBlock: 'silver_leaves',
        treesPerChunk: 3,
        minHeight: 5,
        maxHeight: 9
      })
      legacy('biome', 'silver_glade', {
        displayName: 'Silver Glade',
        hostBiome: 'biome:OVERWORLD_FOREST',
        topBlock: 'block:GRASS',
        fillerBlock: 'block:DIRT',

        spawns: [{ entity: 'wisp', weight: 12 }],
        treeFeature: 'silverwood'
      })
      legacy('biome', 'silver_barrens', {
        displayName: 'Silver Barrens',
        hostBiome: 'biome:OVERWORLD_DESERT',
        topBlock: 'block:SAND',
        fillerBlock: 'block:SAND',
        treeFeature: 'none'
      })
      return migrateProject(project)
    }
  },
  {

    name: 'sixteen doors',
    build: () => {
      const { project, add } = mk('gatemod')

      const doors = [
        'ember', 'cinder', 'hollow', 'lantern', 'quartz', 'tidal', 'sable', 'verdant',
        'anvil', 'mire', 'frost', 'kiln', 'drift', 'garnet', 'thorn', 'vault'
      ]

      const borrowed: Record<string, string> = {
        drift: 'block:BRICK_CLAY',
        vault: 'block:SANDSTONE'
      }
      const title = (s: string): string => s[0].toUpperCase() + s.slice(1)
      doors.forEach((door, i) => {
        const ground = `${door}_stone`
        add('block', ground, { displayName: `${title(door)} Stone`, hardness: 2, drops: 'self' })
        add('biome', `${door}_flats`, {
          displayName: `${title(door)} Flats`,
          generateInOverworld: false,
          topBlock: ground,
          fillerBlock: ground,

          mapColor: `${(0x20 + i * 13).toString(16).padStart(2, '0')}5f${(0xf0 - i * 9).toString(16).padStart(2, '0')}`
        })
        add('dimension', `the_${door}`, {
          displayName: `The ${title(door)}`,
          biomes: [`${door}_flats`],
          portalFrame: borrowed[door] ?? ground
        })
      })
      return project
    }
  },
  {

    name: 'a door onto the game itself',
    build: () => {
      const { project, add } = mk('baremod')
      add('block', 'gate_stone', { displayName: 'Gate Stone', hardness: 2, drops: 'self' })
      add('dimension', 'the_borrowed', {
        displayName: 'The Borrowed',
        biomes: ['biome:OVERWORLD_FOREST', 'biome:OVERWORLD_DESERT'],
        portalFrame: 'gate_stone'
      })
      return project
    }
  },
  {

    name: 'sixteen furnished doors',
    build: () => {
      const { project, add } = mk('realmmod')

      const doors = [
        'aurora', 'basalt', 'coral', 'dusk', 'ember', 'fen', 'glacier', 'harrow',
        'ingot', 'jetty', 'kelp', 'loam', 'marrow', 'nimbus', 'orchard', 'pyre'
      ]
      const borrowed: Record<string, string> = {
        jetty: 'block:BRICK_CLAY',
        pyre: 'block:SANDSTONE'
      }

      const oreDoors = ['aurora', 'ember', 'glacier']
      const gloomDoors = ['dusk', 'marrow']
      const frostDoor = 'glacier'
      const plantDoors = ['ember', 'pyre']
      const cairnDoors = ['basalt', 'loam']
      const wispDoors = ['ember', 'pyre']
      const title = (s: string): string => s[0].toUpperCase() + s.slice(1)
      const reach = (door: string): string => `${door}_reach`

      add('item', 'starsteel', {
        displayName: 'Starsteel',
        generateSet: true,
        set: {
          tools: true,
          armor: true,
          durability: 900,
          efficiency: 9,
          miningLevel: 3,
          damage: 5,
          armorDurability: 700,
          totalProtection: 0.3,
          blastProtection: 0.35,
          fireProtection: 0.25
        }
      })
      add('item', 'ember_dust', { displayName: 'Ember Dust', stackSize: 32, category: 'misc' })
      add('block', 'starsteel_ore', {
        displayName: 'Starsteel Ore',
        hardness: 3,
        harvestLevel: 2,
        drops: 'item',
        dropItem: 'starsteel'
      })
      add('block', 'realm_brick', { displayName: 'Realm Brick', hardness: 2, drops: 'self' })
      add('block', 'gloom_log', { displayName: 'Gloom Log', hardness: 2 })
      add('block', 'gloom_leaves', { displayName: 'Gloom Leaves', hardness: 0.2 })
      add('block', 'frost_log', { displayName: 'Frost Log', hardness: 2 })
      add('block', 'frost_leaves', { displayName: 'Frost Leaves', hardness: 0.2 })
      add('liquid', 'quicksilver', { displayName: 'Quicksilver', materialKind: 'water' })

      add('ore', 'starsteel_veins', {
        displayName: 'Starsteel Veins',
        blockRef: 'starsteel_ore',
        veinSize: 7,
        veinsPerChunk: 9,
        biomes: oreDoors.map(reach)
      })

      add('ore', 'brickstone_veins', {
        displayName: 'Brickstone Veins',
        blockRef: 'realm_brick',
        veinSize: 6,
        veinsPerChunk: 4
      })

      add('tree', 'gloomwood', {
        displayName: 'Gloomwood',
        logBlock: 'gloom_log',
        leavesBlock: 'gloom_leaves',
        treesPerChunk: 3,
        biomes: gloomDoors.map(reach)
      })

      add('tree', 'frostpine', {
        displayName: 'Frostpine',
        logBlock: 'frost_log',
        leavesBlock: 'frost_leaves',
        treesPerChunk: 2,
        biomes: [reach(frostDoor), 'starfall_glade']
      })

      add('plant', 'emberbloom', {
        displayName: 'Emberbloom',
        growsOn: plantDoors.map((door) => `${door}_stone`),
        maxHeight: 3,
        patchesPerChunk: 4,
        drops: 'item',
        dropItem: 'ember_dust',
        biomes: plantDoors.map(reach)
      })
      add('structure', 'realm_cairn', {
        displayName: 'Realm Cairn',
        placement: 'surface',
        oneInChunks: 16,
        variants: [
          {
            id: 'c1',
            name: 'A',
            blocks: { '0,0,0': 'realm_brick', '0,1,0': 'realm_brick', '0,2,0': 'starsteel_ore' }
          },

          { id: 'c2', name: 'B', blocks: { '0,0,0': 'realm_brick', '1,0,0': 'starsteel_ore' } }
        ],
        biomes: cairnDoors.map(reach)
      })

      add('mob', 'realm_wisp', {
        displayName: 'Realm Wisp',
        hostile: true,
        attackDamage: 3,
        health: 14,
        dropItem: 'ember_dust',
        spawnWeight: 12,
        spawnBiomes: wispDoors.map(reach)
      })

      add('mob', 'realm_elk', {
        displayName: 'Realm Elk',
        shape: 'quadruped',
        health: 18,
        spawnWeight: 8
      })

      add('recipe', 'starsteel_from_ore', {
        recipeType: 'furnace',
        output: 'starsteel',
        inputs: ['starsteel_ore']
      })
      add('recipe', 'realm_brick_block', {
        recipeType: 'shaped',
        output: 'realm_brick',
        outputCount: 4,
        grid: ['ember_dust', 'ember_dust', '', 'ember_dust', 'ember_dust', '', '', '', '']
      })
      add('recipe', 'ember_dust_pile', {
        recipeType: 'shapeless',
        output: 'ember_dust',
        inputs: ['starsteel']
      })

      add('biome', 'starfall_glade', {
        displayName: 'Starfall Glade',
        hostBiome: 'biome:OVERWORLD_FOREST',
        topBlock: 'block:GRASS',
        fillerBlock: 'block:DIRT',
        mapColor: 'a0c8e0'
      })

      doors.forEach((door, i) => {
        const ground = `${door}_stone`
        add('block', ground, { displayName: `${title(door)} Stone`, hardness: 2, drops: 'self' })
        add('biome', reach(door), {
          displayName: `${title(door)} Reach`,
          generateInOverworld: false,
          topBlock: ground,
          fillerBlock: ground,
          mapColor: `${(0x18 + i * 12).toString(16).padStart(2, '0')}${(0x30 + i * 7).toString(16).padStart(2, '0')}a4`
        })
        add('dimension', `the_${door}`, {
          displayName: `The ${title(door)}`,

          biomes: door === 'jetty' ? [reach(door), 'biome:OVERWORLD_DESERT'] : [reach(door)],
          portalFrame: borrowed[door] ?? ground
        })
      })
      return project
    }
  }
]
