import * as data from './presetData'

export type Grid = string[]

export const GRID_SIZE = 16

const blank = (): Grid => Array(256).fill('')

export function mix(a: string, b: string, t: number): string {
  const na = parseInt(a.slice(1), 16)
  const nb = parseInt(b.slice(1), 16)
  const ch = (sa: number, sb: number): number => Math.round(sa + (sb - sa) * t)
  const r = ch((na >> 16) & 255, (nb >> 16) & 255)
  const g = ch((na >> 8) & 255, (nb >> 8) & 255)
  const bl = ch(na & 255, nb & 255)
  return `#${((r << 16) | (g << 8) | bl).toString(16).padStart(6, '0')}`
}

function hexToHsl(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  const r = ((n >> 16) & 255) / 255
  const g = ((n >> 8) & 255) / 255
  const b = (n & 255) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h: number
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6
  else if (max === g) h = ((b - r) / d + 2) / 6
  else h = ((r - g) / d + 4) / 6
  return [h, s, l]
}

function hslToHex(h: number, s: number, l: number): string {
  const hue = (c: number): number => {
    const t = ((c % 1) + 1) % 1
    if (t < 1 / 6) return p2 + (q2 - p2) * 6 * t
    if (t < 1 / 2) return q2
    if (t < 2 / 3) return p2 + (q2 - p2) * (2 / 3 - t) * 6
    return p2
  }
  if (s === 0) {
    const v = Math.round(l * 255)
    return `#${((v << 16) | (v << 8) | v).toString(16).padStart(6, '0')}`
  }
  const q2 = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p2 = 2 * l - q2
  const r = Math.round(hue(h + 1 / 3) * 255)
  const g = Math.round(hue(h) * 255)
  const b = Math.round(hue(h - 1 / 3) * 255)
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`
}

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v))

export function adjustColor(hex: string, hueDeg: number, satPct: number, briPct: number): string {
  if (!hueDeg && !satPct && !briPct) return hex
  const [h, s, l] = hexToHsl(hex)
  return hslToHex(h + hueDeg / 360, clamp01(s + satPct / 100), clamp01(l + briPct / 100))
}

export function blendColors(colors: string[], weight = 1): string {
  if (!colors.length) return colors[0] ?? ''
  let r = 0
  let g = 0
  let b = 0
  for (const c of colors) {
    const n = parseInt(c.slice(1), 16)
    r += (n >> 16) & 255
    g += (n >> 8) & 255
    b += n & 255
  }
  const k = colors.length
  const mixTo = (v: number, base: number): number => Math.round(base + (v / k - base) * weight)
  const first = parseInt(colors[0].slice(1), 16)
  const rr = mixTo(r, (first >> 16) & 255)
  const gg = mixTo(g, (first >> 8) & 255)
  const bb = mixTo(b, first & 255)
  return `#${((rr << 16) | (gg << 8) | bb).toString(16).padStart(6, '0')}`
}

export function shade(hex: string, f: number): string {
  const n = parseInt(hex.replace('#', ''), 16)
  const ch = (v: number): number =>
    Math.max(0, Math.min(255, Math.round(f >= 1 ? v + (255 - v) * (f - 1) : v * f)))
  const r = ch((n >> 16) & 255)
  const gr = ch((n >> 8) & 255)
  const b = ch(n & 255)
  return `#${((r << 16) | (gr << 8) | b).toString(16).padStart(6, '0')}`
}

function bake(base: Grid, tint: (number | null)[], accent: string): Grid {
  return base.map((c, i) => {
    const t = tint[i]
    if (t == null) return c

    return shade(accent, 0.55 + (t / 255) * 0.85)
  })
}

export interface TexturePreset {
  id: string
  label: string
  group: 'Terrain' | 'Material' | 'Tools' | 'Armor'
  usesAccent: boolean
  generate: (accent: string) => Grid
}

function luminanceTint(base: Grid): (number | null)[] {
  return base.map((c) => {
    if (!c) return null
    const n = parseInt(c.slice(1), 16)
    return Math.round(0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255))
  })
}

const dyed = (id: string, label: string, group: TexturePreset['group'], grid: Grid): TexturePreset => {
  const tint = luminanceTint(grid)
  return {
    id,
    label,
    group,
    usesAccent: true,
    generate: (accent) => bake(grid, tint, accent)
  }
}

function soften(tint: (number | null)[], amount: number): (number | null)[] {
  return tint.map((t) => (t == null ? null : Math.round(128 + (t - 128) * amount)))
}

const tinted = (
  id: string,
  label: string,
  group: TexturePreset['group'],
  base: Grid,
  tint: (number | null)[]
): TexturePreset => ({
  id,
  label,
  group,
  usesAccent: true,
  generate: (accent) => bake(base, tint, accent)
})

export const TEXTURE_PRESETS: TexturePreset[] = [
  dyed('stone', 'Stone', 'Terrain', data.STONE),
  dyed('cobble', 'Cobblestone', 'Terrain', data.COBBLE),
  dyed('dirt', 'Dirt', 'Terrain', data.DIRT),
  dyed('grass_top', 'Grass Top', 'Terrain', data.GRASS_TOP),
  dyed('grass_side', 'Grass Side', 'Terrain', data.GRASS_SIDE),
  dyed('sand', 'Sand', 'Terrain', data.SAND),
  dyed('gravel', 'Gravel', 'Terrain', data.GRAVEL),
  dyed('planks', 'Planks', 'Terrain', data.PLANKS),
  dyed('log_side', 'Log Side', 'Terrain', data.LOG_SIDE),
  dyed('log_top', 'Log Top', 'Terrain', data.LOG_TOP),
  dyed('leaves', 'Leaves', 'Terrain', data.LEAVES),

  tinted('liquid', 'Liquid', 'Terrain', data.LIQUID_BASE, soften(data.LIQUID_TINT, 0.45)),
  tinted('ore', 'Ore', 'Material', data.ORE_BASE, data.ORE_TINT),
  tinted('gem', 'Gem', 'Material', data.GEM_BASE, data.GEM_TINT),
  tinted('ingot', 'Ingot', 'Material', data.INGOT_BASE, data.INGOT_TINT),
  tinted('sword', 'Sword', 'Tools', data.SWORD_BASE, data.SWORD_TINT),
  tinted('pickaxe', 'Pickaxe', 'Tools', data.PICKAXE_BASE, data.PICKAXE_TINT),
  tinted('axe', 'Axe', 'Tools', data.AXE_BASE, data.AXE_TINT),
  tinted('shovel', 'Shovel', 'Tools', data.SHOVEL_BASE, data.SHOVEL_TINT),
  tinted('hoe', 'Hoe', 'Tools', data.HOE_BASE, data.HOE_TINT),
  tinted('helmet', 'Helmet', 'Armor', data.HELMET_BASE, data.HELMET_TINT),
  tinted('chestplate', 'Chestplate', 'Armor', data.CHESTPLATE_BASE, data.CHESTPLATE_TINT),
  tinted('leggings', 'Leggings', 'Armor', data.LEGGINGS_BASE, data.LEGGINGS_TINT),
  tinted('boots', 'Boots', 'Armor', data.BOOTS_BASE, data.BOOTS_TINT)
]

export const PIXEL_PALETTE: string[] = [
  '#1b1b1b', '#4c4c4c', '#7d7d7d', '#a8a8a8', '#d8d8d8', '#ffffff',
  '#40332b', '#6e5535', '#8a6b42', '#b08d5b', '#d1b183', '#e8d5ab',
  '#1c4a12', '#2e6b1e', '#3d8228', '#5cb04a', '#7fd35f', '#a3e88a',
  '#1f3b6e', '#2f5fa8', '#4a8fd8', '#7fb8e8', '#2f8f8f', '#4fd8d8',
  '#6e1f1f', '#a83030', '#d85555', '#e88a7f', '#a8702c', '#d8a83c',
  '#f2d05f', '#5f2f8f', '#8f4fd8', '#c58ae8', '#d87f2f', '#e89fb8'
]

export function gridToDataUrl(grid: Grid): string {
  return rgbaToDataUrl(grid)
}

let scratch: { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } | null = null
function scratch16(): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  if (!scratch) {
    const canvas = document.createElement('canvas')
    canvas.width = 16
    canvas.height = 16
    scratch = { canvas, ctx: canvas.getContext('2d')! }
  }
  return scratch
}

export function rgbaToDataUrl(grid: Grid, alpha?: number[]): string {
  const { canvas, ctx } = scratch16()
  const img = ctx.createImageData(16, 16)
  for (let i = 0; i < 256; i++) {
    const c = grid[i]
    if (!c) continue
    const a = alpha ? alpha[i] : 1
    if (a <= 0) continue
    const n = parseInt(c.slice(1), 16)
    img.data[i * 4] = (n >> 16) & 255
    img.data[i * 4 + 1] = (n >> 8) & 255
    img.data[i * 4 + 2] = n & 255
    img.data[i * 4 + 3] = Math.max(0, Math.min(255, Math.round(a * 255)))
  }
  ctx.putImageData(img, 0, 0)
  return canvas.toDataURL('image/png')
}

export async function dataUrlToGrid(dataUrl: string): Promise<Grid> {
  const img = new Image()
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve()
    img.onerror = () => reject(new Error('bad texture data'))
    img.src = dataUrl
  })
  const canvas = document.createElement('canvas')
  canvas.width = 16
  canvas.height = 16
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(img, 0, 0, 16, 16)
  const data = ctx.getImageData(0, 0, 16, 16).data
  const grid = blank()
  for (let i = 0; i < 256; i++) {
    if (data[i * 4 + 3] < 128) continue
    const hex = ((data[i * 4] << 16) | (data[i * 4 + 1] << 8) | data[i * 4 + 2])
      .toString(16)
      .padStart(6, '0')
    grid[i] = `#${hex}`
  }
  return grid
}
