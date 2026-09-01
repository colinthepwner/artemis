import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)))

function findJar() {
  const explicit = process.argv[2] ?? process.env.BTA_CLIENT_JAR
  if (explicit) {
    if (!existsSync(explicit)) throw new Error(`No jar at ${explicit}`)
    return explicit
  }
  const cache = join(homedir(), '.gradle', 'caches', 'fabric-loom')
  if (!existsSync(cache)) throw new Error('No fabric-loom cache. Pass the jar path as an argument.')
  const found = readdirSync(cache)
    .map((dir) => join(cache, dir, 'minecraft-client.jar'))
    .filter((p) => existsSync(p))
  if (found.length === 0) throw new Error('No minecraft-client.jar in the loom cache.')

  return found.sort()[found.length - 1]
}

function javap(jar, className) {
  const bin = process.env.JAVA_HOME ? join(process.env.JAVA_HOME, 'bin', 'javap') : 'javap'
  return execFileSync(bin, ['-p', '-c', '-cp', jar, className], {
    encoding: 'utf-8',
    maxBuffer: 64 * 1024 * 1024
  })
}

function pushedInt(op, rest) {
  if (op === 'iconst_m1') return -1
  if (op.startsWith('iconst_')) return Number(op.slice(7))
  if (op === 'bipush' || op === 'sipush') return Number(rest.trim().split(/\s+/)[0])

  if (op === 'ldc' || op === 'ldc_w') {
    const m = rest.match(/\/\/ int (-?\d+)/)
    if (m) return Number(m[1])
  }
  return null
}

function pushedString(op, rest) {
  if (op !== 'ldc' && op !== 'ldc_w') return null
  const m = rest.match(/\/\/ String (.*)$/)
  return m ? m[1] : null
}

function extract(source) {

  const lines = source.split(/\r?\n/)
  const start = lines.findIndex((l) => l.trim() === 'static {};')
  if (start < 0) throw new Error('Blocks has no static initializer, which cannot be right.')

  const out = []

  let strings = []
  let lastInt = null
  let pending = null

  for (const line of lines.slice(start)) {
    const m = line.match(/^\s+\d+: (\S+)(.*)$/)
    if (!m) continue
    const [, op, rest] = m

    if (pending) {

      const field = rest.match(/\/\/ Field ([A-Za-z_$][A-Za-z0-9_$]*):Lnet\/minecraft\/core\/block\/Block;/)
      if (op === 'putstatic' && field) {
        out.push({ ...pending, field: field[1] })
        pending = null
      }
      continue
    }

    const str = pushedString(op, rest)
    if (str !== null) {
      strings.push(str)
      if (strings.length > 2) strings.shift()
      continue
    }
    const int = pushedInt(op, rest)
    if (int !== null) {
      lastInt = int
      continue
    }
    if (op === 'invokestatic' && /\/\/ Method register:\(Ljava\/lang\/String;Ljava\/lang\/String;I/.test(rest)) {
      if (strings.length !== 2 || lastInt === null) {
        throw new Error(`register call with ${strings.length} strings and id ${lastInt}`)
      }
      pending = { key: strings[0], namespaceId: strings[1], id: lastInt }
      strings = []
      lastInt = null
    }
  }
  if (pending) throw new Error(`register for "${pending.key}" never reached a putstatic`)
  return out
}

const jar = findJar()

const version = jar
  .replace(/\\/g, '/')
  .split('/')
  .slice(-2)[0]
  .replace(/^v/, '')
const source = javap(jar, 'net.minecraft.core.block.Blocks')
const blocks = extract(source)

const bad = []
if (blocks.length < 400) bad.push(`only ${blocks.length} blocks found`)
const byId = new Map()
for (const b of blocks) {
  if (byId.has(b.id)) bad.push(`id ${b.id} claimed by ${byId.get(b.id)} and ${b.field}`)
  byId.set(b.id, b.field)
}

for (const [id, field] of [
  [0, 'AIR'],
  [1, 'STONE']
]) {
  if (byId.get(id) !== field) bad.push(`id ${id} is ${byId.get(id)}, expected ${field}`)
}
const known = new Set(
  readFileSync(join(ROOT, 'src/shared/generator/vanilla', `bta-${version}.ts`), 'utf-8')
    .matchAll(/\{"field":"([A-Z0-9_]+)"/g)
)
const fields = new Set([...known].map((m) => m[1]))
if (fields.size < 100) {
  bad.push(`could not read the field list out of bta-${version}.ts to cross-check against`)
} else {
  const strangers = blocks.filter((b) => !fields.has(b.field)).map((b) => b.field)

  if (strangers.length > 40) {
    bad.push(`${strangers.length} ids name fields the block list does not: ${strangers.slice(0, 6).join(', ')}…`)
  }
}
if (bad.length) {
  console.error('Refusing to write:\n  ' + bad.join('\n  '))
  process.exit(1)
}

const rows = blocks
  .slice()
  .sort((a, b) => a.id - b.id)
  .map((b) => `  ${JSON.stringify({ id: b.id, field: b.field, key: b.key })}`)
  .join(',\n')

const file = `// AUTO-GENERATED from Better Than Adventure! ${version}
// (net.minecraft.core.block.Blocks.<clinit>, read with javap).
//
//   node scripts/extract-block-ids.mjs [path/to/minecraft-client.jar]
//
// Regenerate whenever the target version changes. Nothing here is editable by
// hand: an id typed in from memory is a schematic that imports the wrong
// blocks and says nothing about why.
export interface VanillaBlockId {
  /** the number a .schematic stores */
  id: number
  /** the Blocks.<FIELD> constant, which is how the rest of Artemis names it */
  field: string
  /** the registry key, which is how a palette-based format names it */
  key: string
}

export const VANILLA_BLOCK_IDS: VanillaBlockId[] = [
${rows}
]
`

const dest = join(ROOT, 'src/shared/generator/vanilla', `blockIds-${version}.ts`)
writeFileSync(dest, file)
console.log(`${blocks.length} blocks, ids ${blocks[0].id}..${Math.max(...byId.keys())}`)
console.log(`wrote ${dest.replace(ROOT, '.').replace(/\\/g, '/')}`)
