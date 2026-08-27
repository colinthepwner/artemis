import { CodeGenerator } from '../src/shared/generator/CodeGenerator'
import { createEmptyProject, type ArtemisProject } from '../src/shared/project'
import { KIND_DEFAULTS, type BuildVariant } from '../src/shared/generator/props'
import { structureFeatureClassName } from '../src/shared/generator/templates/structure'
import { treeFeatureClassName } from '../src/shared/generator/templates/tree'
import { HALF, MAX_Y, keyOf, inBounds } from '../src/renderer/src/components/workshop/voxel'
import { normalize } from '../src/renderer/src/store/projectStore'

let failures = 0
let passes = 0
const check = (name: string, condition: boolean, detail?: string): void => {
  if (condition) passes++
  else {
    failures++
    console.log(`  FAIL ${name}${detail ? `\n       ${detail}` : ''}`)
  }
}

let seq = 0
function project(
  build: (add: (kind: string, name: string, props: Record<string, unknown>) => void) => void
): ArtemisProject {
  const p = createEmptyProject('workshop', 'workshop')
  p.meta.authors = ['Colin']
  build((kind, name, props) => {
    p.elements.push({
      id: `w${seq++}`,
      kind: kind as never,
      name,
      properties: { ...(KIND_DEFAULTS[kind as never] ?? {}), ...props },
      createdAt: '2026-08-27T00:00:00Z',
      updatedAt: '2026-08-27T00:00:00Z'
    })
  })
  return p
}

const generate = (p: ArtemisProject): Map<string, string> =>
  new Map(new CodeGenerator(p).generate().map((f) => [f.path.replace(/\\/g, '/'), f.content]))

const featureSource = (files: Map<string, string>, registryName: string, kind: 'structure' | 'tree' = 'structure'): string => {
  const cls = kind === 'tree' ? treeFeatureClassName(registryName) : structureFeatureClassName(registryName)
  const hit = [...files].find(([path]) => path.endsWith(`/${cls}.java`))
  return hit ? hit[1] : ''
}

function delta(expr: string, axis: string): number | null {
  const t = expr.trim()
  if (t === axis) return 0
  const m = new RegExp(`^${axis}\\s*([+-])\\s*(\\d+)$`).exec(t)
  if (!m) return null
  return m[1] === '+' ? Number(m[2]) : -Number(m[2])
}

interface PlacedCell {
  x: number
  y: number
  z: number
  block: string
  guarded: boolean

  variant: number
}

const RE_PLACE =
  /^\s*(if \(world\.getBlockId\(([^)]*)\) == 0\) )?world\.setBlockWithNotify\(([^,]+),([^,]+),([^,]+),\s*(.+?)\.id\(\)\);\s*$/

function placedCells(java: string): { cells: PlacedCell[]; unparsed: string[] } {
  const cells: PlacedCell[] = []
  const unparsed: string[] = []
  let variant = -1
  for (const line of java.split('\n')) {
    const method = /private void place(\d+)\(/.exec(line)
    if (method) {
      variant = Number(method[1])
      continue
    }
    if (!line.includes('setBlockWithNotify')) continue
    const m = RE_PLACE.exec(line)
    if (!m) {
      unparsed.push(line)
      continue
    }
    const x = delta(m[3], 'x')
    const y = delta(m[4], 'y')
    const z = delta(m[5], 'z')
    if (x === null || y === null || z === null) {
      unparsed.push(line)
      continue
    }

    if (m[1]) {
      const guardArgs = m[2].split(',')
      const same =
        guardArgs.length === 3 &&
        delta(guardArgs[0], 'x') === x &&
        delta(guardArgs[1], 'y') === y &&
        delta(guardArgs[2], 'z') === z
      if (!same) unparsed.push(line)
    }
    cells.push({ x, y, z, block: m[6].trim(), guarded: !!m[1], variant })
  }
  return { cells, unparsed }
}

const SHAPE: Record<string, string> = {
  [keyOf(0, 0, 0)]: 'marble',
  [keyOf(0, 1, 0)]: 'marble',
  [keyOf(0, 2, 0)]: 'marble',
  [keyOf(1, 2, 0)]: 'block:LEAVES_OAK',
  [keyOf(-2, 2, 0)]: 'block:LEAVES_OAK',
  [keyOf(0, 2, 3)]: 'block:LEAVES_OAK',
  [keyOf(0, 2, -4)]: 'block:LEAVES_OAK',
  [keyOf(-HALF, 0, HALF)]: 'marble',
  [keyOf(HALF, MAX_Y, -HALF)]: 'block:LEAVES_OAK'
}

const variant = (id: string, name: string, blocks: Record<string, string>): BuildVariant => ({
  id,
  name,
  blocks
})

function main(): void {

  console.log('the cells that went in are the cells that come out')

  {
    const p = project((add) => {
      add('block', 'marble', {})
      add('structure', 'shrine', { variants: [variant('s1', 'Only', SHAPE)] })
    })
    const java = featureSource(generate(p), 'shrine')
    check('a built structure emits its feature class', java.length > 0)

    const { cells, unparsed } = placedCells(java)
    check('every place line parses', unparsed.length === 0, unparsed.join('\n'))
    check(
      'one place line per built cell, no more and no fewer',
      cells.length === Object.keys(SHAPE).length,
      `${cells.length} lines for ${Object.keys(SHAPE).length} cells`
    )
    const emitted = new Set(cells.map((c) => keyOf(c.x, c.y, c.z)))
    check('no cell is placed twice', emitted.size === cells.length)
    const missing = Object.keys(SHAPE).filter((k) => !emitted.has(k))
    check('every built cell reaches the mod', missing.length === 0, missing.join(' '))
    const extra = [...emitted].filter((k) => !(k in SHAPE))
    check('and nothing else does', extra.length === 0, extra.join(' '))

    const byKey = new Map(cells.map((c) => [keyOf(c.x, c.y, c.z), c]))
    check(
      'the anchor cell places at exactly x, y, z with no offset',
      !!byKey.get(keyOf(0, 0, 0)),
      'the cell at the gold anchor square must carry no offset at all'
    )
    check('a cell at +3 on z is emitted on z', !!byKey.get(keyOf(0, 2, 3)))
    check('a cell at -4 on z is emitted on z', !!byKey.get(keyOf(0, 2, -4)))
    check('a cell at -2 on x is emitted on x', !!byKey.get(keyOf(-2, 2, 0)))
    check(
      'the far corner of the editor grid survives',
      !!byKey.get(keyOf(HALF, MAX_Y, -HALF)),
      `x=${HALF} y=${MAX_Y} z=${-HALF} is a cell the editor lets you place`
    )

    const marbleCells = Object.entries(SHAPE).filter(([, ref]) => ref === 'marble').map(([k]) => k)
    const marbleExprs = new Set(marbleCells.map((k) => byKey.get(k)?.block))
    check('every cell of one block resolves to one expression', marbleExprs.size === 1, [...marbleExprs].join(' | '))
    check(
      'a project block resolves to the mod field, not a string',
      [...marbleExprs][0]?.includes('MARBLE') === true,
      [...marbleExprs][0]
    )
    const leafExpr = byKey.get(keyOf(0, 2, 3))?.block
    check('a vanilla ref resolves to the game constant', leafExpr?.includes('LEAVES_OAK') === true, leafExpr)

    const ys = cells.map((c) => c.y)
    check('cells are emitted bottom up', ys.every((y, i) => i === 0 || ys[i - 1] <= y), ys.join(','))
    const again = featureSource(generate(p), 'shrine')
    check('re-generating an untouched project is byte identical', again === java)
  }

  console.log('\nevery variant is reachable')

  {
    const p = project((add) => {
      add('block', 'marble', {})
      add('structure', 'shrine', {
        variants: [
          variant('s1', 'Tall', { [keyOf(0, 0, 0)]: 'marble', [keyOf(0, 1, 0)]: 'marble' }),
          variant('s2', 'Wide', { [keyOf(0, 0, 0)]: 'marble', [keyOf(1, 0, 0)]: 'marble' }),
          variant('s3', 'Bent', { [keyOf(0, 0, 0)]: 'marble', [keyOf(0, 0, 1)]: 'marble' })
        ]
      })
    })
    const java = featureSource(generate(p), 'shrine')
    const { cells } = placedCells(java)

    const nextInt = /random\.nextInt\((\d+)\)/.exec(java)
    check('the feature rolls for a variant', !!nextInt)
    check('and rolls across exactly the built variants', nextInt?.[1] === '3', nextInt?.[1])

    const cases = [...java.matchAll(/case (\d+): place(\d+)\(/g)].map((m) => [Number(m[1]), Number(m[2])])
    check('one case per variant', cases.length === 3, JSON.stringify(cases))
    check(
      'every case calls its own method',
      cases.every(([c, m]) => c === m),
      JSON.stringify(cases)
    )
    check(
      'the cases are 0..n-1, so no roll lands on nothing',
      [...new Set(cases.map(([c]) => c))].sort().join(',') === '0,1,2',
      JSON.stringify(cases)
    )
    const methods = [...java.matchAll(/private void place(\d+)\(/g)].map((m) => Number(m[1]))
    check('one method per case, no orphans', methods.sort().join(',') === '0,1,2', methods.join(','))
    for (const i of [0, 1, 2]) {
      check(`variant ${i} places something`, cells.some((c) => c.variant === i))
    }

    const perVariant = [0, 1, 2].map((i) => cells.filter((c) => c.variant === i).map((c) => keyOf(c.x, c.y, c.z)).sort().join('|'))
    check('the variants are distinct builds', new Set(perVariant).size === 3, perVariant.join('  '))

    const withEmpty = project((add) => {
      add('block', 'marble', {})
      add('structure', 'shrine', {
        variants: [
          variant('s1', 'Real', { [keyOf(0, 0, 0)]: 'marble' }),
          variant('s2', 'Never built', {})
        ]
      })
    })
    const emptyJava = featureSource(generate(withEmpty), 'shrine')
    check('an empty variant is dropped', /random\.nextInt\(1\)/.test(emptyJava), emptyJava.slice(0, 200))
    check(
      'and takes no case with it',
      [...emptyJava.matchAll(/case (\d+):/g)].length === 1
    )

    const nothing = project((add) => {
      add('block', 'marble', {})
      add('structure', 'shrine', { variants: [variant('s1', 'Empty', {})] })
    })
    check('a structure with nothing built emits no feature class', featureSource(generate(nothing), 'shrine') === '')
  }

  console.log('\nthe two rules a modder never sees')

  {

    const p = project((add) => {
      add('block', 'ashwood_log', {})
      add('block', 'ashwood_leaves', {})
      add('tree', 'ashwood', {
        design: 'built',
        variants: [
          variant('t1', 'A', {
            [keyOf(0, 0, 0)]: 'ashwood_log',
            [keyOf(0, 1, 0)]: 'ashwood_log',
            [keyOf(1, 1, 0)]: 'ashwood_leaves',
            [keyOf(0, 1, 1)]: 'ashwood_leaves',
            [keyOf(-1, 2, -1)]: 'ashwood_leaves'
          })
        ]
      })
    })
    const java = featureSource(generate(p), 'ashwood', 'tree')
    const { cells, unparsed } = placedCells(java)
    check('a built tree emits its feature class', java.length > 0)
    check('every tree place line parses', unparsed.length === 0, unparsed.join('\n'))
    const trunk = cells.filter((c) => c.x === 0 && c.z === 0)
    const canopy = cells.filter((c) => !(c.x === 0 && c.z === 0))
    check('the trunk column has cells to check', trunk.length === 2)
    check('the trunk stamps unconditionally', trunk.every((c) => !c.guarded))
    check('the canopy has cells to check', canopy.length === 3)
    check('everything off the trunk only fills air', canopy.every((c) => c.guarded))
    check(
      'a built tree carries the GROWS_TREES ground gate',
      /BlockTags\.GROWS_TREES/.test(java),
      'without it a tree plants on another tree\'s canopy, because the heightmap counts leaves'
    )

    const s = project((add) => {
      add('block', 'marble', {})
      add('structure', 'shrine', { variants: [variant('s1', 'A', SHAPE)] })
    })
    const sJava = featureSource(generate(s), 'shrine')
    check('a structure has no ground gate', !/GROWS_TREES/.test(sJava))
    check(
      'and stamps every cell unconditionally',
      placedCells(sJava).cells.every((c) => !c.guarded)
    )
  }

  console.log('\nsave, reopen, export: the same cells')

  {
    const p = project((add) => {
      add('block', 'marble', {})
      add('structure', 'shrine', {
        variants: [variant('s1', 'A', SHAPE), variant('s2', 'B', { [keyOf(2, 0, 2)]: 'marble' })]
      })
    })
    const before = featureSource(generate(p), 'shrine')

    const reopened = normalize(JSON.parse(JSON.stringify(p)) as ArtemisProject)
    const el = reopened.elements.find((e) => e.kind === 'structure')!
    const variants = (el.properties as { variants: BuildVariant[] }).variants
    check('the variants survive the file', variants.length === 2)
    check(
      'every cell survives with its block',
      Object.entries(SHAPE).every(([k, v]) => variants[0].blocks[k] === v),
      JSON.stringify(variants[0].blocks)
    )
    check('and no cell is invented', Object.keys(variants[0].blocks).length === Object.keys(SHAPE).length)
    check('the variant keeps its name', variants[0].name === 'A')
    check('and its id, which the editor tracks undo by', variants[0].id === 's1')
    check('exporting after a reopen produces identical Java', featureSource(generate(reopened), 'shrine') === before)

    const twice = normalize(JSON.parse(JSON.stringify(reopened)) as ArtemisProject)
    check(
      'and a second reopen changes nothing',
      JSON.stringify(twice) === JSON.stringify(reopened)
    )
  }

  console.log('\nthe editor grid and the exporter agree')

  {

    const corners: [number, number, number][] = [
      [0, 0, 0],
      [HALF, 0, HALF],
      [-HALF, 0, -HALF],
      [HALF, MAX_Y, HALF],
      [-HALF, MAX_Y, -HALF],
      [0, MAX_Y, 0]
    ]
    check('every corner is inside the editor grid', corners.every(([x, y, z]) => inBounds(x, y, z)))
    check('and one step past the edge is not', !inBounds(HALF + 1, 0, 0) && !inBounds(0, MAX_Y + 1, 0) && !inBounds(0, -1, 0))

    const blocks: Record<string, string> = {}
    for (const [x, y, z] of corners) blocks[keyOf(x, y, z)] = 'marble'
    const p = project((add) => {
      add('block', 'marble', {})
      add('structure', 'edges', { variants: [variant('s1', 'A', blocks)] })
    })
    const { cells } = placedCells(featureSource(generate(p), 'edges'))
    check(
      'every cell the editor allows reaches the mod',
      corners.every(([x, y, z]) => cells.some((c) => c.x === x && c.y === y && c.z === z)),
      `${cells.length} of ${corners.length}`
    )

    const junk = project((add) => {
      add('block', 'marble', {})
      add('structure', 'junk', {
        variants: [
          variant('s1', 'A', {
            [keyOf(0, 0, 0)]: 'marble',
            'not,a,cell': 'marble',
            '1,2': 'marble',
            '': 'marble'
          })
        ]
      })
    })
    const junkJava = featureSource(generate(junk), 'junk')
    check('a malformed cell key is dropped, not emitted', !/NaN|undefined/.test(junkJava), junkJava)
    check('and the good cell still places', placedCells(junkJava).cells.length === 1)
  }

  console.log('\nnothing is planted from two sides')

  {

    const p = project((add) => {
      add('block', 'ashwood_log', {})
      add('block', 'ashwood_leaves', {})
      add('tree', 'ashwood', {
        design: 'built',
        logBlock: 'ashwood_log',
        leavesBlock: 'ashwood_leaves',
        variants: [variant('t1', 'A', { [keyOf(0, 0, 0)]: 'ashwood_log', [keyOf(0, 1, 0)]: 'ashwood_leaves' })]
      })
    })
    const files = generate(p)
    const cls = treeFeatureClassName('ashwood')
    const treeClasses = [...files.keys()].filter((f) => /Ashwood/.test(f) && f.endsWith('.java'))
    check(
      'a built tree emits one feature class, not two',
      treeClasses.length === 1,
      treeClasses.join(', ')
    )

    const body = featureSource(files, 'ashwood', 'tree')
    check('the built shape won', /private void place0\(/.test(body))
    check(
      'and the grown shape is not in the same class',
      !/nextInt\(\s*\d+\s*\)\s*\+\s*\d+/.test(body.replace(/random\.nextInt\(1\)/g, '')),
      'the grown template rolls a height; a built tree only rolls a variant'
    )
    const all = [...files.values()].join('\n')
    const mentions = [...all.matchAll(new RegExp(cls, 'g'))].length
    check(
      'the class is named where it is declared and where it is planted',
      mentions >= 2,
      `${mentions} mentions of ${cls}`
    )
  }

  console.log(`\n${passes} checks passed, ${failures} failed`)
  if (failures) {
    console.log('WORKSHOP FAIL')
    process.exit(1)
  }
  console.log('WORKSHOP PASS')
}

main()
