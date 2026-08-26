import { CodeGenerator } from '../src/shared/generator/CodeGenerator'
import { createEmptyProject } from '../src/shared/project'
import {
  BLOCK_DEFAULTS,
  ORE_DEFAULTS,
  RECIPE_DEFAULTS,
  MOB_DEFAULTS,
  BIOME_DEFAULTS,
  TREE_DEFAULTS
} from '../src/shared/generator/props'

const project = createEmptyProject('Test Mod', 'testmod')
project.meta.authors = ['Colin']
let n = 0
const add = (kind: string, name: string, properties: Record<string, unknown>): void => {
  project.elements.push({
    id: `id-${n++}`,
    kind: kind as never,
    name,
    properties,
    createdAt: '2026-08-25T00:00:00Z',
    updatedAt: '2026-08-25T00:00:00Z'
  })
}

add('block', 'marble', { ...BLOCK_DEFAULTS, displayName: 'Marble', luminance: 3 })
add('ore', 'ruby_ore', { ...ORE_DEFAULTS, displayName: 'Ruby Ore', generateSet: true, set: { ...ORE_DEFAULTS.set } })
add('recipe', 'ruby_block_recipe', {
  ...RECIPE_DEFAULTS,
  recipeType: 'shaped',
  grid: ['ruby', 'ruby', 'ruby', 'ruby', 'ruby', 'ruby', 'ruby', 'ruby', 'ruby'],
  output: 'marble',
  outputCount: 1
})
add('mob', 'dust_wraith', { ...MOB_DEFAULTS, displayName: 'Dust Wraith', hostile: true, dropItem: 'ruby' })
add('tree', 'silverwood', { ...TREE_DEFAULTS, displayName: 'Silverwood' })
add('biome', 'ashen_highlands', {
  ...BIOME_DEFAULTS,
  displayName: 'Ashen Highlands',
  spawns: [{ entity: 'dust_wraith', weight: 12 }]
})

const files = new CodeGenerator(project).generate()
for (const f of files) {
  console.log(`\n${'='.repeat(70)}\n${f.path}\n${'='.repeat(70)}`)
  console.log(f.content)
}
