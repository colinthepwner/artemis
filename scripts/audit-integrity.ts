import { CodeGenerator } from '../src/shared/generator/CodeGenerator'
import { createEmptyProject, type ArtemisProject, type ElementKind } from '../src/shared/project'
import { KIND_DEFAULTS } from '../src/shared/generator/props'
import { unfinishedIn, autoFixProject } from '../src/shared/readiness'
import { migrateProject } from '../src/shared/migrate'
import { kitPieces } from '../src/shared/generator/family'
import { normalize } from '../src/renderer/src/store/projectStore'
import { SCENARIOS } from './audit-fixtures'
import { pngDataUrl } from './_canvas'
import { generated } from './_harness'

let failures = 0
let passes = 0
const check = (name: string, condition: boolean, detail?: string): void => {
  if (condition) {
    passes++
  } else {
    failures++
    console.log(`  FAIL ${name}${detail ? `\n       ${detail}` : ''}`)
  }
}

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T
const stable = (p: ArtemisProject): string => JSON.stringify(p)

function duplicateDecls(p: ArtemisProject): string[] {
  const out: string[] = []
  for (const f of new CodeGenerator(p).generate()) {
    if (f.language !== 'java') continue
    const seen = new Map<string, number>()
    for (const line of f.content.split('\n')) {
      const m = /^\t(?:public|private|protected)\s+static\s+(?:final\s+)?[\w.<>[\],\s]+?\s+(\w+)\s*=/.exec(line)
      if (m) seen.set(m[1], (seen.get(m[1]) ?? 0) + 1)
    }
    for (const [name, n] of seen) if (n > 1) out.push(`${f.path}: ${name} x${n}`)
  }
  return out
}

let seq = 0
function mk(modId: string): {
  project: ArtemisProject
  add: (kind: ElementKind, name: string, props: Record<string, unknown>) => void
} {
  const project = createEmptyProject(modId, modId)
  const add = (kind: ElementKind, name: string, props: Record<string, unknown>): void => {
    project.elements.push({
      id: `i${seq++}`,
      kind,
      name,
      properties: { ...(KIND_DEFAULTS[kind] ?? {}), ...props },
      createdAt: '2026-08-27T00:00:00Z',
      updatedAt: '2026-08-27T00:00:00Z'
    })
  }
  return { project, add }
}

console.log('readiness: an empty mod')

{
  const empty = createEmptyProject('Empty', 'empty')
  const items = unfinishedIn(empty)
  check('an empty mod is reported unfinished', items.length > 0)
  check(
    'and says so about the mod, not about an element',
    items.every((i) => i.elementId === ''),
    JSON.stringify(items)
  )
}

console.log('readiness: dangling references are caught')

{
  const { project, add } = mk('danglemod')
  add('item', 'ruby', { displayName: 'Ruby' })

  add('block', 'fake_ref_block', { drops: 'item', dropItem: 'block:GOLD_BLOCK' })
  add('ore', 'ghost_veins', { blockRef: 'no_such_block', veinsPerChunk: 4 })
  add('tree', 'ghost_tree', {
    logBlock: 'block:LOG_OAK',
    leavesBlock: 'block:LEAVES_OAK',
    biomes: ['biome:NOT_A_BIOME', 'no_such_biome']
  })
  add('mob', 'ghost_mob', { spawnBiomes: ['biome:ALSO_NOT_A_BIOME'] })
  add('structure', 'ghost_hut', {
    variants: [{ id: 'v', name: 'A', blocks: { '0,0,0': 'block:NOPE_STONE', '1,0,0': 'block:STONE' } }]
  })

  const before = unfinishedIn(project)

  const flagged = (elementName: string, labelBit: string): boolean => {
    const el = project.elements.find((e) => e.name === elementName)!
    return before.some(
      (u) => u.elementId === el.id && u.label.toLowerCase().includes(labelBit.toLowerCase())
    )
  }
  const dump = JSON.stringify(before, null, 1)
  check('a bad vanilla block constant is flagged', flagged('fake_ref_block', 'drop item'), dump)
  check('an ore pointing at nothing is flagged', flagged('ghost_veins', 'ore block'), dump)
  check('a tree biome list with a bad entry is flagged', flagged('ghost_tree', 'biome filter'), dump)
  check('a mob spawn biome list with a bad entry is flagged', flagged('ghost_mob', 'spawn biome'), dump)
  check('a variant cell pointing at nothing is flagged', flagged('ghost_hut', 'structure block'), dump)

  const fixed = clone(project)
  autoFixProject(fixed)
  const after = unfinishedIn(fixed)
  const danglingAfter = after.filter((u) => /point|exist|missing|unknown|dangl/i.test(u.label))
  check(
    'autoFix clears every dangling reference it reported',
    danglingAfter.length === 0,
    danglingAfter.map((u) => `${u.title}: ${u.label}`).join('; ')
  )

  const twice = clone(fixed)
  autoFixProject(twice)
  check('autoFix run twice changes nothing more', stable(twice) === stable(fixed))

  check('the fixed project still generates', (() => {
    try {
      generated(fixed)
      return true
    } catch (e) {
      return `threw ${(e as Error).message}` === ''
    }
  })())
  check('the fixed project declares nothing twice', duplicateDecls(fixed).length === 0, duplicateDecls(fixed).join('; '))
}

console.log('a piece detached from a set with nothing owning it')

{
  const at = '2026-08-30T00:00:00Z'
  const holed = createEmptyProject('Holed', 'holedmod')
  holed.elements.push(
    { id: 'a', kind: 'item', name: 'new_item', properties: { ...KIND_DEFAULTS.item }, createdAt: at, updatedAt: at },
    { id: 'b', kind: 'item', name: 'new_item_boots', properties: { ...KIND_DEFAULTS.item, piece: 'boots' }, createdAt: at, updatedAt: at },
    {
      id: 'c',
      kind: 'gearset',
      name: 'new_item',
      properties: { ...KIND_DEFAULTS.gearset },
      detached: ['new_item_boots', 'new_item_sword'],
      createdAt: at,
      updatedAt: at
    }
  )
  migrateProject(holed)
  const set = holed.elements.find((e) => e.kind === 'gearset')!
  const made = kitPieces(set).map((k) => k.name)
  check(
    'a piece detached with nothing owning it is handed back to the set',
    made.includes('new_item_sword'),
    made.join(', ')
  )
  check(
    'and one that really was promoted stays promoted, so it is not declared twice',
    !made.includes('new_item_boots') && made.length === 8,
    `${made.length} pieces: ${made.join(', ')}`
  )
  const twice = clone(holed)
  migrateProject(twice)
  check('and repairing it twice is the same as once', stable(twice) === stable(holed))
}

console.log('a block that powers redstone')

{
  const wired = mk('redmod')
  wired.add('block', 'spark', { displayName: 'Spark', emitsRedstone: true, drops: 'nothing' })
  wired.add('block', 'plain', { displayName: 'Plain' })
  const files = new CodeGenerator(wired.project).generate()
  const logic = files.filter((f) => f.path.includes('BlockLogic'))
  check('a block that powers redstone gets a logic class', logic.length === 1, String(logic.length))
  const src = logic[0]?.content ?? ''
  check('with the signal overrides in it', /isSignalSource/.test(src) && /isEmittingSignal/.test(src), src.slice(0, 200))
  check(
    'and its drop override in the SAME class, because it can only have one',
    /getBreakResult/.test(src),
    src.slice(0, 300)
  )
  check(
    'a block that wants neither gets no logic class at all',
    !files.some((f) => f.path.includes('BlockLogicPlain')),
    files.map((f) => f.path).join(', ')
  )
}

console.log('an item that wears out')

{
  const durable = mk('duramod')
  durable.add('item', 'chisel', { displayName: 'Chisel', durability: 128, stackSize: 64 })
  durable.add('item', 'ruby', { displayName: 'Ruby', stackSize: 64 })
  const java = new CodeGenerator(durable.project)
    .generate()
    .find((f) => f.path.endsWith('ModItems.java'))!.content
  const chisel = java.split('\n\n').find((b) => b.includes('CHISEL')) ?? ''
  const ruby = java.split('\n\n').find((b) => b.includes('RUBY')) ?? ''
  check('an item with durability declares a max damage', /setMaxDamage\(128\)/.test(chisel), chisel)

  check('and does not stack, whatever the file asks for', /setStackSize\(1\)/.test(chisel), chisel)
  check(
    'an item without one is untouched, so nothing already made changes',
    !/setMaxDamage|setStackSize/.test(ruby),
    ruby
  )
}

console.log('readiness: colliding registry names')

{
  const { project, add } = mk('collidemod')

  add('item', 'ruby', { displayName: 'Ruby' })
  add('gearset', 'ruby', { displayName: 'Ruby' })
  add('item', 'ruby_pickaxe', { displayName: 'Hand Made Pickaxe' })

  const before = unfinishedIn(project)
  check(
    'a hand-made item colliding with a kit piece is flagged',
    before.some((u) => /name|collid|already|taken|twice/i.test(u.label)),
    JSON.stringify(before, null, 1)
  )
  check(
    'and the collision really would break the build',
    duplicateDecls(project).length > 0,
    'no duplicate declaration, so the warning may be describing something else'
  )

  const fixed = clone(project)
  autoFixProject(fixed)
  check('autoFix resolves the collision', duplicateDecls(fixed).length === 0, duplicateDecls(fixed).join('; '))
  const twice = clone(fixed)
  autoFixProject(twice)
  check('and is idempotent on collisions too', stable(twice) === stable(fixed))
}

console.log('readiness: a biome that would generate nowhere')

{

  const { project, add } = mk('coldmod')
  add('biome', 'frostvale', {
    generateInOverworld: true,
    generationStyle: 'climate',
    temperature: 0.1,
    topBlock: 'block:GRASS',
    fillerBlock: 'block:DIRT'
  })
  add('biome', 'warmvale', {
    generateInOverworld: true,
    generationStyle: 'climate',
    temperature: 0.8,
    topBlock: 'block:GRASS',
    fillerBlock: 'block:DIRT'
  })
  add('biome', 'coldsub', {
    generateInOverworld: true,
    generationStyle: 'substitute',
    hostBiome: 'biome:OVERWORLD_FOREST',
    temperature: 0.1,
    topBlock: 'block:GRASS',
    fillerBlock: 'block:DIRT'
  })
  const items = unfinishedIn(project)
  const flaggedEmpty = (name: string): boolean => {
    const el = project.elements.find((e) => e.name === name)!
    return items.some((u) => u.elementId === el.id && /no world reaches/i.test(u.label))
  }
  check('a cold climate-window biome is flagged as generating nowhere', flaggedEmpty('frostvale'),
    JSON.stringify(items, null, 1))
  check('a warm one is left alone', !flaggedEmpty('warmvale'))
  check('and substitution at the same temperature is left alone', !flaggedEmpty('coldsub'))
}

console.log('readiness: a biome nobody can reach')

{

  const { project, add } = mk('strandedmod')
  add('block', 'slate', {})
  add('biome', 'stranded', { generateInOverworld: false, topBlock: 'slate', fillerBlock: 'slate' })
  add('biome', 'reached', { generateInOverworld: false, topBlock: 'slate', fillerBlock: 'slate' })
  add('biome', 'overworld_one', {
    generateInOverworld: true,
    topBlock: 'block:GRASS',
    fillerBlock: 'block:DIRT'
  })
  add('dimension', 'the_deep', { biomes: ['reached'], portalFrame: 'slate' })

  const items = unfinishedIn(project)
  const stranded = (name: string): boolean => {
    const el = project.elements.find((e) => e.name === name)!
    return items.some((u) => u.elementId === el.id && /no world at all/i.test(u.label))
  }
  check('a biome out of the overworld that no dimension lists is flagged', stranded('stranded'),
    JSON.stringify(items, null, 1))
  check('the one a dimension does list is left alone', !stranded('reached'))
  check('and a biome that simply generates in the overworld is left alone',
    !stranded('overworld_one'))
}

console.log('readiness: two doors that could not both open')

{

  const { project, add } = mk('framecheck')
  add('block', 'slate', {})
  add('biome', 'deep', { generateInOverworld: false, topBlock: 'slate', fillerBlock: 'slate' })
  add('dimension', 'first_door', { biomes: ['deep'], portalFrame: 'slate' })
  add('dimension', 'second_door', { biomes: ['deep'], portalFrame: 'slate' })
  add('dimension', 'nether_door', { biomes: ['deep'], portalFrame: 'block:OBSIDIAN' })
  add('dimension', 'own_door', { biomes: ['deep'], portalFrame: 'block:BRICK_CLAY' })

  const items = unfinishedIn(project)
  const flagged = (name: string, pattern: RegExp): boolean => {
    const el = project.elements.find((e) => e.name === name)!
    return items.some((u) => u.elementId === el.id && pattern.test(u.label))
  }
  check('the second dimension to claim a frame is flagged', flagged('second_door', /shares its portal frame/),
    JSON.stringify(items, null, 1))
  check('and the first one is left alone, because it is the one that opens',
    !flagged('first_door', /shares its portal frame/))
  check('a frame the game already opens a portal on is flagged',
    flagged('nether_door', /portal of its own/), JSON.stringify(items, null, 1))
  check('and a frame nobody else wants is left alone',
    !flagged('own_door', /shares its portal frame|portal of its own/))
}

console.log('readiness: a plant scattered into ground it will not stand on')

{

  const { project, add } = mk('barrenmod')
  add('block', 'ash_stone', { displayName: 'Ash Stone' })
  add('block', 'loam', { displayName: 'Loam' })
  add('biome', 'ash_flats', {
    generateInOverworld: true,
    topBlock: 'ash_stone',
    fillerBlock: 'ash_stone'
  })
  add('biome', 'loam_downs', { generateInOverworld: true, topBlock: 'loam', fillerBlock: 'loam' })
  add('biome', 'green_downs', {
    generateInOverworld: true,
    topBlock: 'block:GRASS',
    fillerBlock: 'block:DIRT'
  })

  add('plant', 'ash_tuft', { growsOn: ['loam'], patchesPerChunk: 4, biomes: ['ash_flats'] })

  add('plant', 'loam_tuft', { growsOn: ['loam'], patchesPerChunk: 4, biomes: ['loam_downs'] })

  add('plant', 'grass_tuft', {
    growsOn: ['block:GRASS'],
    patchesPerChunk: 4,
    biomes: ['green_downs']
  })

  add('plant', 'shelf_moss', { growsOn: ['loam'], patchesPerChunk: 0, biomes: ['ash_flats'] })

  add('plant', 'open_tuft', { growsOn: ['loam'], patchesPerChunk: 4 })

  const items = unfinishedIn(project)
  const barren = (name: string): boolean => {
    const el = project.elements.find((e) => e.name === name)!
    return items.some((u) => u.elementId === el.id && /cannot grow in/i.test(u.label))
  }
  check('a plant scattered into a biome whose floor it does not accept is flagged',
    barren('ash_tuft'), JSON.stringify(items, null, 1))
  check('and the one pointed at the floor it accepts is left alone', !barren('loam_tuft'))
  check("and so is one growing on the game's own grass", !barren('grass_tuft'))
  check('a crafted-only plant is left alone whatever it names', !barren('shelf_moss'))
  check('and a plant with no biome filter is left alone', !barren('open_tuft'))
}

console.log('readiness: a finished mod is not nagged about content')

{
  for (const s of SCENARIOS) {
    const p = s.build()
    const items = unfinishedIn(p)

    const nonTexture = items.filter((u) => !/texture|paint|artwork|skin/i.test(u.label))
    check(
      `"${s.name}" has no complaint other than unpainted artwork`,
      nonTexture.length === 0,
      nonTexture.map((u) => `${u.title}: ${u.label}${u.detail ? ` (${u.detail})` : ''}`).join('; ')
    )
  }
}

console.log('migration: legacy files upgrade, and stay upgraded')

{

  const legacy = createEmptyProject('Legacy', 'legacymod')
  const now = '2026-08-25T00:00:00Z'
  legacy.elements = [
    {
      id: 'l1',
      kind: 'ore',
      name: 'ruby_ore',
      properties: {
        displayName: 'Ruby Ore',
        hardness: 3,
        resistance: 5,
        dropMode: 'item',
        dropItemName: 'ruby',
        veinSize: 9,
        veinsPerChunk: 7,
        minY: 4,
        maxY: 40,
        generateSet: true,
        set: { tools: true, armor: true, durability: 700 }
      },
      createdAt: now,
      updatedAt: now
    },
    {
      id: 'l2',
      kind: 'plant',
      name: 'bell',
      properties: { displayName: 'Bell', growsOn: 'sand' },
      createdAt: now,
      updatedAt: now
    },
    {
      id: 'l3',
      kind: 'mob',
      name: 'wisp',
      properties: { displayName: 'Wisp' },
      createdAt: now,
      updatedAt: now
    },
    {
      id: 'l4',
      kind: 'mob',
      name: 'stray',
      properties: { displayName: 'Stray' },
      createdAt: now,
      updatedAt: now
    },
    {
      id: 'l5',
      kind: 'tree',
      name: 'silverwood',
      properties: { displayName: 'Silverwood' },
      createdAt: now,
      updatedAt: now
    },
    {
      id: 'l6',
      kind: 'biome',
      name: 'glade',
      properties: {
        displayName: 'Glade',
        spawns: [{ entity: 'wisp', weight: 12 }],
        treeFeature: 'silverwood'
      },
      createdAt: now,
      updatedAt: now
    },
    {
      id: 'l7',
      kind: 'biome',
      name: 'barrens',
      properties: { displayName: 'Barrens', treeFeature: 'none' },
      createdAt: now,
      updatedAt: now
    }
  ]

  const once = clone(legacy)
  migrateProject(once)
  const twice = clone(once)
  migrateProject(twice)

  check('migrating twice is the same as migrating once', stable(twice) === stable(once))
  check(
    'a migrated project generates',
    (() => {
      try {
        generated(once)
        return true
      } catch {
        return false
      }
    })()
  )
  check('a migrated project declares nothing twice', duplicateDecls(once).length === 0, duplicateDecls(once).join('; '))

  const kinds = once.elements.map((e) => `${e.kind}:${e.name}`)
  check('the legacy ore became a block', kinds.includes('block:ruby_ore'), kinds.join(', '))
  check('and an item to drop', kinds.includes('item:ruby'), kinds.join(', '))
  check('and a veins element', kinds.some((k) => k.startsWith('ore:')), kinds.join(', '))
  const plant = once.elements.find((e) => e.name === 'bell')!
  check(
    "the plant's ground key became a reference list",
    Array.isArray(plant.properties['growsOn']) &&
      (plant.properties['growsOn'] as string[]).includes('block:SAND'),
    JSON.stringify(plant.properties['growsOn'])
  )
  const glade = once.elements.find((e) => e.name === 'glade')!
  check('the biome no longer owns a spawn list', glade.properties['spawns'] === undefined)
  check('nor picks its own tree', glade.properties['treeFeature'] === undefined)
  const silverwood = once.elements.find((e) => e.name === 'silverwood')!
  check(
    'the tree claims the biome instead',
    ((silverwood.properties['biomes'] as string[]) ?? []).includes('glade'),
    JSON.stringify(silverwood.properties['biomes'])
  )
  const barrens = once.elements.find((e) => e.name === 'barrens')!
  check("a biome that wanted no trees says so on itself", barrens.properties['vanillaTrees'] === false)
  const wisp = once.elements.find((e) => e.name === 'wisp')!
  const stray = once.elements.find((e) => e.name === 'stray')!
  check('the spawned mob carries the weight now', wisp.properties['spawnWeight'] === 12)
  check('and the biome it came from', ((wisp.properties['spawnBiomes'] as string[]) ?? []).includes('glade'))
  check(
    'a mob no legacy biome listed does not start spawning everywhere',
    stray.properties['spawnWeight'] === 0,
    `spawnWeight is ${String(stray.properties['spawnWeight'])}`
  )

  for (const s of SCENARIOS) {
    const modern = s.build()
    const before = stable(modern)
    migrateProject(modern)
    check(`"${s.name}" is left alone by migration`, stable(modern) === before)
  }
}

console.log('save and reopen: a project must survive the round trip')

{

  for (const s of SCENARIOS) {
    const original = s.build()
    const onDisk = JSON.stringify(original, null, 2)
    const reopened = normalize(JSON.parse(onDisk) as ArtemisProject)

    check(`"${s.name}" generates the same mod after a save and reopen`, generated(reopened) === generated(original))

    const again = normalize(JSON.parse(JSON.stringify(reopened)) as ArtemisProject)
    check(`"${s.name}" reopens to the same file the second time`, stable(again) === stable(reopened))
  }

  {
    const withIcon = SCENARIOS[0].build()
    withIcon.meta.icon = pngDataUrl(128, 128, '#3aa0ff', '#123a5a')
    const reopened = normalize(JSON.parse(JSON.stringify(withIcon)) as ArtemisProject)
    check('an uploaded icon survives a save and reopen', reopened.meta.icon === withIcon.meta.icon)
    const cleared = SCENARIOS[0].build()
    cleared.meta.icon = ''
    const back = normalize(JSON.parse(JSON.stringify(cleared)) as ArtemisProject)
    check('and no icon stays no icon rather than becoming one', !back.meta.icon)
  }

  {
    const bare = SCENARIOS[0].build() as unknown as Record<string, unknown>
    delete bare['textures']
    delete bare['textureAssignments']
    delete bare['codeOverrides']
    delete (bare['meta'] as Record<string, unknown>)['obfuscate']
    const loaded = normalize(bare as unknown as ArtemisProject)
    check('a file missing the additive fields gets them all back', Boolean(
      Array.isArray(loaded.textures) &&
        loaded.textureAssignments &&
        loaded.codeOverrides &&
        loaded.meta.obfuscate === true
    ))
    check('and still generates', (() => {
      try {
        generated(loaded)
        return true
      } catch {
        return false
      }
    })())
  }

  {
    const p = SCENARIOS[0].build()
    p.textures = [
      { id: 'a', name: 'a', data: 'x', createdAt: '', updatedAt: '' },
      { id: 'b', name: 'b', data: 'x', createdAt: '', updatedAt: '' }
    ]
    p.textureAssignments = { 'item/ruby': 'a', 'block/ruby_ore': 'b' }
    const loaded = normalize(JSON.parse(JSON.stringify(p)) as ArtemisProject)
    check(
      'a texture on an item slot is backfilled as an item icon',
      loaded.textures.find((t) => t.id === 'a')?.kind === 'item'
    )
    check(
      'and one on a block slot as a block face',
      loaded.textures.find((t) => t.id === 'b')?.kind === 'block'
    )
  }

  {
    const future = SCENARIOS[0].build() as unknown as { formatVersion: number }
    future.formatVersion = 99
    let threw = false
    try {
      normalize(future as unknown as ArtemisProject)
    } catch {
      threw = true
    }
    check('a project from a newer format is refused rather than half-read', threw)
  }
}

console.log(`\n${passes} checks passed, ${failures} failed`)
console.log(failures === 0 ? 'INTEGRITY PASS' : 'INTEGRITY: see above')
if (failures > 0) process.exitCode = 1
