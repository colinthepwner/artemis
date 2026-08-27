export interface CropView {

  scale: number

  ox: number
  oy: number
}

export const MAX_ZOOM = 6

export function coverScale(imageW: number, imageH: number, size: number): number {
  if (imageW <= 0 || imageH <= 0 || size <= 0) return 1
  return Math.max(size / imageW, size / imageH)
}

export function clampView(view: CropView, imageW: number, imageH: number, size: number): CropView {
  const min = coverScale(imageW, imageH, size)
  const scale = Math.min(Math.max(view.scale, min), min * MAX_ZOOM)
  const w = imageW * scale
  const h = imageH * scale

  return {
    scale,
    ox: Math.min(0, Math.max(view.ox, size - w)),
    oy: Math.min(0, Math.max(view.oy, size - h))
  }
}

export function centeredView(imageW: number, imageH: number, size: number): CropView {
  const scale = coverScale(imageW, imageH, size)
  return clampView(
    { scale, ox: (size - imageW * scale) / 2, oy: (size - imageH * scale) / 2 },
    imageW,
    imageH,
    size
  )
}

export function zoomAt(
  view: CropView,
  factor: number,
  at: { x: number; y: number },
  imageW: number,
  imageH: number,
  size: number
): CropView {
  const next = clampView({ ...view, scale: view.scale * factor }, imageW, imageH, size)
  const actual = next.scale / view.scale
  return clampView(
    {
      scale: next.scale,
      ox: at.x - (at.x - view.ox) * actual,
      oy: at.y - (at.y - view.oy) * actual
    },
    imageW,
    imageH,
    size
  )
}

export function scaleView(view: CropView, from: number, to: number): CropView {
  const k = to / from
  return { scale: view.scale * k, ox: view.ox * k, oy: view.oy * k }
}
