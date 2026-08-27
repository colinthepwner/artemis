import { useEffect, useMemo, useRef, type ReactNode } from 'react'
import { parseKey } from './voxel'
import { refColor, shadeColor, useRefArt, type RefArt } from './refArt'
import { isOpaqueArt, useOpacityVersion } from './opacity'

const COS = Math.cos(Math.PI / 6)
const RISE = 0.5 * Math.sin(Math.PI / 6)
const YSCALE = Math.sqrt(1.5) / 2 + 0.25

interface Face {

  px: number
  py: number

  ux: number
  uy: number
  vx: number
  vy: number
  shade: number
  kind: 'top' | 'side'
}

function project(x: number, y: number, z: number): { px: number; py: number } {
  return { px: (x - z) * COS, py: (x + z) * RISE - y * YSCALE }
}

function facesFor(
  cells: { x: number; y: number; z: number; ref: string }[],
  solid: (ref: string) => boolean
): (Face & { ref: string })[] {
  const filled = new Map(cells.map((c) => [`${c.x},${c.y},${c.z}`, c.ref]))
  const has = (x: number, y: number, z: number): boolean => {
    const ref = filled.get(`${x},${y},${z}`)
    return ref !== undefined && solid(ref)
  }

  const sorted = [...cells].sort((a, b) => a.x + a.z - (b.x + b.z) || a.y - b.y)

  const out: (Face & { ref: string })[] = []
  for (const c of sorted) {
    const { x, y, z, ref } = c
    if (!has(x, y + 1, z)) {
      const o = project(x - 0.5, y + 0.5, z + 0.5)
      const ex = project(x + 0.5, y + 0.5, z + 0.5)
      const ez = project(x - 0.5, y + 0.5, z - 0.5)
      out.push({ ref, kind: 'top', shade: 1, px: o.px, py: o.py, ux: ex.px - o.px, uy: ex.py - o.py, vx: ez.px - o.px, vy: ez.py - o.py })
    }
    if (!has(x + 1, y, z)) {
      const o = project(x + 0.5, y + 0.5, z + 0.5)
      const ez = project(x + 0.5, y + 0.5, z - 0.5)
      const ey = project(x + 0.5, y - 0.5, z + 0.5)
      out.push({ ref, kind: 'side', shade: 0.8, px: o.px, py: o.py, ux: ez.px - o.px, uy: ez.py - o.py, vx: ey.px - o.px, vy: ey.py - o.py })
    }
    if (!has(x, y, z + 1)) {
      const o = project(x - 0.5, y + 0.5, z + 0.5)
      const ex = project(x + 0.5, y + 0.5, z + 0.5)
      const ey = project(x - 0.5, y - 0.5, z + 0.5)
      out.push({ ref, kind: 'side', shade: 0.6, px: o.px, py: o.py, ux: ex.px - o.px, uy: ex.py - o.py, vx: ey.px - o.px, vy: ey.py - o.py })
    }
  }
  return out
}

const imageCache = new Map<string, HTMLImageElement>()
function loadImage(src: string): Promise<HTMLImageElement> {
  const hit = imageCache.get(src)
  if (hit) {
    return hit.complete ? Promise.resolve(hit) : new Promise((res) => hit.addEventListener('load', () => res(hit)))
  }
  const img = new Image()
  img.src = src
  imageCache.set(src, img)
  return new Promise((resolve) => {
    img.onload = () => resolve(img)
    img.onerror = () => resolve(img)
  })
}

export function VoxelSprite(props: {
  blocks: Record<string, string>
  size: number

  maxCells?: number

  fallback?: ReactNode
}): JSX.Element | null {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const refArt = useRefArt()

  const opacity = useOpacityVersion()

  const cells = useMemo(
    () =>
      Object.entries(props.blocks).map(([key, ref]) => {
        const { x, y, z } = parseKey(key)
        return { x, y, z, ref }
      }),
    [props.blocks]
  )

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || cells.length === 0) return
    let live = true

    const art = new Map<string, RefArt>()
    for (const c of cells) if (!art.has(c.ref)) art.set(c.ref, refArt(c.ref))
    const sources = [...new Set([...art.values()].flatMap((a) => [a.top, a.side].filter((s): s is string => !!s)))]

    void Promise.all(sources.map(loadImage)).then((imgs) => {
      if (!live) return
      const bySrc = new Map(sources.map((s, i) => [s, imgs[i]]))

      const faces = facesFor(cells, (ref) => isOpaqueArt(art.get(ref)))

      let minX = Infinity
      let maxX = -Infinity
      let minY = Infinity
      let maxY = -Infinity
      for (const f of faces) {
        for (const [px, py] of [
          [f.px, f.py],
          [f.px + f.ux, f.py + f.uy],
          [f.px + f.vx, f.py + f.vy],
          [f.px + f.ux + f.vx, f.py + f.uy + f.vy]
        ]) {
          minX = Math.min(minX, px)
          maxX = Math.max(maxX, px)
          minY = Math.min(minY, py)
          maxY = Math.max(maxY, py)
        }
      }
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      const box = props.size * dpr
      const cube = (box * 0.94) / Math.max(maxX - minX, maxY - minY, 1)
      const offX = (box - (maxX - minX) * cube) / 2 - minX * cube
      const offY = (box - (maxY - minY) * cube) / 2 - minY * cube

      canvas.width = box
      canvas.height = box
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.imageSmoothingEnabled = false
      for (const f of faces) {
        const a = art.get(f.ref)!
        const src = f.kind === 'top' ? a.top : a.side
        const img = src ? bySrc.get(src) : undefined
        ctx.setTransform(f.ux * cube, f.uy * cube, f.vx * cube, f.vy * cube, offX + f.px * cube, offY + f.py * cube)
        if (img && img.naturalWidth > 0) {
          ctx.filter = f.shade === 1 ? 'none' : `brightness(${f.shade})`
          ctx.drawImage(img, 0, 0, img.naturalWidth, img.naturalHeight, 0, 0, 1, 1)
          ctx.filter = 'none'
        } else {
          ctx.fillStyle = shadeColor(a.color || refColor(f.ref), f.shade)
          ctx.fillRect(0, 0, 1, 1)
        }
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0)
    })

    return () => {
      live = false
    }
  }, [cells, refArt, props.size, opacity])

  if (cells.length === 0 || cells.length > (props.maxCells ?? 4000)) {
    return <>{props.fallback ?? null}</>
  }
  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none"
      style={{ width: props.size, height: props.size, imageRendering: 'pixelated' }}
    />
  )
}
