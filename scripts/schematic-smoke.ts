import { gunzipSync, gzipSync } from 'zlib'
import { parseSchematic, type Schematic } from '../src/shared/schematic'
import { describeImport, importSchematic } from '../src/shared/schematicImport'
import { getVanillaBlockIds } from '../src/shared/generator/vanilla'
import { readNbt } from '../src/shared/nbt'

let failures = 0
const fail = (msg: string): void => {
  console.error(`FAIL: ${msg}`)
  failures++
}
const ok = (cond: boolean, msg: string): void => {
  if (!cond) fail(msg)
}

const BOUNDS = { half: 15, maxY: 31 }
const IDS = getVanillaBlockIds('8.0.1')
const idOf = (field: string): number => IDS.find((b) => b.field === field)!.id
const keyOf = (field: string): string => IDS.find((b) => b.field === field)!.key

const bytes = (...parts: (Buffer | number[])[]): Buffer =>
  Buffer.concat(parts.map((p) => (Buffer.isBuffer(p) ? p : Buffer.from(p))))

const short = (v: number): Buffer => {
  const b = Buffer.alloc(2)
  b.writeInt16BE(v)
  return b
}
const int = (v: number): Buffer => {
  const b = Buffer.alloc(4)
  b.writeInt32BE(v)
  return b
}
const str = (v: string): Buffer => {
  const raw = Buffer.from(v, 'utf-8')
  return bytes(short(raw.length), raw)
}
const named = (type: number, name: string, payload: Buffer): Buffer =>
  bytes([type], str(name), payload)
const tagShort = (name: string, v: number): Buffer => named(2, name, short(v))
const tagInt = (name: string, v: number): Buffer => named(3, name, int(v))
const tagString = (name: string, v: string): Buffer => named(8, name, str(v))
const tagByteArray = (name: string, v: Buffer): Buffer => named(7, name, bytes(int(v.length), v))
const tagCompound = (name: string, inner: Buffer): Buffer => named(10, name, bytes(inner, [0]))
const rootCompound = (name: string, inner: Buffer): Buffer => tagCompound(name, inner)

const varint = (value: number): number[] => {
  const out: number[] = []
  let v = value
  do {
    let byte = v & 0x7f
    v >>>= 7
    if (v !== 0) byte |= 0x80
    out.push(byte)
  } while (v !== 0)
  return out
}

const W = 5
const H = 3
const L = 7

const PLAN: Record<string, string> = {}
const put = (x: number, y: number, z: number, field: string): void => {
  PLAN[`${x},${y},${z}`] = field
}
put(0, 0, 0, 'STONE')
put(4, 0, 0, 'COBBLE_STONE')
put(0, 0, 6, 'MARBLE')
put(4, 0, 6, 'BASALT')
put(2, 1, 3, 'LIMESTONE')
put(2, 2, 3, 'GRANITE')

const ALIEN_ID = 4095
const ALIEN_KEY = 'quantum_widget'

function mcedit(withAlien: boolean): Buffer {
  const blocks = Buffer.alloc(W * H * L)
  const add = Buffer.alloc(Math.ceil((W * H * L) / 2))
  let usedAdd = false
  for (const [key, field] of Object.entries(PLAN)) {
    const [x, y, z] = key.split(',').map(Number)
    const index = (y * L + z) * W + x
    const id = idOf(field)
    blocks[index] = id & 0xff
    if (id > 255) {
      usedAdd = true
      const half = id >> 8
      if ((index & 1) === 0) add[index >> 1] |= half & 0x0f
      else add[index >> 1] |= (half & 0x0f) << 4
    }
  }
  if (withAlien) {
    const index = (0 * L + 1) * W + 1
    blocks[index] = ALIEN_ID & 0xff
    usedAdd = true
    if ((index & 1) === 0) add[index >> 1] |= (ALIEN_ID >> 8) & 0x0f
    else add[index >> 1] |= ((ALIEN_ID >> 8) & 0x0f) << 4
  }
  return gzipSync(
    rootCompound(
      'Schematic',
      bytes(
        tagShort('Width', W),
        tagShort('Height', H),
        tagShort('Length', L),
        tagString('Materials', 'Alpha'),
        tagByteArray('Blocks', blocks),
        tagByteArray('Data', Buffer.alloc(W * H * L)),
        ...(usedAdd ? [tagByteArray('AddBlocks', add)] : [])
      )
    )
  )
}

function sponge(version: 2 | 3, withAlien: boolean): Buffer {

  const fields = [...new Set(Object.values(PLAN))]
  const palette: string[] = ['minecraft:air', ...fields.map((f) => `minecraft:${keyOf(f)}`)]
  if (withAlien) palette.push(`minecraft:${ALIEN_KEY}`)
  const indexOfName = new Map(palette.map((n, i) => [n, i]))

  const cells = new Array<number>(W * H * L).fill(0)
  for (const [key, field] of Object.entries(PLAN)) {
    const [x, y, z] = key.split(',').map(Number)
    cells[x + z * W + y * W * L] = indexOfName.get(`minecraft:${keyOf(field)}`)!
  }
  if (withAlien) cells[1 + 1 * W + 0] = indexOfName.get(`minecraft:${ALIEN_KEY}`)!

  const data = Buffer.from(cells.flatMap(varint))
  const paletteTag = tagCompound('Palette', bytes(...palette.map((n, i) => tagInt(n, i))))

  const inner =
    version === 2
      ? bytes(
          tagShort('Width', W),
          tagShort('Height', H),
          tagShort('Length', L),
          tagInt('Version', 2),
          paletteTag,
          tagByteArray('BlockData', data)
        )
      : bytes(
          tagShort('Width', W),
          tagShort('Height', H),
          tagShort('Length', L),
          tagInt('Version', 3),
          tagCompound('Blocks', bytes(paletteTag, tagByteArray('Data', data)))
        )
  return gzipSync(version === 3 ? rootCompound('', tagCompound('Schematic', inner)) : rootCompound('Schematic', inner))
}

const EXPECTED: Record<string, string> = {}
for (const [key, field] of Object.entries(PLAN)) {
  const [x, y, z] = key.split(',').map(Number)
  EXPECTED[`${x - Math.floor((W - 31) / 2) - 15},${y},${z - Math.floor((L - 31) / 2) - 15}`] =
    `block:${field}`
}

const read = (buf: Buffer): Schematic => parseSchematic(new Uint8Array(gunzipSync(buf)))

for (const [label, buf] of [
  ['mcedit .schematic', mcedit(false)],
  ['sponge .schem v2', sponge(2, false)],
  ['sponge .schem v3', sponge(3, false)]
] as const) {
  let schematic: Schematic
  try {
    schematic = read(buf)
  } catch (e) {
    fail(`${label}: would not parse: ${String(e)}`)
    continue
  }
  ok(
    schematic.width === W && schematic.height === H && schematic.length === L,
    `${label}: read ${schematic.width}x${schematic.height}x${schematic.length}, wrote ${W}x${H}x${L}`
  )

  const result = importSchematic(schematic, '8.0.1', BOUNDS)
  ok(
    result.placed === Object.keys(PLAN).length,
    `${label}: placed ${result.placed} of ${Object.keys(PLAN).length}`
  )
  ok(
    JSON.stringify(sorted(result.blocks)) === JSON.stringify(sorted(EXPECTED)),
    `${label}: wrong blocks\n  want ${JSON.stringify(sorted(EXPECTED))}\n  got  ${JSON.stringify(sorted(result.blocks))}`
  )
  ok(result.unknown.length === 0, `${label}: reported ${result.unknown.length} unknown blocks in a file with none`)
  ok(!result.crop.cropped, `${label}: cropped a build that fits`)
}

function sorted(map: Record<string, string>): [string, string][] {
  return Object.entries(map).sort(([a], [b]) => a.localeCompare(b))
}

for (const [label, buf, expected] of [
  ['mcedit .schematic', mcedit(true), `id ${ALIEN_ID}`],
  ['sponge .schem v2', sponge(2, true), ALIEN_KEY]
] as const) {
  const result = importSchematic(read(buf), '8.0.1', BOUNDS)
  ok(
    result.unknown.length === 1 && result.unknown[0].what === expected,
    `${label}: unknown block reported as ${JSON.stringify(result.unknown)}, wanted ${expected}`
  )
  ok(result.placed === Object.keys(PLAN).length, `${label}: an unknown block displaced a known one`)
  ok(
    describeImport(result).includes(expected),
    `${label}: the summary does not name the block that was lost`
  )
}

{
  const big = 41
  const size = big * 2 * big
  const blocks = Buffer.alloc(size, idOf('STONE') & 0xff)
  const buf = gzipSync(
    rootCompound(
      'Schematic',
      bytes(
        tagShort('Width', big),
        tagShort('Height', 2),
        tagShort('Length', big),
        tagByteArray('Blocks', blocks),
        tagByteArray('Data', Buffer.alloc(size))
      )
    )
  )
  const result = importSchematic(read(buf), '8.0.1', BOUNDS)
  ok(result.crop.cropped, 'a 41x2x41 schematic was not reported as cropped')
  ok(result.placed === 31 * 2 * 31, `kept ${result.placed} cells, the grid holds ${31 * 2 * 31}`)
  ok(result.crop.lost === size - result.placed, `lost ${result.crop.lost}, expected ${size - result.placed}`)

  for (const key of ['-15,0,-15', '15,0,15', '-15,1,15', '15,1,-15']) {
    ok(result.blocks[key] === 'block:STONE', `the crop is not centred: ${key} is empty`)
  }
  ok(describeImport(result).includes('left behind'), 'the summary does not mention the crop')
}

{
  const tall = 40
  const blocks = Buffer.alloc(tall)

  blocks[0] = idOf('STONE') & 0xff
  blocks[tall - 1] = idOf('MARBLE') & 0xff
  const buf = gzipSync(
    rootCompound(
      'Schematic',
      bytes(
        tagShort('Width', 1),
        tagShort('Height', tall),
        tagShort('Length', 1),
        tagByteArray('Blocks', blocks),
        tagByteArray('Data', Buffer.alloc(tall))
      )
    )
  )
  const result = importSchematic(read(buf), '8.0.1', BOUNDS)
  ok(result.blocks['0,0,0'] === 'block:STONE', 'the bottom of a tall build did not land on the ground')
  ok(result.crop.lost === 1, `the block above the grid was not dropped (lost ${result.crop.lost})`)
}

for (const [what, buf] of [
  ['an empty file', Buffer.alloc(0)],
  ['a text file', Buffer.from('this is not nbt at all, not even slightly')],
  ['nbt that is not a schematic', gzipSync(rootCompound('Hello', tagString('World', 'yes')))]
] as const) {
  let message = ''
  try {
    const raw = what === 'nbt that is not a schematic' ? gunzipSync(buf) : buf
    importSchematic(parseSchematic(new Uint8Array(raw)), '8.0.1', BOUNDS)
  } catch (e) {
    message = e instanceof Error ? e.message : String(e)
  }
  ok(message.length > 0, `${what}: was accepted, which it should not be`)
  ok(
    /[a-z]{4}/.test(message) && !/undefined|NaN|\[object/.test(message),
    `${what}: the failure reads as "${message}", which says nothing to a person`
  )
}

{
  ok(IDS.length > 400, `the block id table holds ${IDS.length} entries`)
  const seen = new Set<number>()
  for (const b of IDS) {
    if (seen.has(b.id)) fail(`id ${b.id} appears twice in the table`)
    seen.add(b.id)
  }
  ok(IDS[0].id === 0 && IDS[0].field === 'AIR', 'id 0 is not AIR')

  const two = IDS.find((b) => b.id === 2)
  ok(
    two?.field === 'BASALT',
    `id 2 is ${two?.field}: BTA's ids are not vanilla's, and this table is why`
  )

  ok(
    IDS.every((b) => b.key.length > 0 && !b.key.includes(' ')),
    'a registry key in the table is empty or has a space in it'
  )
}

{
  const doc = readNbt(
    gunzipSync(
      gzipSync(
        rootCompound(
          'Root',
          bytes(tagShort('S', -3), tagInt('I', 70000), tagString('Str', 'hello'), tagCompound('C', tagInt('N', 1)))
        )
      )
    )
  )
  ok(doc.name === 'Root', `the root compound is named ${doc.name}`)
  ok(doc.value['S'] === -3, 'a negative short did not survive')
  ok(doc.value['I'] === 70000, 'an int past a short did not survive')
  ok(doc.value['Str'] === 'hello', 'a string did not survive')
  ok((doc.value['C'] as Record<string, unknown>)['N'] === 1, 'a nested compound did not survive')
}

if (failures) {
  console.error(`${failures} failure(s)`)
  process.exit(1)
}
console.log('SCHEMATIC PASS')
