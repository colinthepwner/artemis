import { CodeGenerator } from '../src/shared/generator/CodeGenerator'
import { createEmptyProject, type ArtemisProject, type ElementKind } from '../src/shared/project'
import {
  BLOCK_DEFAULTS,
  ITEM_DEFAULTS,
  LIQUID_DEFAULTS,
  RECIPE_DEFAULTS
} from '../src/shared/generator/props'
import { migrateProject } from '../src/shared/migrate'

let failures = 0
const fail = (msg: string): void => {
  console.error(`FAIL: ${msg}`)
  failures++
}
const ok = (cond: boolean, msg: string): void => {
  if (!cond) fail(msg)
}

const now = '2026-09-01T00:00:00Z'

function fixture(): ArtemisProject {
  const p = createEmptyProject('Group Test', 'grouptest')
  let n = 0
  const add = (kind: ElementKind, name: string, properties: Record<string, unknown>): string => {
    const id = `e${n++}`
    p.elements.push({ id, kind, name, properties, createdAt: now, updatedAt: now })
    return id
  }

  const cinder = add('item', 'cinder', { ...ITEM_DEFAULTS, category: 'material', stackSize: 64 })
  add('item', 'loose_pebble', { ...ITEM_DEFAULTS, category: 'misc' })
  const ruby = add('item', 'ruby', { ...ITEM_DEFAULTS, category: 'material', stackSize: 32 })
  const ember = add('item', 'ember', { ...ITEM_DEFAULTS, category: 'drop' })

  add('recipe', 'ruby_recipe', { ...RECIPE_DEFAULTS })
  add('block', 'plain_stone', { ...BLOCK_DEFAULTS, creativeCategory: 'stone' })

  p.groups = [
    {
      id: 'g1',
      name: 'Ruby',
      shelf: 'oreDrop',
      kind: 'item',

      members: [ruby, ember, cinder],
      color: '#e6ad55'
    }
  ]
  return p
}

const build = (project: ArtemisProject): Map<string, string> =>
  new Map(new CodeGenerator(project).generate().map((f) => [f.path, f.content]))

const declsOf = (src: string): string[] => src.split(/\n\n(?=\tpublic static final )/).slice(1)
const declFor = (src: string, field: string): string | undefined =>
  declsOf(src).find((d) => d.includes(` ${field} =`))

const files = build(fixture())
const groups = files.get('src/main/java/com/grouptest/init/ModGroups.java')
const items = files.get('src/main/java/com/grouptest/init/ModItems.java') ?? ''
const blocks = files.get('src/main/java/com/grouptest/init/ModBlocks.java') ?? ''
const entry = files.get('src/main/java/com/grouptest/GrouptestMod.java') ?? ''

if (!groups) {
  fail('no ModGroups.java was written for a project with a shelved group')
} else {
  const placed = [...groups.matchAll(/place\((Mod\w+\.\w+),/g)].map((m) => m[1])
  const dupes = placed.filter((r, i) => placed.indexOf(r) !== i)
  ok(dupes.length === 0, `a member is placed twice: ${dupes.join(', ')}`)

  const expected = ['ModItems.RUBY', 'ModItems.EMBER', 'ModItems.CINDER']
  ok(
    JSON.stringify(placed) === JSON.stringify(expected),
    `wrong order.\n  want ${expected.join(' ')}\n  got  ${placed.join(' ')}`
  )

  const cats = new Set([...groups.matchAll(/CreativeInventoryCategory\.(\w+)\)/g)].map((m) => m[1]))
  ok(
    cats.size === 1 && cats.has('ORE_PRODUCTS'),
    `members did not all land on the group's shelf: ${[...cats].join(', ')}`
  )

  ok(
    groups.includes(
      'CreativeInventoryRegistry.INSTANCE.register(entry, new CreativeInventoryPlacement.Category(category))'
    ),
    'the place() helper is not the verified halplibe call'
  )
  ok(
    groups.includes('import net.minecraft.core.item.IItemConvertible;') &&
      groups.includes(
        'import turniplabs.halplibe.helper.creativeInventory.CreativeInventoryRegistry;'
      ),
    'ModGroups is missing an import it names'
  )
  ok(
    !groups.includes('import com.grouptest.init.ModItems;'),
    'ModGroups imports a class from its own package'
  )
  ok(!groups.includes('LOOSE_PEBBLE'), 'an ungrouped item was placed by the groups class')
}

for (const field of ['RUBY', 'EMBER', 'CINDER']) {
  const decl = declFor(items, field)
  if (decl?.includes('setCreativeInventoryPlacement')) {
    fail(`ModItems: ${field} is in a group and still carries a builder placement`)
  }
}

ok(
  /PLAIN_STONE[\s\S]*?CreativeInventoryCategory\.STONE/.test(blocks),
  'an ungrouped block lost the shelf it picked for itself'
)
ok(
  !!declFor(items, 'LOOSE_PEBBLE')?.includes('setCreativeInventoryPlacement'),
  'an ungrouped item lost its builder placement'
)

const order = ['ModItems.init();', 'ModGroups.init();'].map((c) => entry.indexOf(c))
ok(
  order.every((i) => i >= 0),
  'the entrypoint does not call ModGroups.init()'
)
ok(order[1] > order[0], 'ModGroups.init() runs before the class whose fields it names')

const folderOnly = fixture()
folderOnly.groups![0].shelf = ''
const plainFiles = new CodeGenerator(folderOnly).generate()
ok(
  !plainFiles.some((f) => f.path.endsWith('ModGroups.java')),
  'a group with no shelf still emitted a groups class'
)
const ungrouped = fixture()
ungrouped.groups = []
const base = build(ungrouped)
for (const f of plainFiles) {
  if (base.get(f.path) !== f.content) {
    fail(`a shelf-less group changed ${f.path}, which should be identical to having no group`)
  }
}

{
  const shared = fixture()
  shared.groups![0].props = {
    stackSize: 16,
    burnTime: 400,
    blockUses: [
      {
        id: 'shared-1',
        on: 'block',
        target: 'block:DIRT',
        effects: [{ kind: 'becomes', block: 'block:GRASS' }]
      }
    ]
  }
  const out = build(shared)
  const src = out.get('src/main/java/com/grouptest/init/ModItems.java') ?? ''

  for (const field of ['RUBY', 'EMBER', 'CINDER']) {
    ok(!!declFor(src, field), `${field} was not declared at all`)
    ok(
      !!declFor(src, field)?.includes('.setStackSize(16)'),
      `${field} did not take the group's stack size`
    )
  }

  ok(!src.includes('.setStackSize(32)'), "a member's own value beat the group's")

  ok(
    !declFor(src, 'LOOSE_PEBBLE')?.includes('setStackSize'),
    'an ungrouped item picked up the group’s stack size'
  )

  for (const cls of ['ItemRuby', 'ItemEmber', 'ItemCinder']) {
    const file = out.get(`src/main/java/com/grouptest/item/${cls}.java`)
    ok(!!file, `${cls} was not written, so the shared right-click rules did not reach it`)
    ok(!!file?.includes('Blocks.GRASS'), `${cls} did not get the shared rule's effect`)
  }
  ok(
    !out.has('src/main/java/com/grouptest/item/ItemLoosePebble.java'),
    'an ungrouped item was given the group’s rules'
  )

  const fuel = (out.get('src/main/java/com/grouptest/GrouptestMod.java') ?? '')
    .split('\n')
    .filter((l) => /addFuelEntry|LookupFuelFurnace/.test(l))
  ok(fuel.length >= 3, `the shared burn time reached ${fuel.length} of 3 members`)
}

{

  const wet = createEmptyProject('Wet', 'wet')
  wet.elements = ['spring', 'creek'].map((name, i) => ({
    id: `l${i}`,
    kind: 'liquid' as const,
    name,
    properties: { ...LIQUID_DEFAULTS, luminance: 0 },
    createdAt: now,
    updatedAt: now
  }))
  wet.groups = [
    {
      id: 'gw',
      name: 'Waters',
      shelf: '',
      kind: 'liquid',
      members: ['l0', 'l1'],
      color: '#6f8fee',
      props: { luminance: 11 }
    }
  ]
  const src = build(wet).get('src/main/java/com/wet/init/ModBlocks.java') ?? ''
  const lit = (src.match(/\.setLuminance\(11\)/g) ?? []).length
  ok(lit === 4, `a shared luminance reached ${lit} of 4 liquid halves`)
  ok(
    /SPRING_FLOWING[\s\S]*?NOT_IN_CREATIVE_MENU/.test(src),
    'the hidden flowing half lost its guard once the liquid joined a group'
  )
}

{
  const rotten = fixture()

  rotten.groups!.push({
    id: 'g2',
    name: 'Second',
    shelf: 'misc',
    members: ['e0', 'nope'],
    color: '#ffffff'
  })
  rotten.groups!.push({
    id: 'g3',
    name: 'Mixed',
    shelf: 'misc',

    members: ['e1', 'e5'],
    color: '#ffffff'
  })
  migrateProject(rotten)

  const byId = (id: string): NonNullable<ArtemisProject['groups']>[number] =>
    rotten.groups!.find((g) => g.id === id)!
  ok(!byId('g2').members.includes('nope'), 'migrate kept a member id no element answers to')
  ok(
    rotten.groups!.filter((g) => g.members.includes('e0')).length === 1,
    'migrate left one element claimed by two groups'
  )
  ok(byId('g3').kind === 'item', `a mixed group settled on ${byId('g3').kind}, not its first member`)
  ok(!byId('g3').members.includes('e5'), 'migrate left a block in a group of items')
  ok(byId('g1').kind === 'item', 'migrate lost the kind of a group that was already correct')

  const twice = JSON.parse(JSON.stringify(rotten)) as ArtemisProject
  migrateProject(twice)
  ok(
    JSON.stringify(twice.groups) === JSON.stringify(rotten.groups),
    'migrateGroups is not idempotent'
  )
}

{
  const emptied = fixture()
  emptied.groups![0].props = { stackSize: 8 }
  emptied.groups![0].members = []
  migrateProject(emptied)
  const g = emptied.groups![0]
  ok(g.kind === undefined, 'an empty group kept a kind it no longer holds')
  ok(g.props === undefined, 'an empty group kept settings for content it no longer has')
}

if (groups) {
  console.log('---- ModGroups.java ----')
  console.log(groups)
}

if (failures) {
  console.error(`${failures} failure(s)`)
  process.exit(1)
}
console.log('GROUPS PASS')
