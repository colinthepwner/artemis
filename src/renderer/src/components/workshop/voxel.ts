import type { BuildVariant, TreeProps } from '@shared/generator/props'
import type { Face } from '@/components/preview/scene'

export const HALF = 15
export const MAX_Y = 31

export const keyOf = (x: number, y: number, z: number): string => `${x},${y},${z}`

export function parseKey(key: string): { x: number; y: number; z: number } {
  const [x, y, z] = key.split(',').map(Number)
  return { x, y, z }
}

export function inBounds(x: number, y: number, z: number): boolean {
  return x >= -HALF && x <= HALF && z >= -HALF && z <= HALF && y >= 0 && y <= MAX_Y
}

export type CellFace = Face | 'bottom'

export const FACE_NORMALS: Record<CellFace, { x: number; y: number; z: number }> = {
  top: { x: 0, y: 1, z: 0 },
  bottom: { x: 0, y: -1, z: 0 },
  front: { x: 0, y: 0, z: 1 },
  back: { x: 0, y: 0, z: -1 },
  left: { x: -1, y: 0, z: 0 },
  right: { x: 1, y: 0, z: 0 }
}

export interface VoxelCell {
  x: number
  y: number
  z: number
  ref: string
  faces: CellFace[]
}

export function visibleVoxels(
  blocks: Record<string, string>,
  clipY: number,
  solid: (ref: string) => boolean = () => true,

  includeBottom = false
): VoxelCell[] {
  const shown = new Map<string, string>()
  for (const [key, ref] of Object.entries(blocks)) {
    const { y } = parseKey(key)
    if (y <= clipY) shown.set(key, ref)
  }
  const out: VoxelCell[] = []
  for (const [key, ref] of shown) {
    const { x, y, z } = parseKey(key)

    const seeThrough = !solid(ref)
    const faces = (Object.keys(FACE_NORMALS) as CellFace[]).filter((face) => {

      if (face === 'bottom' && (!includeBottom || y === 0)) return false
      if (seeThrough) return true
      const n = FACE_NORMALS[face]
      const neighbor = shown.get(keyOf(x + n.x, y + n.y, z + n.z))
      return neighbor === undefined || !solid(neighbor)
    })
    if (faces.length) out.push({ x, y, z, ref, faces })
  }
  return out
}

export interface FaceRect {
  face: CellFace
  ref: string
  plane: number
  u0: number
  v0: number
  w: number
  h: number
}

export function mergeFaces(cells: VoxelCell[]): FaceRect[] {
  interface Bucket {
    face: CellFace
    ref: string
    plane: number
    cells: Map<string, { u: number; v: number }>
  }
  const buckets = new Map<string, Bucket>()
  for (const c of cells) {
    for (const face of c.faces) {
      const [plane, u, v] =
        face === 'top' || face === 'bottom'
          ? [c.y, c.x, c.z]
          : face === 'front' || face === 'back'
            ? [c.z, c.x, c.y]
            : [c.x, c.z, c.y]
      const key = `${face}|${plane}|${c.ref}`
      let b = buckets.get(key)
      if (!b) {
        b = { face, ref: c.ref, plane, cells: new Map() }
        buckets.set(key, b)
      }
      b.cells.set(`${u},${v}`, { u, v })
    }
  }

  const out: FaceRect[] = []
  for (const b of buckets.values()) {
    const free = b.cells

    const order = [...free.values()].sort((a, c) => a.v - c.v || a.u - c.u)
    const used = new Set<string>()
    for (const start of order) {
      const startKey = `${start.u},${start.v}`
      if (used.has(startKey)) continue

      let w = 1
      while (free.has(`${start.u + w},${start.v}`) && !used.has(`${start.u + w},${start.v}`)) w++

      let h = 1
      grow: for (;;) {
        for (let du = 0; du < w; du++) {
          const k = `${start.u + du},${start.v + h}`
          if (!free.has(k) || used.has(k)) break grow
        }
        h++
      }
      for (let du = 0; du < w; du++) {
        for (let dv = 0; dv < h; dv++) used.add(`${start.u + du},${start.v + dv}`)
      }
      out.push({ face: b.face, ref: b.ref, plane: b.plane, u0: start.u, v0: start.v, w, h })
    }
  }
  return out
}

export function highestY(blocks: Record<string, string>): number {
  let top = 0
  for (const key of Object.keys(blocks)) top = Math.max(top, parseKey(key).y)
  return top
}

export function newVariant(name: string): BuildVariant {
  return { id: crypto.randomUUID(), name, blocks: {} }
}

export function seedGrownVariant(p: TreeProps): BuildVariant {
  const blocks: Record<string, string> = {}
  const h = Math.max(2, Math.min(p.minHeight, MAX_Y - 2))
  for (let dy = 0; dy < h; dy++) blocks[keyOf(0, dy, 0)] = p.logBlock
  for (let dy = h - 2; dy <= h + 1; dy++) {
    const radius = dy > h - 1 ? 1 : 2
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dz = -radius; dz <= radius; dz++) {
        if (Math.abs(dx) === radius && Math.abs(dz) === radius) continue
        const key = keyOf(dx, dy, dz)
        if (!blocks[key] && dy <= MAX_Y) blocks[key] = p.leavesBlock
      }
    }
  }
  return { id: crypto.randomUUID(), name: 'Variant 1', blocks }
}

const CROSS_PLANTS =
  /^(SAPLING_|TALLGRASS|DEADBUSH$|SPINIFEX$|ALGAE$|FLOWER_|MUSHROOM_BROWN$|MUSHROOM_RED$|CROPS_|SUGARCANE$)/

export function isCrossPlantField(field: string): boolean {
  return CROSS_PLANTS.test(field)
}
