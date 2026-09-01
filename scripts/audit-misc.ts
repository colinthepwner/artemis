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
import ts from 'typescript'
import { harness, endingLine } from './_harness'

const walkTs = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f)
    return statSync(p).isDirectory() ? walkTs(p) : /\.tsx?$/.test(p) ? [p] : []
  })

const normalizeBody = (body: string, params: string[]): string => {
  let out = body.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
  params.forEach((param, index) => {
    out = out.replace(new RegExp(`\\b${param}\\b`, 'g'), `_arg${index}_`)
  })
  return out.replace(/\s+/g, ' ').trim()
}

const audit = harness()
const check = audit.check

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
    const center = visible.find((c) => c.x === 0 && c.y === 1 && c.z === 0)
    check(
      'a cell surrounded on all six sides is not drawn',
      center === undefined,
      center ? JSON.stringify(center) : ''
    )

    const under = visible.find((c) => c.x === 0 && c.y === 0 && c.z === 0)
    check('the cell under the center is culled with it', under === undefined)
    check('the rest of the shell is drawn', visible.length === 25, `${visible.length} cells`)
    check('and nothing is drawn with an empty face list', visible.every((c) => c.faces.length > 0))
    check('no cell ever reports a bottom face', visible.every((c) => !c.faces.includes('down' as never)))
  }

  {
    const blocks = { [keyOf(0, 0, 0)]: 'block:LOG_OAK', [keyOf(0, 1, 0)]: 'block:LEAVES_OAK' }
    const solidTop = visibleVoxels(blocks, MAX_Y)
      .find((c) => c.y === 0)!
      .faces.includes('top')
    check('a solid neighbor still hides the face under it', !solidTop)

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
    ...walkTs(join(process.cwd(), 'src/main')),
    ...walkTs(join(process.cwd(), 'scripts'))
  ]

  interface Decl {
    name: string
    where: string
    body: string
  }
  const decls: Decl[] = []

  const nameOf = (node: ts.Node): string | null => {
    const named = node as { name?: ts.Node }
    if (named.name && ts.isIdentifier(named.name as ts.Node)) return (named.name as ts.Identifier).text
    const parent = node.parent
    if (!parent) return null
    if (
      (ts.isVariableDeclaration(parent) ||
        ts.isPropertyAssignment(parent) ||
        ts.isPropertyDeclaration(parent)) &&
      ts.isIdentifier(parent.name)
    )
      return parent.name.text
    return null
  }

  for (const file of files) {
    const rel = file.replace(process.cwd() + sep, '').replace(/\\/g, '/')
    const text = readFileSync(file, 'utf-8')
    const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true)
    const visit = (node: ts.Node): void => {
      const fn =
        ts.isFunctionDeclaration(node) ||
        ts.isArrowFunction(node) ||
        ts.isMethodDeclaration(node) ||
        ts.isFunctionExpression(node)
          ? (node as ts.FunctionLikeDeclaration)
          : null
      if (fn && fn.body && ts.isBlock(fn.body)) {
        const params = fn.parameters
          .map((p) => (ts.isIdentifier(p.name) ? p.name.text : null))
          .filter((p): p is string => p !== null)

        const body = normalizeBody(fn.body.getText().slice(1, -1), params)

        if (body.length >= 60) decls.push({ name: nameOf(node) ?? '<anonymous>', where: rel, body })
      }
      ts.forEachChild(node, visit)
    }
    visit(source)
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

  check(
    'and the sweep actually read the source it swept',
    decls.length > 800 && files.length > 140,
    `${decls.length} bodies of 60 characters or more in ${files.length} files, which is too few to be a real read`
  )
}

console.log('one rule, one declaration, in the Java too')

{

  const unescapeTemplate = (text: string): string =>
    text.replace(/\\([\s\S])/g, (whole, ch: string) => {
      if (ch === 'n') return '\n'
      if (ch === 't') return '\t'
      if (ch === 'r') return '\r'
      if (ch === '\\') return '\\'
      if (ch === '`') return '`'
      if (ch === '$') return '$'
      return whole
    })

  const HEADER =
    /\bprivate\s+static\s+(?!final\b)([\w.$]+(?:\s*<[^;{]*?>)?(?:\s*\[\s*\])*)\s+([A-Za-z_$][\w$]*)\s*\(/g

  const splitParams = (text: string): string[] => {
    const out: string[] = []
    let depth = 0
    let start = 0
    for (let i = 0; i < text.length; i++) {
      const c = text[i]
      if (c === '<' || c === '(' || c === '[') depth++
      else if (c === '>' || c === ')' || c === ']') depth--
      else if (c === ',' && depth === 0) {
        out.push(text.slice(start, i))
        start = i + 1
      }
    }
    if (text.slice(start).trim()) out.push(text.slice(start))
    return out.map((s) => s.trim()).filter(Boolean)
  }

  interface JavaDecl {
    name: string
    where: string
    body: string
  }
  const javaDecls: JavaDecl[] = []

  const javaFiles = walkTs(join(process.cwd(), 'scripts'))

  for (const file of javaFiles) {
    const rel = file.replace(process.cwd() + sep, '').replace(/\\/g, '/')

    const text = unescapeTemplate(readFileSync(file, 'utf-8'))
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/[^\n]*/g, '')
    HEADER.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = HEADER.exec(text))) {
      let i = m.index + m[0].length

      let depth = 1
      const pStart = i
      while (i < text.length && depth > 0) {
        const c = text[i]
        if (c === '(') depth++
        else if (c === ')') depth--
        i++
      }
      const params = splitParams(text.slice(pStart, i - 1))

      while (i < text.length && text[i] !== '{' && text[i] !== ';') i++
      if (text[i] !== '{') continue
      const bStart = i + 1
      depth = 1
      i++
      while (i < text.length && depth > 0) {
        const c = text[i]
        if (c === '{') depth++
        else if (c === '}') depth--
        i++
      }

      const names = params
        .map((p) => (p.match(/([A-Za-z_$][\w$]*)\s*$/) ?? [])[1])
        .filter((p): p is string => !!p)
      const body = normalizeBody(text.slice(bStart, i - 1), names)
      if (body.length >= 60) javaDecls.push({ name: m[2], where: rel, body })
    }
  }

  const javaByBody = new Map<string, JavaDecl[]>()
  for (const d of javaDecls) {
    const list = javaByBody.get(d.body) ?? []
    list.push(d)
    javaByBody.set(d.body, list)
  }
  const javaDupes = [...javaByBody.values()]
    .filter((list) => list.length > 1)
    .map((list) => list.map((d) => `${d.name} in ${d.where}`).join(' == '))
  check(
    `no Java method body is written out twice (${javaDecls.length} methods compared)`,
    javaDupes.length === 0,
    javaDupes.join('\n       ')
  )

  check(
    'and the Java sweep actually read the Java',
    javaDecls.length > 40 && javaByBody.size > 30,
    `${javaDecls.length} method bodies of 60 characters or more, which is too few to be a real read`
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

console.log('the mapping, asked what nothing reads')

{

  const mappingPath = join(process.cwd(), 'src/shared/generator/mappings/bta-8.0.1.json')
  const mapping = JSON.parse(readFileSync(mappingPath, 'utf-8')) as Record<string, unknown>

  const tables: Record<string, string> = {
    imports: 'indexed by the type name a template asks JavaWriter.use for',
    materials: 'indexed by the material a block element names',
    sounds: 'indexed by the sound a block element names',
    blockTags: 'indexed by the tags a block element carries',
    itemTags: 'indexed by the tags an item element carries, and enumerated for its switch list',
    harvestLevel: 'indexed by the tool a block element asks for',
    idRanges: 'read as a whole when the exporter allocates ids',
    fabricModJson: 'spread wholesale into fabric.mod.json, so every key is written'
  }

  const sources: string[] = []
  const walkAll = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry)
      if (statSync(full).isDirectory()) walkAll(full)
      else if (/\.tsx?$/.test(full) && !full.includes(`generator${sep}mappings`)) sources.push(full)
    }
  }
  walkAll(join(process.cwd(), 'src'))
  walkAll(join(process.cwd(), 'scripts'))
  const sourceText = sources.map((f) => readFileSync(f, 'utf-8')).join('\n')

  const namedByValue = new Set<string>()
  const collect = (value: unknown): void => {
    if (typeof value === 'string') namedByValue.add(value)
    else if (value && typeof value === 'object') Object.values(value).forEach(collect)
  }
  collect(mapping)

  const unread: string[] = []
  let asked = 0
  for (const [section, value] of Object.entries(mapping)) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue
    if (tables[section]) continue
    for (const [key, leaf] of Object.entries(value as Record<string, unknown>)) {

      if (key.startsWith('$')) continue

      if (leaf && typeof leaf === 'object') continue
      asked++
      if (sourceText.includes(key) || namedByValue.has(key)) continue
      unread.push(`${section}.${key}`)
    }
  }

  check(
    'every key in the mapping is read by something',
    unread.length === 0,
    `${unread.length} of ${asked} are read by nothing: ${unread.join(', ')}`
  )

  check('and the sweep actually looked at the mapping', asked > 100, `it only found ${asked} keys`)
}

console.log('how a dead game is described (a build-tool death is not a mod death)')

{

  const quiet = { reason: null } as unknown as Parameters<typeof endingLine>[0]
  const stopped = { reason: 'the 1612s budget fired' } as unknown as Parameters<typeof endingLine>[0]

  const gradleSaid =
    'The message received from the daemon indicates that the daemon has disappeared. Daemon pid: 52592'

  check(
    'a daemon that disappeared is named as the build tool, not as the mod',
    endingLine(quiet, 4294967295, null, 384, gradleSaid).includes('gradle daemon disappeared'),
    endingLine(quiet, 4294967295, null, 384, gradleSaid)
  )

  check(
    'and a game that really did end on its own still says so',
    endingLine(quiet, 4294967295, null, 384, 'nothing unusual here').includes('it ended on its own'),
    endingLine(quiet, 4294967295, null, 384, 'nothing unusual here')
  )

  check(
    'and a stop this runner asked for outranks a daemon message',
    endingLine(stopped, 1, null, 1614, gradleSaid).includes('this runner stopped it'),
    endingLine(stopped, 1, null, 1614, gradleSaid)
  )
}

console.log('no store selector mints a value (the infinite render loop)')

{
  const SELECTOR = /use[A-Z]\w*Store\(\s*\((\w*)\)\s*=>\s*([^\n]*?)\)(?=\s*[,);]|\s*$)/g
  const MINTS =
    /(\?\?|\|\|)\s*(\[\s*\]|\{\s*\})|\.(map|filter|slice|concat|flat|flatMap|sort)\(|\bnew (Set|Map)\b|Object\.(keys|values|entries|fromEntries|assign)\(/
  const offenders: string[] = []
  for (const file of walkTs(join(process.cwd(), 'src/renderer'))) {
    const text = readFileSync(file, 'utf-8')
    for (const m of text.matchAll(SELECTOR)) {
      if (!MINTS.test(m[2])) continue
      const line = text.slice(0, m.index ?? 0).split('\n').length
      const rel = file.replace(process.cwd() + sep, '').replace(/\\/g, '/')
      offenders.push(`${rel}:${line}  ${m[2].trim().slice(0, 70)}`)
    }
  }
  check('no store selector builds the value it returns', offenders.length === 0, offenders.join('\n       '))

  const bait = 'const s = useProjectStore((s) => s.project?.sounds ?? [])'
  const caught = [...bait.matchAll(SELECTOR)].some((m) => MINTS.test(m[2]))
  check('and the sweep still catches the line that shipped', caught, bait)

  const fixed = 'const s = useProjectStore((s) => s.project?.sounds) ?? NONE'
  const clear = [...fixed.matchAll(SELECTOR)].every((m) => !MINTS.test(m[2]))
  check('and leaves the fixed form alone', clear, fixed)
}

console.log(`\n${audit.passes} checks passed, ${audit.failures} failed`)
console.log(audit.failures === 0 ? 'MISC PASS' : 'MISC: see above')
if (audit.failures > 0) process.exitCode = 1
