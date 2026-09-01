import { HALF, MAX_Y, inBounds, keyOf } from './voxel'
import { rng } from '@shared/rng'

export interface StructureSlot {

  key: string

  label: string

  defaultRef: string
}

export interface StructureTemplate {
  id: string
  name: string
  group: 'BTA' | 'Artemis'
  desc: string

  slots: StructureSlot[]

  build: (seed: number) => Record<string, string[]>
}

class Build {
  private order: string[]
  private slotIndex = new Map<string, number>()
  private cells = new Map<string, number>()

  constructor(slotKeys: string[]) {
    this.order = slotKeys
    slotKeys.forEach((k, i) => this.slotIndex.set(k, i))
  }

  put(slot: string, x: number, y: number, z: number): void {
    if (!inBounds(x, y, z)) return
    const idx = this.slotIndex.get(slot)
    if (idx === undefined) return
    const k = keyOf(x, y, z)
    const prev = this.cells.get(k)

    if (prev !== undefined && prev <= idx) return
    this.cells.set(k, idx)
  }

  cut(x: number, y: number, z: number): void {
    this.cells.delete(keyOf(x, y, z))
  }

  door(x: number, yFeet: number, z: number): void {
    this.cut(x, yFeet, z)
    this.cut(x, yFeet + 1, z)
  }

  fill(slot: string, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): void {
    const [xa, xb] = x0 <= x1 ? [x0, x1] : [x1, x0]
    const [ya, yb] = y0 <= y1 ? [y0, y1] : [y1, y0]
    const [za, zb] = z0 <= z1 ? [z0, z1] : [z1, z0]
    for (let x = xa; x <= xb; x++) {
      for (let y = ya; y <= yb; y++) {
        for (let z = za; z <= zb; z++) this.put(slot, x, y, z)
      }
    }
  }

  ring(slot: string, x0: number, z0: number, x1: number, z1: number, y0: number, y1: number): void {
    for (let x = x0; x <= x1; x++) {
      for (let z = z0; z <= z1; z++) {
        if (x !== x0 && x !== x1 && z !== z0 && z !== z1) continue
        for (let y = y0; y <= y1; y++) this.put(slot, x, y, z)
      }
    }
  }

  column(slot: string, x: number, z: number, y0: number, y1: number): void {
    for (let y = y0; y <= y1; y++) this.put(slot, x, y, z)
  }

  disc(slot: string, cx: number, y: number, cz: number, radius: number): void {
    const rr = Math.ceil(radius)
    for (let dx = -rr; dx <= rr; dx++) {
      for (let dz = -rr; dz <= rr; dz++) {
        if (Math.hypot(dx, dz) <= radius + 0.4) this.put(slot, cx + dx, y, cz + dz)
      }
    }
  }

  hoop(slot: string, cx: number, y: number, cz: number, rIn: number, rOut: number): void {
    const rr = Math.ceil(rOut)
    for (let dx = -rr; dx <= rr; dx++) {
      for (let dz = -rr; dz <= rr; dz++) {
        const d = Math.hypot(dx, dz)
        if (d >= rIn && d <= rOut) this.put(slot, cx + dx, y, cz + dz)
      }
    }
  }

  done(): Record<string, string[]> {
    const out: Record<string, string[]> = {}
    for (const k of this.order) out[k] = []
    for (const [key, idx] of this.cells) out[this.order[idx]].push(key)
    return out
  }
}

const weathered =
  (b: Build, r: () => number, plain: string, mossy: string) =>
  (x: number, y: number, z: number): void => {
    b.put(r() < 0.3 ? mossy : plain, x, y, z)
  }

function btaDungeonCell(seed: number): Record<string, string[]> {
  const r = rng(seed)
  const b = new Build(['walls', 'mossy', 'spawner'])

  const half = 3 + (r() < 0.5 ? 0 : 1)
  const h = 4
  const lay = weathered(b, r, 'walls', 'mossy')
  for (let x = -half; x <= half; x++) {
    for (let z = -half; z <= half; z++) {
      lay(x, 0, z)
      lay(x, h, z)
      if (Math.abs(x) === half || Math.abs(z) === half) {
        for (let y = 1; y < h; y++) lay(x, y, z)
      }
    }
  }
  b.put('spawner', 0, 1, 0)
  b.door(0, 1, half)
  return b.done()
}

function btaLabyrinth(seed: number): Record<string, string[]> {
  const r = rng(seed)
  const b = new Build(['walls', 'floor'])
  const C = 10
  const N = C * 2 + 1

  const wall: boolean[][] = []
  for (let i = 0; i < N; i++) wall.push(new Array<boolean>(N).fill(true))
  const visited: boolean[][] = []
  for (let i = 0; i < C; i++) visited.push(new Array<boolean>(C).fill(false))

  const stack: [number, number][] = [[0, 0]]
  visited[0][0] = true
  wall[1][1] = false
  const dirs: [number, number][] = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1]
  ]
  while (stack.length > 0) {
    const [ci, cj] = stack[stack.length - 1]
    const options: [number, number][] = []
    for (const [di, dj] of dirs) {
      const ni = ci + di
      const nj = cj + dj
      if (ni >= 0 && ni < C && nj >= 0 && nj < C && !visited[ni][nj]) options.push([di, dj])
    }
    if (options.length === 0) {
      stack.pop()
      continue
    }
    const [di, dj] = options[Math.floor(r() * options.length)]
    const ni = ci + di
    const nj = cj + dj
    visited[ni][nj] = true

    wall[2 * ci + 1 + di][2 * cj + 1 + dj] = false
    wall[2 * ni + 1][2 * nj + 1] = false
    stack.push([ni, nj])
  }

  wall[2 * Math.floor(r() * C) + 1][0] = false
  wall[2 * Math.floor(r() * C) + 1][N - 1] = false

  for (let wx = 0; wx < N; wx++) {
    for (let wz = 0; wz < N; wz++) {
      const x = wx - C
      const z = wz - C
      b.put('floor', x, 0, z)
      if (wall[wx][wz]) {
        b.put('walls', x, 1, z)
        b.put('walls', x, 2, z)
      }
    }
  }
  return b.done()
}

function btaDesertWell(seed: number): Record<string, string[]> {
  const r = rng(seed)
  const b = new Build(['stone', 'water', 'trim'])

  b.fill('stone', -1, 0, -1, 1, 0, 1)
  for (let x = -2; x <= 2; x++) {
    for (let z = -2; z <= 2; z++) {
      if (Math.abs(x) < 2 && Math.abs(z) < 2) continue
      const corner = Math.abs(x) === 2 && Math.abs(z) === 2
      if (corner && r() < 0.4) continue
      b.put('trim', x, 0, z)
    }
  }

  b.ring('stone', -1, -1, 1, 1, 1, 1)
  b.put('water', 0, 1, 0)

  for (const [px, pz] of [
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1]
  ]) {
    b.column('stone', px, pz, 2, 3)
  }
  b.fill('trim', -1, 4, -1, 1, 4, 1)
  return b.done()
}

function btaRuinedTower(seed: number): Record<string, string[]> {
  const r = rng(seed)
  const b = new Build(['walls', 'rubble'])
  const h = 8 + Math.floor(r() * 3)

  const breach = r() * Math.PI * 2
  for (let dx = -4; dx <= 4; dx++) {
    for (let dz = -4; dz <= 4; dz++) {
      const d = Math.hypot(dx, dz)

      if (d < 2.3) {
        b.put(r() < 0.25 ? 'rubble' : 'walls', dx, 0, dz)
        continue
      }
      if (d > 3.4) {

        if (d <= 5 && r() < 0.18) {
          b.put('rubble', dx, 0, dz)
          if (r() < 0.3) b.put('rubble', dx, 1, dz)
        }
        continue
      }

      let colH = h - Math.floor(r() * r() * h * 0.8)

      let ang = Math.atan2(dz, dx) - breach
      while (ang > Math.PI) ang -= Math.PI * 2
      while (ang < -Math.PI) ang += Math.PI * 2
      if (Math.abs(ang) < 0.55) colH = Math.min(colH, 2 + Math.floor(r() * 2))
      for (let y = 0; y < colH; y++) {
        b.put(r() < 0.2 ? 'rubble' : 'walls', dx, y, dz)
      }
    }
  }

  const dx = Math.round(Math.cos(breach + Math.PI) * 3)
  const dz = Math.round(Math.sin(breach + Math.PI) * 3)
  b.door(dx, 1, dz)
  return b.done()
}

function btaBuriedVault(seed: number): Record<string, string[]> {
  const r = rng(seed)
  const b = new Build(['vault', 'earth', 'chest'])

  b.fill('vault', -3, 0, -3, 3, 0, 3)
  b.fill('vault', -3, 4, -3, 3, 4, 3)
  b.ring('vault', -3, -3, 3, 3, 1, 3)
  b.put('chest', 0, 1, 0)

  b.door(0, 1, 3)

  const mR = 5.2 + r() * 0.8
  for (let x = -6; x <= 6; x++) {
    for (let y = 0; y <= 6; y++) {
      for (let z = -6; z <= 6; z++) {
        const inside = Math.abs(x) <= 2 && Math.abs(z) <= 2 && y >= 1 && y <= 3
        const passage = x === 0 && z >= 3 && z <= 6 && y >= 1 && y <= 2
        if (inside || passage) continue
        if (Math.hypot(x, y * 1.35, z) <= mR + (r() - 0.5) * 0.6) b.put('earth', x, y, z)
      }
    }
  }
  return b.done()
}

function btaMineshaft(seed: number): Record<string, string[]> {
  const r = rng(seed)
  const b = new Build(['timber', 'planks', 'torches'])

  const zHalf = 4 + Math.floor(r() * 3)
  for (let z = -zHalf; z <= zHalf; z++) {
    const frame = (z + zHalf) % 3 === 0
    if (frame) {
      b.column('timber', -1, z, 0, 2)
      b.column('timber', 1, z, 0, 2)
      for (let x = -1; x <= 1; x++) b.put('timber', x, 3, z)

      if (r() < 0.45) b.put('torches', r() < 0.5 ? 1 : -1, 4, z)
    }

    if (r() < 0.85) b.put('planks', 0, 3, z)

    if (r() < 0.5) b.put('planks', -1, 0, z)
    if (r() < 0.5) b.put('planks', 1, 0, z)
  }
  return b.done()
}

function btaStoneCircle(seed: number): Record<string, string[]> {
  const r = rng(seed)
  const b = new Build(['stones', 'caps'])
  const n = 8
  const radius = 5.5
  const pos: [number, number, number][] = []
  for (let i = 0; i < n; i++) {
    const ang = (i / n) * Math.PI * 2 + (r() - 0.5) * 0.3
    const x = Math.round(Math.cos(ang) * radius)
    const z = Math.round(Math.sin(ang) * radius)
    const h = 2 + Math.floor(r() * 3)
    b.column('stones', x, z, 0, h - 1)
    pos.push([x, z, h])
  }

  for (let i = 0; i < n; i++) {
    const [ax, az, ah] = pos[i]
    const [bx, bz, bh] = pos[(i + 1) % n]
    if (ah < 3 || bh < 3 || r() < 0.45) continue
    const top = Math.max(ah, bh)
    b.put('caps', ax, top, az)
    b.put('caps', bx, top, bz)
    b.put('caps', Math.round((ax + bx) / 2), top, Math.round((az + bz) / 2))
  }
  return b.done()
}

function btaCairnField(seed: number): Record<string, string[]> {
  const r = rng(seed)
  const b = new Build(['rocks', 'mossy'])
  const piles = 6 + Math.floor(r() * 4)
  const lay = weathered(b, r, 'rocks', 'mossy')
  for (let i = 0; i < piles; i++) {
    const px = Math.floor(r() * 11) - 5
    const pz = Math.floor(r() * 11) - 5

    lay(px, 0, pz)
    if (r() < 0.8) lay(px + 1, 0, pz)
    if (r() < 0.8) lay(px - 1, 0, pz)
    if (r() < 0.8) lay(px, 0, pz + 1)
    if (r() < 0.8) lay(px, 0, pz - 1)
    lay(px, 1, pz)
    if (r() < 0.4) lay(px, 2, pz)
  }
  return b.done()
}

function btaSandPyramid(seed: number): Record<string, string[]> {
  const r = rng(seed)
  const b = new Build(['stone', 'trim'])

  const half = 6 + (r() < 0.5 ? 0 : 1)
  for (let y = 0; y <= half; y++) {
    const hw = half - y
    for (let x = -hw; x <= hw; x++) {
      for (let z = -hw; z <= hw; z++) {
        const edge = Math.abs(x) === hw && Math.abs(z) === hw
        b.put(edge ? 'trim' : 'stone', x, y, z)
      }
    }
  }
  b.put('trim', 0, half + 1, 0)

  for (let x = -2; x <= 2; x++) {
    for (let y = 1; y <= 3; y++) {
      for (let z = -2; z <= 2; z++) b.cut(x, y, z)
    }
  }
  for (let z = 2; z <= half; z++) {
    b.cut(0, 1, z)
    b.cut(0, 2, z)
  }
  return b.done()
}

function btaWatchRuin(seed: number): Record<string, string[]> {
  const r = rng(seed)
  const b = new Build(['walls', 'mossy'])
  const lay = weathered(b, r, 'walls', 'mossy')

  for (let x = -6; x <= -2; x++) {
    for (let z = -2; z <= 2; z++) {
      const shell = x === -6 || x === -2 || Math.abs(z) === 2
      if (!shell) {
        lay(x, 0, z)
        continue
      }
      const colH = 5 + Math.floor(r() * 3) - Math.floor(r() * r() * 4)
      for (let y = 0; y < colH; y++) lay(x, y, z)
    }
  }
  b.door(-2, 1, 0)

  for (let x = -1; x <= 7; x++) {
    if (r() < 0.2) continue
    const colH = 1 + Math.floor(r() * 3)
    for (let y = 0; y < colH; y++) lay(x, y, 0)
  }
  return b.done()
}

function btaGraveyard(seed: number): Record<string, string[]> {
  const r = rng(seed)
  const b = new Build(['markers', 'wall', 'ground'])

  b.fill('ground', -5, 0, -4, 5, 0, 4)
  for (let x = -5; x <= 5; x++) {
    for (let z = -4; z <= 4; z++) {
      if (Math.abs(x) !== 5 && Math.abs(z) !== 4) continue

      if (z === -4 && Math.abs(x) <= 1) continue
      if (r() < 0.3) continue
      b.put('wall', x, 1, z)
    }
  }

  for (let x = -3; x <= 3; x += 2) {
    for (let z = -2; z <= 2; z += 2) {
      if (r() < 0.2) continue
      if (r() < 0.2) {

        b.put('markers', x, 1, z)
        b.put('markers', x + 1, 1, z)
      } else {
        b.put('markers', x, 1, z)
        if (r() < 0.6) b.put('markers', x, 2, z)
      }
    }
  }
  return b.done()
}

function btaMonolith(seed: number): Record<string, string[]> {
  const r = rng(seed)
  const b = new Build(['monolith', 'base'])
  const h = 6 + Math.floor(r() * 4)

  for (let x = -3; x <= 3; x++) {
    for (let z = -2; z <= 3; z++) {
      if (r() < 0.75 - Math.hypot(x - 0, z - 0.5) * 0.12) b.put('base', x, 0, z)
    }
  }

  for (let y = 0; y <= h; y++) {
    b.put('monolith', 0, y, 0)
    b.put('monolith', 0, y, 1)
  }
  return b.done()
}

function artCottage(seed: number): Record<string, string[]> {
  const r = rng(seed)
  const b = new Build(['frame', 'walls', 'roof'])
  const hx = 3
  const hz = 3 + (r() < 0.5 ? 0 : 1)

  b.fill('walls', -hx, 0, -hz, hx, 0, hz)
  b.ring('walls', -hx, -hz, hx, hz, 1, 3)
  for (const [cx, cz] of [
    [hx, hz],
    [hx, -hz],
    [-hx, hz],
    [-hx, -hz]
  ]) {
    b.column('frame', cx, cz, 1, 3)
  }

  b.door(0, 1, hz)
  b.cut(-2, 2, hz)
  b.cut(2, 2, hz)
  b.cut(-hx, 2, 0)
  b.cut(hx, 2, 0)

  for (let s = 0; s <= hx + 1; s++) {
    const rx = hx + 1 - s
    const y = 4 + s
    for (let z = -hz - 1; z <= hz + 1; z++) {
      b.put('roof', rx, y, z)
      b.put('roof', -rx, y, z)
    }
    if (rx > 0) {
      for (let x = -rx + 1; x <= rx - 1; x++) {
        b.put('walls', x, y, hz)
        b.put('walls', x, y, -hz)
      }
    }
  }
  return b.done()
}

function artWatchtower(seed: number): Record<string, string[]> {
  const r = rng(seed)
  const b = new Build(['walls', 'crown', 'ladder'])
  const h = 9 + Math.floor(r() * 3)
  b.fill('walls', -2, 0, -2, 2, 0, 2)
  b.ring('walls', -2, -2, 2, 2, 1, h - 2)

  b.fill('walls', -2, h - 1, -2, 2, h - 1, 2)
  for (let x = -2; x <= 2; x++) {
    for (let z = -2; z <= 2; z++) {
      if (Math.abs(x) !== 2 && Math.abs(z) !== 2) continue
      b.put('crown', x, h, z)
      if ((x + z + 20) % 2 === 0) b.put('crown', x, h + 1, z)
    }
  }
  b.door(0, 1, 2)

  const slitY = Math.max(3, h - 4)
  b.cut(0, slitY, -2)
  b.cut(2, slitY, 0)
  b.cut(-2, slitY, 0)

  for (let y = 1; y <= h - 2; y++) b.put('ladder', 0, y, -1)
  b.cut(0, h - 1, -1)
  return b.done()
}

function artBridge(seed: number): Record<string, string[]> {
  const r = rng(seed)
  const b = new Build(['deck', 'piers', 'rails'])
  const L = 6 + (r() < 0.5 ? 0 : 1)

  const deckY = (x: number): number =>
    Math.round(3.2 * Math.sqrt(Math.max(0, 1 - (x / (L + 0.5)) ** 2)))
  for (let x = -L; x <= L; x++) {
    const y = deckY(x)
    for (let z = -1; z <= 1; z++) b.put('deck', x, y, z)

    if (Math.abs(x) >= L - 2) {
      for (let z = -1; z <= 1; z++) b.fill('piers', x, 0, z, x, y, z)
    }

    b.put('rails', x, y + 1, -1)
    b.put('rails', x, y + 1, 1)
  }
  return b.done()
}

function artFountain(seed: number): Record<string, string[]> {
  const r = rng(seed)
  const b = new Build(['basin', 'paving', 'water'])
  const half = 4 + (r() < 0.5 ? 0 : 1)

  for (let x = -half; x <= half; x++) {
    for (let z = -half; z <= half; z++) {
      if (Math.abs(x) === half && Math.abs(z) === half) continue
      b.put('paving', x, 0, z)
    }
  }

  b.ring('basin', -2, -2, 2, 2, 1, 1)
  for (let x = -1; x <= 1; x++) {
    for (let z = -1; z <= 1; z++) {
      if (x !== 0 || z !== 0) b.put('water', x, 1, z)
    }
  }
  b.column('basin', 0, 0, 1, 2)
  b.put('water', 0, 3, 0)
  return b.done()
}

function artFarmstead(seed: number): Record<string, string[]> {
  const r = rng(seed)
  const b = new Build(['fence', 'crops', 'soil'])

  for (let x = -5; x <= 5; x++) {
    for (let z = -4; z <= 4; z++) {
      if (Math.abs(x) !== 5 && Math.abs(z) !== 4) continue
      if (z === -4 && Math.abs(x) <= 0) continue
      b.put('fence', x, 0, z)
    }
  }

  for (let x = -4; x <= 4; x++) {
    for (let z = -3; z <= 3; z++) {
      b.put('soil', x, 0, z)
      if ((x + 4) % 2 === 0 && r() < 0.7) b.put('crops', x, 1, z)
    }
  }
  return b.done()
}

function artCampsite(seed: number): Record<string, string[]> {
  const r = rng(seed)
  const b = new Build(['tents', 'ring', 'logs'])

  for (const [dx, dz] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1]
  ]) {
    if (r() < 0.9) b.put('ring', dx, 0, dz)
  }

  const tents = 2 + (r() < 0.5 ? 0 : 1)
  const spots: [number, number][] = [
    [0, -5],
    [5, 0],
    [-5, 0],
    [0, 5]
  ]
  const first = Math.floor(r() * spots.length)
  for (let i = 0; i < tents; i++) {
    const [tx, tz] = spots[(first + i) % spots.length]

    const [ux, uz] = tz === 0 ? [0, 1] : [1, 0]
    const [vx, vz] = [Math.sign(tx), Math.sign(tz)]
    for (let v = 0; v <= 1; v++) {
      b.put('tents', tx + ux + vx * v, 0, tz + uz + vz * v)
      b.put('tents', tx - ux + vx * v, 0, tz - uz + vz * v)
      b.put('tents', tx + vx * v, 1, tz + vz * v)
    }

    b.put('tents', tx + vx * 2, 0, tz + vz * 2)
  }

  const benches = 1 + Math.floor(r() * 2)
  for (let i = 0; i < benches; i++) {
    const [tx, tz] = spots[(first + tents + i) % spots.length]
    const [ux, uz] = tz === 0 ? [0, 1] : [1, 0]
    b.put('logs', Math.sign(tx) * 3, 0, Math.sign(tz) * 3)
    b.put('logs', Math.sign(tx) * 3 + ux, 0, Math.sign(tz) * 3 + uz)
  }
  return b.done()
}

function artGazebo(seed: number): Record<string, string[]> {
  const r = rng(seed)
  const b = new Build(['posts', 'wood', 'railing'])

  const inOct = (x: number, z: number): boolean =>
    Math.abs(x) <= 4 && Math.abs(z) <= 4 && Math.abs(x) + Math.abs(z) <= 6
  const onRim = (x: number, z: number): boolean =>
    inOct(x, z) && (Math.abs(x) === 4 || Math.abs(z) === 4 || Math.abs(x) + Math.abs(z) === 6)
  for (let x = -4; x <= 4; x++) {
    for (let z = -4; z <= 4; z++) {
      if (inOct(x, z)) b.put('wood', x, 0, z)
    }
  }
  for (const [px, pz] of [
    [4, 0],
    [-4, 0],
    [0, 4],
    [0, -4],
    [3, 3],
    [3, -3],
    [-3, 3],
    [-3, -3]
  ]) {
    b.column('posts', px, pz, 1, 3)
  }

  for (let x = -4; x <= 4; x++) {
    for (let z = -4; z <= 4; z++) {
      if (!onRim(x, z)) continue
      if (z === -4 && Math.abs(x) <= 1) continue
      b.put('railing', x, 1, z)
    }
  }

  for (let s = 0; s <= 4; s++) {
    const half = 5 - s
    for (let x = -half; x <= half; x++) {
      for (let z = -half; z <= half; z++) {
        if (Math.abs(x) + Math.abs(z) <= Math.floor(half * 1.5)) b.put('wood', x, 4 + s, z)
      }
    }
  }

  b.put('posts', 0, 9, 0)
  if (r() < 0.5) b.put('posts', 0, 10, 0)
  return b.done()
}

function artWizardTower(seed: number): Record<string, string[]> {
  const r = rng(seed)
  const b = new Build(['walls', 'glow', 'roof'])
  const h = 10 + Math.floor(r() * 3)
  b.disc('walls', 0, 0, 0, 3.4)
  for (let y = 1; y < h; y++) b.hoop('walls', 0, y, 0, 2.3, 3.4)
  b.door(3, 1, 0)

  const windows = 3 + Math.floor(r() * 2)
  for (let i = 0; i < windows; i++) {
    const ang = r() * Math.PI * 2
    const wy = 3 + Math.floor(r() * (h - 5))
    const wx = Math.round(Math.cos(ang) * 3)
    const wz = Math.round(Math.sin(ang) * 3)
    if (r() < 0.5) {
      b.cut(wx, wy, wz)
    } else {
      b.cut(wx, wy, wz)
      b.put('glow', wx, wy, wz)
    }
  }

  const cone = [4.4, 3.4, 2.4, 1.6, 0.8]
  cone.forEach((radius, i) => b.disc('roof', 0, h + i, 0, radius))
  return b.done()
}

function artCrypt(seed: number): Record<string, string[]> {
  const r = rng(seed)
  const b = new Build(['walls', 'roof', 'tombs'])
  b.fill('walls', -3, 0, -4, 3, 0, 4)
  b.ring('walls', -3, -4, 3, 4, 1, 3)

  b.fill('roof', -3, 4, -4, 3, 4, 4)
  b.fill('roof', -2, 5, -4, 2, 5, 4)
  b.fill('roof', -1, 6, -4, 1, 6, 4)
  b.door(0, 1, 4)

  b.put('walls', 0, 0, 5)
  b.cut(-3, 2, -1)
  b.cut(3, 2, 1)

  b.fill('tombs', -2, 1, -2, -2, 1, 0)
  b.fill('tombs', 2, 1, -2, 2, 1, 0)
  if (r() < 0.5) b.fill('tombs', 0, 1, -3, 0, 1, -2)
  return b.done()
}

function artLighthouse(seed: number): Record<string, string[]> {
  const r = rng(seed)
  const b = new Build(['stripeA', 'stripeB', 'lantern'])
  const h = 13 + Math.floor(r() * 3)

  b.disc('stripeA', 0, 0, 0, 3.4)
  for (let y = 1; y < h; y++) {
    const rad = y < h * 0.4 ? 3.4 : 2.6
    const slot = Math.floor(y / 2) % 2 === 0 ? 'stripeA' : 'stripeB'
    b.hoop(slot, 0, y, 0, rad - 1.2, rad)
  }
  b.door(3, 1, 0)

  b.disc('stripeB', 0, h, 0, 3.4)
  b.column('lantern', 0, 0, h + 1, h + 2)
  b.disc('stripeA', 0, h + 3, 0, 1.4)
  return b.done()
}

function artHarborDock(seed: number): Record<string, string[]> {
  const r = rng(seed)
  const b = new Build(['deck', 'piles', 'posts'])
  const L = 5 + Math.floor(r() * 3)

  for (let x = -L; x <= L; x++) {
    for (let z = -1; z <= 1; z++) b.put('deck', x, 1, z)
  }
  const headHalf = 2 + (r() < 0.5 ? 0 : 1)
  for (let x = L - 1; x <= L + 1; x++) {
    for (let z = -headHalf; z <= headHalf; z++) b.put('deck', x, 1, z)
  }

  for (let x = -L; x <= L; x += 3) {
    b.put('piles', x, 0, -1)
    b.put('piles', x, 0, 1)
  }
  for (const z of [-headHalf, headHalf]) {
    b.put('piles', L - 1, 0, z)
    b.put('piles', L + 1, 0, z)
  }

  for (let x = -L + 1; x <= L; x += 4) {
    b.put('posts', x, 2, r() < 0.5 ? -1 : 1)
  }
  b.put('posts', L + 1, 2, -headHalf)
  b.put('posts', L + 1, 2, headHalf)
  return b.done()
}

function artArena(seed: number): Record<string, string[]> {
  const r = rng(seed)
  const b = new Build(['walls', 'seats', 'sand'])

  const tiers = 2 + (r() < 0.5 ? 0 : 1)
  const wallR = 7.5
  for (let x = -12; x <= 12; x++) {
    for (let z = -12; z <= 12; z++) {
      const d = Math.hypot(x, z)
      if (d < wallR) {
        b.put('sand', x, 0, z)
      } else if (d <= wallR + 1) {
        b.column('walls', x, z, 0, 2)
      } else if (d <= wallR + 1 + tiers) {

        const tier = Math.ceil(d - wallR - 1)
        b.column('seats', x, z, 0, tier)
      }
    }
  }

  const reach = Math.ceil(wallR + 1 + tiers)
  for (let x = 7; x <= reach; x++) {
    b.cut(x, 1, 0)
    b.cut(x, 2, 0)
    b.cut(-x, 1, 0)
    b.cut(-x, 2, 0)
  }
  return b.done()
}

const B = (field: string): string => `block:${field}`

export const STRUCTURE_TEMPLATES: StructureTemplate[] = [
  {
    id: 'bta_dungeon_cell',
    name: 'Dungeon Cell',
    group: 'BTA',
    desc: 'The classic mossy cobble box, spawner and all.',
    slots: [
      { key: 'walls', label: 'Walls', defaultRef: B('COBBLE_STONE') },
      { key: 'mossy', label: 'Mossy patches', defaultRef: B('COBBLE_STONE_MOSSY') },
      { key: 'spawner', label: 'Spawner', defaultRef: B('MOBSPAWNER') }
    ],
    build: btaDungeonCell
  },
  {
    id: 'bta_labyrinth',
    name: 'Labyrinth',
    group: 'BTA',
    desc: 'A true 21×21 maze; every reroll is a new one.',
    slots: [
      { key: 'walls', label: 'Walls', defaultRef: B('BRICK_STONE') },
      { key: 'floor', label: 'Floor', defaultRef: B('COBBLE_STONE') }
    ],
    build: btaLabyrinth
  },
  {
    id: 'bta_desert_well',
    name: 'Desert Well',
    group: 'BTA',
    desc: 'A sandstone well with a little canopy.',
    slots: [
      { key: 'stone', label: 'Stone', defaultRef: B('SANDSTONE') },
      { key: 'water', label: 'Water', defaultRef: B('FLUID_WATER_STILL') },
      { key: 'trim', label: 'Trim', defaultRef: B('SLAB_SANDSTONE') }
    ],
    build: btaDesertWell
  },
  {
    id: 'bta_ruined_tower',
    name: 'Ruined Tower',
    group: 'BTA',
    desc: 'A round tower crumbled open on one side.',
    slots: [
      { key: 'walls', label: 'Walls', defaultRef: B('COBBLE_STONE') },
      { key: 'rubble', label: 'Rubble', defaultRef: B('COBBLE_STONE_MOSSY') }
    ],
    build: btaRuinedTower
  },
  {
    id: 'bta_buried_vault',
    name: 'Buried Vault',
    group: 'BTA',
    desc: 'A brick chamber under a mound, one way in.',
    slots: [
      { key: 'vault', label: 'Vault', defaultRef: B('BRICK_STONE') },
      { key: 'earth', label: 'Earth', defaultRef: B('DIRT') },
      { key: 'chest', label: 'Loot', defaultRef: B('CHEST_PLANKS_OAK') }
    ],
    build: btaBuriedVault
  },
  {
    id: 'bta_mineshaft',
    name: 'Mineshaft Gallery',
    group: 'BTA',
    desc: 'Timber frames marching down a worked shaft.',
    slots: [
      { key: 'timber', label: 'Timber', defaultRef: B('LOG_OAK') },
      { key: 'planks', label: 'Boards', defaultRef: B('PLANKS_OAK') },
      { key: 'torches', label: 'Lamps', defaultRef: B('TORCH_COAL') }
    ],
    build: btaMineshaft
  },
  {
    id: 'bta_stone_circle',
    name: 'Stone Circle',
    group: 'BTA',
    desc: 'Standing stones, lintels where they still hold.',
    slots: [
      { key: 'stones', label: 'Stones', defaultRef: B('STONE') },
      { key: 'caps', label: 'Lintels', defaultRef: B('GRANITE') }
    ],
    build: btaStoneCircle
  },
  {
    id: 'bta_cairn_field',
    name: 'Cairn Field',
    group: 'BTA',
    desc: 'Scattered rock piles, moss taking some.',
    slots: [
      { key: 'rocks', label: 'Rocks', defaultRef: B('COBBLE_STONE') },
      { key: 'mossy', label: 'Mossy', defaultRef: B('MOSS_STONE') }
    ],
    build: btaCairnField
  },
  {
    id: 'bta_sand_pyramid',
    name: 'Sand Pyramid',
    group: 'BTA',
    desc: 'A stepped pyramid with a real chamber inside.',
    slots: [
      { key: 'stone', label: 'Stone', defaultRef: B('SANDSTONE') },
      { key: 'trim', label: 'Trim', defaultRef: B('BRICK_SANDSTONE') }
    ],
    build: btaSandPyramid
  },
  {
    id: 'bta_watch_ruin',
    name: 'Watch Ruin',
    group: 'BTA',
    desc: 'A tower stub with a broken wall trailing off.',
    slots: [
      { key: 'walls', label: 'Walls', defaultRef: B('COBBLE_STONE') },
      { key: 'mossy', label: 'Mossy', defaultRef: B('COBBLE_STONE_MOSSY') }
    ],
    build: btaWatchRuin
  },
  {
    id: 'bta_graveyard',
    name: 'Sunken Graveyard',
    group: 'BTA',
    desc: 'Rows of small markers inside a broken wall.',
    slots: [
      { key: 'markers', label: 'Markers', defaultRef: B('STONE_POLISHED') },
      { key: 'wall', label: 'Wall', defaultRef: B('COBBLE_STONE_MOSSY') },
      { key: 'ground', label: 'Ground', defaultRef: B('DIRT') }
    ],
    build: btaGraveyard
  },
  {
    id: 'bta_monolith',
    name: 'Obsidian Monolith',
    group: 'BTA',
    desc: 'A tall black slab standing in scree.',
    slots: [
      { key: 'monolith', label: 'Monolith', defaultRef: B('OBSIDIAN') },
      { key: 'base', label: 'Scree', defaultRef: B('GRAVEL') }
    ],
    build: btaMonolith
  },
  {
    id: 'art_cottage',
    name: 'Cottage',
    group: 'Artemis',
    desc: 'A snug plank house under a gable roof.',
    slots: [
      { key: 'frame', label: 'Frame', defaultRef: B('LOG_OAK') },
      { key: 'walls', label: 'Walls', defaultRef: B('PLANKS_OAK') },
      { key: 'roof', label: 'Roof', defaultRef: B('BRICK_CLAY') }
    ],
    build: artCottage
  },
  {
    id: 'art_watchtower',
    name: 'Watchtower',
    group: 'Artemis',
    desc: 'A tall keep with a crenellated crown.',
    slots: [
      { key: 'walls', label: 'Walls', defaultRef: B('COBBLE_STONE') },
      { key: 'crown', label: 'Crown', defaultRef: B('BRICK_STONE') },
      { key: 'ladder', label: 'Ladder', defaultRef: B('LADDER_OAK') }
    ],
    build: artWatchtower
  },
  {
    id: 'art_bridge',
    name: 'Arched Bridge',
    group: 'Artemis',
    desc: 'A stone arc you can actually walk across.',
    slots: [
      { key: 'deck', label: 'Deck', defaultRef: B('BRICK_STONE') },
      { key: 'piers', label: 'Piers', defaultRef: B('COBBLE_STONE') },
      { key: 'rails', label: 'Rails', defaultRef: B('FENCE_PLANKS_OAK') }
    ],
    build: artBridge
  },
  {
    id: 'art_fountain',
    name: 'Fountain Plaza',
    group: 'Artemis',
    desc: 'A paved square around a marble fountain.',
    slots: [
      { key: 'basin', label: 'Basin', defaultRef: B('BRICK_MARBLE') },
      { key: 'paving', label: 'Paving', defaultRef: B('STONE_POLISHED') },
      { key: 'water', label: 'Water', defaultRef: B('FLUID_WATER_STILL') }
    ],
    build: artFountain
  },
  {
    id: 'art_farmstead',
    name: 'Farmstead Plot',
    group: 'Artemis',
    desc: 'A fenced field with tilled rows and crops.',
    slots: [
      { key: 'fence', label: 'Fence', defaultRef: B('FENCE_PLANKS_OAK') },

      { key: 'crops', label: 'Crops', defaultRef: B('CROPS_WHEAT') },
      { key: 'soil', label: 'Soil', defaultRef: B('FARMLAND_DIRT') }
    ],
    build: artFarmstead
  },
  {
    id: 'art_campsite',
    name: 'Campsite',
    group: 'Artemis',
    desc: 'Tents pitched around a fire ring.',
    slots: [
      { key: 'tents', label: 'Tents', defaultRef: B('WOOL') },
      { key: 'ring', label: 'Fire ring', defaultRef: B('COBBLE_STONE') },
      { key: 'logs', label: 'Log seats', defaultRef: B('LOG_OAK') }
    ],
    build: artCampsite
  },
  {
    id: 'art_gazebo',
    name: 'Gazebo',
    group: 'Artemis',
    desc: 'An open octagon under a pyramid roof.',
    slots: [
      { key: 'posts', label: 'Posts', defaultRef: B('LOG_OAK') },
      { key: 'wood', label: 'Deck & roof', defaultRef: B('PLANKS_OAK') },
      { key: 'railing', label: 'Railing', defaultRef: B('FENCE_PLANKS_OAK') }
    ],
    build: artGazebo
  },
  {
    id: 'art_wizard_tower',
    name: 'Wizard Tower',
    group: 'Artemis',
    desc: 'A round shaft under a pointed hat.',
    slots: [
      { key: 'walls', label: 'Walls', defaultRef: B('BRICK_STONE') },
      { key: 'glow', label: 'Lit windows', defaultRef: B('GLOWSTONE') },
      { key: 'roof', label: 'Roof', defaultRef: B('WOOL') }
    ],
    build: artWizardTower
  },
  {
    id: 'art_crypt',
    name: 'Crypt',
    group: 'Artemis',
    desc: 'A low vault with sarcophagi inside.',
    slots: [
      { key: 'walls', label: 'Walls', defaultRef: B('BRICK_STONE') },
      { key: 'roof', label: 'Roof', defaultRef: B('SLAB_BRICK_STONE') },
      { key: 'tombs', label: 'Tombs', defaultRef: B('STONE_POLISHED') }
    ],
    build: artCrypt
  },
  {
    id: 'art_lighthouse',
    name: 'Lighthouse',
    group: 'Artemis',
    desc: 'A striped tower with a lamp on top.',
    slots: [
      { key: 'stripeA', label: 'Stripe A', defaultRef: B('BRICK_CLAY') },
      { key: 'stripeB', label: 'Stripe B', defaultRef: B('MARBLE') },
      { key: 'lantern', label: 'Lantern', defaultRef: B('GLOWSTONE') }
    ],
    build: artLighthouse
  },
  {
    id: 'art_harbor_dock',
    name: 'Harbor Dock',
    group: 'Artemis',
    desc: 'A plank pier on log piles, T head at the end.',
    slots: [
      { key: 'deck', label: 'Deck', defaultRef: B('PLANKS_OAK') },
      { key: 'piles', label: 'Piles', defaultRef: B('LOG_OAK') },
      { key: 'posts', label: 'Posts', defaultRef: B('FENCE_PLANKS_OAK') }
    ],
    build: artHarborDock
  },
  {
    id: 'art_arena',
    name: 'Small Arena',
    group: 'Artemis',
    desc: 'A sand pit ringed by terraced seating.',
    slots: [
      { key: 'walls', label: 'Ring wall', defaultRef: B('BRICK_STONE') },
      { key: 'seats', label: 'Seating', defaultRef: B('SLAB_COBBLE_STONE') },
      { key: 'sand', label: 'Sand', defaultRef: B('SAND') }
    ],
    build: artArena
  }
]

const SLOT_COLORS = ['#9aa1ad', '#a8865c', '#6f9a80']

export function structureSilhouette(
  cells: Record<string, string[]>,
  slots: StructureSlot[]
): string {
  const w = HALF * 2 + 1
  const h = MAX_Y + 1
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  for (let i = slots.length - 1; i >= 0; i--) {
    ctx.fillStyle = SLOT_COLORS[Math.min(i, SLOT_COLORS.length - 1)]
    for (const key of cells[slots[i].key] ?? []) {
      const [x, y] = key.split(',').map(Number)
      ctx.fillRect(x + HALF, MAX_Y - y, 1, 1)
    }
  }
  return canvas.toDataURL()
}
