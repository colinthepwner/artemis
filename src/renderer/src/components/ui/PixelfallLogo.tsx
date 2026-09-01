import { useCallback, useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { useAppStore } from '@/store/appStore'
import { cn } from '@/lib/cn'
import logoUrl from '@/assets/logo.png'
import pixelLogoUrl from '@/assets/logo-pixel.png'
import marbleGridUrl from '@/assets/logo-marble-grid.png'

export const SWAP_SECONDS = 1.4

const RISE = 0.45

const BOW_CELLS = 4

const DRIFT_CELLS = 22

const SCATTER = 0.06

const WASTE = 0.25

const ALPHA_FLOOR = 110

const GLOW_STEPS = 6
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => v / 16)

const MASK_EDGE = 0.14

const SHADOW = { y: 8, blur: 24, colour: 'rgba(0,0,0,0.45)' }

const SUPERSAMPLE = 4

const GLOW_BLUR_LOSS = { gold: 0.63, blue: 0.7 }

const GLOW = {
  gold: {
    rgb: [230, 173, 85] as const,
    radius: 0.8,
    alpha: [
      0.5 * 0.3 * GLOW_BLUR_LOSS.gold,
      0.5 * 0.55 * GLOW_BLUR_LOSS.gold
    ] as const,
    scale: [0.92, 1.08] as const,
    period: 6
  },
  blue: {
    rgb: [106, 174, 232] as const,
    radius: 0.62,
    alpha: [
      0.28 * 0.25 * GLOW_BLUR_LOSS.blue,
      0.28 * 0.45 * GLOW_BLUR_LOSS.blue
    ] as const,
    scale: [1.05, 0.95] as const,
    period: 7.5
  }
}

const MATCHED = 0

const SURPLUS = 1

const DEFICIT = 2

interface Morph {

  marble: HTMLImageElement

  w: number
  h: number

  gw: number
  gh: number

  ox: number
  oy: number

  cx: number
  cy: number

  n: number

  ax: Float32Array
  ay: Float32Array

  bx: Float32Array
  by: Float32Array

  ux: Float32Array
  uy: Float32Array

  delay: Float32Array
  kind: Uint8Array

  palette: string[]

  group: Uint32Array
}

function hash(x: number, y: number, salt: number): number {
  let n = Math.imul(x + salt, 374761393) + Math.imul(y - salt, 668265263)
  n = Math.imul(n ^ (n >>> 13), 1274126177)
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296
}

function falloff(d: number, radius: number): number {
  if (d >= radius) return 0
  const f = 1 - d / radius
  return f * f * (3 - 2 * f)
}

function breathe(t: number, period: number, from: number, to: number): number {
  const wave = 0.5 - 0.5 * Math.cos(((t % period) / period) * Math.PI * 2)
  return from + (to - from) * wave
}

function easeInOut(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2
}

function sample(img: HTMLImageElement, w: number, h: number): Uint8ClampedArray | null {
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, 0, 0, w, h)
  return ctx.getImageData(0, 0, w, h).data
}

function luma(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b
}

function buildMorph(
  pixelImg: HTMLImageElement,
  gridImg: HTMLImageElement,
  marbleImg: HTMLImageElement
): Morph | null {
  const pw = pixelImg.naturalWidth
  const ph = pixelImg.naturalHeight
  if (!pw || !ph) return null
  const pixels = sample(pixelImg, pw, ph)
  if (!pixels) return null

  let minX = pw
  let minY = ph
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < ph; y++) {
    for (let x = 0; x < pw; x++) {
      if (pixels[(y * pw + x) * 4 + 3] <= ALPHA_FLOOR) continue
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
  }
  if (maxX < 0) return null
  const w = maxX - minX + 1
  const h = maxY - minY + 1

  const targets = new Map<string, number[]>()
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const i = (y * pw + x) * 4
      if (pixels[i + 3] <= ALPHA_FLOOR) continue
      const key = `rgb(${pixels[i]},${pixels[i + 1]},${pixels[i + 2]})`
      const list = targets.get(key)
      if (list) list.push(x - minX, y - minY)
      else targets.set(key, [x - minX, y - minY])
    }
  }

  const palette = [...targets.keys()].sort((a, b) => {
    const pa = a.match(/\d+/g)
    const pb = b.match(/\d+/g)
    if (!pa || !pb) return 0
    return luma(+pa[0], +pa[1], +pa[2]) - luma(+pb[0], +pb[1], +pb[2])
  })
  const targetCells = palette.map((c) => targets.get(c) ?? [])
  const targetTotal = targetCells.reduce((sum, list) => sum + list.length / 2, 0)
  if (!targetTotal) return null

  const marble = sample(gridImg, w, h)
  if (!marble) return null
  const lit: number[] = []
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4
      if (marble[i + 3] <= ALPHA_FLOOR) continue
      lit.push(y * w + x)
    }
  }
  const key = (cell: number): number => {
    const i = cell * 4
    return luma(marble[i], marble[i + 1], marble[i + 2])
  }
  lit.sort((a, b) => key(a) - key(b))

  const bands: number[][] = []
  let cut = 0
  for (let g = 0; g < palette.length; g++) {
    const take =
      g === palette.length - 1
        ? lit.length - cut
        : Math.min(lit.length - cut, Math.round((targetCells[g].length / 2 / targetTotal) * lit.length))
    const band = lit.slice(cut, cut + take)

    band.sort((a, b) => a - b)
    bands.push(band)
    cut += take
  }

  let n = 0
  for (let g = 0; g < palette.length; g++) n += bands[g].length + targetCells[g].length / 2

  const ax = new Float32Array(n)
  const ay = new Float32Array(n)
  const bx = new Float32Array(n)
  const by = new Float32Array(n)
  const ux = new Float32Array(n)
  const uy = new Float32Array(n)
  const delay = new Float32Array(n)
  const kind = new Uint8Array(n)
  const group = new Uint32Array(palette.length + 1)

  const spanX = Math.max(1, w - 1)
  const spanY = Math.max(1, h - 1)
  let at = 0
  for (let g = 0; g < palette.length; g++) {
    group[g] = at
    const band = bands[g]
    const target = targetCells[g]
    const pairs = Math.max(band.length, target.length / 2)

    const emit = (flavour: number, ax0: number, ay0: number, bx0: number, by0: number): void => {
      if (flavour !== DEFICIT) {
        ax[at] = ax0
        ay[at] = ay0
      }
      if (flavour !== SURPLUS) {
        bx[at] = bx0
        by[at] = by0
      }
      kind[at] = flavour

      const sx = flavour === DEFICIT ? bx0 : ax0
      const sy = flavour === DEFICIT ? by0 : ay0

      const angle = hash(sx, sy, g * 31 + 7 + flavour * 977) * Math.PI * 2
      ux[at] = Math.cos(angle)
      uy[at] = Math.sin(angle)

      const front = (sx / spanX + sy / spanY) / 2 + (hash(sx, sy, 101) - 0.5) * SCATTER * 2
      delay[at] = Math.min(1, Math.max(0, front)) * (1 - RISE)
      at++
    }

    for (let k = 0; k < pairs; k++) {
      const hasA = k < band.length
      const hasB = k * 2 < target.length
      const ax0 = hasA ? band[k] % w : 0
      const ay0 = hasA ? (band[k] - (band[k] % w)) / w : 0
      const bx0 = hasB ? target[k * 2] : 0
      const by0 = hasB ? target[k * 2 + 1] : 0
      if (hasA && hasB && hash(k, g, 313) < WASTE) {

        emit(SURPLUS, ax0, ay0, 0, 0)
        emit(DEFICIT, 0, 0, bx0, by0)
      } else {
        emit(hasA && hasB ? MATCHED : hasA ? SURPLUS : DEFICIT, ax0, ay0, bx0, by0)
      }
    }
  }
  group[palette.length] = at

  const reach = Math.ceil(GLOW.gold.radius * Math.max(...GLOW.gold.scale) * h)
  const gw = Math.max(w, reach * 2)
  const gh = Math.max(h, reach * 2)
  const ox = Math.round((gw - w) / 2)
  const oy = Math.round((gh - h) / 2)

  return {
    marble: marbleImg,
    w,
    h,
    gw,
    gh,
    ox,
    oy,
    cx: ox + w / 2,
    cy: oy + h / 2,
    n: at,
    ax,
    ay,
    bx,
    by,
    ux,
    uy,
    delay,
    kind,
    palette,
    group
  }
}

let pending: Promise<Morph | null> | null = null

let resolved: Morph | null = null
let resolvedGlow: { canvas: HTMLCanvasElement; image: ImageData } | null = null

function glowFor(morph: Morph): { canvas: HTMLCanvasElement; image: ImageData } | null {
  if (resolvedGlow) return resolvedGlow
  const canvas = document.createElement('canvas')
  canvas.width = morph.gw
  canvas.height = morph.gh
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  resolvedGlow = { canvas, image: ctx.createImageData(morph.gw, morph.gh) }
  return resolvedGlow
}

function load(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = src
  })
}

function loadMorph(): Promise<Morph | null> {
  if (!pending) {
    pending = Promise.all([load(pixelLogoUrl), load(marbleGridUrl), load(logoUrl)])
      .then(([pixelImg, gridImg, marbleImg]) =>
        pixelImg && gridImg && marbleImg ? buildMorph(pixelImg, gridImg, marbleImg) : null
      )
      .then((morph) => {
        resolved = morph
        return morph
      })

      .catch((err) => {
        console.warn('[artemis] pixel logo unavailable:', err)
        return null
      })
  }
  return pending
}

export function PixelfallLogo(props: { revealed: boolean; className?: string }): JSX.Element {
  const reduceAnimations = useAppStore((s) => s.reduceAnimations)
  const pixel = useAppStore((s) => s.pixelLogo)
  const togglePixelLogo = useAppStore((s) => s.togglePixelLogo)

  const boxRef = useRef<HTMLButtonElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  const scaleRef = useRef(SUPERSAMPLE)

  const morphRef = useRef<Morph | null>(resolved)

  const glowRef = useRef<{ canvas: HTMLCanvasElement; image: ImageData } | null>(
    resolved ? glowFor(resolved) : null
  )

  const progressRef = useRef(pixel ? 1 : 0)
  const frameRef = useRef(0)

  const unitRef = useRef(SUPERSAMPLE)
  const [ready, setReady] = useState(resolved !== null)

  const [broken, setBroken] = useState(false)

  const paintGlow = useCallback((clock: number): HTMLCanvasElement | null => {
    const morph = morphRef.current
    const glow = glowRef.current
    if (!morph || !glow) return null
    const gctx = glow.canvas.getContext('2d')
    if (!gctx) return null

    const scale = morph.h
    const goldR = GLOW.gold.radius * scale * breathe(clock, GLOW.gold.period, ...GLOW.gold.scale)
    const blueR = GLOW.blue.radius * scale * breathe(clock, GLOW.blue.period, ...GLOW.blue.scale)
    const goldA = breathe(clock, GLOW.gold.period, ...GLOW.gold.alpha)
    const blueA = breathe(clock, GLOW.blue.period, ...GLOW.blue.alpha)
    const [gr, gg, gb] = GLOW.gold.rgb
    const [br, bg, bb] = GLOW.blue.rgb
    const outer = Math.max(goldR, blueR)

    const peak = blueA + goldA * (1 - blueA)

    const buf = glow.image.data
    buf.fill(0)
    for (let y = 0; y < morph.gh; y++) {
      const dy = y + 0.5 - morph.cy
      const half = outer * outer - dy * dy
      if (half <= 0) continue
      const span = Math.sqrt(half)
      const from = Math.max(0, Math.ceil(morph.cx - span - 0.5))
      const to = Math.min(morph.gw - 1, Math.floor(morph.cx + span - 0.5))
      for (let x = from; x <= to; x++) {
        const dx = x + 0.5 - morph.cx
        const d = Math.sqrt(dx * dx + dy * dy)
        const ga = falloff(d, goldR) * goldA
        const ba = falloff(d, blueR) * blueA
        if (ga <= 0 && ba <= 0) continue

        const raw = ba + ga * (1 - ba)
        const keep = ga * (1 - ba)

        const level = Math.floor((raw / peak) * GLOW_STEPS + BAYER[(y & 3) * 4 + (x & 3)])
        if (level <= 0) continue
        const a = (level / GLOW_STEPS) * peak
        const i = (y * morph.gw + x) * 4

        buf[i] = (br * ba + gr * keep) / raw
        buf[i + 1] = (bg * ba + gg * keep) / raw
        buf[i + 2] = (bb * ba + gb * keep) / raw
        buf[i + 3] = a * 255
      }
    }
    gctx.putImageData(glow.image, 0, 0)
    return glow.canvas
  }, [])

  const restore = useCallback((): void => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height)
  }, [])

  const erase = useCallback(
    (
      ctx: CanvasRenderingContext2D,
      p: number,
      x: number,
      y: number,
      w: number,
      h: number
    ): string | CanvasGradient | null => {
      const front = -MASK_EDGE / 2 + (1 + MASK_EDGE) * Math.min(1, p / (1 - RISE))

      if (front <= 0) return null
      if (front >= 1) return 'rgba(0,0,0,1)'

      const from = Math.max(0, front - MASK_EDGE / 2)
      const to = Math.min(1, front + MASK_EDGE / 2)
      const s = (2 * w * h) / (h * h + w * w)
      const g = ctx.createLinearGradient(x, y, x + s * h, y + s * w)
      g.addColorStop(from, 'rgba(0,0,0,1)')
      g.addColorStop(to, 'rgba(0,0,0,0)')
      return g
    },
    []
  )

  const draw = useCallback(
    (p: number, clock: number): void => {
      const canvas = canvasRef.current
      const morph = morphRef.current
      if (!canvas || !morph) return
      const ctx = canvas.getContext('2d')
      if (!ctx) return

      const cell = unitRef.current
      const scale = scaleRef.current
      ctx.globalCompositeOperation = 'source-over'
      ctx.globalAlpha = 1
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      const mh = morph.h * cell
      const mw = morph.marble.naturalHeight
        ? (mh * morph.marble.naturalWidth) / morph.marble.naturalHeight
        : morph.w * cell
      const mx = morph.cx * cell - mw / 2
      const my = morph.oy * cell
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'
      ctx.shadowColor = SHADOW.colour
      ctx.shadowOffsetY = SHADOW.y * scale
      ctx.shadowBlur = SHADOW.blur * scale
      ctx.drawImage(morph.marble, mx, my, mw, mh)
      ctx.shadowColor = 'transparent'
      ctx.shadowOffsetY = 0
      ctx.shadowBlur = 0

      if (p > 0) {

        const rub = erase(ctx, p, mx, my, mw, mh)
        if (rub) {
          ctx.globalCompositeOperation = 'destination-out'
          ctx.fillStyle = rub
          ctx.fillRect(0, 0, canvas.width, canvas.height)
        }

        const glow = paintGlow(clock)
        if (glow) {
          ctx.globalCompositeOperation = 'destination-over'

          ctx.globalAlpha = p * p
          ctx.imageSmoothingEnabled = false
          ctx.drawImage(glow, 0, 0, morph.gw, morph.gh, 0, 0, canvas.width, canvas.height)
          ctx.globalAlpha = 1
        }
        ctx.globalCompositeOperation = 'source-over'
      }

      if (p <= 0) return

      ctx.imageSmoothingEnabled = false

      const bow = BOW_CELLS * cell
      const drift = DRIFT_CELLS * cell

      for (let g = 0; g < morph.palette.length; g++) {
        ctx.fillStyle = morph.palette[g]
        const end = morph.group[g + 1]
        for (let i = morph.group[g]; i < end; i++) {
          const raw = (p - morph.delay[i]) / RISE
          const t = raw <= 0 ? 0 : raw >= 1 ? 1 : raw
          const flavour = morph.kind[i]

          if (t === 0) continue

          if (t === 1 && flavour !== SURPLUS) {
            ctx.globalAlpha = 1
            ctx.fillRect((morph.ox + morph.bx[i]) * cell, (morph.oy + morph.by[i]) * cell, cell, cell)
            continue
          }

          let x: number
          let y: number
          let alpha: number
          if (flavour === MATCHED) {
            const e = easeInOut(t)

            const off = Math.sin(Math.PI * t) * bow
            x = (morph.ox + morph.ax[i] + (morph.bx[i] - morph.ax[i]) * e) * cell + morph.ux[i] * off
            y = (morph.oy + morph.ay[i] + (morph.by[i] - morph.ay[i]) * e) * cell + morph.uy[i] * off
            alpha = 1
          } else if (flavour === SURPLUS) {

            x = (morph.ox + morph.ax[i]) * cell + morph.ux[i] * t * t * drift
            y = (morph.oy + morph.ay[i]) * cell + morph.uy[i] * t * t * drift
            alpha = 1 - t * t
          } else {

            const u = 1 - t
            x = (morph.ox + morph.bx[i]) * cell + morph.ux[i] * u * u * drift
            y = (morph.oy + morph.by[i]) * cell + morph.uy[i] * u * u * drift
            alpha = 1 - u * u
          }

          if (alpha <= 0) continue
          ctx.globalAlpha = alpha
          ctx.fillRect(Math.round(x), Math.round(y), cell, cell)
        }
      }
      ctx.globalAlpha = 1
    },
    [paintGlow, erase]
  )

  const layout = useCallback((): void => {
    const morph = morphRef.current
    const canvas = canvasRef.current
    const box = boxRef.current
    if (!morph || !canvas || !box) return
    const height = box.clientHeight
    if (height <= 0) return

    const dpr = window.devicePixelRatio || 1

    const target = (height * dpr) / morph.h

    const unit = Math.max(SUPERSAMPLE, Math.ceil(target))
    unitRef.current = unit

    canvas.width = morph.gw * unit
    canvas.height = morph.gh * unit
    canvas.style.width = `${(morph.gw * target) / dpr}px`
    canvas.style.height = `${(morph.gh * target) / dpr}px`

    canvas.style.transform = `translate3d(${(-morph.cx * target) / dpr}px, ${(-morph.cy * target) / dpr}px, 0)`

    scaleRef.current = (unit * dpr) / target

    draw(progressRef.current, performance.now() / 1000)
  }, [draw])

  useEffect(() => {
    let live = true

    if (resolved) {
      layout()
      return
    }
    void loadMorph().then((morph) => {
      if (!live || !morph) return
      const glow = glowFor(morph)
      if (!glow) return
      morphRef.current = morph
      glowRef.current = glow
      layout()
      setReady(true)
    })
    return () => {
      live = false
    }
  }, [layout])

  useEffect(() => {
    const box = boxRef.current
    if (!box) return
    const observer = new ResizeObserver(() => layout())
    observer.observe(box)
    return () => observer.disconnect()
  }, [layout])

  useEffect(() => {
    if (!ready) return
    const target = pixel ? 1 : 0

    if (reduceAnimations) {
      progressRef.current = target

      draw(target, 0)
      return
    }

    let last = performance.now()
    const step = (now: number): void => {

      const dt = Math.min(0.05, Math.max(0, (now - last) / 1000))
      last = now
      let p = progressRef.current
      if (p !== target) {
        const move = dt / SWAP_SECONDS
        p = target > p ? Math.min(target, p + move) : Math.max(target, p - move)

        progressRef.current = p = Math.min(1, Math.max(0, p))
      }
      try {
        draw(p, now / 1000)
      } catch (err) {

        console.warn('[artemis] pixel logo stopped:', err)
        progressRef.current = 0
        restore()
        setBroken(true)
        return
      }

      if (target > 0 || p > 0) frameRef.current = requestAnimationFrame(step)
    }
    frameRef.current = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frameRef.current)
  }, [pixel, ready, reduceAnimations, draw, restore])

  return (
    <motion.button
      ref={boxRef}
      type="button"

      onClick={ready && !broken ? togglePixelLogo : undefined}

      aria-label={pixel ? 'Artemis logo, currently pixel art' : 'Artemis logo'}
      aria-pressed={pixel}
      initial={{ opacity: 0, y: 8, scale: 0.96 }}
      animate={props.revealed ? { opacity: 1, y: 0, scale: 1 } : { opacity: 0, y: 8, scale: 0.96 }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      className={cn(

        'relative inline-flex cursor-pointer items-center justify-center overflow-visible',
        'rounded-md focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gold-400/60',
        props.className
      )}
    >
      <img
        src={logoUrl}
        alt=""
        draggable={false}

        style={{ opacity: ready && !broken ? 0 : 1 }}

        className="h-[clamp(5rem,17vh,11rem)] w-auto select-none drop-shadow-[0_8px_24px_rgba(0,0,0,0.45)]"
      />
      <canvas
        ref={canvasRef}
        aria-hidden

        className="pointer-events-none absolute left-1/2 top-1/2"
      />
    </motion.button>
  )
}
