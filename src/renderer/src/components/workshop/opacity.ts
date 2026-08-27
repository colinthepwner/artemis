import { useSyncExternalStore } from 'react'

const answers = new Map<string, boolean>()
const reading = new Set<string>()
const listeners = new Set<() => void>()
let version = 0

function settle(src: string, opaque: boolean): void {
  answers.set(src, opaque)
  reading.delete(src)
  version++
  listeners.forEach((l) => l())
}

export function isOpaqueTexture(src: string): boolean {
  const known = answers.get(src)
  if (known !== undefined) return known
  if (!reading.has(src)) {
    reading.add(src)
    const img = new Image()
    img.onerror = () => settle(src, true)
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas')
        canvas.width = img.naturalWidth
        canvas.height = img.naturalHeight
        const ctx = canvas.getContext('2d')
        if (!ctx || !canvas.width || !canvas.height) return settle(src, true)
        ctx.drawImage(img, 0, 0)
        const px = ctx.getImageData(0, 0, canvas.width, canvas.height).data
        for (let i = 3; i < px.length; i += 4) {
          if (px[i] < 255) return settle(src, false)
        }
        settle(src, true)
      } catch {
        settle(src, true)
      }
    }
    img.src = src
  }
  return true
}

export function isOpaqueArt(art: { top?: string; side?: string } | undefined): boolean {
  if (!art) return true
  return [art.top, art.side].every((src) => !src || isOpaqueTexture(src))
}

export function useOpacityVersion(): number {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => version,
    () => version
  )
}
