import { useMemo, useSyncExternalStore } from 'react'
import { gridToDataUrl, shade, TEXTURE_PRESETS, type Grid } from './presets'
import { useVanillaArt, type VanillaArt } from './useVanillaArt'

import { FOLIAGE_TINTS as FOLIAGE, multiplyPixels } from './foliageTints'

export interface SwatchSpec {

  field?: string

  stripField?: string

  stripFields?: string[]

  closeRim?: boolean

  withTop?: boolean

  topFace?: boolean

  item?: boolean

  flat?: boolean

  scale?: number

  preset?: string

  draw?: string

  accent?: string

  tint?: string

  smooth?: boolean

  grid?: number

  flowRight?: boolean

  colorized?: boolean
}

export interface Swatch {

  texture: string

  item?: boolean

  flat?: boolean

  scale?: number

  strip?: string

  tint: string
}

const SILVER = '#d6d6d6'

export const SWATCHES: Record<string, SwatchSpec> = {

  stone: { field: 'STONE', preset: 'stone', tint: '#7f7f7f' },
  cobble: { field: 'COBBLE_STONE', preset: 'cobble', tint: '#7a7a7a' },
  dirt: { field: 'DIRT', preset: 'dirt', tint: '#966c4b' },

  grass: { field: 'GRASS', topFace: true, colorized: true, preset: 'grass_top', tint: FOLIAGE.grass },
  wood: { field: 'PLANKS_OAK', preset: 'planks', tint: '#9f844d' },
  log: { field: 'LOG_OAK', preset: 'log_side', tint: '#6b5637' },
  metal: { field: 'BLOCK_IRON', tint: '#dcdcdc', smooth: true },
  sand: { field: 'SAND', preset: 'sand', tint: '#dbd59c' },
  gravel: { field: 'GRAVEL', preset: 'gravel', tint: '#8b7f7d' },
  glass: {
    field: 'GLASS',
    stripField: 'GLASS_JOINED_X',
    closeRim: true,
    draw: 'glass',
    tint: '#bcd8e0',
    smooth: true
  },
  leaves: { field: 'LEAVES_OAK', preset: 'leaves', tint: FOLIAGE.oak, colorized: true },
  plant: { field: 'TALLGRASS', preset: 'leaves', tint: FOLIAGE.grass, colorized: true },
  cloth: { field: 'WOOL', tint: '#e4e4e4', smooth: true },
  ice: { field: 'ICE', tint: '#a7c8f0', smooth: true },
  snow: { field: 'BLOCK_SNOW', tint: '#f0f4f8', smooth: true },
  cactus: { field: 'CACTUS', tint: '#4f7f34' },

  moss: { field: 'COBBLE_STONE_MOSSY', preset: 'cobble', tint: '#7a9464' },
  clay: { field: 'BLOCK_CLAY', tint: '#a4aab5', smooth: true },
  water: { field: 'FLUID_WATER_FLOWING', grid: 2, flowRight: true, preset: 'liquid', tint: '#3a72c8' },
  lava: { field: 'FLUID_LAVA_FLOWING', grid: 2, flowRight: true, preset: 'liquid', tint: '#e0761f' },
  basalt: { field: 'BASALT', preset: 'stone', tint: '#565660' },
  limestone: { field: 'LIMESTONE', preset: 'stone', tint: '#c3bda9' },
  granite: { field: 'GRANITE', preset: 'stone', tint: '#a87565' },
  marble: { field: 'MARBLE', tint: '#e6e4de', smooth: true },
  slate: { field: 'SLATE', tint: '#5a6068', smooth: true },
  iron: { field: 'BLOCK_IRON', tint: '#dcdcdc', smooth: true },
  gold: { field: 'BLOCK_GOLD', tint: '#f2d05f', smooth: true },
  diamond: { field: 'BLOCK_DIAMOND', tint: '#4fd8d8', smooth: true },
  obsidian: { field: 'OBSIDIAN', tint: '#241c31', smooth: true },
  ore: { field: 'ORE_IRON_STONE', preset: 'ore', accent: '#c8a27a', tint: '#8a8078' },

  workbench: {
    field: 'WORKBENCH',
    withTop: true,
    stripFields: ['WORKBENCH_FRONT', 'WORKBENCH'],
    preset: 'planks',
    tint: '#9f844d'
  },
  furnace: {
    field: 'FURNACE_STONE_SIDE',
    withTop: true,
    stripFields: ['FURNACE_STONE_FRONT', 'FURNACE_STONE_SIDE'],
    preset: 'cobble',
    tint: '#7a7a7a'
  },

  tierAny: { field: 'PLANKS_OAK', preset: 'planks', tint: '#9f844d' },
  tierStone: { field: 'COBBLE_STONE', preset: 'cobble', tint: '#7a7a7a' },
  tierIron: { field: 'INGOT_IRON', item: true, tint: '#d8d8d8', smooth: true },
  tierDiamond: { field: 'DIAMOND', item: true, tint: '#4fd8d8', smooth: true },

  torch: { field: 'TORCH_COAL', draw: 'torch', tint: '#e8b04a', flat: true, scale: 125 },
  torchRedstone: { field: 'TORCH_REDSTONE_ACTIVE', draw: 'torchRedstone', tint: '#c33b2c', flat: true, scale: 125 },
  glowstone: { field: 'GLOWSTONE', tint: '#f2d05f' },
  mushroom: { field: 'MUSHROOM_BROWN', tint: '#b08d5b', flat: true },

  all: { field: 'COBBLE_STONE', preset: 'cobble', tint: '#7a7a7a' },

  topBottomSides: { field: 'LOG_OAK', withTop: true, preset: 'log_side', tint: '#6b5637' },

  flower: {
    field: 'FLOWER_RED',
    draw: 'flower',
    flat: true,
    stripFields: ['FLOWER_RED', 'FLOWER_YELLOW'],
    scale: 135
  },
  deadbush: { field: 'DEADBUSH', flat: true },
  shrub: {

    field: 'TALLGRASS_FERN',
    stripFields: ['TALLGRASS', 'TALLGRASS_FERN', 'DEADBUSH', 'SAPLING_SHRUB'],
    colorized: true,
    preset: 'leaves',
    tint: FOLIAGE.grass,
    flat: true
  },

  block: { field: 'ORE_IRON_STONE', preset: 'ore', accent: '#c8a27a', tint: '#8a8078' },
  item: { field: 'ORE_RAW_IRON', item: true, preset: 'gem', accent: '#c8a27a' },

  shaped: {
    field: 'WORKBENCH',
    withTop: true,
    stripFields: ['WORKBENCH_FRONT', 'WORKBENCH'],
    preset: 'planks',
    tint: '#9f844d'
  },
  shapeless: {
    field: 'WORKBENCH',
    withTop: true,
    stripFields: ['WORKBENCH_FRONT', 'WORKBENCH'],
    preset: 'planks',
    tint: '#9f844d'
  },

  mineableByPickaxe: { field: 'TOOL_PICKAXE_IRON', item: true, preset: 'pickaxe', accent: SILVER },
  mineableByAxe: { field: 'TOOL_AXE_IRON', item: true, preset: 'axe', accent: SILVER },
  mineableByShovel: { field: 'TOOL_SHOVEL_IRON', item: true, preset: 'shovel', accent: SILVER },
  mineableByHoe: { field: 'TOOL_HOE_IRON', item: true, preset: 'hoe', accent: SILVER },
  mineableBySword: { field: 'TOOL_SWORD_IRON', item: true, preset: 'sword', accent: SILVER },
  mineableByShears: { field: 'TOOL_SHEARS', item: true },

  brokenByFluids: { field: 'FLUID_WATER_STILL', tint: '#3f76e4', smooth: true },

  preventMobSpawns: { field: 'MOBSPAWNER', tint: '#3b3226' },

  growsFlowers: { field: 'FLOWER_RED', draw: 'flower', flat: true, scale: 100 },
  fencesConnect: { draw: 'fence', tint: '#9f844d', flat: true, scale: 100 },
  notInCreativeMenu: {
    field: 'GLASS',
    stripField: 'GLASS_JOINED_X',
    closeRim: true,
    draw: 'glass',
    tint: '#bcd8e0',
    smooth: true
  }
}

const baked = new Map<string, string>()

function hashKey(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0 || 1
}

function torchGrid(flame: string): Grid {
  const grid: Grid = Array(256).fill('')
  const put = (x: number, y: number, c: string): void => {
    grid[y * 16 + x] = c
  }

  for (let y = 8; y < 16; y++) {
    put(6, y, '#a2864f')
    put(7, y, '#8a6b42')
    put(8, y, '#5f4a2c')
  }
  for (let x = 5; x <= 9; x++) put(x, 7, '#3a2b1c')
  for (let x = 5; x <= 9; x++) put(x, 6, shade(flame, 0.8))
  put(5, 5, shade(flame, 0.85))
  put(9, 5, shade(flame, 0.85))
  for (let x = 6; x <= 8; x++) put(x, 5, flame)
  for (let x = 6; x <= 8; x++) put(x, 4, shade(flame, 1.3))
  put(7, 3, shade(flame, 1.45))
  return grid
}

function glassGrid(tint: string): Grid {
  const grid: Grid = Array(256).fill('')
  const put = (x: number, y: number, c: string): void => {
    grid[y * 16 + x] = c
  }
  const hl = shade(tint, 1.35)
  const sh = shade(tint, 0.7)
  const bg = shade(tint, 0.9)

  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      if ((x + y) % 2 === 0) put(x, y, bg)
    }
  }

  for (let i = 2; i <= 6; i++) {
    put(i, 13 - i, hl)
    put(i + 1, 13 - i, sh)
  }

  for (let i = 11; i <= 12; i++) {
    put(i, 23 - i, hl)
  }

  return grid
}

function flowerGrid(color: string): Grid {
  const grid: Grid = Array(256).fill('')
  const put = (x: number, y: number, c: string): void => {
    grid[y * 16 + x] = c
  }

  for (let y = 9; y < 16; y++) put(7, y, '#5ca33e')
  put(8, 12, '#5ca33e')
  put(9, 11, '#5ca33e')
  put(6, 13, '#5ca33e')
  put(5, 12, '#5ca33e')

  put(7, 5, '#f4c718')

  const p = color
  put(7, 3, p); put(7, 4, p);
  put(7, 6, p); put(7, 7, p);
  put(5, 5, p); put(6, 5, p);
  put(8, 5, p); put(9, 5, p);
  put(6, 4, p); put(8, 4, p);
  put(6, 6, p); put(8, 6, p);

  return grid
}

function fenceGrid(color: string): Grid {
  const grid: Grid = Array(256).fill('')
  const put = (x: number, y: number, c: string): void => {
    if (x >= 0 && x < 16 && y >= 0 && y < 16) grid[y * 16 + x] = c
  }
  const dark = shade(color, -0.3)
  const lit = shade(color, 0.18)
  const fill = (x0: number, x1: number, y0: number, y1: number): void => {
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {

        put(x, y, y === y0 ? lit : y === y1 ? dark : color)
      }
    }
  }

  fill(2, 4, 1, 15)
  fill(11, 13, 1, 15)
  fill(2, 13, 4, 6)
  fill(2, 13, 9, 11)
  return grid
}

const DRAWN: Record<string, () => Grid> = {
  torch: () => torchGrid('#f2a63c'),
  torchRedstone: () => torchGrid('#d8402c'),
  flower: () => flowerGrid('#d85555'),
  glass: () => glassGrid('#bcd8e0'),
  fence: () => fenceGrid('#9f844d')
}

function noiseGrid(tint: string, seed: number, spread: number): Grid {
  const grid: Grid = []
  let s = seed
  for (let i = 0; i < 256; i++) {
    s ^= s << 13
    s >>>= 0
    s ^= s >>> 17
    s ^= s << 5
    s >>>= 0
    const t = (s % 1024) / 1024
    grid.push(shade(tint, 1 - spread + t * spread * 2))
  }
  return grid
}

function fallbackTexture(key: string, spec: SwatchSpec): string | undefined {
  const cached = baked.get(key)
  if (cached) return cached

  const preset = spec.preset ? TEXTURE_PRESETS.find((p) => p.id === spec.preset) : undefined
  const grid =
    (spec.draw ? DRAWN[spec.draw]?.() : undefined) ??
    preset?.generate(spec.accent ?? spec.tint ?? '#8a8a8a') ??
    (spec.tint ? noiseGrid(spec.tint, hashKey(key), spec.smooth ? 0.1 : 0.18) : undefined)
  if (!grid) return undefined

  const url = gridToDataUrl(grid)
  baked.set(key, url)
  return url
}

const tinted = new Map<string, string>()
const baking = new Set<string>()
const listeners = new Set<() => void>()
let version = 0

function pngSize(dataUrl: string): { w: number; h: number } | null {
  const comma = dataUrl.indexOf(',')
  if (comma < 0) return null
  try {
    const head = atob(dataUrl.slice(comma + 1, comma + 45))
    if (head.charCodeAt(1) !== 0x50) return null
    const at = (o: number): number =>
      ((head.charCodeAt(o) << 24) |
        (head.charCodeAt(o + 1) << 16) |
        (head.charCodeAt(o + 2) << 8) |
        head.charCodeAt(o + 3)) >>>
      0
    return { w: at(16), h: at(20) }
  } catch {
    return null
  }
}

interface BakeOptions {
  tint?: string

  grid?: number

  flowRight?: boolean

  closeRim?: boolean
}

function bakedTexture(texture: string, opts: BakeOptions): string {
  const key = [
    opts.tint ?? 'plain',
    opts.grid ?? 1,
    opts.flowRight ? 'r' : '-',
    opts.closeRim ? 'rim' : '-',
    texture
  ].join(' ')
  const done = tinted.get(key)
  if (done) return done
  if (!baking.has(key)) {
    baking.add(key)
    const img = new Image()
    img.onload = () => {
      baking.delete(key)
      const side = Math.min(img.width, img.height) / (opts.grid ?? 1)
      const canvas = document.createElement('canvas')
      canvas.width = side
      canvas.height = side
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      if (opts.flowRight) {

        ctx.translate(0, side)
        ctx.rotate(-Math.PI / 2)
      }
      ctx.drawImage(img, 0, 0, side, side, 0, 0, side, side)
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      const tint = opts.tint
      if (tint || opts.closeRim) {
        const data = ctx.getImageData(0, 0, side, side)
        const px = data.data
        const at = (x: number, y: number): number => (y * side + x) * 4

        if (opts.closeRim) {

          for (const y of [0, side - 1]) {
            const painted: number[] = []
            for (let x = 0; x < side; x++) if (px[at(x, y) + 3] > 0) painted.push(x)
            if (painted.length === 0) continue
            for (let x = 0; x < side; x++) {
              const i = at(x, y)
              if (px[i + 3] > 0) continue
              let nearest = painted[0]
              for (const c of painted) {
                if (Math.abs(c - x) < Math.abs(nearest - x)) nearest = c
              }
              const j = at(nearest, y)
              px[i] = px[j]
              px[i + 1] = px[j + 1]
              px[i + 2] = px[j + 2]
              px[i + 3] = px[j + 3]
            }
          }
        }

        if (tint) multiplyPixels(px, tint)
        ctx.putImageData(data, 0, 0)
      }
      finishBake(key, canvas)
    }
    img.onerror = () => baking.delete(key)
    img.src = texture
  }
  return texture
}

function finishBake(key: string, canvas: HTMLCanvasElement): void {
  tinted.set(key, canvas.toDataURL())
  version++
  listeners.forEach((l) => l())
}

function compositeTexture(sources: string[]): string {
  const key = `set ${sources.join(' ')}`
  const done = tinted.get(key)
  if (done) return done
  if (!baking.has(key)) {
    baking.add(key)
    const imgs = sources.map(() => new Image())
    let remaining = imgs.length
    const onOne = (): void => {
      if (--remaining > 0) return
      baking.delete(key)
      const side = Math.min(imgs[0].width, imgs[0].height)
      const canvas = document.createElement('canvas')
      canvas.width = side * imgs.length
      canvas.height = side
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      imgs.forEach((img, i) => {
        const src = Math.min(img.width, img.height)
        ctx.drawImage(img, 0, 0, src, src, i * side, 0, side, side)
      })
      finishBake(key, canvas)
    }
    imgs.forEach((img, i) => {
      img.onload = onOne
      img.onerror = () => baking.delete(key)
      img.src = sources[i]
    })
  }
  return sources[0]
}

export function shadedTexture(texture: string, factor: number): string {
  if (factor >= 1) return texture
  const level = Math.max(0, Math.min(255, Math.round(factor * 255)))
  const hex = level.toString(16).padStart(2, '0')
  return bakedTexture(texture, { tint: `#${hex}${hex}${hex}` })
}

export function useSwatchVersion(): number {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => {
        listeners.delete(cb)
      }
    },
    () => version
  )
}

export function swatchFor(key: string, art: VanillaArt): Swatch | undefined {
  const spec = SWATCHES[key]
  if (!spec) return undefined
  const tint = spec.tint ?? '#8a8a8a'

  const face = spec.field
    ? spec.topFace
      ? (art.tops[spec.field] ?? art.blocks[spec.field])
      : (spec.item ? art.items : art.blocks)[spec.field]
    : undefined
  const real = face

  const namedStrip = (): string | undefined => {
    if (spec.stripFields) {
      const set = spec.stripFields.map((f) => art.blocks[f]).filter(Boolean)
      if (set.length > 1) return compositeTexture(set)
    }
    if (spec.stripField) {
      const source = art.blocks[spec.stripField]
      return source && spec.closeRim ? bakedTexture(source, { closeRim: true }) : source
    }
    return undefined
  }

  if (spec.withTop && spec.field && real) {
    const top = art.tops[spec.field]
    if (top) {
      return {
        texture: `${top}||${real}`,

        strip: namedStrip() ?? compositeTexture([top, real]),
        tint,
        item: spec.item,
        flat: spec.flat,
        scale: spec.scale
      }
    }
  }

  const size = real ? pngSize(real) : null
  const needsBake =
    !!real && (spec.colorized || spec.grid !== undefined || spec.flowRight || !size || size.h !== size.w)
  const texture = real
    ? needsBake
      ? bakedTexture(real, { grid: spec.grid, flowRight: spec.flowRight })
      : real
    : fallbackTexture(key, spec)
  if (!texture) return undefined
  return { texture, strip: namedStrip(), tint, item: spec.item, flat: spec.flat, scale: spec.scale }
}

export function useSwatch(key: string): Swatch | undefined {
  const art = useVanillaArt()
  const v = useSwatchVersion()

  return useMemo(() => swatchFor(key, art), [key, art, v])
}

export interface SwatchedOption {
  value: string
  label: string
  texture?: string
  item?: boolean
  flat?: boolean
  scale?: number

  strip?: string
  tint?: string
}

export function useSwatchedOptions(
  options: { value: string; label: string }[],

  keyOf?: (value: string) => string
): SwatchedOption[] {
  const art = useVanillaArt()
  const v = useSwatchVersion()

  const signature = options.map((o) => `${o.value}\u0000${o.label}`).join('\u0001')
  return useMemo(
    () =>
      options.map((o) => {
        const swatch = swatchFor(keyOf ? keyOf(o.value) : o.value, art)
        return {
          ...o,
          texture: swatch?.texture,
          strip: swatch?.strip,
          tint: swatch?.tint,
          item: swatch?.item,
          flat: swatch?.flat,
          scale: swatch?.scale
        }
      }),

    [signature, art, keyOf, v]
  )
}
