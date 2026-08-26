import { adjustColor, mix, shade, type Grid } from './presets'

export interface PixelFx {
  light: {
    enabled: boolean

    angle: number

    strength: number
  }
}

export const DEFAULT_FX: PixelFx = {
  light: { enabled: false, angle: -Math.PI * 0.75, strength: 45 }
}

export interface LitLayer {
  grid: Grid
  visible: boolean

  opacity: number

  hue?: number

  saturation?: number

  brightness?: number
}

export function adjustedGrid(l: LitLayer): Grid {
  const h = l.hue ?? 0
  const s = l.saturation ?? 0
  const b = l.brightness ?? 0
  if (!h && !s && !b) return l.grid
  return l.grid.map((c) => (c ? adjustColor(c, h, s, b) : c))
}

export interface Composite {
  grid: Grid

  alpha: number[]
}

const emptyGrid = (): Grid => Array(256).fill('')

export function applyDirectionalShading(grid: Grid, angle: number, strength: number): Grid {
  if (strength <= 0) return grid
  const s = strength / 100
  const dx = Math.cos(angle)
  const dy = Math.sin(angle)
  const out = [...grid]
  const opaque = (x: number, y: number): boolean =>
    x >= 0 && x < 16 && y >= 0 && y < 16 && grid[y * 16 + x] !== ''

  const sx = Math.abs(dx) > 0.38 ? Math.sign(dx) : 0
  const sy = Math.abs(dy) > 0.38 ? Math.sign(dy) : 0

  let n = 0
  let cx = 0
  let cy = 0
  for (let i = 0; i < 256; i++) {
    if (!grid[i]) continue
    cx += i % 16
    cy += (i / 16) | 0
    n++
  }
  if (!n) return out
  cx /= n
  cy /= n

  let reach = 0.001
  for (let i = 0; i < 256; i++) {
    if (!grid[i]) continue
    const p = ((i % 16) - cx) * dx + (((i / 16) | 0) - cy) * dy
    reach = Math.max(reach, Math.abs(p))
  }

  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const c = grid[y * 16 + x]
      if (!c) continue

      const t = ((x - cx) * dx + (y - cy) * dy) / reach
      let f = 1 + t * s * 0.32

      if (!opaque(x + sx, y + sy)) f *= 1 + s * 0.3
      if (!opaque(x - sx, y - sy)) f *= 1 - s * 0.28
      out[y * 16 + x] = shade(c, Math.max(0.4, Math.min(1.8, f)))
    }
  }
  return out
}

function shadowOffset(angle: number, strength: number): [number, number] {
  const dist = strength > 65 ? 2 : 1
  return [-Math.round(Math.cos(angle) * dist), -Math.round(Math.sin(angle) * dist)]
}

interface Built {
  composite: Composite

  baked: Grid[]
}

function build(layers: LitLayer[], fx: PixelFx | null): Built {
  const grid = emptyGrid()
  const alpha = new Array<number>(256).fill(0)

  const owner = new Array<number>(256).fill(-1)
  const baked = layers.map((l) => [...adjustedGrid(l)])

  const lit = !!fx?.light.enabled && fx.light.strength > 0
  const s = lit ? fx!.light.strength / 100 : 0
  const [ox, oy] = lit ? shadowOffset(fx!.light.angle, fx!.light.strength) : [0, 0]
  const shadowFactor = 1 - s * 0.4

  layers.forEach((l, li) => {
    if (!l.visible || l.opacity <= 0) return

    const tinted = adjustedGrid(l)

    if (lit && (ox !== 0 || oy !== 0)) {
      const own = new Set<number>()
      for (let i = 0; i < 256; i++) if (tinted[i]) own.add(i)
      const hit = new Set<number>()
      for (const i of own) {
        const x = (i % 16) + ox
        const y = ((i / 16) | 0) + oy
        if (x < 0 || x > 15 || y < 0 || y > 15) continue
        const t = y * 16 + x

        if (own.has(t) || hit.has(t) || !grid[t]) continue
        hit.add(t)
        grid[t] = shade(grid[t], shadowFactor)
        const o = owner[t]
        if (o >= 0 && baked[o][t]) baked[o][t] = shade(baked[o][t], shadowFactor)
      }
    }

    const src = lit ? applyDirectionalShading(tinted, fx!.light.angle, fx!.light.strength) : tinted
    if (lit) baked[li] = [...src]

    const a = l.opacity / 100
    for (let i = 0; i < 256; i++) {
      const c = src[i]
      if (!c) continue
      const dstA = alpha[i]
      const outA = a + dstA * (1 - a)
      grid[i] = dstA > 0 && a < 1 ? mix(grid[i], c, a / outA) : c
      alpha[i] = outA
      owner[i] = li
    }
  })

  return { composite: { grid, alpha }, baked }
}

export function compositeLayers(layers: LitLayer[], fx?: PixelFx | null): Composite {
  return build(layers, fx ?? null).composite
}

export function bakeLighting(layers: LitLayer[], fx: PixelFx): Grid[] {
  return build(layers, fx).baked
}
