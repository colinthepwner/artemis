export const FOLIAGE_TINTS = {
  grass: '#91bd59',
  oak: '#77ab2f',
  birch: '#80a755',
  cherry: '#ffcceb',
  eucalyptus: '#92be48',
  cacao: '#49a81f',
  pine: '#619961',
  shrub: '#80a754',
  thorn: '#b6b756',
  palm: '#b2e542',
  water: '#0098d6'
} as const

export type FoliageFamily = keyof typeof FOLIAGE_TINTS

export const TINTED_BLOCKS: Record<string, FoliageFamily> = {
  GRASS: 'grass',
  TALLGRASS: 'grass',
  TALLGRASS_FERN: 'grass',
  ALGAE: 'grass',

  MOSS_STONE: 'grass',
  MOSS_BASALT: 'grass',
  MOSS_LIMESTONE: 'grass',
  MOSS_GRANITE: 'grass',
  LEAVES_OAK: 'oak',
  LAYER_LEAVES_OAK: 'oak',
  LEAVES_BIRCH: 'birch',
  LEAVES_CHERRY: 'cherry',
  LEAVES_CHERRY_FLOWERING: 'cherry',
  LEAVES_EUCALYPTUS: 'eucalyptus',
  LEAVES_CACAO: 'cacao',
  LEAVES_PINE: 'pine',
  LEAVES_SHRUB: 'shrub',
  LEAVES_THORN: 'thorn',
  LEAVES_PALM: 'palm',
  FLUID_WATER_STILL: 'water',
  FLUID_WATER_FLOWING: 'water'
}

export function vanillaTint(field: string): string | undefined {
  const family = TINTED_BLOCKS[field]
  return family ? FOLIAGE_TINTS[family] : undefined
}

export function isColourless(px: Uint8ClampedArray | Uint8Array): boolean {
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] === 0) continue
    if (Math.abs(px[i] - px[i + 1]) > 10 || Math.abs(px[i + 1] - px[i + 2]) > 10) return false
  }
  return true
}

export function multiplyPixels(px: Uint8ClampedArray | Uint8Array, hex: string): void {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  for (let i = 0; i < px.length; i += 4) {
    px[i] = (px[i] * r) / 255
    px[i + 1] = (px[i + 1] * g) / 255
    px[i + 2] = (px[i + 2] * b) / 255
  }
}

export function tintTexture(src: string, hex: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onerror = () => resolve(src)
    img.onload = () => {
      if (!img.width || !img.height) return resolve(src)
      const canvas = document.createElement('canvas')
      canvas.width = img.width
      canvas.height = img.height
      const ctx = canvas.getContext('2d')
      if (!ctx) return resolve(src)
      ctx.imageSmoothingEnabled = false
      ctx.drawImage(img, 0, 0)
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height)
      if (!isColourless(data.data)) return resolve(src)
      multiplyPixels(data.data, hex)
      ctx.putImageData(data, 0, 0)
      resolve(canvas.toDataURL())
    }
    img.src = src
  })
}

export async function tintVanillaArt<
  T extends { blocks: Record<string, string>; tops: Record<string, string> }
>(art: T): Promise<T & { tints: Record<string, string> }> {
  const blocks = { ...art.blocks }
  const tops = { ...art.tops }
  const tints: Record<string, string> = {}
  await Promise.all(
    Object.keys(TINTED_BLOCKS).map(async (field) => {
      const hex = vanillaTint(field)
      if (!hex) return
      tints[field] = hex
      if (blocks[field]) blocks[field] = await tintTexture(blocks[field], hex)
      if (tops[field]) tops[field] = await tintTexture(tops[field], hex)
    })
  )
  return { ...art, blocks, tops, tints }
}
