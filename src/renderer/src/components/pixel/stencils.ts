import { mix, shade, type Grid } from './presets'
import { rng, type Rand } from '@shared/rng'

const SIZE = 16
const CELLS = SIZE * SIZE

export type ParamValue = number | boolean | string

export interface StencilParam {
  key: string
  label: string
  hint?: string
  kind: 'slider' | 'switch' | 'choice'
  min?: number
  max?: number
  step?: number
  options?: { value: string; label: string }[]
  default: ParamValue
}

export interface StencilInput {

  below: Grid

  color: string
  seed: number

  angle: number
  params: Record<string, ParamValue>
}

export interface StencilResult {

  grid?: Grid

  cut?: number[]
}

export interface Stencil {
  id: string
  label: string
  group: string

  blurb: string

  mode: 'layer' | 'cut'
  usesColor: boolean

  usesSeed?: boolean

  suggestedColor?: string
  params: StencilParam[]
  run: (input: StencilInput) => StencilResult
}

export { newSeed } from '@shared/rng'

const int = (r: Rand, lo: number, hi: number): number => lo + Math.floor(r() * (hi - lo + 1))

const blank = (): Grid => Array(CELLS).fill('')
const at = (x: number, y: number): number => y * SIZE + x
const inside = (x: number, y: number): boolean => x >= 0 && x < SIZE && y >= 0 && y < SIZE
const gx = (i: number): number => i % SIZE
const gy = (i: number): number => (i / SIZE) | 0

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v))

function luma(hex: string): number {
  const n = parseInt(hex.slice(1), 16)
  return 0.3 * ((n >> 16) & 255) + 0.59 * ((n >> 8) & 255) + 0.11 * (n & 255)
}

const num = (p: Record<string, ParamValue>, k: string, fallback: number): number =>
  typeof p[k] === 'number' ? (p[k] as number) : fallback
const bool = (p: Record<string, ParamValue>, k: string, fallback: boolean): boolean =>
  typeof p[k] === 'boolean' ? (p[k] as boolean) : fallback
const str = (p: Record<string, ParamValue>, k: string, fallback: string): string =>
  typeof p[k] === 'string' ? (p[k] as string) : fallback

const lightVec = (angle: number): [number, number] => [Math.cos(angle), Math.sin(angle)]

export function toneRamp(accent: string, contrast = 100): string[] {
  const n = parseInt(accent.slice(1), 16)
  const rgb = [(n >> 16) & 255, (n >> 8) & 255, n & 255]
  const k = contrast / 100
  const peak = Math.max(...rgb)

  if (peak < 16) return [0, 7, 16, 27].map((d) => scaleChannels(rgb, 1, d * k))
  const lo = Math.max(1, Math.min(...rgb))
  if (lo * 1.22 >= 255) {

    return [0.62, 0.75, 0.87, 1].map((f) => scaleChannels(rgb, 1 + (f - 1) * k))
  }

  const top = clamp((255 / lo) * 0.9, 1.35, 2.4)
  return [0, 0.191, 0.478, 1].map((t) => scaleChannels(rgb, 1 + (top - 1) * t * k))
}

function scaleChannels(rgb: number[], f: number, lift = 0): string {
  const raw = rgb.map((v) => v * f + lift)
  const over = Math.max(0, Math.max(...raw) - 255)
  const out = raw.map((v) => clamp(Math.round(v + over * 0.3), 0, 255))
  return `#${((out[0] << 16) | (out[1] << 8) | out[2]).toString(16).padStart(6, '0')}`
}

function toneRanks(n: number): number[] {
  if (n <= 1) return [1]
  if (n === 2) return [2, 0]
  if (n === 3) return [2, 1, 0]
  const hi = Math.max(1, Math.round(n * 0.15))
  const li = Math.max(1, Math.round(n * 0.32))
  const mid = Math.max(1, Math.round(n * 0.24))
  return Array.from({ length: n }, (_, k) =>
    k < hi ? 3 : k < hi + li ? 2 : k < hi + li + mid ? 1 : 0
  )
}

function shadeCluster(out: Grid, cells: number[], tones: string[], dx: number, dy: number): void {
  if (!cells.length) return
  let cx = 0
  let cy = 0
  for (const i of cells) {
    cx += gx(i)
    cy += gy(i)
  }
  cx /= cells.length
  cy /= cells.length
  const lit = (i: number): number => (gx(i) - cx) * dx + (gy(i) - cy) * dy
  const order = [...cells].sort((a, b) => lit(b) - lit(a))
  const ranks = toneRanks(order.length)
  order.forEach((i, k) => {
    out[i] = tones[ranks[k]]
  })
}

function grow(r: Rand, start: number, size: number, wide = 0.62, taken?: Set<number>): number[] {
  const cells = [start]
  const has = new Set([start])
  let guard = 0
  while (cells.length < size && guard++ < size * 24) {
    const from = cells[Math.floor(r() * cells.length)]
    const horizontal = r() < wide
    const step = r() < 0.5 ? -1 : 1
    const nx = gx(from) + (horizontal ? step : 0)
    const ny = gy(from) + (horizontal ? 0 : step)
    if (!inside(nx, ny)) continue
    const i = at(nx, ny)
    if (has.has(i) || taken?.has(i)) continue
    has.add(i)
    cells.push(i)
  }
  return cells
}

function blockHalo(blocked: Set<number>, cells: number[]): void {
  for (const c of cells) {
    blocked.add(c)
    for (const [ox, oy] of RIM) {
      const x = gx(c) + ox
      const y = gy(c) + oy
      if (inside(x, y)) blocked.add(at(x, y))
    }
  }
}

function oreShape(r: Rand, size: number): [number, number][] {
  const cells: [number, number][] = []

  const base = clamp(Math.round(size * (0.55 + r() * 0.35)), Math.min(size, 2), 6)
  for (let k = 0; k < base; k++) cells.push([k, 1])
  let remaining = size - base

  for (const row of r() < 0.5 ? [0, 2] : [2, 0]) {
    if (remaining <= 0) break
    const w = Math.max(1, Math.min(remaining, 1 + Math.floor(r() * Math.min(base, 3))))
    const x = -1 + Math.floor(r() * (base - w + 3))
    for (let k = 0; k < w; k++) cells.push([x + k, row])
    remaining -= w
  }
  const minX = Math.min(...cells.map((c) => c[0]))
  const minY = Math.min(...cells.map((c) => c[1]))
  return cells.map(([cx, cy]) => [cx - minX, cy - minY])
}

function oreSize(r: Rand, max: number): number {
  const t = r()
  if (t < 0.18) return 1
  if (t < 0.63) return Math.min(2, max)
  return Math.min(max, 4 + Math.floor(((t - 0.63) / 0.37) * Math.max(1, max - 3)))
}

function disc(cx: number, cy: number, radius: number): number[] {
  const cells: number[] = []
  const rr = radius * radius
  for (let y = Math.floor(cy - radius); y <= Math.ceil(cy + radius); y++) {
    for (let x = Math.floor(cx - radius); x <= Math.ceil(cx + radius); x++) {
      if (!inside(x, y)) continue
      if ((x - cx) * (x - cx) + (y - cy) * (y - cy) <= rr) cells.push(at(x, y))
    }
  }
  return cells
}

const RIM: [number, number][] = [
  [-1, -1],
  [0, -1],
  [1, -1],
  [-1, 0],
  [1, 0],
  [-1, 1],
  [0, 1],
  [1, 1]
]

function rimShade(
  out: Grid,
  below: Grid,
  isBlob: (i: number) => boolean,
  dx: number,
  dy: number,
  amount: number
): void {
  if (amount <= 0) return
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const i = at(x, y)
      if (out[i] || isBlob(i) || !below[i]) continue
      let score = 0
      let orthogonal = false
      for (const [ox, oy] of RIM) {
        const nx = x + ox
        const ny = y + oy
        if (!inside(nx, ny) || !isBlob(at(nx, ny))) continue
        if (ox === 0 || oy === 0) orthogonal = true
        score += (ox * dx + oy * dy) / Math.hypot(ox, oy)
      }

      if (!orthogonal) continue
      out[i] = shade(below[i], score > 0 ? 1 + 0.16 * amount : 1 - 0.14 * amount)
    }
  }
}

const ORE: Stencil = {
  id: 'ore',
  label: 'Ore blobs',
  group: 'Ore and rock',
  blurb:
    'Scatters ore the way BTA does: short horizontal runs rather than round lumps, mostly pairs with a few larger flecks, four tones running across each one, and the rock around them lifted or dropped depending on which side the light is on.',
  mode: 'layer',
  usesColor: true,
  suggestedColor: '#5decf5',
  params: [
    { key: 'blobs', label: 'Clusters', kind: 'slider', min: 3, max: 18, default: 11 },
    {
      key: 'size',
      label: 'Biggest cluster',
      hint: 'Pairs dominate whatever this is set to, the way vanilla does it',
      kind: 'slider',
      min: 1,
      max: 10,
      default: 8
    },
    {
      key: 'contrast',
      label: 'Tone spread',
      hint: 'How far the tones climb toward white',
      kind: 'slider',
      min: 20,
      max: 140,
      default: 100
    },
    {
      key: 'rock',
      label: 'Shade the rock',
      hint: 'Repaints the stone touching each cluster, like vanilla',
      kind: 'switch',
      default: true
    }
  ],
  run: ({ below, color, seed, angle, params }) => {
    const r = rng(seed)
    const [dx, dy] = lightVec(angle)
    const tones = toneRamp(color, num(params, 'contrast', 100))
    const out = blank()
    const ore = new Set<number>()
    const blocked = new Set<number>()
    const maxSize = num(params, 'size', 8)

    const sizes = Array.from({ length: num(params, 'blobs', 11) }, () =>
      oreSize(r, maxSize)
    ).sort((a, b) => b - a)

    for (const want of sizes) {
      let placed: number[] | null = null

      for (let t = 0; t < 20 && !placed; t++) {
        const shape = oreShape(r, want)
        const w = Math.max(...shape.map((c) => c[0])) + 1
        const h = Math.max(...shape.map((c) => c[1])) + 1
        if (w > SIZE - 2 || h > SIZE - 2) continue

        const x0 = int(r, 1, SIZE - 1 - w)
        const y0 = int(r, 1, SIZE - 1 - h)
        const cells = shape.map(([cx, cy]) => at(x0 + cx, y0 + cy))

        if (cells.some((i) => blocked.has(i))) continue
        placed = cells
      }
      if (!placed) continue
      shadeCluster(out, placed, tones, dx, dy)
      for (const c of placed) ore.add(c)
      blockHalo(blocked, placed)
    }

    if (bool(params, 'rock', true)) rimShade(out, below, (i) => ore.has(i), dx, dy, 1)
    return { grid: out }
  }
}

const SPECKLE: Stencil = {
  id: 'speckle',
  label: 'Mineral flecks',
  group: 'Ore and rock',
  blurb:
    'Fine dust rather than lumps, the way lapis and quartz sit in stone. Raise the clumping to pull the flecks into pairs and threes.',
  mode: 'layer',
  usesColor: true,
  suggestedColor: '#2f5fa8',
  params: [
    { key: 'density', label: 'Density', kind: 'slider', min: 2, max: 100, default: 22 },
    { key: 'clump', label: 'Clumping', kind: 'slider', min: 0, max: 100, default: 30 },
    { key: 'contrast', label: 'Tone spread', kind: 'slider', min: 20, max: 140, default: 90 }
  ],
  run: ({ color, seed, angle, params }) => {
    const r = rng(seed)
    const [dx, dy] = lightVec(angle)
    const tones = toneRamp(color, num(params, 'contrast', 90))
    const out = blank()
    const taken = new Set<number>()
    const flecks = Math.round((num(params, 'density', 22) / 100) * 70)
    const clump = num(params, 'clump', 30) / 100

    for (let n = 0; n < flecks; n++) {
      const start = at(int(r, 0, SIZE - 1), int(r, 0, SIZE - 1))
      if (taken.has(start)) continue
      const cells = grow(r, start, r() < clump ? int(r, 2, 3) : 1, 0.5, taken)
      for (const c of cells) taken.add(c)
      shadeCluster(out, cells, tones, dx, dy)
    }
    return { grid: out }
  }
}

const VEINS: Stencil = {
  id: 'veins',
  label: 'Cracks and veins',
  group: 'Ore and rock',
  blurb:
    'Thin wandering lines one pixel wide. A dark color gives cracks in stone, a bright one gives a mineral seam running through it.',
  mode: 'layer',
  usesColor: true,
  suggestedColor: '#40332b',
  params: [
    { key: 'veins', label: 'Veins', kind: 'slider', min: 1, max: 8, default: 3 },
    { key: 'length', label: 'Length', kind: 'slider', min: 4, max: 26, default: 13 },
    { key: 'wander', label: 'Wander', kind: 'slider', min: 0, max: 100, default: 32 },
    { key: 'branch', label: 'Branching', kind: 'switch', default: false }
  ],
  run: ({ color, seed, params }) => {
    const r = rng(seed)
    const tones = toneRamp(color, 70)
    const out = blank()
    const wander = num(params, 'wander', 32) / 100
    const length = num(params, 'length', 13)
    const branch = bool(params, 'branch', false)

    const stepX = [0, 1, 1, 1, 0, -1, -1, -1]
    const stepY = [-1, -1, 0, 1, 1, 1, 0, -1]

    const walk = (fromX: number, fromY: number, steps: number, heading: number): void => {
      let x = fromX
      let y = fromY
      let dir = heading
      let turned = false
      for (let s = 0; s < steps; s++) {
        if (!inside(x, y)) return

        out[at(x, y)] = r() < 0.22 ? tones[1] : tones[0]

        if (r() < wander && !turned) {
          dir += r() < 0.5 ? -1 : 1
          turned = true
        } else {
          turned = false
        }
        dir = (dir + 8) % 8
        x += stepX[dir]
        y += stepY[dir]
        if (branch && s > 2 && r() < 0.12) walk(x, y, Math.round(steps / 3), (dir + 2) % 8)
      }
    }

    for (let n = 0; n < num(params, 'veins', 3); n++) {
      walk(int(r, 0, SIZE - 1), int(r, 0, SIZE - 1), length, int(r, 0, 7))
    }
    return { grid: out }
  }
}

const PEBBLES: Stencil = {
  id: 'pebbles',
  label: 'Pebbles',
  group: 'Ore and rock',
  blurb:
    'Rounded lumps with a lit cap and a shadow under them, the shape cobble and gravel are built from. The rock behind each lump gets the same rim treatment the ores use.',
  mode: 'layer',
  usesColor: true,
  suggestedColor: '#7d7d7d',
  params: [
    { key: 'pebbles', label: 'Pebbles', kind: 'slider', min: 2, max: 14, default: 7 },
    { key: 'size', label: 'Size', kind: 'slider', min: 2, max: 7, default: 3 },
    { key: 'relief', label: 'Relief', kind: 'slider', min: 0, max: 100, default: 55 }
  ],
  run: ({ below, color, seed, angle, params }) => {
    const r = rng(seed)
    const [dx, dy] = lightVec(angle)

    const tones = toneRamp(shade(color, 0.72), 75)
    const out = blank()
    const stones = new Set<number>()
    const blocked = new Set<number>()
    const size = num(params, 'size', 3)

    for (let n = 0; n < num(params, 'pebbles', 7); n++) {
      const radius = (size + r() * size * 0.6) / 2
      const cells = disc(r() * SIZE, r() * SIZE, radius).filter((i) => !blocked.has(i))
      if (cells.length < 2) continue

      const tint = 0.86 + r() * 0.26
      const lump = blank()
      shadeCluster(lump, cells, tones, dx, dy)
      for (const c of cells) {
        out[c] = shade(lump[c], tint)
        stones.add(c)
      }
      blockHalo(blocked, cells)
    }
    rimShade(out, below, (i) => stones.has(i), dx, dy, num(params, 'relief', 55) / 100)
    return { grid: out }
  }
}

const MOSS: Stencil = {
  id: 'moss',
  label: 'Moss patches',
  group: 'Weathering',
  blurb:
    'Organic patches that cling to one side of the block, with a darker fringe where they meet bare rock.',
  mode: 'layer',
  usesColor: true,
  suggestedColor: '#3d8228',
  params: [
    { key: 'coverage', label: 'Coverage', kind: 'slider', min: 5, max: 80, default: 30 },
    {
      key: 'cling',
      label: 'Clings to',
      kind: 'choice',
      options: [
        { value: 'bottom', label: 'Bottom' },
        { value: 'top', label: 'Top' },
        { value: 'edges', label: 'Edges' },
        { value: 'any', label: 'Anywhere' }
      ],
      default: 'bottom'
    },
    { key: 'fringe', label: 'Dark fringe', kind: 'switch', default: true }
  ],
  run: ({ below, color, seed, angle, params }) => {
    const r = rng(seed)
    const [dx, dy] = lightVec(angle)
    const tones = toneRamp(color, 80)
    const out = blank()
    const taken = new Set<number>()
    const cling = str(params, 'cling', 'bottom')
    const want = Math.round((num(params, 'coverage', 30) / 100) * CELLS)

    const score = (i: number): number => {
      if (cling === 'bottom') return gy(i)
      if (cling === 'top') return SIZE - 1 - gy(i)
      return Math.max(Math.abs(gx(i) - 7.5), Math.abs(gy(i) - 7.5))
    }
    const seedCell = (): number => {
      let best = at(int(r, 0, SIZE - 1), int(r, 0, SIZE - 1))
      if (cling === 'any') return best
      for (let k = 0; k < 3; k++) {
        const c = at(int(r, 0, SIZE - 1), int(r, 0, SIZE - 1))
        if (score(c) > score(best)) best = c
      }
      return best
    }

    let guard = 0
    while (taken.size < want && guard++ < 60) {
      const start = seedCell()
      if (taken.has(start)) continue
      const cells = grow(r, start, int(r, 3, 12), 0.55, taken)
      for (const c of cells) taken.add(c)
      shadeCluster(out, cells, tones, dx, dy)
    }

    if (bool(params, 'fringe', true)) {
      for (let y = 0; y < SIZE; y++) {
        for (let x = 0; x < SIZE; x++) {
          const i = at(x, y)
          if (out[i] || !below[i]) continue
          if (inside(x, y - 1) && taken.has(at(x, y - 1))) out[i] = shade(below[i], 0.78)
        }
      }
    }
    return { grid: out }
  }
}

const DRIPS: Stencil = {
  id: 'drips',
  label: 'Drips and stains',
  group: 'Weathering',
  blurb:
    'Streaks running down from the top edge, fading as they go. The color is mixed into whatever is underneath rather than painted over it, so the rock still shows through.',
  mode: 'layer',
  usesColor: true,
  suggestedColor: '#40332b',
  params: [
    { key: 'streaks', label: 'Streaks', kind: 'slider', min: 1, max: 10, default: 5 },
    { key: 'length', label: 'Length', kind: 'slider', min: 3, max: 15, default: 9 },
    { key: 'strength', label: 'Strength', kind: 'slider', min: 10, max: 100, default: 55 }
  ],
  run: ({ below, color, seed, params }) => {
    const r = rng(seed)
    const out = blank()
    const strength = num(params, 'strength', 55) / 100
    const length = num(params, 'length', 9)

    for (let n = 0; n < num(params, 'streaks', 5); n++) {
      let x = int(r, 0, SIZE - 1)
      const drop = Math.max(2, Math.round(length * (0.55 + r() * 0.7)))
      for (let y = 0; y < drop && y < SIZE; y++) {

        const k = strength * (1 - y / drop) * (0.7 + r() * 0.45)
        const i = at(x, y)
        if (below[i]) out[i] = mix(below[i], color, clamp(k, 0, 1))
        if (r() < 0.18) x = clamp(x + (r() < 0.5 ? -1 : 1), 0, SIZE - 1)
      }
    }
    return { grid: out }
  }
}

const CAP: Stencil = {
  id: 'cap',
  label: 'Snow cap',
  group: 'Weathering',
  blurb:
    'Covers the top of the tile with an uneven edge and drops a shadow line under it. The same shape works for snow, ash, a sand drift or a grass overhang on a block side.',
  mode: 'layer',
  usesColor: true,
  suggestedColor: '#e8eef5',
  params: [
    { key: 'depth', label: 'Depth', kind: 'slider', min: 1, max: 9, default: 4 },
    { key: 'roughness', label: 'Roughness', kind: 'slider', min: 0, max: 100, default: 45 },
    { key: 'shadow', label: 'Shadow line', kind: 'switch', default: true }
  ],
  run: ({ below, color, seed, angle, params }) => {
    const r = rng(seed)
    const [dx, dy] = lightVec(angle)
    const tones = toneRamp(color, 70)
    const out = blank()
    const depth = num(params, 'depth', 4)
    const rough = (num(params, 'roughness', 45) / 100) * 2.6
    const heights: number[] = []
    let drift = 0

    for (let x = 0; x < SIZE; x++) {

      drift = drift * 0.55 + (r() - 0.5) * rough
      heights.push(clamp(Math.round(depth + drift), 0, SIZE))
    }

    const covered: number[] = []
    for (let x = 0; x < SIZE; x++) {
      for (let y = 0; y < heights[x]; y++) covered.push(at(x, y))
    }
    shadeCluster(out, covered, tones, dx, dy)

    if (bool(params, 'shadow', true)) {
      for (let x = 0; x < SIZE; x++) {
        const y = heights[x]
        if (y >= SIZE) continue
        const i = at(x, y)
        if (!out[i] && below[i]) out[i] = shade(below[i], 0.8)
      }
    }
    return { grid: out }
  }
}

const SCUFF: Stencil = {
  id: 'scuff',
  label: 'Wear and scuffs',
  group: 'Weathering',
  blurb:
    'Lifts and drops small patches of what is already painted, so a flat fill stops looking flat. Uses no color of its own.',
  mode: 'layer',
  usesColor: false,
  params: [
    { key: 'patches', label: 'Patches', kind: 'slider', min: 2, max: 20, default: 9 },
    { key: 'size', label: 'Patch size', kind: 'slider', min: 1, max: 8, default: 3 },
    { key: 'depth', label: 'Depth', kind: 'slider', min: 5, max: 100, default: 45 }
  ],
  run: ({ below, seed, params }) => {
    const r = rng(seed)
    const out = blank()
    const taken = new Set<number>()
    const depth = num(params, 'depth', 45) / 100
    const size = num(params, 'size', 3)

    for (let n = 0; n < num(params, 'patches', 9); n++) {
      const start = at(int(r, 0, SIZE - 1), int(r, 0, SIZE - 1))
      const cells = grow(r, start, 1 + Math.floor(Math.pow(r(), 1.4) * size), 0.6, taken)
      const f = r() < 0.5 ? 1 + 0.3 * depth * (0.6 + r() * 0.8) : 1 - 0.26 * depth * (0.6 + r() * 0.8)
      for (const i of cells) {
        taken.add(i)
        if (below[i]) out[i] = shade(below[i], f)
      }
    }
    return { grid: out }
  }
}

const BRICKS: Stencil = {
  id: 'bricks',
  label: 'Brick courses',
  group: 'Structure',
  blurb:
    'Mortar lines in running bond, with every brick face nudged a little lighter or darker so no two read the same.',
  mode: 'layer',
  usesColor: true,
  suggestedColor: '#9e8a84',
  params: [
    { key: 'courses', label: 'Courses', kind: 'slider', min: 2, max: 8, default: 4 },
    { key: 'perCourse', label: 'Bricks per course', kind: 'slider', min: 1, max: 4, default: 2 },
    { key: 'bond', label: 'Bond offset', kind: 'slider', min: 0, max: 100, default: 50 },
    { key: 'variance', label: 'Face variance', kind: 'slider', min: 0, max: 100, default: 35 }
  ],
  run: ({ below, color, seed, params }) => {
    const r = rng(seed)
    const out = blank()
    const courses = num(params, 'courses', 4)
    const per = num(params, 'perCourse', 2)
    const bond = num(params, 'bond', 50) / 100
    const variance = num(params, 'variance', 35) / 100
    const mortar = toneRamp(color, 55)
    const brickW = SIZE / per

    for (let y = 0; y < SIZE; y++) {
      const course = Math.floor((y * courses) / SIZE)
      const bottom = Math.round(((course + 1) * SIZE) / courses) - 1
      const offset = (course % 2) * bond * brickW
      for (let x = 0; x < SIZE; x++) {
        const i = at(x, y)

        if (y === bottom || (x - offset + SIZE) % brickW < 1) {
          out[i] = r() < 0.3 ? mortar[1] : mortar[0]
          continue
        }
        if (!below[i] || variance <= 0) continue

        const brick = Math.floor((x - offset + SIZE) / brickW) * 31 + course * 7
        const jitter = rng(seed + brick)()
        out[i] = shade(below[i], 1 + (jitter - 0.5) * 0.34 * variance)
      }
    }
    return { grid: out }
  }
}

const PLANKS: Stencil = {
  id: 'planks',
  label: 'Plank seams',
  group: 'Structure',
  blurb:
    'Splits the tile into boards with a dark seam between them, runs grain along each board and drops the odd knot in. BTA planks are four boards with a one pixel seam.',
  mode: 'layer',
  usesColor: true,
  suggestedColor: '#695433',
  params: [
    { key: 'planks', label: 'Boards', kind: 'slider', min: 2, max: 8, default: 4 },
    {
      key: 'direction',
      label: 'Direction',
      kind: 'choice',
      options: [
        { value: 'horizontal', label: 'Horizontal' },
        { value: 'vertical', label: 'Vertical' }
      ],
      default: 'horizontal'
    },
    { key: 'grain', label: 'Grain', kind: 'slider', min: 0, max: 100, default: 45 },
    { key: 'knots', label: 'Knots', kind: 'slider', min: 0, max: 4, default: 1 }
  ],
  run: ({ below, color, seed, params }) => {
    const r = rng(seed)
    const out = blank()
    const boards = num(params, 'planks', 4)
    const vertical = str(params, 'direction', 'horizontal') === 'vertical'
    const grain = num(params, 'grain', 45) / 100
    const seam = toneRamp(color, 60)

    const put = (along: number, across: number, c: string): void => {
      const x = vertical ? across : along
      const y = vertical ? along : across
      if (inside(x, y)) out[at(x, y)] = c
    }
    const under = (along: number, across: number): string => {
      const x = vertical ? across : along
      const y = vertical ? along : across
      return inside(x, y) ? below[at(x, y)] : ''
    }

    for (let across = 0; across < SIZE; across++) {
      const board = Math.floor((across * boards) / SIZE)
      const edge = Math.round(((board + 1) * SIZE) / boards) - 1
      for (let along = 0; along < SIZE; along++) {
        if (across === edge) {
          put(along, across, r() < 0.28 ? seam[1] : seam[0])
          continue
        }
        const src = under(along, across)
        if (!src || grain <= 0) continue

        const jitter = rng(seed + Math.floor(along / 3) * 17 + board * 5 + across)()
        if (jitter < 0.45) continue
        put(along, across, shade(src, 1 + (jitter - 0.72) * 0.5 * grain))
      }
    }

    for (let k = 0; k < num(params, 'knots', 1); k++) {
      const board = int(r, 0, boards - 1)
      const lo = Math.round((board * SIZE) / boards)
      const hi = Math.round(((board + 1) * SIZE) / boards) - 2
      if (hi <= lo) continue
      const along = int(r, 1, SIZE - 3)
      const across = int(r, lo, hi)
      put(along, across, seam[0])
      put(along + 1, across, seam[1])
      put(along, across + 1, seam[1])
    }
    return { grid: out }
  }
}

const BEVEL: Stencil = {
  id: 'bevel',
  label: 'Bevelled edge',
  group: 'Structure',
  blurb:
    'Rims the tile with a lit edge on the side facing the light and a dark one opposite, which is what makes a flat face read as a raised block. Carved flips it into a recess.',
  mode: 'layer',
  usesColor: false,
  usesSeed: false,
  params: [
    { key: 'width', label: 'Width', kind: 'slider', min: 1, max: 3, default: 1 },
    { key: 'strength', label: 'Strength', kind: 'slider', min: 10, max: 100, default: 55 },
    {
      key: 'style',
      label: 'Style',
      kind: 'choice',
      options: [
        { value: 'raised', label: 'Raised' },
        { value: 'carved', label: 'Carved' }
      ],
      default: 'raised'
    }
  ],
  run: ({ below, angle, params }) => {
    const [dx, dy] = lightVec(angle)
    const out = blank()
    const width = num(params, 'width', 1)
    const strength = num(params, 'strength', 55) / 100
    const flip = str(params, 'style', 'raised') === 'carved' ? -1 : 1

    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        const i = at(x, y)
        if (!below[i]) continue
        const left = x
        const right = SIZE - 1 - x
        const top = y
        const bottom = SIZE - 1 - y
        const edge = Math.min(left, right, top, bottom)
        if (edge >= width) continue

        let nx = 0
        let ny = 0
        if (edge === left) nx = -1
        else if (edge === right) nx = 1
        if (edge === top) ny = -1
        else if (edge === bottom) ny = 1
        const facing = (nx * dx + ny * dy) * flip
        if (Math.abs(facing) < 0.05) continue

        const falloff = 1 - edge / (width + 0.6)
        out[i] = shade(below[i], 1 + facing * strength * 0.34 * falloff)
      }
    }
    return { grid: out }
  }
}

const GLINTS: Stencil = {
  id: 'glints',
  label: 'Sparkle glints',
  group: 'Structure',
  blurb:
    'Drops specular points on the brightest pixels already painted, spaced apart so they do not clump. The finishing touch on gems and polished metal.',
  mode: 'layer',
  usesColor: true,
  suggestedColor: '#ffffff',
  params: [
    { key: 'count', label: 'Glints', kind: 'slider', min: 1, max: 10, default: 3 },
    {
      key: 'shape',
      label: 'Shape',
      kind: 'choice',
      options: [
        { value: 'dot', label: 'Dot' },
        { value: 'cross', label: 'Cross' }
      ],
      default: 'dot'
    },
    { key: 'spread', label: 'Randomness', kind: 'slider', min: 0, max: 100, default: 40 }
  ],
  run: ({ below, color, seed, params }) => {
    const r = rng(seed)
    const out = blank()
    const cross = str(params, 'shape', 'dot') === 'cross'
    const spread = num(params, 'spread', 40) / 100
    const arms: [number, number][] = [
      [0, -1],
      [0, 1],
      [-1, 0],
      [1, 0]
    ]

    const ranked = below
      .map((c, i) => ({ i, score: c ? luma(c) * (1 - spread) + r() * 255 * spread : -1 }))
      .filter((e) => e.score >= 0)
      .sort((a, b) => b.score - a.score)

    const placed: number[] = []
    for (const { i } of ranked) {
      if (placed.length >= num(params, 'count', 3)) break

      if (placed.some((p) => Math.abs(gx(p) - gx(i)) < 3 && Math.abs(gy(p) - gy(i)) < 3)) continue
      placed.push(i)
      out[i] = color
      if (!cross) continue
      for (const [ox, oy] of arms) {
        const x = gx(i) + ox
        const y = gy(i) + oy
        if (inside(x, y) && below[at(x, y)]) out[at(x, y)] = mix(below[at(x, y)], color, 0.55)
      }
    }
    return { grid: out }
  }
}

const LEAF_HOLES: Stencil = {
  id: 'leafHoles',
  label: 'Leaf holes',
  group: 'Cutouts',
  blurb:
    'Punches the gaps a leaf block needs. BTA builds its fancy leaf masks by knocking out the darkest pixels of the flat texture, so this does the same with a random term mixed in and a fresh arrangement per seed.',
  mode: 'cut',
  usesColor: false,
  params: [
    { key: 'coverage', label: 'Coverage', kind: 'slider', min: 5, max: 60, default: 35 },
    {
      key: 'bias',
      label: 'Follow the shading',
      hint: 'How strongly holes prefer dark pixels over random ones',
      kind: 'slider',
      min: 0,
      max: 100,
      default: 70
    },
    { key: 'clump', label: 'Clumping', kind: 'slider', min: 0, max: 100, default: 30 },
    { key: 'keepEdges', label: 'Keep the border solid', kind: 'switch', default: false }
  ],
  run: ({ below, seed, params }) => {
    const r = rng(seed)
    const bias = num(params, 'bias', 70) / 100
    const keepEdges = bool(params, 'keepEdges', false)
    const clump = num(params, 'clump', 30) / 100

    const candidates: { i: number; score: number }[] = []
    below.forEach((c, i) => {
      if (!c) return
      if (keepEdges && (gx(i) === 0 || gx(i) === SIZE - 1 || gy(i) === 0 || gy(i) === SIZE - 1)) {
        return
      }
      candidates.push({ i, score: luma(c) * bias + r() * 255 * (1 - bias) })
    })
    candidates.sort((a, b) => a.score - b.score)

    const want = Math.round((num(params, 'coverage', 35) / 100) * candidates.length)
    const cut = new Set<number>()
    for (const { i } of candidates) {
      if (cut.size >= want) break
      cut.add(i)

      if (r() >= clump) continue
      const ox = r() < 0.5 ? (r() < 0.5 ? -1 : 1) : 0
      const oy = ox === 0 ? (r() < 0.5 ? -1 : 1) : 0
      const x = gx(i) + ox
      const y = gy(i) + oy
      if (inside(x, y) && below[at(x, y)]) cut.add(at(x, y))
    }
    return { cut: [...cut] }
  }
}

const RAGGED: Stencil = {
  id: 'ragged',
  label: 'Ragged border',
  group: 'Cutouts',
  blurb:
    'Eats into the outside of the tile at an uneven depth, so a plant or an overhang stops ending on a ruler straight line.',
  mode: 'cut',
  usesColor: false,
  params: [
    { key: 'depth', label: 'Depth', kind: 'slider', min: 1, max: 5, default: 2 },
    { key: 'amount', label: 'Amount', kind: 'slider', min: 5, max: 100, default: 55 },
    {
      key: 'sides',
      label: 'Sides',
      kind: 'choice',
      options: [
        { value: 'all', label: 'All' },
        { value: 'top', label: 'Top' },
        { value: 'bottom', label: 'Bottom' },
        { value: 'sides', label: 'Left and right' }
      ],
      default: 'all'
    }
  ],
  run: ({ below, seed, params }) => {
    const r = rng(seed)
    const depth = num(params, 'depth', 2)
    const amount = num(params, 'amount', 55) / 100
    const sides = str(params, 'sides', 'all')
    const cut = new Set<number>()

    const eat = (cell: (line: number, into: number) => [number, number]): void => {
      for (let line = 0; line < SIZE; line++) {
        if (r() > amount) continue
        const bite = int(r, 1, depth)
        for (let into = 0; into < bite; into++) {
          const [x, y] = cell(line, into)
          if (inside(x, y) && below[at(x, y)]) cut.add(at(x, y))
        }
      }
    }

    if (sides === 'all' || sides === 'top') eat((l, i) => [l, i])
    if (sides === 'all' || sides === 'bottom') eat((l, i) => [l, SIZE - 1 - i])
    if (sides === 'all' || sides === 'sides') {
      eat((l, i) => [i, l])
      eat((l, i) => [SIZE - 1 - i, l])
    }
    return { cut: [...cut] }
  }
}

export const STENCILS: Stencil[] = [
  ORE,
  SPECKLE,
  VEINS,
  PEBBLES,
  MOSS,
  DRIPS,
  CAP,
  SCUFF,
  BRICKS,
  PLANKS,
  BEVEL,
  GLINTS,
  LEAF_HOLES,
  RAGGED
]

export function defaultParams(s: Stencil): Record<string, ParamValue> {
  const out: Record<string, ParamValue> = {}
  for (const p of s.params) out[p.key] = p.default
  return out
}

export function previewStencil(s: Stencil, input: StencilInput): Grid {
  const result = s.run(input)
  if (result.cut) {
    const gone = new Set(result.cut)
    return input.below.map((c, i) => (gone.has(i) ? '' : c))
  }
  const add = result.grid ?? blank()
  return input.below.map((c, i) => add[i] || c)
}
