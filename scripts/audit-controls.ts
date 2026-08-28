import { CodeGenerator } from '../src/shared/generator/CodeGenerator'
import type { ArtemisProject, ElementKind } from '../src/shared/project'
import { KIND_DEFAULTS } from '../src/shared/generator/props'
import { readFileSync } from 'fs'
import { join } from 'path'

import { MODES, V, variant, buildProject } from './_modes'
import { generated } from './_harness'

const MUTATE: Record<string, unknown> = {
  'block.material': 'wood',
  'block.sound': 'wood',
  'block.textureMode': 'topBottomSides',
  'block.drops': 'nothing',
  'block.dropItem': V.iron,
  'block.tags': ['mineableByShovel'],

  'item.category': 'tools',
  'item.piece': 'sword',
  'item.set': {
    tools: true,
    armor: false,
    durability: 111,
    efficiency: 3,
    miningLevel: 1,
    damage: 9,
    armorDurability: 77,
    totalProtection: 0.5,
    blastProtection: 0.1,
    fireProtection: 0.9
  },

  'liquid.materialKind': 'lava',

  'ore.blockRef': V.stone,
  'ore.biomes': [V.desert],

  'plant.growsOn': [V.sand],
  'plant.drops': 'nothing',
  'plant.dropItem': V.iron,
  'plant.biomes': [V.desert],

  'tree.design': 'grown',
  'tree.logBlock': V.log,
  'tree.leavesBlock': V.leaves2,
  'tree.biomes': [V.desert],
  'tree.variants': [variant('v9', 'Other', { '0,0,0': V.sand, '0,1,0': V.sand })],

  'structure.placement': 'buried',
  'structure.biomes': [V.desert],
  'structure.variants': [variant('s9', 'Ruin', { '0,0,0': V.sand })],

  'recipe.recipeType': 'shapeless',
  'recipe.output': V.iron,
  'recipe.grid': ['', V.cobble, '', '', V.cobble, '', '', '', ''],
  'recipe.inputs': [V.stone, V.cobble],

  'mob.shape': 'quadruped',
  'mob.dropItem': V.iron,
  'mob.spawnBiomes': [V.desert],

  'biome.hostBiome': V.desert,
  'biome.generationStyle': 'climate',
  'biome.topBlock': V.sand,
  'biome.fillerBlock': V.sand,
  'biome.mapColor': 'ff0000',
  'biome.skyColor': 'ff00ff',
  'biome.waterColor': '00ff00',
  'biome.grassColor': 'ff8800',
  'biome.blockedWeathers': ['rain'],
  'biome.spawns': [{ entity: 'probe_mob', weight: 7 }],

  'dimension.biomes': [V.forest],
  'dimension.portalFrame': V.obsidian
}

const ACCEPTED: Record<string, string> = {
  'ore.displayName':
    'ore veins are not a registry entry and get no lang line; the shared Name field drives the registry id, which does reach the mod',
  'tree.displayName': 'same as ore.displayName: a tree is a world feature, not a named thing',
  'structure.displayName': 'same as ore.displayName',
  'recipe.displayName': 'a recipe has no name in game; the field only labels it in the sidebar'
}

const INTEGERISH = /(count|height|size|chunks?|weight|level|luminance|stackSize|durability|efficiency|damage|veins?|patches|minY|maxY)/i

function mutateByType(key: string, value: unknown): unknown {
  if (typeof value === 'boolean') return !value
  if (typeof value === 'number') {
    if (!INTEGERISH.test(key) && value >= 0 && value <= 1) return value > 0.5 ? 0.25 : 0.75
    return value === 0 ? 3 : Math.round(value) + 5
  }
  if (typeof value === 'string') return value === '' ? 'probe_value' : value + '_x'
  if (Array.isArray(value)) return value.length ? [] : ['probe_value']
  if (value === undefined) return 'probe_value'
  return value
}

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T

interface Result {
  liveIn: string[]
  deadIn: string[]
  sample: { from: unknown; to: unknown }
}

const results = new Map<string, Result>()
const errors: string[] = []

for (const kind of Object.keys(MODES) as ElementKind[]) {
  for (const [modeName, modeProps] of Object.entries(MODES[kind])) {
    const base = buildProject(kind, modeProps)
    const baseline = generated(base)
    const subject = base.elements.find((e) => e.name === `subject_${kind}`)!
    const props = subject.properties as Record<string, unknown>
    const keys = Array.from(
      new Set([...Object.keys(KIND_DEFAULTS[kind] ?? {}), ...Object.keys(props)])
    ).sort()

    for (const key of keys) {
      const id = `${kind}.${key}`
      const current = props[key]
      const override = MUTATE[id]
      const next = override !== undefined ? override : mutateByType(key, current)
      if (JSON.stringify(next) === JSON.stringify(current)) continue

      const trial = clone(base)
      const target = trial.elements.find((e) => e.name === `subject_${kind}`)!
      ;(target.properties as Record<string, unknown>)[key] = clone(next)

      let out: string
      try {
        out = generated(trial)
      } catch (err) {
        errors.push(`${id} [${modeName}]: generator threw ${(err as Error).message}`)
        continue
      }

      const r = results.get(id) ?? { liveIn: [], deadIn: [], sample: { from: current, to: next } }
      if (out === baseline) r.deadIn.push(modeName)
      else r.liveIn.push(modeName)
      results.set(id, r)
    }
  }
}

const short = (v: unknown): string => {
  const s = typeof v === 'string' ? v : JSON.stringify(v)
  if (s === undefined) return 'undefined'
  return s.length > 40 ? s.slice(0, 37) + '...' : s
}

const FORM_FILE: Record<ElementKind, string> = {
  block: 'BlockForm.tsx',
  item: 'ItemForm.tsx',
  liquid: 'LiquidForm.tsx',
  ore: 'OreForm.tsx',
  plant: 'PlantForm.tsx',
  tree: 'TreeForm.tsx',
  structure: 'StructureForm.tsx',
  recipe: 'RecipeForm.tsx',
  mob: 'MobForm.tsx',
  biome: 'BiomeForm.tsx',
  dimension: 'DimensionForm.tsx'
}

const SET_ELSEWHERE: Record<string, string> = {
  'block.displayName': 'the shared Name field in FormShell writes it for every kind',
  'item.displayName': 'FormShell',
  'liquid.displayName': 'FormShell',
  'ore.displayName': 'FormShell',
  'plant.displayName': 'FormShell',
  'tree.displayName': 'FormShell',
  'structure.displayName': 'FormShell',
  'recipe.displayName': 'FormShell',
  'mob.displayName': 'FormShell',
  'biome.displayName': 'FormShell',
  'dimension.displayName': 'FormShell',
  'item.piece': 'set by promoteGenerated when a kit piece is edited, never typed',
  'tree.variants': 'built in the Workshop voxel editor, not in the form',
  'structure.variants': 'built in the Workshop voxel editor, not in the form'
}

const formsDir = join(process.cwd(), 'src/renderer/src/sections/forms')
const sharedFormText = ['DropsFields.tsx', 'BiomesField.tsx', 'FormShell.tsx']
  .map((f) => readFileSync(join(formsDir, f), 'utf-8'))
  .join('\n')

const unreachable: string[] = []
for (const kind of Object.keys(MODES) as ElementKind[]) {
  const text = readFileSync(join(formsDir, FORM_FILE[kind]), 'utf-8') + sharedFormText
  const written = new Set<string>()
  for (const m of text.matchAll(/patch(?:Set)?\(\s*'(\w+)'/g)) written.add(m[1])

  for (const key of Object.keys(KIND_DEFAULTS[kind] ?? {})) {
    const id = `${kind}.${key}`
    if (written.has(key) || SET_ELSEWHERE[id]) continue
    unreachable.push(id)
  }
}
if (unreachable.length) {
  console.log('\nNO FORM SETS THESE, and no reason is recorded')
  for (const id of unreachable) console.log('  ' + id)
}

const alwaysDead = [...results].filter(([id, r]) => r.liveIn.length === 0 && !ACCEPTED[id])
const acceptedDead = [...results].filter(([id, r]) => r.liveIn.length === 0 && ACCEPTED[id])
const partlyDead = [...results].filter(([, r]) => r.liveIn.length > 0 && r.deadIn.length > 0)
const fullyLive = [...results].filter(([, r]) => r.deadIn.length === 0)

const modeCount = Object.values(MODES).reduce((n, m) => n + Object.keys(m).length, 0)
console.log(`probed ${results.size} properties over ${modeCount} modes of ${Object.keys(MODES).length} kinds`)
console.log(
  `always live: ${fullyLive.length}   inert in some modes: ${partlyDead.length}   ` +
    `dead: ${alwaysDead.length}   dead on purpose: ${acceptedDead.length}`
)

if (alwaysDead.length) {
  console.log('\nDEAD: changes nothing in the generated mod, in any mode')
  for (const [id, r] of alwaysDead) {
    console.log(`  ${id.padEnd(30)} ${short(r.sample.from)} -> ${short(r.sample.to)}`)
  }
}
if (partlyDead.length) {
  console.log('\nCONDITIONAL: live in some modes, inert in others')
  console.log('(the form must hide these where they do nothing, or they read as broken)')
  for (const [id, r] of partlyDead) {
    console.log(`  ${id.padEnd(30)} inert in: ${r.deadIn.join(', ')}`)
  }
}
if (errors.length) {
  console.log('\nGENERATOR ERRORS')
  for (const e of errors) console.log('  ' + e)
}
console.log(alwaysDead.length === 0 && errors.length === 0 ? '\nCONTROLS PASS' : '\nCONTROLS: see above')
