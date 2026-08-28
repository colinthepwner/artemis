import { CodeGenerator, type GeneratedFile } from '../src/shared/generator/CodeGenerator'
import { toConstantCase, type ArtemisProject } from '../src/shared/project'
import { textureSlotsForElement } from '../src/shared/generator/textures'
import { treeFeatureClassName } from '../src/shared/generator/templates/tree'
import { SCENARIOS } from './audit-fixtures'

let failures = 0
let checks = 0
const fail = (scenario: string, msg: string): void => {
  failures++
  console.log(`  FAIL [${scenario}] ${msg}`)
}
const ok = (): void => {
  checks++
}

function dupes<T>(items: T[], key: (t: T) => string): Map<string, number> {
  const counts = new Map<string, number>()
  for (const it of items) {
    const k = key(it)
    counts.set(k, (counts.get(k) ?? 0) + 1)
  }
  return new Map([...counts].filter(([, n]) => n > 1))
}

const RE_IMPORT = /^import\s+(static\s+)?([\w.*]+);/

const RE_FIELD = /^\s*(?:public|private|protected)?\s*static\s+(?:final\s+)?[\w.<>\[\],\s]+?\s+(\w+)\s*(?:=|;)/

const RE_METHOD =
  /^\s*(?:@\w+\s*)*(?:public|private|protected)\s+(?:static\s+|final\s+|abstract\s+)*[\w.<>\[\],\s]+\s+(\w+)\s*\(([^)]*)\)\s*(?:throws [\w., ]+)?\{/
const RE_CLASS = /^\s*(?:public\s+)?(?:final\s+|abstract\s+)?(?:class|interface|enum)\s+(\w+)/

function javaImports(src: string): string[] {
  return src
    .split('\n')
    .map((l) => RE_IMPORT.exec(l))
    .filter((m): m is RegExpExecArray => Boolean(m))
    .map((m) => (m[1] ? 'static ' : '') + m[2])
}

function javaTopLevelClasses(src: string): string[] {
  const out: string[] = []
  for (const line of src.split('\n')) {

    if (/^\S/.test(line)) {
      const m = RE_CLASS.exec(line)
      if (m) out.push(m[1])
    }
  }
  return out
}

function javaStaticFields(src: string): string[] {
  const out: string[] = []
  for (const line of src.split('\n')) {
    if (!/^\t(?:public|private|protected)/.test(line)) continue
    const m = RE_FIELD.exec(line)
    if (m) out.push(m[1])
  }
  return out
}

function javaMethods(src: string): string[] {
  const out: string[] = []
  for (const line of src.split('\n')) {
    if (!/^\t(?:@|public|private|protected)/.test(line)) continue
    const m = RE_METHOD.exec(line)
    if (!m) continue
    const params = m[2]
      .split(',')
      .map((s) => s.trim().split(/\s+/)[0])
      .filter(Boolean)
      .join(',')
    out.push(`${m[1]}(${params})`)
  }
  return out
}

function auditPlacementOrder(scenario: string, files: GeneratedFile[]): void {
  const placement = files.find((f) => f.path.endsWith('BiomePlacement.java'))

  if (!placement) return

  const lines = placement.content.split('\n').filter((l) => l.trim().startsWith('if ('))
  const styles = lines.map((l) => (l.includes('vanilla ==') ? 'substitute' : 'climate'))
  const lastSubstitution = styles.lastIndexOf('substitute')
  const firstClimate = styles.indexOf('climate')

  if (firstClimate !== -1 && lastSubstitution > firstClimate) {
    fail(
      scenario,
      `placement chain writes a climate window at ${firstClimate} before a substitution at ` +
        `${lastSubstitution}: the window silently takes the host's columns`
    )
  } else ok()
}

function auditPortalIgnition(scenario: string, project: ArtemisProject, files: GeneratedFile[]): void {

  const doors = project.elements.filter(
    (el) =>
      el.kind === 'dimension' &&
      ((el.properties['biomes'] as string[] | undefined) ?? []).some((r) => r?.trim())
  )
  const mixin = files.find((f) => f.path.endsWith('PortalIgnition.java'))
  if (doors.length === 0) {
    if (mixin) fail(scenario, 'a mod with no dimensions still emitted a portal ignition mixin')
    else ok()
    return
  }
  if (!mixin) {
    fail(scenario, `${doors.length} dimension(s) and no ignition mixin: none of them can be opened`)
    return
  }
  for (const el of doors) {
    const field = toConstantCase(`${el.name}_portal`)
    const lines = mixin.content.split('\n')
    const n = lines.filter((l) => l.includes(`ModBlocks.${field})`)).length
    if (n === 1) ok()
    else fail(scenario, `${el.name}'s portal appears ${n} times in the ignition mixin, not once`)
  }

  const config = files.find((f) => f.path.endsWith('.mixins.json'))
  const className = mixin.path.split('/').pop()!.replace('.java', '')
  if (config?.content.includes(`"${className}"`)) ok()
  else fail(scenario, `${className} is not listed in the mixins config, so it never applies`)
}

function auditTreeGround(scenario: string, project: ArtemisProject, files: GeneratedFile[]): void {
  const biomes = project.elements.filter((el) => el.kind === 'biome')

  const floorOf = (el: ArtemisProject['elements'][number]): string | null => {
    const ref = String((el.properties as { topBlock?: string }).topBlock ?? '').trim()
    if (!ref) return null
    if (ref.startsWith('biome:')) return null
    if (ref.startsWith('block:')) return `Blocks.${ref.slice('block:'.length).toUpperCase()}.id()`
    const owner = project.elements.find((e) => e.name === ref)
    if (!owner) return null
    return `ModBlocks.${toConstantCase(owner.kind === 'liquid' ? `${ref}_still` : ref)}.id()`
  }

  for (const tree of project.elements.filter((el) => el.kind === 'tree')) {
    const file = files.find((f) => f.path.endsWith(`${treeFeatureClassName(tree.name)}.java`))
    if (!file) {
      fail(scenario, `tree ${tree.name} generated no feature class`)
      continue
    }
    const gate = file.content
      .split('\n')
      .find((l) => l.includes('groundId') && l.includes('GROWS_TREES'))
    if (!gate) {
      fail(scenario, `tree ${tree.name}'s feature has no ground gate at all`)
      continue
    }
    const listed = (((tree.properties['biomes'] as string[] | undefined) ?? []) as string[])
      .map((r) => r.trim())
      .filter(Boolean)

    const claimed = listed.length === 0 ? biomes : biomes.filter((b) => listed.includes(b.name))
    const wanted = new Set(claimed.map(floorOf).filter((e): e is string => Boolean(e)))
    for (const expr of wanted) {
      if (gate.includes(expr)) ok()
      else
        fail(
          scenario,
          `tree ${tree.name} claims a biome floored with ${expr} and its ground gate does not ` +
            `name it, so it refuses every column of that biome: ${gate.trim()}`
        )
    }

    const strangers = [
      ...new Set(
        biomes
          .filter((b) => !claimed.includes(b))
          .map(floorOf)
          .filter((e): e is string => Boolean(e) && !wanted.has(e as string))
          .filter((e) => gate.includes(e))
      )
    ]
    if (strangers.length === 0) ok()
    else
      fail(
        scenario,
        `tree ${tree.name} may stand on ${strangers.join(', ')}, which floors a biome it never ` +
          `claimed: the gate claims more ground than the modder asked for`
      )
  }
}

function auditFiles(scenario: string, files: GeneratedFile[]): void {

  const pathDupes = dupes(files, (f) => f.path)
  if (pathDupes.size) {
    for (const [p, n] of pathDupes) fail(scenario, `${n} files written to the same path: ${p}`)
  } else ok()

  for (const f of files) {
    if (f.language !== 'java') continue

    const impDupes = dupes(javaImports(f.content), (s) => s)
    if (impDupes.size) {
      for (const [i, n] of impDupes) fail(scenario, `${f.path} imports ${i} ${n} times`)
    } else ok()

    const clsDupes = dupes(javaTopLevelClasses(f.content), (s) => s)
    if (clsDupes.size) {
      for (const [c, n] of clsDupes) fail(scenario, `${f.path} declares class ${c} ${n} times`)
    } else ok()

    const fieldDupes = dupes(javaStaticFields(f.content), (s) => s)
    if (fieldDupes.size) {
      for (const [d, n] of fieldDupes) fail(scenario, `${f.path} declares field ${d} ${n} times`)
    } else ok()

    const methodDupes = dupes(javaMethods(f.content), (s) => s)
    if (methodDupes.size) {
      for (const [d, n] of methodDupes) fail(scenario, `${f.path} declares method ${d} ${n} times`)
    } else ok()
  }

  const byFqn = new Map<string, string[]>()
  for (const f of files) {
    if (f.language !== 'java') continue
    const pkg = /^package\s+([\w.]+);/m.exec(f.content)?.[1] ?? ''
    for (const c of javaTopLevelClasses(f.content)) {
      const fqn = `${pkg}.${c}`
      byFqn.set(fqn, [...(byFqn.get(fqn) ?? []), f.path])
    }
  }
  let clash = false
  for (const [fqn, paths] of byFqn) {
    if (paths.length > 1) {
      clash = true
      fail(scenario, `${fqn} is declared by ${paths.length} files: ${paths.join(', ')}`)
    }
  }
  if (!clash) ok()

  for (const f of files) {
    if (!f.path.endsWith('.lang')) continue
    const keys = f.content
      .split('\n')
      .filter((l) => l.includes('='))
      .map((l) => l.slice(0, l.indexOf('=')))
    const langDupes = dupes(keys, (s) => s)
    if (langDupes.size) {
      for (const [k, n] of langDupes) fail(scenario, `lang key ${k} defined ${n} times`)
    } else ok()
  }

  for (const f of files) {
    if (f.language !== 'java') continue
    if (!/\/init\/Mod(Blocks|Items|Biomes|Entities)\.java$/.test(f.path)) continue
    const names = [...f.content.matchAll(/\.build\(\s*"([^"]+)"/g)].map((m) => m[1])
    const regDupes = dupes(names, (s) => s)
    if (regDupes.size) {
      for (const [nm, n] of regDupes) fail(scenario, `${f.path} registers "${nm}" ${n} times`)
    } else ok()
  }

  for (const f of files) {
    if (!f.path.endsWith('mixins.json')) continue
    let json: { mixins?: string[]; client?: string[]; server?: string[] }
    try {
      json = JSON.parse(f.content)
    } catch (e) {
      fail(scenario, `${f.path} is not valid JSON: ${(e as Error).message}`)
      continue
    }
    for (const side of ['mixins', 'client', 'server'] as const) {
      const list = json[side] ?? []
      const mixDupes = dupes(list, (s) => s)
      if (mixDupes.size) {
        for (const [m, n] of mixDupes) fail(scenario, `${f.path} lists ${side} mixin ${m} ${n} times`)
      } else ok()
    }

    const all = [...(json.mixins ?? []), ...(json.client ?? []), ...(json.server ?? [])]
    const crossDupes = dupes(all, (s) => s)
    if (crossDupes.size) {
      for (const [m, n] of crossDupes) fail(scenario, `${f.path} lists mixin ${m} on ${n} sides`)
    } else ok()
  }

  for (const f of files) {
    if (f.language !== 'json') continue
    try {
      JSON.parse(f.content)
      ok()
    } catch (e) {
      fail(scenario, `${f.path} is not valid JSON: ${(e as Error).message}`)
    }
  }

  const declared = new Set<string>()
  for (const f of files) {
    if (f.language !== 'java') continue
    for (const c of javaTopLevelClasses(f.content)) declared.add(c)
  }
  const generatedish = /\b((?:Feature|Structure|Biome|Entity|Block|Item)[A-Z]\w+)\b/g
  let missing = false
  for (const f of files) {
    if (f.language !== 'java') continue
    for (const m of f.content.matchAll(generatedish)) {
      const name = m[1]

      if (declared.has(name)) continue
      if (new RegExp(`import\\s+[\\w.]*\\.${name};`).test(f.content)) continue
      if (/^(BlockLogic|BlockModel|ItemModel|BlockColor|EntityRenderer|BiomeProvider)/.test(name)) continue
      missing = true
      fail(scenario, `${f.path} names ${name}, which no generated file declares`)
    }
  }
  if (!missing) ok()

  const declaredFq = new Set<string>()
  const ourPackages = new Set<string>()
  for (const f of files) {
    if (f.language !== 'java') continue
    const pkg = /^package\s+([\w.]+);/m.exec(f.content)?.[1]
    if (!pkg) continue
    ourPackages.add(pkg)
    for (const c of javaTopLevelClasses(f.content)) declaredFq.add(`${pkg}.${c}`)
  }

  const root = [...ourPackages].sort((a, b) => a.length - b.length)[0]
  let badImport = false
  if (root) {
    for (const f of files) {
      if (f.language !== 'java') continue
      for (const line of f.content.split('\n')) {
        const m = RE_IMPORT.exec(line)
        if (!m) continue
        const fq = m[2]
        if (!fq.startsWith(`${root}.`)) continue
        if (m[1]) {

          const owner = fq.slice(0, fq.lastIndexOf('.'))
          if (!declaredFq.has(owner)) {
            badImport = true
            fail(scenario, `${f.path} statically imports ${fq}, and ${owner} is not generated`)
          }
          continue
        }
        if (fq.endsWith('.*')) {

          const pkg = fq.slice(0, -2)
          if (!ourPackages.has(pkg)) {
            badImport = true
            fail(scenario, `${f.path} imports ${fq}, and no generated file lives in ${pkg}`)
          }
          continue
        }
        if (!declaredFq.has(fq)) {
          badImport = true
          fail(scenario, `${f.path} imports ${fq}, which no generated file declares`)
        }
      }
    }
  }
  if (!badImport) ok()
}

console.log('one-declaration audit\n')

for (const s of SCENARIOS) {
  const project = s.build()
  let files: GeneratedFile[]
  try {
    files = new CodeGenerator(project).generate()
  } catch (e) {
    fail(s.name, `generator threw: ${(e as Error).message}`)
    continue
  }
  const before = failures
  auditFiles(s.name, files)
  auditPlacementOrder(s.name, files)
  auditPortalIgnition(s.name, project, files)
  auditTreeGround(s.name, project, files)

  const slots: string[] = []
  for (const el of project.elements) {
    for (const slot of textureSlotsForElement(el)) slots.push(slot.key)
  }
  const slotDupes = dupes(slots, (s2) => s2)
  if (slotDupes.size) {
    for (const [k, n] of slotDupes) fail(s.name, `texture slot ${k} claimed ${n} times`)
  } else ok()

  console.log(
    `  ${failures === before ? 'ok  ' : 'FAIL'} ${s.name.padEnd(32)} ${files.length} files`
  )
}

console.log(`\n${checks} checks, ${failures} failures`)
console.log(failures === 0 ? 'DECLARATIONS PASS' : 'DECLARATIONS: see above')
if (failures > 0) process.exitCode = 1
