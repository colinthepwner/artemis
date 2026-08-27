import { isNewerVersion, versionCore } from '../src/shared/version'
import { buildCompletions } from '../src/shared/generator/completions'
import { getVanillaRegistry } from '../src/shared/generator/vanilla'
import { getMapping } from '../src/shared/generator/mappings'
import {
  HALF,
  MAX_Y,
  keyOf,
  parseKey,
  inBounds,
  visibleVoxels,
  highestY,
  seedGrownVariant
} from '../src/renderer/src/components/workshop/voxel'
import { TREE_DEFAULTS } from '../src/shared/generator/props'
import { SCENARIOS } from './audit-fixtures'
import { readFileSync, readdirSync, statSync } from 'fs'
import { associationEntries, projectPathFromArgv } from '../src/main/fileAssociation'
import { join, sep } from 'path'

const walkTs = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f)
    return statSync(p).isDirectory() ? walkTs(p) : /\.tsx?$/.test(p) ? [p] : []
  })

let failures = 0
let passes = 0
const check = (name: string, condition: boolean, detail?: string): void => {
  if (condition) passes++
  else {
    failures++
    console.log(`  FAIL ${name}${detail ? `\n       ${detail}` : ''}`)
  }
}

console.log('version compare (the updater runs this on every launch)')

{
  const newer: [string, string][] = [
    ['0.2.0', '0.1.0'],
    ['1.0.0', '0.9.9'],
    ['0.1.1', '0.1.0'],
    ['0.10.0', '0.9.0'],
    ['v0.2.0', '0.1.0'],
    ['0.2.0', 'v0.1.0'],
    ['1.2.3', '1.2.2'],
    ['0.2.0-beta.1', '0.1.0']
  ]
  for (const [a, b] of newer) {
    check(`${a} is newer than ${b}`, isNewerVersion(a, b), JSON.stringify([versionCore(a), versionCore(b)]))
  }

  const notNewer: [string, string][] = [
    ['0.1.0', '0.1.0'],
    ['0.1.0', '0.2.0'],
    ['0.9.0', '0.10.0'],

    ['0.1.0-beta.1', '0.1.0'],

    ['0.1.0', '0.1.0-beta.1'],
    ['0.1.0-rc.2', '0.1.0-rc.1'],
    ['v0.1.0', '0.1.0'],
    ['0.1', '0.1.0'],
    ['garbage', '0.1.0']
  ]
  for (const [a, b] of notNewer) {
    check(`${a} is not newer than ${b}`, !isNewerVersion(a, b), JSON.stringify([versionCore(a), versionCore(b)]))
  }

  const all = [...new Set([...newer, ...notNewer].flat())]
  const symmetric: string[] = []
  for (const a of all) {
    for (const b of all) {
      if (isNewerVersion(a, b) && isNewerVersion(b, a)) symmetric.push(`${a} <-> ${b}`)
    }
  }
  check('no pair is newer than itself in both directions', symmetric.length === 0, symmetric.join(', '))
  check('nothing is newer than itself', all.every((v) => !isNewerVersion(v, v)))
}

console.log('editor completions (a wrong symbol is code that will not compile)')

{
  const project = SCENARIOS.find((s) => s.name === 'kitchen sink')!.build()
  const items = buildCompletions(project)
  check('completions are built at all', items.length > 50, `${items.length} items`)

  const dupes = new Map<string, number>()
  for (const c of items) {
    const k = `${c.owner ?? '(global)'}.${c.kind}:${c.apply ?? c.label}`
    dupes.set(k, (dupes.get(k) ?? 0) + 1)
  }
  const repeated = [...dupes].filter(([, n]) => n > 1)
  check(
    'no completion is offered twice',
    repeated.length === 0,
    repeated.slice(0, 10).map(([k, n]) => `${k} x${n}`).join(', ')
  )

  check(
    'every completion has a label',
    items.every((c) => typeof c.label === 'string' && c.label.trim().length > 0)
  )
  const badLabels = items.filter((c) => /\s/.test(c.label) && c.kind !== 'snippet')
  check(
    'no non-snippet completion has whitespace in its label',
    badLabels.length === 0,
    badLabels.slice(0, 8).map((c) => `${c.kind}:${JSON.stringify(c.label)}`).join(', ')
  )

  const reg = getVanillaRegistry(project.meta.targetBta)
  const fields = {
    Blocks: new Set(reg.blocks.map((b) => b.field)),
    Items: new Set(reg.items.map((i) => i.field)),
    Biomes: new Set(reg.biomes.map((b) => b.field))
  }
  const bogus: string[] = []
  for (const c of items) {
    const owner = (c as { owner?: string }).owner
    if (!owner || !(owner in fields)) continue
    if (!fields[owner as keyof typeof fields].has(c.label)) bogus.push(`${owner}.${c.label}`)
  }
  check(
    'every vanilla constant offered actually exists in the registry',
    bogus.length === 0,
    bogus.slice(0, 12).join(', ')
  )

  const labels = new Set(items.map((c) => c.label))
  check('the mod’s own blocks are offered', labels.has('MARBLE') || labels.has('RUBY_ORE'), '')
  check('the mod’s own items are offered', labels.has('RUBY') || labels.has('ASH'), '')
  check(
    'generated kit pieces are offered too',
    labels.has('RUBY_PICKAXE'),
    'a kit piece is as real as any other item and the editor should know it'
  )

  const mapping = getMapping(project.meta.targetBta)
  const importable = new Set(Object.keys(mapping.imports ?? {}))
  const classes = items.filter((c) => c.kind === 'class').map((c) => c.label)
  const unimportable = classes.filter((c) => !importable.has(c) && !/^Mod[A-Z]/.test(c))
  check(
    'every class completion is one the generator can import',
    unimportable.length === 0,
    unimportable.slice(0, 12).join(', ')
  )
}

console.log('workshop grid (a cell out of bounds reaches the world)')

{
  check('keyOf and parseKey round trip', (() => {
    for (const [x, y, z] of [[0, 0, 0], [-15, 31, 15], [3, 7, -9], [-1, 0, -1]]) {
      const p = parseKey(keyOf(x, y, z))
      if (p.x !== x || p.y !== y || p.z !== z) return false
    }
    return true
  })())

  check('the corners of the grid are in bounds', inBounds(-HALF, 0, -HALF) && inBounds(HALF, MAX_Y, HALF))
  check(
    'one step past every edge is out of bounds',
    !inBounds(-HALF - 1, 0, 0) &&
      !inBounds(HALF + 1, 0, 0) &&
      !inBounds(0, -1, 0) &&
      !inBounds(0, MAX_Y + 1, 0) &&
      !inBounds(0, 0, -HALF - 1) &&
      !inBounds(0, 0, HALF + 1)
  )

  {
    const blocks: Record<string, string> = {}
    for (let x = -1; x <= 1; x++)
      for (let y = 0; y <= 2; y++) for (let z = -1; z <= 1; z++) blocks[keyOf(x, y, z)] = 'block:STONE'
    const visible = visibleVoxels(blocks, MAX_Y)
    const centre = visible.find((c) => c.x === 0 && c.y === 1 && c.z === 0)
    check(
      'a cell surrounded on all six sides is not drawn',
      centre === undefined,
      centre ? JSON.stringify(centre) : ''
    )

    const under = visible.find((c) => c.x === 0 && c.y === 0 && c.z === 0)
    check('the cell under the centre is culled with it', under === undefined)
    check('the rest of the shell is drawn', visible.length === 25, `${visible.length} cells`)
    check('and nothing is drawn with an empty face list', visible.every((c) => c.faces.length > 0))
    check('no cell ever reports a bottom face', visible.every((c) => !c.faces.includes('down' as never)))
  }

  {
    const blocks = { [keyOf(0, 0, 0)]: 'block:LOG_OAK', [keyOf(0, 1, 0)]: 'block:LEAVES_OAK' }
    const solidTop = visibleVoxels(blocks, MAX_Y)
      .find((c) => c.y === 0)!
      .faces.includes('top')
    check('a solid neighbour still hides the face under it', !solidTop)

    const seeThrough = visibleVoxels(blocks, MAX_Y, (ref) => ref !== 'block:LEAVES_OAK')
      .find((c) => c.y === 0)!
      .faces.includes('top')
    check('and a see-through one does not', seeThrough)
  }

  {
    const blocks: Record<string, string> = {}
    for (let y = 0; y <= 5; y++) blocks[keyOf(0, y, 0)] = 'block:STONE'
    const clipped = visibleVoxels(blocks, 2)
    check('the slice slider hides everything above it', clipped.every((c) => c.y <= 2), JSON.stringify(clipped.map((c) => c.y)))
    check('and keeps everything at or below it', clipped.length === 3, `${clipped.length} cells`)
    check('highestY reports the top of the build', highestY(blocks) === 5, String(highestY(blocks)))
  }

  {
    for (const maxHeight of [2, 7, 20, 40]) {
      const variant = seedGrownVariant({ ...TREE_DEFAULTS, maxHeight, minHeight: 2 })
      const cells = Object.keys(variant.blocks).map(parseKey)
      check(
        `a grown tree seeded at max height ${maxHeight} stays inside the grid`,
        cells.every((c) => inBounds(c.x, c.y, c.z)),
        cells.filter((c) => !inBounds(c.x, c.y, c.z)).map((c) => `${c.x},${c.y},${c.z}`).slice(0, 6).join(' ')
      )
      check(`and is grounded at y 0 (max height ${maxHeight})`, cells.some((c) => c.y === 0))
    }
  }
}

console.log('kind metadata (a kind must be named and drawn in one place)')

{

  const OWNERS = ['src/renderer/src/lib/kindIcons.ts', 'src/renderer/src/sections/forms/registry.ts']
  const labels = ['Block', 'Item', 'Liquid', 'Ore Veins', 'Plant', 'Tree', 'Structure', 'Recipe', 'Mob', 'Biome', 'Dimension']

  const files = walkTs(join(process.cwd(), 'src/renderer'))
  const offenders: string[] = []
  for (const file of files) {
    const rel = file.replace(process.cwd() + sep, '').replace(/\\/g, '/')
    if (OWNERS.includes(rel)) continue
    const text = readFileSync(file, 'utf-8')
    const hits = labels.filter((l) => new RegExp(`['"\`]${l}['"\`]`).test(text))

    if (hits.length >= 4) offenders.push(`${rel} names ${hits.length}: ${hits.join(', ')}`)
  }
  check('no file outside the owners re-declares the kind names', offenders.length === 0, offenders.join('; '))
}

console.log('one rule, one declaration (no function written out twice)')

{

  const files = [
    ...walkTs(join(process.cwd(), 'src/shared')),
    ...walkTs(join(process.cwd(), 'src/renderer')),
    ...walkTs(join(process.cwd(), 'src/main'))
  ]

  interface Decl {
    name: string
    where: string
    body: string
  }
  const decls: Decl[] = []
  for (const file of files) {
    const rel = file.replace(process.cwd() + sep, '').replace(/\\/g, '/')
    const text = readFileSync(file, 'utf-8')

    const patterns = [
      /function\s+([A-Za-z0-9_]+)\s*\(([^)]*)\)[^{]*\{/g,
      /(?:const|let)\s+([A-Za-z0-9_]+)\s*(?::[^=\n]+)?=\s*(?:async\s+)?\(([^)]*)\)\s*(?::\s*[A-Za-z0-9_<>[\]| ]+)?=>\s*\{/g
    ]
    for (const re of patterns) {
    let m: RegExpExecArray | null
    while ((m = re.exec(text))) {

      let depth = 1
      let i = re.lastIndex
      while (i < text.length && depth > 0) {
        if (text[i] === '{') depth++
        else if (text[i] === '}') depth--
        i++
      }
      const raw = text.slice(re.lastIndex, i - 1)
      const params = m[2]
        .split(',')
        .map((piece) => piece.trim().split(/[:=\s]/)[0])
        .filter((piece) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(piece))
      let body = raw
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/[^\n]*/g, '')
      params.forEach((param, index) => {
        body = body.replace(new RegExp(`\\b${param}\\b`, 'g'), `_arg${index}_`)
      })

      body = body.replace(/\s+/g, ' ').trim()

      if (body.length >= 60) decls.push({ name: m[1], where: rel, body })
    }
    }
  }

  const byBody = new Map<string, Decl[]>()
  for (const d of decls) {
    const list = byBody.get(d.body) ?? []
    list.push(d)
    byBody.set(d.body, list)
  }

  const isFormGuard = (body: string): boolean =>

    /^if \(!\w+\) return null;? return <\w*Inner \w+=\{\w+\} \w+=\{\w+\} \/>$/.test(body)

  const dupes = [...byBody.entries()]
    .filter(([body, list]) => list.length > 1 && !isFormGuard(body))
    .map(([, list]) => list.map((d) => `${d.name} in ${d.where}`).join(' == '))
  check(
    `no function body is written out twice (${decls.length} functions compared)`,
    dupes.length === 0,
    dupes.join('\n       ')
  )
}

console.log('the .artemis file association (a double-click has one chance to work)')

{

  const entries = associationEntries('C:\Program Files\My Apps\Artemis.exe', 'C:\icons\a.ico')
  const command = entries.find((e) => e.key.endsWith('command'))
  check('a launch command is registered', !!command, JSON.stringify(entries))
  check(
    'and both the exe and the argument are quoted, so a path with a space still opens',
    command?.value === '"C:\Program Files\My Apps\Artemis.exe" "%1"',
    command?.value
  )
  check(
    'the extension points at the type, not at the exe',
    entries[0].key.endsWith('.artemis') && entries[0].value === 'Artemis.Project',
    JSON.stringify(entries[0])
  )
  check(
    'the icon is registered when there is one',
    entries.some((e) => e.key.endsWith('DefaultIcon') && e.value === 'C:\icons\a.ico')
  )
  check(
    'and left alone when there is not, rather than pointed at nothing',
    !associationEntries('C:\Artemis.exe', '').some((e) => e.key.endsWith('DefaultIcon'))
  )
  check(
    'everything is written under the current user, so nothing needs admin',
    entries.every((e) => e.key.startsWith('HKCU')),
    entries.map((e) => e.key).join(', ')
  )

  const real = join(process.cwd(), 'package.json')
  check('a launch with no file opens nothing', projectPathFromArgv(['Artemis.exe']) === null)
  check(
    'a switch that ends in .artemis is not a file',
    projectPathFromArgv(['Artemis.exe', '--flag.artemis']) === null
  )
  check(
    'a path that does not exist is not opened',
    projectPathFromArgv(['Artemis.exe', 'C:\nope\gone.artemis']) === null
  )

  check('and a real file with the wrong extension is left alone', projectPathFromArgv(['Artemis.exe', real]) === null)
}

console.log(`\n${passes} checks passed, ${failures} failed`)
console.log(failures === 0 ? 'MISC PASS' : 'MISC: see above')
if (failures > 0) process.exitCode = 1
