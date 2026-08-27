import { createEmptyProject } from '../src/shared/project'
import { migrateProject } from '../src/shared/migrate'
import { CodeGenerator } from '../src/shared/generator/CodeGenerator'

const p = createEmptyProject('Old Mod', 'oldmod')
p.elements.push({
  id: 'a',
  kind: 'ore',
  name: 'ruby_ore',
  properties: {
    displayName: 'Ruby Ore',
    material: 'stone',
    sound: 'stone',
    hardness: 3,
    resistance: 5,
    luminance: 0,
    tags: ['mineableByPickaxe'],
    textureMode: 'all',
    drops: 'default',
    harvestLevel: 2,
    notInCreativeMenu: false,
    dropMode: 'item',
    dropItemName: '',
    veinSize: 8,
    veinsPerChunk: 6,
    minY: 0,
    maxY: 48,
    biomes: [],
    generateSet: true,
    set: {
      tools: true,
      armor: false,
      durability: 100,
      efficiency: 4,
      miningLevel: 2,
      damage: 3,
      armorDurability: 1,
      totalProtection: 0,
      blastProtection: 0,
      fireProtection: 0
    }
  },
  createdAt: 'x',
  updatedAt: 'x'
})
p.elements.push({
  id: 'b',
  kind: 'plant',
  name: 'bell',
  properties: { displayName: 'Bell', luminance: 0, harvestLevel: 0, growsOn: 'moss' },
  createdAt: 'x',
  updatedAt: 'x'
})

p.elements.push({
  id: 'c',
  kind: 'biome',
  name: 'glade',
  properties: { displayName: 'Glade', spawns: [{ entity: 'wisp', weight: 7 }] },
  createdAt: 'x',
  updatedAt: 'x'
})
p.elements.push({
  id: 'd',
  kind: 'mob',
  name: 'wisp',
  properties: { displayName: 'Wisp', hostile: false },
  createdAt: 'x',
  updatedAt: 'x'
})
p.elements.push({
  id: 'e',
  kind: 'mob',
  name: 'stalker',
  properties: { displayName: 'Stalker', hostile: true },
  createdAt: 'x',
  updatedAt: 'x'
})

p.elements.push({
  id: 'f',
  kind: 'tree',
  name: 'silverwood',
  properties: { displayName: 'Silverwood', biomes: [] },
  createdAt: 'x',
  updatedAt: 'x'
})
p.elements.push({
  id: 'g',
  kind: 'biome',
  name: 'grove',
  properties: { displayName: 'Grove', treeFeature: 'silverwood' },
  createdAt: 'x',
  updatedAt: 'x'
})
p.elements.push({
  id: 'h',
  kind: 'biome',
  name: 'barrens',
  properties: { displayName: 'Barrens', treeFeature: 'none' },
  createdAt: 'x',
  updatedAt: 'x'
})

migrateProject(p)

const fail = (msg: string): never => {
  console.error(`MIGRATE FAIL: ${msg}`)
  process.exit(1)
}

const kinds = p.elements.map((e) => `${e.kind}:${e.name}`).join(', ')
console.log(kinds)
const block = p.elements.find((e) => e.kind === 'block' && e.name === 'ruby_ore') ?? fail('no block')
const item = p.elements.find((e) => e.kind === 'item' && e.name === 'ruby') ?? fail('no item')
const veins = p.elements.find((e) => e.kind === 'ore') ?? fail('no veins')
const plant = p.elements.find((e) => e.kind === 'plant') ?? fail('no plant')

if (block.properties['drops'] !== 'item' || block.properties['dropItem'] !== 'ruby')
  fail('block does not drop the item')
if (item.properties['generateSet'] !== true) fail('kit did not move to the item')
if (veins.properties['blockRef'] !== 'ruby_ore') fail('veins do not point at the block')
if (JSON.stringify(plant.properties['growsOn']) !== JSON.stringify(['block:MOSS_STONE']))
  fail(`plant ground wrong: ${JSON.stringify(plant.properties['growsOn'])}`)

const wisp = p.elements.find((e) => e.name === 'wisp') ?? fail('no wisp')
const stalker = p.elements.find((e) => e.name === 'stalker') ?? fail('no stalker')
const glade = p.elements.find((e) => e.name === 'glade') ?? fail('no glade')
if (wisp.properties['spawnWeight'] !== 7) fail('referenced mob did not take the biome weight')
if (JSON.stringify(wisp.properties['spawnBiomes']) !== JSON.stringify(['glade']))
  fail('referenced mob did not take the biome list')
if (stalker.properties['spawnWeight'] !== 0) fail('unreferenced mob would spawn everywhere')
if ('spawns' in glade.properties) fail('biome kept its legacy spawn list')

const silverwood = p.elements.find((e) => e.name === 'silverwood') ?? fail('no tree')
const grove = p.elements.find((e) => e.name === 'grove') ?? fail('no grove')
const barrens = p.elements.find((e) => e.name === 'barrens') ?? fail('no barrens')
if (JSON.stringify(silverwood.properties['biomes']) !== JSON.stringify(['grove']))
  fail('tree did not take the biome claim from the legacy treeFeature')
if ('treeFeature' in grove.properties) fail('grove kept its legacy treeFeature')
if ('treeFeature' in barrens.properties) fail('barrens kept its legacy treeFeature')
if (barrens.properties['vanillaTrees'] !== false) fail("'none' did not become the vanillaTrees switch")

const files = new CodeGenerator(p).generate()
const paths = files.map((f) => f.path)
if (!paths.some((f) => f.endsWith('ModItems.java'))) fail('no ModItems generated')
if (!paths.some((f) => f.endsWith('OldmodOreWorldGen.java'))) fail('no worldgen mixin generated')

console.log('MIGRATE PASS')
