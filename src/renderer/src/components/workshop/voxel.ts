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

export const FACE_NORMALS: Record<Face, { x: number; y: number; z: number }> = {
  top: { x: 0, y: 1, z: 0 },
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
  faces: Face[]
}

export function visibleVoxels(
  blocks: Record<string, string>,
  clipY: number,
  solid: (ref: string) => boolean = () => true
): VoxelCell[] {
  const shown = new Map<string, string>()
  for (const [key, ref] of Object.entries(blocks)) {
    const { y } = parseKey(key)
    if (y <= clipY) shown.set(key, ref)
  }
  const out: VoxelCell[] = []
  for (const [key, ref] of shown) {
    const { x, y, z } = parseKey(key)
    const faces = (Object.keys(FACE_NORMALS) as Face[]).filter((face) => {
      const n = FACE_NORMALS[face]
      const neighbor = shown.get(keyOf(x + n.x, y + n.y, z + n.z))
      return neighbor === undefined || !solid(neighbor)
    })
    if (faces.length) out.push({ x, y, z, ref, faces })
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
