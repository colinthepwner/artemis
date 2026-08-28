const GLYPHS: Record<string, string[]> = {
  A: ['010', '101', '111', '101', '101'],
  R: ['110', '101', '110', '101', '101'],
  T: ['111', '010', '010', '010', '010'],
  E: ['111', '100', '110', '100', '111'],
  M: ['101', '111', '111', '101', '101'],
  I: ['111', '010', '010', '010', '111'],
  S: ['011', '100', '010', '001', '110']
}

export interface Cell {
  x: number
  y: number
  z: number
}

export function wordCells(word: string): Cell[] {
  const letters = [...word.toUpperCase()].map((c) => GLYPHS[c]).filter(Boolean)
  const width = letters.length * 4 - 1
  const cells: Cell[] = []
  letters.forEach((rows, i) => {
    rows.forEach((row, r) => {
      ;[...row].forEach((on, c) => {
        if (on !== '1') return
        cells.push({
          x: i * 4 + c - (width - 1) / 2,

          y: rows.length - 1 - r,
          z: 0
        })
      })
    })
  })
  return cells
}

export type Face = 'top' | 'front' | 'back' | 'left' | 'right'

const NEIGHBORS: Record<Face, Cell> = {
  top: { x: 0, y: 1, z: 0 },
  front: { x: 0, y: 0, z: 1 },
  back: { x: 0, y: 0, z: -1 },
  left: { x: -1, y: 0, z: 0 },
  right: { x: 1, y: 0, z: 0 }
}

export function visibleFaces(cells: Cell[]): { cell: Cell; faces: Face[] }[] {
  const filled = new Set(cells.map((c) => `${c.x},${c.y},${c.z}`))
  return cells.map((cell) => ({
    cell,
    faces: (Object.keys(NEIGHBORS) as Face[]).filter((face) => {
      const n = NEIGHBORS[face]
      return !filled.has(`${cell.x + n.x},${cell.y + n.y},${cell.z + n.z}`)
    })
  }))
}

export const FACE_SHADE: Record<Face, number> = {
  top: 1,
  front: 0.8,
  back: 0.8,
  left: 0.6,
  right: 0.6
}

export function faceTransform(face: Face, s: number): string {
  const half = s / 2
  switch (face) {
    case 'top':
      return `rotateX(90deg) translateZ(${half}px)`
    case 'front':
      return `translateZ(${half}px)`
    case 'back':
      return `rotateY(180deg) translateZ(${half}px)`
    case 'left':
      return `rotateY(-90deg) translateZ(${half}px)`
    case 'right':
      return `rotateY(90deg) translateZ(${half}px)`
  }
}

export const PLANT_SPOTS: { x: number; z: number }[] = [
  { x: 0, z: 0 },
  { x: -2, z: -1 },
  { x: 2, z: 1 },
  { x: -3, z: 2 },
  { x: 3, z: -2 },
  { x: -1, z: 3 },
  { x: 1, z: -3 },
  { x: 4, z: 2 },
  { x: -4, z: -2 }
]
