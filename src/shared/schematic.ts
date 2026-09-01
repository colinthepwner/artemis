import { nbtBytes, nbtCompound, nbtNumber, readNbt, type NbtCompound, type NbtValue } from './nbt'

export interface SchematicCell {

  id?: number

  key?: string
}

export interface Schematic {
  format: 'mcedit' | 'sponge'
  width: number
  height: number
  length: number

  at: (x: number, y: number, z: number) => SchematicCell | null
}

export const SCHEMATIC_EXTENSIONS = ['schematic', 'schem']

export function parseSchematic(bytes: Uint8Array): Schematic {
  const root = readNbt(bytes).value

  const doc = nbtCompound(root['Schematic']) ?? root

  const width = nbtNumber(doc['Width'])
  const height = nbtNumber(doc['Height'])
  const length = nbtNumber(doc['Length'])
  if (width === null || height === null || length === null) {
    throw new Error('That file has no Width, Height and Length, so it is not a schematic.')
  }
  if (width <= 0 || height <= 0 || length <= 0) {
    throw new Error(`That schematic measures ${width} by ${height} by ${length}, which is nothing.`)
  }

  const sponge = spongeBlocks(doc)
  return sponge
    ? spongeSchematic(width, height, length, sponge)
    : mceditSchematic(width, height, length, doc)
}

function spongeBlocks(doc: NbtCompound): { palette: NbtCompound; data: Int8Array } | null {
  const inner = nbtCompound(doc['Blocks'])
  const palette = nbtCompound(inner?.['Palette'] ?? doc['Palette'])
  const data = nbtBytes(inner?.['Data'] ?? doc['BlockData'])
  return palette && data ? { palette, data } : null
}

function spongeSchematic(
  width: number,
  height: number,
  length: number,
  blocks: { palette: NbtCompound; data: Int8Array }
): Schematic {

  const names: string[] = []
  for (const [name, index] of Object.entries(blocks.palette)) {
    const at = nbtNumber(index)
    if (at !== null) names[at] = name
  }

  const cells = new Int32Array(width * height * length)
  let at = 0
  let cursor = 0
  while (cursor < blocks.data.length && at < cells.length) {
    let value = 0
    let shift = 0
    for (;;) {
      if (cursor >= blocks.data.length) {
        throw new Error('The block data ends in the middle of a value.')
      }
      const byte = blocks.data[cursor++] & 0xff
      value |= (byte & 0x7f) << shift
      if ((byte & 0x80) === 0) break
      shift += 7
      if (shift > 31) throw new Error('A block index in that file is too large to be one.')
    }
    cells[at++] = value
  }
  if (at < cells.length) {
    throw new Error(
      `That schematic says it is ${width} by ${height} by ${length} but only carries ${at} blocks.`
    )
  }

  return {
    format: 'sponge',
    width,
    height,
    length,
    at: (x, y, z) => {
      if (x < 0 || y < 0 || z < 0 || x >= width || y >= height || z >= length) return null

      const name = names[cells[x + z * width + y * width * length]]
      return name === undefined ? null : { key: stripNamespace(name) }
    }
  }
}

function stripNamespace(name: string): string {
  const bracket = name.indexOf('[')
  const bare = bracket === -1 ? name : name.slice(0, bracket)
  const colon = bare.indexOf(':')
  return colon === -1 ? bare : bare.slice(colon + 1)
}

function mceditSchematic(
  width: number,
  height: number,
  length: number,
  doc: NbtCompound
): Schematic {
  const blocks = nbtBytes(doc['Blocks'])
  if (!blocks) {
    throw new Error('That file has no Blocks array, so there is nothing in it to import.')
  }
  const expected = width * height * length
  if (blocks.length < expected) {
    throw new Error(
      `That schematic says it is ${width} by ${height} by ${length} but only carries ${blocks.length} blocks.`
    )
  }

  const add = nbtBytes(doc['AddBlocks']) ?? nbtBytes(doc['Add'])

  return {
    format: 'mcedit',
    width,
    height,
    length,
    at: (x, y, z) => {
      if (x < 0 || y < 0 || z < 0 || x >= width || y >= height || z >= length) return null

      const index = (y * length + z) * width + x
      let id = blocks[index] & 0xff
      if (add) {
        const half = add[index >> 1]
        if (half !== undefined) {
          id |= ((index & 1) === 0 ? (half & 0x0f) : (half & 0xf0) >> 4) << 8
        }
      }
      return { id }
    }
  }
}
