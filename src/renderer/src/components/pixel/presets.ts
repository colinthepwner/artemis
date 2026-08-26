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

const literal = (id: string, label: string, group: TexturePreset['group'], grid: Grid): TexturePreset => ({
  id,
  label,
  group,
  usesAccent: false,
  generate: () => grid
})

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
  literal('stone', 'Stone', 'Terrain', data.STONE),
  literal('cobble', 'Cobblestone', 'Terrain', data.COBBLE),
  literal('dirt', 'Dirt', 'Terrain', data.DIRT),
  literal('grass_top', 'Grass Top', 'Terrain', data.GRASS_TOP),
  literal('grass_side', 'Grass Side', 'Terrain', data.GRASS_SIDE),
  literal('sand', 'Sand', 'Terrain', data.SAND),
  literal('gravel', 'Gravel', 'Terrain', data.GRAVEL),
  literal('planks', 'Planks', 'Terrain', data.PLANKS),
  literal('log_side', 'Log Side', 'Terrain', data.LOG_SIDE),
  literal('log_top', 'Log Top', 'Terrain', data.LOG_TOP),
  literal('leaves', 'Leaves', 'Terrain', data.LEAVES),
  tinted('liquid', 'Liquid', 'Terrain', data.LIQUID_BASE, data.LIQUID_TINT),
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

export function rgbaToDataUrl(grid: Grid, alpha?: number[]): string {
  const canvas = document.createElement('canvas')
  canvas.width = 16
  canvas.height = 16
  const ctx = canvas.getContext('2d')!
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
