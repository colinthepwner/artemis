import { getVanillaBlockIds, type VanillaBlockId } from './generator/vanilla'
import type { Schematic } from './schematic'

export interface CropReport {

  size: { width: number; height: number; length: number }

  cropped: boolean

  lost: number
}

export interface SchematicImport {

  blocks: Record<string, string>

  placed: number
  crop: CropReport

  unknown: { what: string; count: number }[]
}

export interface GridBounds {

  half: number

  maxY: number
}

function squash(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '')
}

interface Lookup {
  byId: Map<number, VanillaBlockId>
  byKey: Map<string, VanillaBlockId>
  bySquashedKey: Map<string, VanillaBlockId>
}

function lookupFor(btaVersion: string): Lookup {
  const table = getVanillaBlockIds(btaVersion)
  const byId = new Map<number, VanillaBlockId>()
  const byKey = new Map<string, VanillaBlockId>()
  const bySquashedKey = new Map<string, VanillaBlockId>()
  for (const entry of table) {
    byId.set(entry.id, entry)
    byKey.set(entry.key.toLowerCase(), entry)

    const squashed = squash(entry.key)
    if (!bySquashedKey.has(squashed)) bySquashedKey.set(squashed, entry)
  }
  return { byId, byKey, bySquashedKey }
}

export function importSchematic(
  schematic: Schematic,
  btaVersion: string,
  bounds: GridBounds
): SchematicImport {
  const { byId, byKey, bySquashedKey } = lookupFor(btaVersion)
  const blocks: Record<string, string> = {}
  const unknown = new Map<string, number>()
  let placed = 0
  let lost = 0

  const span = bounds.half * 2 + 1

  const offsetX = Math.floor((schematic.width - span) / 2)
  const offsetZ = Math.floor((schematic.length - span) / 2)

  for (let y = 0; y < schematic.height; y++) {
    for (let z = 0; z < schematic.length; z++) {
      for (let x = 0; x < schematic.width; x++) {
        const cell = schematic.at(x, y, z)
        if (!cell) continue

        if (cell.id === 0) continue
        if (cell.key !== undefined && (cell.key === 'air' || cell.key === 'cave_air')) continue

        let match: VanillaBlockId | undefined
        let named: string
        if (cell.id !== undefined) {
          match = byId.get(cell.id)
          named = `id ${cell.id}`
        } else if (cell.key !== undefined) {
          const key = cell.key.toLowerCase()
          match = byKey.get(key) ?? bySquashedKey.get(squash(key))
          named = cell.key
        } else {
          continue
        }

        if (!match) {
          unknown.set(named, (unknown.get(named) ?? 0) + 1)
          continue
        }

        const gx = x - offsetX - bounds.half
        const gz = z - offsetZ - bounds.half
        if (
          y > bounds.maxY ||
          gx < -bounds.half ||
          gx > bounds.half ||
          gz < -bounds.half ||
          gz > bounds.half
        ) {
          lost++
          continue
        }
        blocks[`${gx},${y},${gz}`] = `block:${match.field}`
        placed++
      }
    }
  }

  return {
    blocks,
    placed,
    crop: {
      size: { width: schematic.width, height: schematic.height, length: schematic.length },
      cropped: lost > 0,
      lost
    },
    unknown: [...unknown]
      .map(([what, count]) => ({ what, count }))
      .sort((a, b) => b.count - a.count)
  }
}

export function describeImport(result: SchematicImport): string {
  const { width, height, length } = result.crop.size
  const parts = [`${result.placed} blocks from a ${width}×${height}×${length} schematic.`]
  if (result.crop.cropped) {
    parts.push(
      `${result.crop.lost} fell outside the Workshop's grid and were left behind; what is here is the middle of it.`
    )
  }
  if (result.unknown.length > 0) {
    const top = result.unknown
      .slice(0, 3)
      .map((u) => `${u.what} (${u.count})`)
      .join(', ')
    const rest = result.unknown.length > 3 ? `, and ${result.unknown.length - 3} more` : ''
    parts.push(`This game has no block for ${top}${rest}, so those cells are empty.`)
  }
  return parts.join(' ')
}
