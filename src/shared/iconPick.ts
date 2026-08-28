export const ICON_SIZE = 128

const BRIGHTNESS_WEIGHT = 0.5
const COLOR_WEIGHT = 0.3
const VARIETY_WEIGHT = 0.2

const VARIETY_BITS = 3

const ALPHA_FLOOR = 8

export interface IconScore {

  coverage: number

  brightness: number

  color: number

  variety: number

  score: number
}

export function scoreIcon(rgba: Uint8Array | Uint8ClampedArray): IconScore {
  const empty: IconScore = { coverage: 0, brightness: 0, color: 0, variety: 0, score: 0 }
  const pixels = Math.floor(rgba.length / 4)
  if (pixels === 0) return empty

  let painted = 0
  let luminance = 0
  let chroma = 0
  const seen = new Set<number>()
  const shift = 8 - VARIETY_BITS

  for (let i = 0; i < rgba.length; i += 4) {
    if (rgba[i + 3] < ALPHA_FLOOR) continue
    const r = rgba[i]
    const g = rgba[i + 1]
    const b = rgba[i + 2]
    painted++

    luminance += (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
    chroma += (Math.max(r, g, b) - Math.min(r, g, b)) / 255
    seen.add(((r >> shift) << (VARIETY_BITS * 2)) | ((g >> shift) << VARIETY_BITS) | (b >> shift))
  }
  if (painted === 0) return empty

  const coverage = painted / pixels
  const brightness = luminance / painted
  const color = chroma / painted

  const variety = Math.min(1, seen.size / painted)
  return {
    coverage,
    brightness,
    color,
    variety,
    score:
      coverage *
      (BRIGHTNESS_WEIGHT * brightness + COLOR_WEIGHT * color + VARIETY_WEIGHT * variety)
  }
}

export interface IconCandidate {

  id: string
  rgba: Uint8Array | Uint8ClampedArray
}

export function pickIcon(candidates: IconCandidate[]): { id: string; score: IconScore } | null {
  let best: { id: string; score: IconScore } | null = null
  for (const c of candidates) {
    const score = scoreIcon(c.rgba)
    if (score.score <= 0) continue
    if (
      !best ||
      score.score > best.score.score ||
      (score.score === best.score.score && c.id < best.id)
    ) {
      best = { id: c.id, score }
    }
  }
  return best
}
