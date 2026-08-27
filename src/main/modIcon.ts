import { nativeImage } from 'electron'
import type { ArtemisProject } from '../shared/project'
import { ICON_SIZE, pickIcon } from '../shared/iconPick'

function pixelsOf(dataUrl: string): Uint8Array | null {
  try {
    const image = nativeImage.createFromDataURL(dataUrl)
    if (image.isEmpty()) return null

    const bgra = image.toBitmap()
    const rgba = new Uint8Array(bgra.length)
    for (let i = 0; i < bgra.length; i += 4) {
      rgba[i] = bgra[i + 2]
      rgba[i + 1] = bgra[i + 1]
      rgba[i + 2] = bgra[i]
      rgba[i + 3] = bgra[i + 3]
    }
    return rgba
  } catch {
    return null
  }
}

export interface ChosenIcon {

  png: Buffer

  source: 'uploaded' | 'texture'

  textureName?: string
}

export function chooseModIcon(project: ArtemisProject): ChosenIcon | null {
  const uploaded = project.meta.icon?.trim()
  if (uploaded) {
    const image = nativeImage.createFromDataURL(uploaded)
    if (!image.isEmpty()) return { png: image.toPNG(), source: 'uploaded' }
  }

  const textures = project.textures ?? []
  const candidates = textures
    .map((t) => ({ id: t.id, rgba: pixelsOf(t.data) }))
    .filter((c): c is { id: string; rgba: Uint8Array } => c.rgba !== null)
  const best = pickIcon(candidates)
  if (!best) return null

  const texture = textures.find((t) => t.id === best.id)
  if (!texture) return null
  const image = nativeImage.createFromDataURL(texture.data)
  if (image.isEmpty()) return null
  const { width, height } = image.getSize()
  if (width <= 0 || height <= 0) return null
  const scaled = nativeImage.createFromBitmap(
    upscaleNearest(image.toBitmap(), width, height, ICON_SIZE),
    { width: ICON_SIZE, height: ICON_SIZE }
  )
  return { png: scaled.toPNG(), source: 'texture', textureName: texture.name }
}

function upscaleNearest(src: Buffer, width: number, height: number, size: number): Buffer {
  const out = Buffer.alloc(size * size * 4)
  for (let y = 0; y < size; y++) {
    const sy = Math.min(height - 1, Math.floor((y * height) / size))
    for (let x = 0; x < size; x++) {
      const sx = Math.min(width - 1, Math.floor((x * width) / size))
      src.copy(out, (y * size + x) * 4, (sy * width + sx) * 4, (sy * width + sx) * 4 + 4)
    }
  }
  return out
}
