import { HALF, MAX_Y, inBounds, keyOf } from './voxel'
import { rng } from '@shared/rng'

export interface TemplateCells {
  trunk: string[]
  leaves: string[]
}

export interface TreeTemplate {
  id: string
  name: string
  group: 'BTA' | 'Artemis'
  desc: string

  suggestedTrunk?: string
  build: (seed: number) => TemplateCells
}

class Build {
  private trunkSet = new Set<string>()
  private leafSet = new Set<string>()

  t(x: number, y: number, z: number): void {
    if (!inBounds(x, y, z)) return
    const k = keyOf(x, y, z)
    this.trunkSet.add(k)
    this.leafSet.delete(k)
  }

  l(x: number, y: number, z: number): void {
    if (!inBounds(x, y, z)) return
    const k = keyOf(x, y, z)
    if (!this.trunkSet.has(k)) this.leafSet.add(k)
  }

  pole(x: number, z: number, from: number, to: number): void {
    for (let y = from; y <= to; y++) this.t(x, y, z)
  }

  disc(cx: number, cy: number, cz: number, r: number, roll?: () => number): void {
    for (let dx = -r; dx <= r; dx++) {
      for (let dz = -r; dz <= r; dz++) {
        const corner = Math.abs(dx) === r && Math.abs(dz) === r
        if (corner && (r > 1 || !roll || roll() < 0.75)) continue
        this.l(cx + dx, cy, cz + dz)
      }
    }
  }

  ball(cx: number, cy: number, cz: number, r: number, roll?: () => number, wobble = 0.3): void {
    const r2 = r * r + r * 0.5
    for (let dx = -r; dx <= r; dx++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dz = -r; dz <= r; dz++) {
          const d = dx * dx + dy * dy + dz * dz
          if (d > r2) continue

          if (roll && d > (r - 1) * (r - 1) && roll() < wobble) continue
          this.l(cx + dx, cy + dy, cz + dz)
        }
      }
    }
  }

  dome(cx: number, cy: number, cz: number, rx: number, ry: number, roll?: () => number): void {
    for (let dx = -rx; dx <= rx; dx++) {
      for (let dy = -ry; dy <= ry; dy++) {
        for (let dz = -rx; dz <= rx; dz++) {
          const d = (dx * dx + dz * dz) / (rx * rx + 0.5) + (dy * dy) / (ry * ry + 0.5)
          if (d > 1) continue
          if (roll && d > 0.66 && roll() < 0.3) continue
          this.l(cx + dx, cy + dy, cz + dz)
        }
      }
    }
  }

  done(): TemplateCells {
    return { trunk: [...this.trunkSet], leaves: [...this.leafSet] }
  }
}

const clampY = (y: number): number => Math.min(MAX_Y - 1, y)

function btaOak(seed: number): TemplateCells {
  const r = rng(seed)
  const b = new Build()
  const h = 4 + Math.floor(r() * 3)
  b.pole(0, 0, 0, h - 1)
  for (let y = h - 2; y <= h + 1; y++) {
    b.disc(0, y, 0, y > h - 1 ? 1 : 2, r)
  }
  return b.done()
}

function btaBigOak(seed: number): TemplateCells {
  const r = rng(seed)
  const b = new Build()
  const h = clampY(8 + Math.floor(r() * 3))
  b.pole(0, 0, 0, h - 1)
  b.ball(0, h, 0, 2, r)

  const limbs = 3 + Math.floor(r() * 2)
  for (let i = 0; i < limbs; i++) {
    const ang = (i / limbs) * Math.PI * 2 + r() * 0.8
    const dx = Math.round(Math.cos(ang))
    const dz = Math.round(Math.sin(ang))
    const start = 3 + Math.floor(r() * (h - 5))
    const len = 2 + Math.floor(r() * 2)
    let x = 0
    let z = 0
    for (let s = 1; s <= len; s++) {
      x += dx
      z += dz
      b.t(x, start + s, z)
    }
    b.ball(x, start + len + 1, z, 2, r)
  }
  return b.done()
}

function btaPine(seed: number): TemplateCells {
  const r = rng(seed)
  const b = new Build()
  const h = clampY(8 + Math.floor(r() * 4))
  b.pole(0, 0, 0, h - 1)
  b.l(0, h, 0)
  b.l(0, h + 1, 0)

  for (let y = h - 1; y >= 3; y--) {
    const fromTop = h - y
    const radius = Math.min(3, Math.ceil(fromTop / 2))
    b.disc(0, y, 0, radius, r)
  }
  return b.done()
}

function btaBirch(seed: number): TemplateCells {
  const r = rng(seed)
  const b = new Build()
  const h = 6 + Math.floor(r() * 2)
  b.pole(0, 0, 0, h - 1)
  b.disc(0, h - 2, 0, 2, r)
  b.disc(0, h - 1, 0, 2, r)
  b.disc(0, h, 0, 1)
  b.l(0, h + 1, 0)
  return b.done()
}

function btaCherry(seed: number): TemplateCells {
  const r = rng(seed)
  const b = new Build()
  const h = 4 + Math.floor(r() * 2)
  b.pole(0, 0, 0, h - 1)

  b.disc(0, h - 1, 0, 3, r)
  b.disc(0, h, 0, 3, r)
  b.disc(0, h + 1, 0, 2, r)
  return b.done()
}

function btaEucalyptus(seed: number): TemplateCells {
  const r = rng(seed)
  const b = new Build()
  const h = clampY(10 + Math.floor(r() * 3))
  b.pole(0, 0, 0, h - 1)

  b.ball(0, h, 0, 2, r)
  b.disc(0, h - 2, 0, 1)
  const tuftY = h - 3 - Math.floor(r() * 2)
  b.l(1, tuftY, 0)
  b.l(-1, tuftY + 1, 1)
  return b.done()
}

function btaPalm(seed: number): TemplateCells {
  const r = rng(seed)
  const b = new Build()
  const h = 7 + Math.floor(r() * 2)

  const leanX = r() < 0.5 ? 1 : -1
  let x = 0
  for (let y = 0; y < h; y++) {
    if (y > 2 && y % 3 === 0) x += leanX
    b.t(x, y, 0)
  }
  const top = h - 1
  b.l(x, top + 1, 0)

  const cardinals = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1]
  ]
  for (const [dx, dz] of cardinals) {
    const rise = [1, 1, 0, -1]
    for (let s = 1; s <= 4; s++) b.l(x + dx * s, top + rise[s - 1], 0 + dz * s)
  }
  for (const [dx, dz] of [
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1]
  ]) {
    b.l(x + dx, top + 1, dz)
    b.l(x + dx * 2, top, dz * 2)
  }
  return b.done()
}

function btaShrub(seed: number): TemplateCells {
  const r = rng(seed)
  const b = new Build()
  b.t(0, 0, 0)
  b.disc(0, 0, 0, 2, r)
  b.disc(0, 1, 0, 1, r)
  return b.done()
}

function btaThorn(seed: number): TemplateCells {
  const r = rng(seed)
  const b = new Build()
  const h = 4 + Math.floor(r() * 2)
  b.pole(0, 0, 0, h - 1)

  const limbs = 2 + Math.floor(r() * 2)
  for (let i = 0; i < limbs; i++) {
    const dx = r() < 0.5 ? 1 : -1
    const dz = r() < 0.5 ? 1 : -1
    const y = 2 + Math.floor(r() * (h - 2))
    b.t(dx, y, 0)
    b.t(dx * 2, y + 1, dz)
    b.l(dx * 2, y + 2, dz)
    b.l(dx * 3, y + 1, dz)
  }
  b.l(0, h, 0)
  b.l(1, h, 0)
  b.l(0, h, -1)
  return b.done()
}

function artSavannah(seed: number): TemplateCells {
  const r = rng(seed)
  const b = new Build()
  const h = 5 + Math.floor(r() * 2)
  b.pole(0, 0, 0, h - 1)

  const umbrella = (tipX: number, tipY: number, tipZ: number): void => {
    b.disc(tipX, tipY, tipZ, 3, r)
    b.disc(tipX, tipY + 1, tipZ, 2, r)
    b.t(tipX, tipY, tipZ)
  }
  b.t(0, h, 0)
  umbrella(0, h + 1, 0)
  const arms = 1 + Math.floor(r() * 2)
  for (let i = 0; i < arms; i++) {
    const sx = r() < 0.5 ? 1 : -1
    const sz = r() < 0.5 ? 1 : -1
    b.t(sx, h - 1, 0)
    b.t(sx * 2, h, sz)
    b.t(sx * 3, h + 1, sz)
    umbrella(sx * 3, h + 2, sz)
  }
  return b.done()
}

function artWillow(seed: number): TemplateCells {
  const r = rng(seed)
  const b = new Build()
  const h = 6 + Math.floor(r() * 2)
  b.pole(0, 0, 0, h - 1)
  b.dome(0, h, 0, 4, 2, r)

  for (let dx = -4; dx <= 4; dx++) {
    for (let dz = -4; dz <= 4; dz++) {
      const onRim = Math.abs(dx) + Math.abs(dz) >= 4 && Math.abs(dx) + Math.abs(dz) <= 5
      if (!onRim || r() < 0.35) continue
      const drop = 2 + Math.floor(r() * 3)
      for (let d = 0; d < drop; d++) b.l(dx, h - 1 - d, dz)
    }
  }
  return b.done()
}

function artDead(seed: number): TemplateCells {
  const r = rng(seed)
  const b = new Build()
  const h = 6 + Math.floor(r() * 3)
  b.pole(0, 0, 0, h - 1)

  const limbs = 3 + Math.floor(r() * 2)
  for (let i = 0; i < limbs; i++) {
    const ang = (i / limbs) * Math.PI * 2 + r()
    const dx = Math.round(Math.cos(ang))
    const dz = Math.round(Math.sin(ang))
    const y = 2 + Math.floor(r() * (h - 3))
    const len = 2 + Math.floor(r() * 2)
    for (let s = 1; s <= len; s++) b.t(dx * s, y + s, dz * s)
  }
  return b.done()
}

function artRedwood(seed: number): TemplateCells {
  const r = rng(seed)
  const b = new Build()
  const h = clampY(15 + Math.floor(r() * 5))
  b.pole(0, 0, 0, h - 1)
  b.l(0, h, 0)
  b.l(0, h + 1, 0)

  const skirt = Math.floor(h / 3)
  for (let y = h - 1; y >= skirt; y--) {
    const fromTop = h - y
    const radius = Math.min(4, 1 + Math.floor(fromTop / 3))
    b.disc(0, y, 0, radius, r)
  }
  return b.done()
}

function artMighty(seed: number): TemplateCells {
  const r = rng(seed)
  const b = new Build()
  const h = clampY(10 + Math.floor(r() * 3))

  for (const [tx, tz] of [
    [0, 0],
    [1, 0],
    [0, 1],
    [1, 1]
  ]) {
    b.pole(tx, tz, 0, h - 1)
  }

  for (let dx = -5; dx <= 6; dx++) {
    for (let dy = -2; dy <= 3; dy++) {
      for (let dz = -5; dz <= 6; dz++) {
        const cx = dx - 0.5
        const cz = dz - 0.5
        const d = (cx * cx + cz * cz) / 26 + (dy * dy) / 7
        if (d > 1) continue
        if (d > 0.7 && r() < 0.3) continue
        b.l(dx, h + dy, dz)
      }
    }
  }
  return b.done()
}

function artStilt(seed: number): TemplateCells {
  const r = rng(seed)
  const b = new Build()
  const h = 7 + Math.floor(r() * 2)

  for (const [dx, dz] of [
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1]
  ]) {
    b.t(dx * 2, 0, dz * 2)
    b.t(dx, 1, dz)
  }
  b.pole(0, 0, 2, h - 1)
  b.dome(0, h, 0, 3, 2, r)
  return b.done()
}

function artSpiral(seed: number): TemplateCells {
  const r = rng(seed)
  const b = new Build()
  const h = clampY(11 + Math.floor(r() * 3))

  const ring = [
    [1, 0],
    [1, 1],
    [0, 1],
    [-1, 1],
    [-1, 0],
    [-1, -1],
    [0, -1],
    [1, -1]
  ]
  b.t(0, 0, 0)
  for (let y = 0; y < h; y++) {
    const [dx, dz] = ring[y % ring.length]
    b.t(dx, y, dz)
    if (y > 2 && y % 3 === 0) b.l(dx * 2, y, dz * 2)
  }
  b.ball(0, h, 0, 2, r)
  return b.done()
}

function artSpire(seed: number): TemplateCells {
  const r = rng(seed)
  const b = new Build()
  const h = clampY(9 + Math.floor(r() * 3))

  for (let y = 0; y < h; y++) {
    const radius = y < 2 ? 1 : 0
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dz = -radius; dz <= radius; dz++) {
        if (Math.abs(dx) === radius && Math.abs(dz) === radius && radius > 0 && r() < 0.5) continue
        b.t(dx, y, dz)
      }
    }
  }
  b.t(1, 2, 0)
  b.t(-1, 3, -1)
  return b.done()
}

function artMushroom(seed: number): TemplateCells {
  const r = rng(seed)
  const b = new Build()
  const h = 4 + Math.floor(r() * 3)
  b.pole(0, 0, 0, h - 1)

  b.disc(0, h, 0, 3, r)
  b.disc(0, h + 1, 0, 2)
  for (let dx = -3; dx <= 3; dx++) {
    for (let dz = -3; dz <= 3; dz++) {
      const edge = Math.max(Math.abs(dx), Math.abs(dz)) === 3
      if (edge && !(Math.abs(dx) === 3 && Math.abs(dz) === 3)) b.l(dx, h - 1, dz)
    }
  }
  return b.done()
}

function artYucca(seed: number): TemplateCells {
  const r = rng(seed)
  const b = new Build()

  b.pole(0, 0, 0, 1)
  b.t(1, 0, 0)
  b.t(-1, 0, 0)
  b.t(0, 0, 1)
  b.t(0, 0, -1)
  const spikes = 8
  for (let i = 0; i < spikes; i++) {
    const ang = (i / spikes) * Math.PI * 2 + r() * 0.4
    const dx = Math.cos(ang)
    const dz = Math.sin(ang)
    const len = 3 + Math.floor(r() * 2)
    for (let s = 1; s <= len; s++) {
      b.l(Math.round(dx * s), 1 + Math.floor(s * 0.8), Math.round(dz * s))
    }
  }
  for (let y = 2; y <= 5; y++) b.l(0, y, 0)
  return b.done()
}

function artSaguaro(seed: number): TemplateCells {
  const r = rng(seed)
  const b = new Build()
  const h = 6 + Math.floor(r() * 3)
  b.pole(0, 0, 0, h - 1)

  const arms = 2 + Math.floor(r() * 2)
  const dirs: [number, number][] = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1]
  ]
  const start = 2 + Math.floor(r() * 2)
  for (let i = 0; i < arms; i++) {
    const [dx, dz] = dirs[(i + Math.floor(r() * 2)) % dirs.length]
    const y = start + i
    if (y >= h - 2) break
    b.t(dx, y, dz)
    const rise = 2 + Math.floor(r() * 2)
    for (let s = 1; s <= rise && y + s < h; s++) b.t(dx * 2, y + s, dz * 2)
    if (r() < 0.4) b.l(dx * 2, Math.min(h - 1, y + rise + 1), dz * 2)
  }
  b.l(0, h, 0)
  return b.done()
}

function artBarrel(seed: number): TemplateCells {
  const r = rng(seed)
  const b = new Build()

  for (let dx = -1; dx <= 1; dx++) {
    for (let dz = -1; dz <= 1; dz++) {
      b.t(dx, 0, dz)
      if (Math.abs(dx) + Math.abs(dz) <= 1) b.t(dx, 1, dz)
    }
  }
  b.t(0, 2, 0)

  for (const [dx, dz] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1]
  ]) {
    if (r() < 0.8) b.l(dx, 2, dz)
  }
  b.l(0, 3, 0)
  return b.done()
}

function artPricklyPear(seed: number): TemplateCells {
  const r = rng(seed)
  const b = new Build()

  const pad = (x: number, y: number, z: number, alongX: boolean): void => {
    for (let i = 0; i < 2; i++) {
      for (let j = 0; j < 2; j++) {
        b.t(x + (alongX ? i : 0), y + j, z + (alongX ? 0 : i))
      }
    }

    if (r() < 0.4) b.l(x + (alongX ? Math.floor(r() * 2) : 0), y + 2, z + (alongX ? 0 : Math.floor(r() * 2)))
  }
  pad(0, 0, 0, true)
  const pads = 2 + Math.floor(r() * 3)
  let x = 0
  let y = 1
  let z = 0
  for (let i = 0; i < pads; i++) {
    const alongX = i % 2 === 0
    x += alongX ? (r() < 0.5 ? 1 : -1) : 0
    z += alongX ? 0 : r() < 0.5 ? 1 : -1
    y += 1
    pad(x, y, z, !alongX)
  }
  return b.done()
}

type Vec3 = [number, number, number]

function crossection(b: Build, c: Vec3, radius: number, axis: 0 | 1 | 2): void {
  const rad = Math.floor(radius + 0.618)
  if (rad <= 0) return
  const sec1 = (axis + 2) % 3
  const sec2 = (axis + 1) % 3
  for (let off1 = -rad; off1 <= rad; off1++) {
    for (let off2 = -rad; off2 <= rad; off2++) {
      const d = Math.hypot(Math.abs(off1) + 0.5, Math.abs(off2) + 0.5)
      if (d > radius) continue
      const p: Vec3 = [0, 0, 0]
      p[axis] = c[axis]
      p[sec1] = c[sec1] + off1
      p[sec2] = c[sec2] + off2
      b.t(p[0], p[1], p[2])
    }
  }
}

function taperedLimb(b: Build, start: Vec3, end: Vec3, startsize: number, endsize: number): void {
  const delta = [0, 1, 2].map((i) => Math.trunc(end[i] - start[i]))
  const maxdist = delta.reduce((a, v) => (Math.abs(v) > Math.abs(a) ? v : a), 0)
  if (maxdist === 0) return
  const axis = delta.indexOf(maxdist) as 0 | 1 | 2
  const sec1 = (axis + 2) % 3
  const sec2 = (axis + 1) % 3
  const sign = maxdist > 0 ? 1 : -1
  const fac1 = delta[sec1] / delta[axis]
  const fac2 = delta[sec2] / delta[axis]
  const primdist = Math.abs(delta[axis])
  for (let off = 0; off !== delta[axis] + sign; off += sign) {
    const c: Vec3 = [0, 0, 0]
    c[axis] = start[axis] + off
    c[sec1] = Math.trunc(start[sec1] + off * fac1)
    c[sec2] = Math.trunc(start[sec2] + off * fac2)
    const radius = endsize + ((startsize - endsize) * Math.abs(delta[axis] - off)) / primdist
    crossection(b, c, radius, axis)
  }
}

interface SpoonerShape {

  foliageShape: number[]
  branchSlope: number
  trunkRadiusMul: number

  trunkHeightMul: number

  envelope: (rel: number, height: number, trunkheight: number, r: () => number) => number | null
  clustersPerLevel: number
}

function twigs(rel: number, height: number, trunkheight: number, r: () => number): number | null {
  if (r() < 100 / (height * height) && rel < trunkheight) return height * 0.12
  return null
}

const SPOONER_SHAPES: Record<'round' | 'cone' | 'canopy', SpoonerShape> = {
  round: {
    foliageShape: [2, 3, 3, 2.5, 1.6],
    branchSlope: 0.382,
    trunkRadiusMul: 0.8,
    trunkHeightMul: 0.7,
    clustersPerLevel: 1,
    envelope: (rel, height, trunkheight, r) => {
      const t = twigs(rel, height, trunkheight, r)
      if (t !== null) return t
      if (rel < height * (0.282 + 0.1 * Math.sqrt(r()))) return null
      const radius = height / 2
      const adj = radius - rel
      const dist = Math.abs(adj) >= radius ? 0 : Math.sqrt(radius * radius - adj * adj)
      return dist * 0.618
    }
  },
  cone: {
    foliageShape: [3, 2.6, 2, 1],
    branchSlope: 0.15,
    trunkRadiusMul: 0.5,
    trunkHeightMul: 1,
    clustersPerLevel: 1,
    envelope: (rel, height, trunkheight, r) => {
      const t = twigs(rel, height, trunkheight, r)
      if (t !== null) return t
      if (rel < height * (0.25 + 0.05 * Math.sqrt(r()))) return null
      return Math.max(0, (height - rel) * 0.382)
    }
  },

  canopy: {
    foliageShape: [3.4, 2.6],
    branchSlope: 1.0,
    trunkRadiusMul: 0.382,
    trunkHeightMul: 0.9,
    clustersPerLevel: 2,
    envelope: (rel, height, _trunkheight, r) => {
      if (rel < height * 0.8) return null
      const width = height * 0.382
      const topdist = (height - rel) / (height * 0.2)
      return width * (0.618 + topdist) * (0.618 + r()) * 0.382
    }
  }
}

function spoonerTree(kind: 'round' | 'cone' | 'canopy', baseHeight: number, heightVar: number) {
  return (seed: number): TemplateCells => {
    const r = rng(seed)
    const s = SPOONER_SHAPES[kind]
    const b = new Build()
    const height = clampY(baseHeight + Math.floor(r() * heightVar))
    const trunkheight = s.trunkHeightMul * height
    const trunkradius = Math.max(1, 0.618 * Math.sqrt(height)) * s.trunkRadiusMul
    const topy = Math.trunc(trunkheight + 0.5)

    const clusters: Vec3[] = []
    for (let y = height; y > 0; y--) {
      for (let i = 0; i < s.clustersPerLevel; i++) {
        const fac = s.envelope(y, height, trunkheight, r)
        if (fac === null) continue
        const cr = (Math.sqrt(r()) + 0.328) * fac
        const theta = r() * 2 * Math.PI
        clusters.push([Math.trunc(cr * Math.sin(theta)), y, Math.trunc(cr * Math.cos(theta))])
      }
    }

    for (const [cx, cy, cz] of clusters) {
      let y = cy
      for (const radius of s.foliageShape) {
        const rad = Math.floor(radius + 0.618)
        for (let dx = -rad; dx <= rad; dx++) {
          for (let dz = -rad; dz <= rad; dz++) {
            if (Math.hypot(Math.abs(dx) + 0.5, Math.abs(dz) + 0.5) > radius) continue
            b.l(cx + dx, y, cz + dz)
          }
        }
        y++
      }
    }

    const esf = trunkheight / height
    const endrad = Math.max(1, trunkradius * (1 - esf))
    const midrad = Math.max(endrad, trunkradius * (1 - esf * 0.5))
    const midy = Math.trunc(trunkheight * 0.382)
    taperedLimb(b, [0, 0, 0], [0, midy, 0], trunkradius, midrad)
    taperedLimb(b, [0, midy, 0], [0, topy, 0], midrad, endrad)

    for (const [cx, cy, cz] of clusters) {
      const dist = Math.hypot(cx, cz)
      const ydist = cy

      const value = (220 * height) / Math.pow(ydist + dist, 3)
      if (value < r()) continue
      const slope = s.branchSlope + (0.5 - r()) * 0.16
      let branchy: number
      let basesize: number
      if (cy - dist * slope > topy) {
        if (r() < 1 / height) continue
        branchy = topy
        basesize = endrad
      } else {
        branchy = cy - dist * slope
        basesize = endrad + ((trunkradius - endrad) * (topy - branchy)) / trunkheight
      }
      const startsize = Math.max(1, basesize * (1 + r()) * 0.618 * Math.pow(dist / height, 0.618))
      const rndr = Math.sqrt(r()) * basesize * 0.618
      const rndang = r() * 2 * Math.PI
      const start: Vec3 = [
        Math.trunc(rndr * Math.sin(rndang) + 0.5),
        Math.max(0, Math.trunc(branchy)),
        Math.trunc(rndr * Math.cos(rndang) + 0.5)
      ]
      taperedLimb(b, start, [cx, cy, cz], startsize, 1)
    }

    for (const [cx, cy, cz] of clusters) b.t(cx, cy, cz)

    return b.done()
  }
}

export const TREE_TEMPLATES: TreeTemplate[] = [
  { id: 'bta_oak', name: 'Oak', group: 'BTA', desc: 'The classic blob on a post.', build: btaOak },
  { id: 'bta_big_oak', name: 'Big Oak', group: 'BTA', desc: 'Limbs stepping out, a ball on each.', build: btaBigOak },
  { id: 'bta_pine', name: 'Pine', group: 'BTA', desc: 'A cone down from the tip.', build: btaPine },
  { id: 'bta_birch', name: 'Birch', group: 'BTA', desc: 'Tall and slim, a small crown.', build: btaBirch },
  { id: 'bta_cherry', name: 'Cherry', group: 'BTA', desc: 'A wide flat parasol.', build: btaCherry },
  { id: 'bta_eucalyptus', name: 'Eucalyptus', group: 'BTA', desc: 'Bare most of the way, foliage riding high.', build: btaEucalyptus },
  { id: 'bta_palm', name: 'Palm', group: 'BTA', desc: 'A leaning trunk under drooping fronds.', build: btaPalm },
  { id: 'bta_shrub', name: 'Shrub', group: 'BTA', desc: 'One log lost in a bush.', build: btaShrub },
  { id: 'bta_thorn', name: 'Thorn', group: 'BTA', desc: 'Gnarled, mean, barely leafed.', build: btaThorn },
  { id: 'art_savannah', name: 'Savannah', group: 'Artemis', desc: 'Scattered flat umbrellas on crooked limbs.', build: artSavannah },
  { id: 'art_willow', name: 'Willow', group: 'Artemis', desc: 'A dome with curtains trailing off the rim.', build: artWillow },
  { id: 'art_dead', name: 'Dead Tree', group: 'Artemis', desc: 'Bare crooked limbs, no leaves at all.', build: artDead },
  { id: 'art_redwood', name: 'Redwood', group: 'Artemis', desc: 'A giant cone with a bare skirt.', build: artRedwood },
  { id: 'art_mighty', name: 'Mighty Tree', group: 'Artemis', desc: 'A 2×2 trunk under an enormous crown.', build: artMighty },
  { id: 'art_spooner_round', name: 'Spooner Round', group: 'Artemis', desc: "Paul Spooner's Forester: a great deciduous crown, every cluster on a real branch.", build: spoonerTree('round', 14, 4) },
  { id: 'art_spooner_conifer', name: 'Spooner Conifer', group: 'Artemis', desc: "Forester's conifer: a towering cone with true limbs.", build: spoonerTree('cone', 18, 5) },
  { id: 'art_spooner_canopy', name: 'Spooner Canopy', group: 'Artemis', desc: "Forester's rainforest tree: a bare pole, everything at the top.", build: spoonerTree('canopy', 15, 4) },
  { id: 'art_stilt', name: 'Stilt Tree', group: 'Artemis', desc: 'Swamp roots holding the trunk off the ground.', build: artStilt },
  { id: 'art_spiral', name: 'Spiral', group: 'Artemis', desc: 'A corkscrew trunk with a crown on top.', build: artSpiral },
  { id: 'art_spire', name: 'Spire', group: 'Artemis', desc: 'A tapering monolith, trunk block only.', build: artSpire },
  { id: 'art_mushroom', name: 'Mushroom', group: 'Artemis', desc: 'A stem under a rimmed cap.', build: artMushroom },
  { id: 'art_saguaro', name: 'Saguaro', group: 'Artemis', desc: 'The classic armed cactus. Leaves are its blossoms.', suggestedTrunk: 'block:CACTUS', build: artSaguaro },
  { id: 'art_barrel', name: 'Barrel Cactus', group: 'Artemis', desc: 'A fat ribbed drum with a blossom crown.', suggestedTrunk: 'block:CACTUS', build: artBarrel },
  { id: 'art_prickly_pear', name: 'Prickly Pear', group: 'Artemis', desc: 'Sprawling pads, fruit on top. Leaves are the fruit.', suggestedTrunk: 'block:CACTUS', build: artPricklyPear },
  { id: 'art_yucca', name: 'Yucca', group: 'Artemis', desc: 'A squat trunk in a burst of spikes.', build: artYucca }
]

export function templateSilhouette(cells: TemplateCells): string {
  const w = HALF * 2 + 1
  const h = MAX_Y + 1
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  const plot = (keys: string[], color: string): void => {
    ctx.fillStyle = color
    for (const key of keys) {
      const [x, y] = key.split(',').map(Number)
      ctx.fillRect(x + HALF, MAX_Y - y, 1, 1)
    }
  }

  plot(cells.leaves, '#559a46')
  plot(cells.trunk, '#8a6a48')
  return canvas.toDataURL()
}
