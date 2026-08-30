import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import * as ContextMenu from '@radix-ui/react-context-menu'
import {
  ArrowDown,
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Check,
  ArrowLeftRight,
  ChevronDown,
  ChevronUp,
  ClipboardCopy,
  Copy,
  Download,
  ImageDown,
  SquareDashed,
  Droplet,
  Eraser,
  Eye,
  EyeOff,
  FlipHorizontal,
  FlipHorizontal2,
  FlipVertical,
  Grid3x3,
  LayoutGrid,
  Layers,
  Moon,
  PaintBucket,
  Pencil,
  Pipette,
  Plus,
  Redo2,
  RotateCw,
  Slash,
  Sparkles,
  Square,
  Stamp,
  Sun,
  SunMedium,
  Trash2,
  Undo2,
  X,
  type LucideIcon
} from 'lucide-react'
import { useAppStore } from '@/store/appStore'
import { useFirstVisit } from '@/components/tutorial/useFirstVisit'
import { useAttention } from '@/components/ui/attention'
import { menuOwnsKeyboard } from '@/components/ui/dismissDistant'
import { TITLEBAR_UNSCALE } from '@shared/ui'
import { isSolidKind } from '@/components/ui/ContentThumb'
import { textureSlotsFor } from '@shared/generator/textures'
import { useProjectStore } from '@/store/projectStore'
import {
  PIXEL_PALETTE,
  blendColors,
  rgbaToDataUrl,
  gridToDataUrl,
  dataUrlToGrid,
  shade,
  type Grid
} from './presets'
import { resolveTextureName, type TextureLayer } from '@shared/project'
import { PresetPicker, type PresetPick } from './PresetPicker'
import { StencilDialog, type StencilApplyOptions } from './StencilDialog'
import type { Stencil, StencilResult } from './stencils'
import { bakeLighting, compositeLayers, mergePair, DEFAULT_FX, type PixelFx } from './effects'
import { GlideList } from '@/components/ui/glide'
import { cn } from '@/lib/cn'

type Tool =
  | 'pencil'
  | 'eraser'
  | 'fill'
  | 'line'
  | 'rect'
  | 'select'
  | 'eyedropper'
  | 'lighten'
  | 'darken'
  | 'noise'
  | 'smooth'

const CELL = 22
const PAD = 28
const EMPTY: Grid = Array(256).fill('')
const MAX_LAYERS = 6

const TRANSPARENT = ''

const CHECKER = {
  backgroundImage: 'repeating-conic-gradient(#31363e 0% 25%, #262b32 0% 50%)',
  backgroundSize: '8px 8px'
} as const

const FX_IDLE_MS = 1500

export interface Marquee {
  left: number
  top: number
  w: number
  h: number

  lifted: string[] | null

  dx: number
  dy: number
}

export function undoDropsTheCarry(m: Marquee | null): boolean {
  return !!m?.lifted && (m.dx !== 0 || m.dy !== 0)
}

export function rectBetween(a: number, b: number): { left: number; top: number; w: number; h: number } {
  const [ax, ay] = xy(a)
  const [bx, by] = xy(b)
  return {
    left: Math.min(ax, bx),
    top: Math.min(ay, by),
    w: Math.abs(ax - bx) + 1,
    h: Math.abs(ay - by) + 1
  }
}

export function insideMarquee(m: Marquee, idx: number): boolean {
  const [x, y] = xy(idx)
  const left = m.left + m.dx
  const top = m.top + m.dy
  return x >= left && x < left + m.w && y >= top && y < top + m.h
}

export function liftFrom(g: Grid, m: Marquee): string[] {
  const out: string[] = []
  for (let y = 0; y < m.h; y++) {
    for (let x = 0; x < m.w; x++) {
      const sx = m.left + x
      const sy = m.top + y
      out.push(sx >= 0 && sx < 16 && sy >= 0 && sy < 16 ? g[sy * 16 + sx] : '')
    }
  }
  return out
}

export function withMarquee(g: Grid, m: Marquee): Grid {
  if (!m.lifted) return g
  const next = [...g]
  for (let y = 0; y < m.h; y++) {
    for (let x = 0; x < m.w; x++) {
      const sx = m.left + x
      const sy = m.top + y
      if (sx >= 0 && sx < 16 && sy >= 0 && sy < 16) next[sy * 16 + sx] = ''
    }
  }
  for (let y = 0; y < m.h; y++) {
    for (let x = 0; x < m.w; x++) {
      const c = m.lifted[y * m.w + x]
      if (!c) continue
      const tx = m.left + m.dx + x
      const ty = m.top + m.dy + y
      if (tx < 0 || tx > 15 || ty < 0 || ty > 15) continue
      next[ty * 16 + tx] = c
    }
  }
  return next
}

const SHAPE_TOOLS: Tool[] = ['line', 'rect']

const ADJUST_TOOLS: Tool[] = ['lighten', 'darken', 'noise', 'smooth']

const NOISE_RANGE = 0.9

function noiseFactor(strength: number): number {
  return 1 + (Math.random() - 0.5) * NOISE_RANGE * (strength / 100)
}

const xy = (i: number): [number, number] => [i % 16, Math.floor(i / 16)]
const mirrorOf = (i: number): number => {
  const [x, y] = xy(i)
  return y * 16 + (15 - x)
}

const STANDING = Math.sqrt(1.5)
const CUBE_ASPECT = (1 + STANDING) / 2

function drawIsoBlock(ctx: CanvasRenderingContext2D, src: CanvasImageSource, size: number): void {
  const w = size / CUBE_ASPECT
  const f = w / 2
  const th = w / 4
  const ox = (size - w) / 2
  const face = (m: [number, number, number, number, number, number], bright: number): void => {
    ctx.save()
    ctx.setTransform(...m)
    ctx.imageSmoothingEnabled = false
    ctx.filter = bright === 1 ? 'none' : `brightness(${bright})`
    ctx.drawImage(src, 0, 0, f, f)
    ctx.restore()
  }
  face([1, 0.5, 0, STANDING, ox, th], 0.8)
  face([1, -0.5, 0, STANDING, ox + f, 2 * th], 0.6)

  face([1, -0.5, 1, 0.5, ox, th], 1)
}

function lineCells(a: number, b: number): number[] {
  let [x0, y0] = xy(a)
  const [x1, y1] = xy(b)
  const dx = Math.abs(x1 - x0)
  const dy = -Math.abs(y1 - y0)
  const sx = x0 < x1 ? 1 : -1
  const sy = y0 < y1 ? 1 : -1
  let err = dx + dy
  const out: number[] = []
  for (;;) {
    out.push(y0 * 16 + x0)
    if (x0 === x1 && y0 === y1) break
    const e2 = 2 * err
    if (e2 >= dy) (err += dy), (x0 += sx)
    if (e2 <= dx) (err += dx), (y0 += sy)
  }
  return out
}

function rectCells(a: number, b: number, filled: boolean): number[] {
  const [ax, ay] = xy(a)
  const [bx, by] = xy(b)
  const x0 = Math.min(ax, bx)
  const x1 = Math.max(ax, bx)
  const y0 = Math.min(ay, by)
  const y1 = Math.max(ay, by)
  const out: number[] = []
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (filled || x === x0 || x === x1 || y === y0 || y === y1) out.push(y * 16 + x)
    }
  }
  return out
}

function shiftGrid(g: Grid, dx: number, dy: number): Grid {
  const out = EMPTY.slice()
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      out[((y + dy + 16) % 16) * 16 + ((x + dx + 16) % 16)] = g[y * 16 + x]
    }
  }
  return out
}

function neighbors(g: Grid, i: number): string[] {
  const [x, y] = xy(i)
  const out: string[] = []
  if (x > 0 && g[i - 1]) out.push(g[i - 1])
  if (x < 15 && g[i + 1]) out.push(g[i + 1])
  if (y > 0 && g[i - 16]) out.push(g[i - 16])
  if (y < 15 && g[i + 16]) out.push(g[i + 16])
  return out
}

const flipHGrid = (g: Grid): Grid => g.map((_, i) => g[mirrorOf(i)])
const flipVGrid = (g: Grid): Grid =>
  g.map((_, i) => {
    const [x, y] = xy(i)
    return g[(15 - y) * 16 + x]
  })
const rotateGrid = (g: Grid): Grid =>
  g.map((_, i) => {
    const [x, y] = xy(i)
    return g[(15 - x) * 16 + y]
  })

interface Layer {
  id: string
  name: string
  visible: boolean

  opacity: number

  hue: number
  saturation: number
  brightness: number

  emissive: boolean
  grid: Grid
}

const makeLayer = (name: string, grid: Grid = EMPTY): Layer => ({
  id: crypto.randomUUID(),
  name,
  visible: true,
  opacity: 100,
  hue: 0,
  saturation: 0,
  brightness: 0,
  emissive: false,
  grid
})

const snapshot = (layers: Layer[]): Layer[] => layers.map((l) => ({ ...l, grid: [...l.grid] }))

function sameStack(a: Layer[], b: Layer[]): boolean {
  if (a.length !== b.length) return false
  return a.every((l, i) => {
    const o = b[i]
    return (
      l.name === o.name &&
      l.visible === o.visible &&
      l.opacity === o.opacity &&
      l.hue === o.hue &&
      l.saturation === o.saturation &&
      l.brightness === o.brightness &&
      l.grid.length === o.grid.length &&
      l.grid.every((px, j) => px === o.grid[j])
    )
  })
}

export function PixelEditorOverlay(): JSX.Element | null {
  const editorState = useAppStore((s) => s.textureEditor)
  if (!editorState) return null

  return <PixelEditor key={editorState.textureId ?? 'new'} />
}

function PixelEditor(): JSX.Element {

  useFirstVisit('pixel')
  const { textureId, assignSlotAfter, kind, suggestedName } = useAppStore((s) => s.textureEditor)!
  const close = useAppStore((s) => s.closeTextureEditor)
  const addTexture = useProjectStore((s) => s.addTexture)
  const updateTexture = useProjectStore((s) => s.updateTexture)
  const assignTexture = useProjectStore((s) => s.assignTexture)
  const allTextures = useProjectStore((s) => s.project?.textures)
  const project = useProjectStore((s) => s.project)
  const existing = useProjectStore((s) =>
    textureId ? s.project?.textures.find((t) => t.id === textureId) : undefined
  )

  const previewAsCube = useMemo(() => {
    const fallback = (existing?.kind ?? kind ?? 'block') === 'block'
    if (!project) return fallback
    const slotKey =
      assignSlotAfter ??
      (textureId
        ? Object.entries(project.textureAssignments).find(([, id]) => id === textureId)?.[0]
        : undefined)
    if (!slotKey) return fallback
    const slot = textureSlotsFor(project).find((sl) => sl.key === slotKey)
    const owner = slot && project.elements.find((e) => e.id === slot.elementId)
    return owner ? isSolidKind(owner.kind) : fallback
  }, [project, assignSlotAfter, textureId, existing?.kind, kind])

  const [layers, setLayers] = useState<Layer[]>(() => [makeLayer('Background')])
  const [activeId, setActiveId] = useState(() => layers[0].id)
  const [name, setName] = useState(existing?.name ?? suggestedName ?? '')

  const [primary, setPrimary] = useState('#7d7d7d')
  const [secondary, setSecondary] = useState<string>(TRANSPARENT)
  const swapColors = useCallback((): void => {
    setPrimary(secondary)
    setSecondary(primary)
  }, [primary, secondary])
  const [accent, setAccent] = useState('#d85555')
  const [tool, setTool] = useState<Tool>('pencil')
  const [mirror, setMirror] = useState(false)
  const [fx, setFx] = useState<PixelFx>(DEFAULT_FX)

  const showChecker = useAppStore((s) => s.showCheckerGrid)
  const setShowChecker = useAppStore((s) => s.setShowCheckerGrid)

  const [noise, setNoise] = useState(0)
  const NOISE_MAP = useMemo(() => Array.from({ length: 256 }, () => Math.random() - 0.5), [])

  const [fxHeldBy, setFxHeldBy] = useState<string[]>([])
  const holdFx = useCallback((who: string, held: boolean): void => {
    setFxHeldBy((list) =>
      held ? (list.includes(who) ? list : [...list, who]) : list.filter((w) => w !== who)
    )
  }, [])

  useEffect(() => {
    if (fxHeldBy.length) return
    if (noise === 0 && !fx.light.enabled) return
    const t = setTimeout(() => {
      setNoise(0)
      setFx((f) => ({ ...f, light: { ...f.light, enabled: false, strength: 0 } }))
    }, FX_IDLE_MS)
    return () => clearTimeout(t)
  }, [fxHeldBy, noise, fx.light.enabled, fx.light.strength])
  const [hover, setHover] = useState<number | null>(null)
  const [shapePreview, setShapePreview] = useState<number[] | null>(null)
  const [presetOpen, setPresetOpen] = useState(false)
  const [stencilOpen, setStencilOpen] = useState(false)
  const undoStack = useRef<Layer[][]>([])
  const redoStack = useRef<Layer[][]>([])
  const strokeActive = useRef(false)

  const strokeInk = useRef<string>(TRANSPARENT)
  const strokeTouched = useRef<Set<number>>(new Set())
  const lastCell = useRef<number | null>(null)
  const shapeAnchor = useRef<number | null>(null)
  const shapeCellsRef = useRef<number[]>([])

  const [marquee, setMarquee] = useState<Marquee | null>(null)

  const marqueeRef = useRef<Marquee | null>(null)
  marqueeRef.current = marquee

  const marqueeAnchor = useRef<number | null>(null)

  const moveFrom = useRef<{ cell: number; dx: number; dy: number } | null>(null)

  const cancelMarquee = useCallback((): void => {
    setMarquee(null)
    marqueeAnchor.current = null
    moveFrom.current = null
  }, [])

  const active = layers.find((l) => l.id === activeId) ?? layers[0]

  const activeGridRef = useRef<Grid>(active.grid)
  activeGridRef.current = active.grid

  const opened = useRef<{ name: string; layers: Layer[] } | null>(null)

  useEffect(() => {

    const settle = (ls: Layer[]): void => {
      opened.current = { name: existing?.name ?? suggestedName ?? '', layers: snapshot(ls) }
    }
    if (existing?.layers?.length) {
      const saved = existing.layers
      void Promise.all(saved.map((l) => dataUrlToGrid(l.data))).then((grids) => {
        const restored = saved.map((l, i) => ({
          ...makeLayer(l.name, grids[i]),
          visible: l.visible,
          opacity: l.opacity,
          hue: l.hue,
          saturation: l.saturation,
          brightness: l.brightness,

          emissive: l.emissive ?? false
        }))
        settle(restored)
        setLayers(restored)
        setActiveId(restored[0].id)
      })
      return
    }
    if (existing?.data) {
      void dataUrlToGrid(existing.data).then((g) => {

        const next = layers.map((l, i) => (i === 0 ? { ...l, grid: g } : l))
        settle(next)
        setLayers(next)
      })
      return
    }

    settle(layers)

  }, [])

  const layersRef = useRef(layers)
  useEffect(() => {
    layersRef.current = layers
  }, [layers])

  const pushUndo = useCallback(() => {
    undoStack.current.push(snapshot(layersRef.current))
    if (undoStack.current.length > 64) undoStack.current.shift()
    redoStack.current = []
  }, [])

  const restore = useCallback((next: Layer[]) => {
    layersRef.current = next
    setLayers(next)
    setActiveId((id) => (next.some((l) => l.id === id) ? id : next[next.length - 1].id))
  }, [])

  const undo = useCallback(() => {
    const floating = marqueeRef.current
    cancelMarquee()
    if (undoDropsTheCarry(floating)) return
    const prev = undoStack.current.pop()
    if (!prev) return
    redoStack.current.push(snapshot(layersRef.current))
    restore(prev)
  }, [restore, cancelMarquee])

  const redo = useCallback(() => {

    cancelMarquee()
    const next = redoStack.current.pop()
    if (!next) return
    undoStack.current.push(snapshot(layersRef.current))
    restore(next)
  }, [restore, cancelMarquee])

  const activeLayerId = active.id
  const setActiveGrid = useCallback(
    (fn: (g: Grid) => Grid) => {
      setLayers((ls) => ls.map((l) => (l.id === activeLayerId ? { ...l, grid: fn(l.grid) } : l)))
    },
    [activeLayerId]
  )

  const clearActive = useCallback(() => {
    pushUndo()
    setActiveGrid(() => EMPTY.slice())
  }, [pushUndo, setActiveGrid])

  const commitMarquee = useCallback((): void => {
    const m = marqueeRef.current
    setMarquee(null)
    marqueeAnchor.current = null
    moveFrom.current = null
    if (!m?.lifted || (m.dx === 0 && m.dy === 0)) return
    pushUndo()
    setActiveGrid((g) => withMarquee(g, m))
  }, [pushUndo, setActiveGrid])

  const nudgeMarquee = useCallback(
    (ddx: number, ddy: number): void => {
      setMarquee((m) => {
        if (!m) return m
        const lifted = m.lifted ?? liftFrom(activeGridRef.current, m)
        return { ...m, lifted, dx: m.dx + ddx, dy: m.dy + ddy }
      })
    },
    []
  )

  const transform = useCallback(
    (fn: (g: Grid) => Grid) => {
      pushUndo()
      setActiveGrid(fn)
    },
    [pushUndo, setActiveGrid]
  )

  useEffect(() => {
    if (tool !== 'select' && marqueeRef.current) commitMarquee()
  }, [tool, commitMarquee])

  useEffect(() => {
    const TOOL_KEYS: Record<string, Tool> = {
      b: 'pencil',
      e: 'eraser',
      f: 'fill',
      l: 'line',
      r: 'rect',
      i: 'eyedropper',
      m: 'select',
      u: 'lighten',
      d: 'darken',
      n: 'noise',
      s: 'smooth'
    }
    const onKey = (e: KeyboardEvent): void => {

      if (presetOpen || stencilOpen) return

      if (menuOwnsKeyboard()) return
      const el = e.target as HTMLElement | null
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) return
      const key = e.key.toLowerCase()
      if ((e.ctrlKey || e.metaKey) && key === 'z') {
        e.preventDefault()

        return e.shiftKey ? redo() : undo()
      }
      if ((e.ctrlKey || e.metaKey) && key === 'y') return (e.preventDefault(), redo())
      if (e.ctrlKey || e.metaKey || e.altKey) return
      if (e.key === 'Escape') {

        if (marqueeRef.current) return cancelMarquee()
        if (shapeAnchor.current !== null) {
          shapeAnchor.current = null
          setShapePreview(null)
          return
        }
        return close()
      }
      if (e.key === 'Enter' && marqueeRef.current) {
        e.preventDefault()
        return commitMarquee()
      }

      const NUDGE: Record<string, [number, number]> = {
        ArrowUp: [0, -1],
        ArrowDown: [0, 1],
        ArrowLeft: [-1, 0],
        ArrowRight: [1, 0]
      }
      const nudge = NUDGE[e.key]
      if (nudge) {
        e.preventDefault()
        if (marqueeRef.current) return nudgeMarquee(nudge[0], nudge[1])
        return transform((g) => shiftGrid(g, nudge[0], nudge[1]))
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {

        const m = marqueeRef.current
        if (m) {

          pushUndo()
          setActiveGrid((g) => g.map((c, i) => (insideMarquee({ ...m, dx: 0, dy: 0 }, i) ? '' : c)))
          return cancelMarquee()
        }
        return clearActive()
      }
      const k = e.key.toLowerCase()

      if (k === 'x') return e.shiftKey ? swapColors() : setMirror((m) => !m)
      if (TOOL_KEYS[k]) return setTool(TOOL_KEYS[k])
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [undo, redo, close, transform, clearActive, swapColors, commitMarquee, cancelMarquee, nudgeMarquee, pushUndo, setActiveGrid, presetOpen, stencilOpen])

  const withMirror = useCallback(
    (cells: number[]): number[] => {
      if (!mirror) return cells
      const out = new Set(cells)
      for (const c of cells) out.add(mirrorOf(c))
      return [...out]
    },
    [mirror]
  )

  const inkFor = (rightButton: boolean): string =>
    tool === 'eraser' ? TRANSPARENT : rightButton ? secondary : primary

  const paintCells = (cells: number[]): void => {
    const expanded = withMirror(cells)

    if (ADJUST_TOOLS.includes(tool)) {
      const fresh = expanded.filter((i) => !strokeTouched.current.has(i))
      if (!fresh.length) return
      const factors = new Map<number, number>()
      for (const i of fresh) {
        strokeTouched.current.add(i)
        factors.set(
          i,
          tool === 'noise' ? noiseFactor(45) : tool === 'lighten' ? 1.16 : 0.86
        )
      }
      setActiveGrid((g) => {
        let next: Grid | null = null
        for (const [i, f] of factors) {
          const cur = g[i]
          if (!cur) continue

          const v =
            tool === 'smooth'
              ? blendColors([cur, ...neighbors(g, i)], 0.65)
              : shade(cur, f)
          if (v === cur) continue
          next ??= [...g]
          next[i] = v
        }
        return next ?? g
      })
      return
    }

    const value = strokeInk.current
    setActiveGrid((g) => {
      let next: Grid | null = null
      for (const i of expanded) {
        if ((next ?? g)[i] === value) continue
        next ??= [...g]
        next[i] = value
      }
      return next ?? g
    })
  }

  const floodFill = (idx: number, value: string): void => {
    pushUndo()
    setActiveGrid((g) => {
      const target = g[idx]
      if (target === value) return g
      const next = [...g]
      const queue = [idx]
      while (queue.length) {
        const i = queue.pop()!
        if (next[i] !== target) continue
        next[i] = value
        const x = i % 16
        if (x > 0) queue.push(i - 1)
        if (x < 15) queue.push(i + 1)
        if (i >= 16) queue.push(i - 16)
        if (i < 240) queue.push(i + 16)
      }
      return next
    })
  }

  const cellFromEvent = (e: React.PointerEvent<HTMLDivElement>): number | null => {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = Math.floor((e.clientX - rect.left) / CELL)
    const y = Math.floor((e.clientY - rect.top) / CELL)
    if (x < 0 || x > 15 || y < 0 || y > 15) return null
    return y * 16 + x
  }

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>): void => {
    const idx = cellFromEvent(e)
    if (idx === null) return
    e.currentTarget.setPointerCapture(e.pointerId)
    const right = e.buttons === 2

    if (e.altKey || tool === 'eyedropper') {
      const picked = flat.grid[idx] ?? TRANSPARENT
      if (right) setSecondary(picked)
      else setPrimary(picked)
      if (tool === 'eyedropper') setTool('pencil')
      return
    }

    if (!active.visible) patchLayer(active.id, { visible: true })
    if (tool === 'select') {

      if (marquee && insideMarquee(marquee, idx)) {
        setMarquee((m) =>
          m ? { ...m, lifted: m.lifted ?? liftFrom(activeGridRef.current, m) } : m
        )
        moveFrom.current = { cell: idx, dx: marquee.dx, dy: marquee.dy }
        return
      }
      commitMarquee()
      marqueeAnchor.current = idx
      setMarquee({ ...rectBetween(idx, idx), lifted: null, dx: 0, dy: 0 })
      return
    }
    if (tool === 'fill') {

      floodFill(idx, inkFor(right))
      return
    }
    strokeInk.current = inkFor(right)
    if (SHAPE_TOOLS.includes(tool)) {
      shapeAnchor.current = idx
      shapeCellsRef.current = withMirror([idx])
      setShapePreview(shapeCellsRef.current)
      return
    }
    strokeActive.current = true
    strokeTouched.current = new Set()
    lastCell.current = idx
    pushUndo()
    paintCells([idx])
  }

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>): void => {
    const idx = cellFromEvent(e)
    setHover(idx)
    if (idx === null) return
    if (tool === 'select') {
      if (marqueeAnchor.current !== null) {
        const r = rectBetween(marqueeAnchor.current, idx)
        setMarquee((m) => (m ? { ...m, ...r } : m))
      } else if (moveFrom.current) {
        const from = moveFrom.current
        const [ax, ay] = xy(from.cell)
        const [bx, by] = xy(idx)
        setMarquee((m) => (m ? { ...m, dx: from.dx + (bx - ax), dy: from.dy + (by - ay) } : m))
      }
      return
    }
    if (shapeAnchor.current !== null && SHAPE_TOOLS.includes(tool)) {
      const raw =
        tool === 'line'
          ? lineCells(shapeAnchor.current, idx)
          : rectCells(shapeAnchor.current, idx, e.shiftKey)
      shapeCellsRef.current = withMirror(raw)
      setShapePreview(shapeCellsRef.current)
      return
    }
    if (!strokeActive.current || e.buttons === 0) return

    const cells = lastCell.current !== null ? lineCells(lastCell.current, idx) : [idx]
    lastCell.current = idx
    paintCells(cells)
  }

  const onPointerUp = (): void => {

    if (tool === 'select') {
      marqueeAnchor.current = null
      moveFrom.current = null
      return
    }
    if (shapeAnchor.current !== null) {
      const cells = shapeCellsRef.current
      shapeAnchor.current = null
      setShapePreview(null)
      if (cells.length) {
        pushUndo()
        const value = strokeInk.current
        setActiveGrid((g) => {
          const next = [...g]
          for (const i of cells) next[i] = value
          return next
        })
      }
      return
    }
    strokeActive.current = false
    lastCell.current = null
  }

  const addLayerAttention = useAttention()
  const addLayer = (): void => {
    if (layers.length >= MAX_LAYERS) return
    pushUndo()
    const next = [...layers, makeLayer(`Layer ${layers.length + 1}`)]
    layersRef.current = next
    setLayers(next)
    setActiveId(next[next.length - 1].id)
  }

  const duplicateLayer = (id: string): void => {
    if (layers.length >= MAX_LAYERS) return
    const i = layers.findIndex((l) => l.id === id)
    if (i < 0) return
    pushUndo()
    const copy: Layer = {
      ...layers[i],
      id: crypto.randomUUID(),
      name: `${layers[i].name} copy`,
      grid: [...layers[i].grid]
    }
    const next = [...layers.slice(0, i + 1), copy, ...layers.slice(i + 1)]
    layersRef.current = next
    setLayers(next)
    setActiveId(copy.id)
  }

  const mergeLayerDown = (id: string): void => {
    const i = layers.findIndex((l) => l.id === id)
    if (i <= 0) return
    pushUndo()
    const lower = layers[i - 1]
    const merged = mergePair(lower, layers[i])

    const layer: Layer = {
      ...lower,
      grid: merged.grid,
      opacity: merged.opacity,
      visible: merged.visible,
      hue: 0,
      saturation: 0,
      brightness: 0
    }
    const next = [...layers.slice(0, i - 1), layer, ...layers.slice(i + 1)]
    layersRef.current = next
    setLayers(next)
    setActiveId(layer.id)
  }

  const deleteLayer = (id: string): void => {
    if (layers.length <= 1) return
    pushUndo()
    const next = layers.filter((l) => l.id !== id)
    layersRef.current = next
    setLayers(next)
    if (id === activeId) setActiveId(next[next.length - 1].id)
  }

  const moveLayer = (id: string, dir: 1 | -1): void => {
    const i = layers.findIndex((l) => l.id === id)
    const j = i + dir
    if (i < 0 || j < 0 || j >= layers.length) return
    pushUndo()
    const next = [...layers]
    ;[next[i], next[j]] = [next[j], next[i]]
    layersRef.current = next
    setLayers(next)
  }

  const patchLayer = (id: string, patch: Partial<Omit<Layer, 'id' | 'grid'>>): void =>
    setLayers((ls) => ls.map((l) => (l.id === id ? { ...l, ...patch } : l)))

  const layerListRef = useRef<HTMLDivElement>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)

  const beginLayerDrag = (id: string): void => {
    pushUndo()
    setDraggingId(id)
  }

  const dragLayerTo = (id: string, clientY: number): void => {
    const rows = layerListRef.current?.querySelectorAll('[data-layer-row]')
    if (!rows?.length) return
    let over = rows.length - 1
    for (let i = 0; i < rows.length; i++) {
      if (clientY < rows[i].getBoundingClientRect().bottom) {
        over = i
        break
      }
    }
    const list = layersRef.current
    const from = list.findIndex((l) => l.id === id)

    const to = list.length - 1 - over
    if (from < 0 || to < 0 || to >= list.length || to === from) return
    const next = [...list]
    next.splice(to, 0, ...next.splice(from, 1))
    layersRef.current = next
    setLayers(next)
  }

  const selectCursor =
    tool !== 'select'
      ? undefined
      : marquee && hover !== null && insideMarquee(marquee, hover)
        ? 'move'
        : 'crosshair'

  const previewLayers = useMemo(() => {

    let out = layers
    if (marquee?.lifted) {
      out = out.map((l) => (l.id === active.id ? { ...l, grid: withMarquee(l.grid, marquee) } : l))
    }
    if (noise !== 0) {
      out = out.map(l => l.id === active.id ? { ...l, grid: l.grid.map((c, i) => c ? shade(c, 1 + NOISE_MAP[i] * NOISE_RANGE * (noise / 100)) : c) } : l)
    }
    return out
  }, [layers, active.id, noise, NOISE_MAP, marquee])

  const composite = useMemo(() => compositeLayers(previewLayers, fx), [previewLayers, fx])
  const displayed = composite.grid

  const flat = useMemo(() => compositeLayers(previewLayers), [previewLayers])

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const previewRefs = [useRef<HTMLCanvasElement>(null), useRef<HTMLCanvasElement>(null)]
  useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return
    const img = ctx.createImageData(16, 16)
    for (let i = 0; i < 256; i++) {
      const c = displayed[i]
      if (!c) continue
      const a = composite.alpha[i]
      if (a <= 0) continue
      const n = parseInt(c.slice(1), 16)
      img.data[i * 4] = (n >> 16) & 255
      img.data[i * 4 + 1] = (n >> 8) & 255
      img.data[i * 4 + 2] = n & 255
      img.data[i * 4 + 3] = Math.round(Math.min(1, a) * 255)
    }
    ctx.clearRect(0, 0, 16, 16)
    ctx.putImageData(img, 0, 0)

    if (shapePreview) {

      ctx.fillStyle = strokeInk.current || 'rgba(255,255,255,0.55)'
      for (const i of shapePreview) ctx.fillRect(i % 16, Math.floor(i / 16), 1, 1)
    }

    for (const ref of previewRefs) {
      const el = ref.current
      const pctx = el?.getContext('2d')
      if (!pctx || !el || !canvasRef.current) continue
      pctx.setTransform(1, 0, 0, 1, 0, 0)
      pctx.filter = 'none'
      pctx.imageSmoothingEnabled = false
      pctx.clearRect(0, 0, el.width, el.height)
      if (previewAsCube) drawIsoBlock(pctx, canvasRef.current, el.width)
      else pctx.drawImage(canvasRef.current, 0, 0, el.width, el.height)
    }

  }, [displayed, composite, shapePreview, previewAsCube])

  const usedColors = useMemo(() => {
    const freq = new Map<string, number>()
    for (const c of flat.grid) if (c) freq.set(c, (freq.get(c) ?? 0) + 1)
    return [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 16).map(([c]) => c)
  }, [flat])

  const orbitRef = useRef<HTMLDivElement>(null)
  const draggingLight = useRef(false)

  const angleFromEvent = (e: PointerEvent | React.PointerEvent): number => {
    const rect = orbitRef.current!.getBoundingClientRect()
    const cx = rect.left + rect.width / 2
    const cy = rect.top + rect.height / 2
    return Math.atan2(e.clientY - cy, e.clientX - cx)
  }

  const onLightDown = (e: React.PointerEvent): void => {
    e.stopPropagation()
    draggingLight.current = true
    holdFx('light-drag', true)
    const move = (ev: PointerEvent): void => {
      if (!draggingLight.current) return
      const angle = angleFromEvent(ev)
      setFx((f) => ({ ...f, light: { ...f.light, angle } }))
    }
    const up = (): void => {
      draggingLight.current = false

      holdFx('light-drag', false)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const bakeLight = (): void => {
    if (!fx.light.enabled) return
    pushUndo()
    const baked = bakeLighting(layers, fx)
    const next = layers.map((l, i) => ({ ...l, grid: baked[i] }))
    layersRef.current = next
    setLayers(next)
    setFx((f) => ({ ...f, light: { ...f.light, enabled: false } }))
  }

  const applyNoise = (): void => {
    pushUndo()
    setActiveGrid((g) => g.map((c, i) => (c ? shade(c, 1 + NOISE_MAP[i] * NOISE_RANGE * (noise / 100)) : c)))
    setNoise(0)
  }

  const applyPick = (pick: PresetPick): void => {
    setPresetOpen(false)
    const commit = (grid: Grid): void => {
      pushUndo()
      setActiveGrid(() => grid)
      if (!name) setName(pick.name)
    }
    if (pick.grid) commit(pick.grid)
    else if (pick.dataUrl) void dataUrlToGrid(pick.dataUrl).then(commit)
  }

  const activeIndex = layers.findIndex((l) => l.id === active.id)

  const stencilBase = useMemo(
    () => compositeLayers(layers.slice(0, activeIndex + 1)).grid,
    [layers, activeIndex]
  )

  const applyStencil = (
    stencil: Stencil,
    result: StencilResult,
    opts: StencilApplyOptions
  ): void => {
    setStencilOpen(false)
    pushUndo()
    let next: Layer[]
    let stacked = false

    if (result.cut) {
      const gone = new Set(result.cut)
      next = layers.map((l) =>
        opts.allLayers || l.id === active.id
          ? { ...l, grid: l.grid.map((c, i) => (gone.has(i) ? '' : c)) }
          : l
      )
    } else {
      const add = result.grid ?? EMPTY

      if (layers.length < MAX_LAYERS) {
        const layer = makeLayer(stencil.label, add.slice())
        next = [...layers.slice(0, activeIndex + 1), layer, ...layers.slice(activeIndex + 1)]
        stacked = true
      } else {
        next = layers.map((l) =>
          l.id === active.id ? { ...l, grid: l.grid.map((c, i) => add[i] || c) } : l
        )
      }
    }

    layersRef.current = next
    setLayers(next)
    if (stacked) setActiveId(next[activeIndex + 1].id)
  }

  const finalName = name.trim()
  const savingKind = existing?.kind ?? kind ?? 'block'
  const resolvedName = resolveTextureName(finalName, savingKind, allTextures ?? [], textureId)
  const saveBlocked = !finalName
    ? 'Name this texture first'
    : resolvedName === null
      ? 'That name is already used'
      : null

  const autoNamed = resolvedName !== null && resolvedName !== finalName ? resolvedName : null

  const { attention, callAttention } = useAttention()

  const nameAttention = useAttention()
  const saveAttention = useAttention()
  const nameRef = useRef<HTMLInputElement>(null)

  const attemptCommit = (): boolean => {
    if (saveBlocked) {
      nameAttention.callAttention()
      saveAttention.callAttention()
      nameRef.current?.focus()
      nameRef.current?.select()
      return false
    }
    return commit()
  }

  const attemptSave = (): void => {
    if (attemptCommit()) close()
  }

  const commit = (): boolean => {
    if (saveBlocked) return false

    const data = rgbaToDataUrl(displayed, composite.alpha)

    const saveStack = marquee?.lifted
      ? layers.map((l) => (l.id === active.id ? { ...l, grid: withMarquee(l.grid, marquee) } : l))
      : layers
    const savedLayers: TextureLayer[] = saveStack.map((l) => ({
      name: l.name,
      visible: l.visible,
      opacity: l.opacity,
      hue: l.hue,
      saturation: l.saturation,
      brightness: l.brightness,
      emissive: l.emissive,
      data: gridToDataUrl(l.grid)
    }))

    const glowing = saveStack.filter((l) => l.emissive && l.visible)
    const emissive = glowing.length
      ? (() => {
          const lit = compositeLayers(glowing)
          return rgbaToDataUrl(lit.grid, lit.alpha)
        })()
      : undefined

    const saveName = resolvedName ?? finalName
    if (textureId) {
      updateTexture(textureId, { name: saveName, data, layers: savedLayers, emissive })
      if (assignSlotAfter) assignTexture(assignSlotAfter, textureId)
    } else {
      const id = addTexture(saveName, data, savingKind, savedLayers, emissive)
      if (assignSlotAfter) assignTexture(assignSlotAfter, id)
    }

    opened.current = { name: finalName, layers: snapshot(layers) }
    return true
  }

  const save = (): void => {
    if (commit()) close()
  }

  const hasUnsavedWork = (): boolean => {
    const base = opened.current
    if (!base) return false
    return name.trim() !== base.name.trim() || !sameStack(layers, base.layers)
  }

  const live = useRef({ hasUnsavedWork, commit })
  live.current = { hasUnsavedWork, commit }
  const setPendingWork = useAppStore((s) => s.setPendingWork)
  useEffect(() => {
    setPendingWork({
      has: () => live.current.hasUnsavedWork(),
      commit: () => live.current.commit()
    })
    return () => setPendingWork(null)
  }, [setPendingWork])

  const [hx, hy] = hover !== null ? xy(hover) : [null, null]

  return (

    <div
      className="fixed inset-x-0 bottom-0 z-40 flex flex-col bg-ink-850"
      style={{ top: 40 * TITLEBAR_UNSCALE }}
    >
      <motion.div
        className={cn('relative flex h-full w-full flex-col', attention && 'jiggle')}
        initial={{ opacity: 0, scale: 0.99 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
      >
        {

}
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 border-b border-white/[0.04] px-4 py-2.5">
          <span className="justify-self-start text-2xs font-semibold uppercase tracking-wider text-gold-400/80">
            Texture Editor
          </span>
          <input
            ref={nameRef}
            className={cn(
              'input-base w-64 py-1 text-center font-mono text-xs',
              saveBlocked && 'shadow-glow-ember',
              nameAttention.attention && 'jiggle'
            )}
            placeholder="texture name (required)"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <div className="flex items-center gap-3 justify-self-end">
            {
}
            <span className="w-12 text-right font-mono text-2xs text-mist-600">
              {hover !== null ? `${hx}, ${hy}` : ''}
            </span>
            <ExportMenu
              name={name}
              png={() => rgbaToDataUrl(displayed, composite.alpha)}
            />
            <button
              onClick={close}
              className="rounded-md p-1.5 text-mist-500 transition-colors hover:bg-ink-750 hover:text-mist-200"
            >
              <X size={15} />
            </button>
          </div>
        </div>

        {
}
        <div className="flex min-h-0 flex-1 justify-center gap-5 overflow-y-auto p-5">
          {}
          <div className="flex w-[260px] flex-col gap-3">
            {}
            <Panel>
              <div className="mb-2.5 flex items-center justify-between gap-1">
                <div className="flex items-center gap-1.5">
                  {

}
                  <div className="relative h-[34px] w-[42px] shrink-0">
                    <ColorSlot
                      value={secondary}
                      onChange={setSecondary}
                      title="Second color, right click paints with this one"
                      className="absolute bottom-0 right-0 h-[22px] w-[26px]"
                    />
                    <ColorSlot
                      value={primary}
                      onChange={setPrimary}
                      title="Main color, left click paints with this one"
                      className="absolute left-0 top-0 h-[22px] w-[26px] ring-1 ring-ink-950/70"
                    />
                  </div>
                  <button
                    onClick={swapColors}
                    title="Swap the two colors (Shift+X)"
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-mist-500 transition-colors hover:bg-ink-750 hover:text-mist-200"
                  >
                    <ArrowLeftRight size={13} />
                  </button>
                  {

}
                  <input
                    className="input-base w-[72px] py-1 text-center font-mono text-2xs"
                    value={primary}
                    placeholder="none"
                    onChange={(e) => {
                      const v = e.target.value.startsWith('#') ? e.target.value : `#${e.target.value}`
                      if (/^#[0-9a-fA-F]{6}$/.test(v)) setPrimary(v.toLowerCase())
                    }}
                    onFocus={(e) => e.target.select()}
                  />
                </div>
                <button
                  title="Pick color (I), or Alt-click. Right click samples into the second slot"
                  onClick={() => setTool('eyedropper')}
                  className={cn(
                    'flex h-8 w-8 shrink-0 items-center justify-center rounded-md transition-colors',
                    tool === 'eyedropper'
                      ? 'bg-gold-500/15 text-gold-300 shadow-glow-gold'
                      : 'text-mist-500 hover:bg-ink-750 hover:text-mist-200'
                  )}
                >
                  <Pipette size={15} />
                </button>
              </div>
              <div className="grid grid-cols-8 gap-1.5">
                {

}
                <Swatch
                  color={TRANSPARENT}
                  primary={primary}
                  secondary={secondary}
                  onPick={setPrimary}
                  onPickSecond={setSecondary}
                  className="h-6 rounded-[4px]"
                  title="Transparent. Right click to keep it on the second button"
                />
                {PIXEL_PALETTE.map((c) => (
                  <Swatch
                    key={c}
                    color={c}
                    primary={primary}
                    secondary={secondary}
                    onPick={setPrimary}
                    onPickSecond={setSecondary}
                    className="h-6 rounded-[4px]"
                  />
                ))}
              </div>
            </Panel>

            {

}
            <Panel>
              <div className="space-y-1.5">
                <ToolRow label="Paint">
                  <ToolButton icon={Pencil} active={tool === 'pencil'} onClick={() => setTool('pencil')} label="Pencil (B)" />
                  <ToolButton icon={Eraser} active={tool === 'eraser'} onClick={() => setTool('eraser')} label="Eraser (E). Right-drag paints the second color, transparent by default" />
                  <ToolButton icon={PaintBucket} active={tool === 'fill'} onClick={() => setTool('fill')} label="Fill (F). Right click fills with the second color" />
                  <ToolButton icon={Slash} active={tool === 'line'} onClick={() => setTool('line')} label="Line (L), drag to draw" />
                  <ToolButton icon={Square} active={tool === 'rect'} onClick={() => setTool('rect')} label="Rectangle (R), hold Shift for filled" />
                </ToolRow>

                {

}
                <ToolRow label="Rework">
                  <ToolButton
                    icon={SquareDashed}
                    active={tool === 'select'}
                    onClick={() => setTool('select')}
                    label="Select (M). Drag a box, drag it again to move it, Enter to put it down"
                  />
                  <ToolButton icon={SunMedium} active={tool === 'lighten'} onClick={() => setTool('lighten')} label="Lighten (U)" />
                  <ToolButton icon={Moon} active={tool === 'darken'} onClick={() => setTool('darken')} label="Darken (D)" />
                  <ToolButton icon={Sparkles} active={tool === 'noise'} onClick={() => setTool('noise')} label="Noise brush (N)" />
                  <ToolButton icon={Droplet} active={tool === 'smooth'} onClick={() => setTool('smooth')} label="Smooth (S), blends a pixel with its neighbors" />
                </ToolRow>
              </div>

              <div className="mt-2.5 space-y-1.5 border-t border-white/[0.04] pt-2.5">
                <ToolRow label="Layer">
                  <ToolButton icon={FlipHorizontal} onClick={() => transform(flipHGrid)} label="Flip horizontal" />
                  <ToolButton icon={FlipVertical} onClick={() => transform(flipVGrid)} label="Flip vertical" />
                  <ToolButton icon={RotateCw} onClick={() => transform(rotateGrid)} label="Rotate 90 degrees" />
                </ToolRow>

                {

}
                <ToolRow label="Nudge">
                  <ToolButton icon={ArrowLeft} onClick={() => transform((g) => shiftGrid(g, -1, 0))} label="Nudge left" />
                  <ToolButton icon={ArrowUp} onClick={() => transform((g) => shiftGrid(g, 0, -1))} label="Nudge up" />
                  <ToolButton icon={ArrowDown} onClick={() => transform((g) => shiftGrid(g, 0, 1))} label="Nudge down" />
                  <ToolButton icon={ArrowRight} onClick={() => transform((g) => shiftGrid(g, 1, 0))} label="Nudge right" />
                </ToolRow>
              </div>
            </Panel>

            {

}
            <Panel onHold={(h) => holdFx('fx-panel', h)}>
              <div className="flex items-center gap-3">
                <span className="flex w-16 shrink-0 items-center gap-1.5 text-2xs uppercase tracking-wider text-mist-500">
                  <Sparkles size={11} /> Noise
                </span>
                {

}
                <div className="min-w-0 flex-1">
                  <SliderRow
                    value={noise}
                    onChange={setNoise}
                    onHold={(h) => holdFx('noise-slider', h)}
                  />
                </div>
                <BakeButton disabled={noise === 0} onClick={applyNoise} />
              </div>

              <div className="mt-2.5 flex items-center gap-3 border-t border-white/[0.04] pt-2.5">
                <button
                  onClick={() => setFx((f) => ({ ...f, light: { ...f.light, enabled: !f.light.enabled } }))}
                  title="Directional lighting. Drag the glowing ball around the canvas."
                  className={cn(
                    'flex w-16 shrink-0 items-center gap-1.5 rounded-md py-1 text-2xs uppercase tracking-wider transition-colors',
                    fx.light.enabled ? 'text-gold-300' : 'text-mist-500 hover:text-mist-300'
                  )}
                >
                  <Sun size={11} /> Light
                </button>
                <div className="min-w-0 flex-1">
                  <SliderRow
                    value={fx.light.strength}
                    onChange={(v) => setFx((f) => ({ ...f, light: { ...f.light, strength: v, enabled: true } }))}
                    onHold={(h) => holdFx('light-slider', h)}
                  />
                </div>
                <BakeButton disabled={!fx.light.enabled} onClick={bakeLight} />
              </div>
            </Panel>
          </div>

          {}
          <div className="flex w-[420px] shrink-0 flex-col gap-3">
            <div className="relative top-8 z-10 mx-auto flex w-[408px] items-center justify-between px-7">
              <div className="flex items-center gap-1 rounded-md bg-ink-950/60 px-1 py-0.5 shadow-panel">
                <ToolButton icon={Undo2} onClick={undo} label="Undo (Ctrl+Z)" />
                <ToolButton icon={Redo2} onClick={redo} label="Redo (Ctrl+Y or Ctrl+Shift+Z)" />
              </div>
              <div className="flex items-center rounded-md bg-ink-950/60 px-1 py-0.5 shadow-panel">
                <ToolButton icon={FlipHorizontal2} active={mirror} onClick={() => setMirror((m) => !m)} label="Mirror painting (X)" />
              </div>
              <div className="flex items-center rounded-md bg-ink-950/60 px-1 py-0.5 shadow-panel">
                <ToolButton icon={Trash2} onClick={clearActive} label="Clear layer (Del)" danger />
              </div>
            </div>

            {}
            <div
              ref={orbitRef}
              className="relative mx-auto shrink-0"
              style={{ width: CELL * 16 + PAD * 2, height: CELL * 16 + PAD * 2 }}
            >
              {fx.light.enabled && (
                <>
                  {}
                  <div className="pointer-events-none absolute inset-1 rounded-2xl border border-dashed border-gold-400/15" />
                  <LightBall
                    angle={fx.light.angle}
                    onPointerDown={onLightDown}
                    onHover={(over) => holdFx('light-ball', over)}
                  />
                </>
              )}
              <div
                data-tour="pixel-canvas"
                className="pixel-cursor absolute overflow-hidden rounded-md shadow-panel"
                style={{

                  cursor: selectCursor,
                  left: PAD,
                  top: PAD,
                  width: CELL * 16,
                  height: CELL * 16,
                  backgroundImage: showChecker ? 'repeating-conic-gradient(#31363e 0% 25%, #262b32 0% 50%)' : 'none',
                  backgroundColor: showChecker ? undefined : '#262b32',
                  backgroundSize: `${CELL * 2}px ${CELL * 2}px`
                }}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerLeave={() => setHover(null)}
                onContextMenu={(e) => e.preventDefault()}
              >
                <canvas
                  ref={canvasRef}
                  width={16}
                  height={16}
                  className="pointer-events-none h-full w-full"
                  style={{ imageRendering: 'pixelated' }}
                />
                {}
                <div
                  className="pointer-events-none absolute inset-0 opacity-25"
                  style={{
                    backgroundImage:
                      'linear-gradient(to right, rgba(255,255,255,0.25) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.25) 1px, transparent 1px)',
                    backgroundSize: `${CELL}px ${CELL}px`
                  }}
                />
                {}
                {mirror && (
                  <div className="pointer-events-none absolute inset-y-0 left-1/2 w-px bg-gold-400/40" />
                )}
                {

}
                {marquee && (
                  <div
                    className="pointer-events-none absolute border border-dashed border-gold-300 bg-gold-400/10"
                    style={{
                      left: (marquee.left + marquee.dx) * CELL,
                      top: (marquee.top + marquee.dy) * CELL,
                      width: marquee.w * CELL,
                      height: marquee.h * CELL
                    }}
                  />
                )}
                {}
                {hover !== null && (
                  <div
                    className="pointer-events-none absolute ring-1 ring-inset ring-white/60"
                    style={{ left: (hover % 16) * CELL, top: Math.floor(hover / 16) * CELL, width: CELL, height: CELL }}
                  />
                )}
              </div>
              <button
                onClick={() => setShowChecker(!showChecker)}
                className="absolute flex items-center justify-center rounded-md p-1.5 text-mist-500 transition-colors hover:bg-ink-750 hover:text-mist-200"
                style={{ bottom: PAD, right: PAD + CELL * 16 + 8 }}
                title="Toggle checkerboard background"
              >
                <Grid3x3 size={15} className={showChecker ? 'text-mist-200' : 'opacity-50'} />
              </button>
            </div>

            {

}
            <div className="mx-auto -mt-8 flex w-[408px] flex-wrap items-center justify-center gap-1.5 px-7 pt-1">
              <span className="mr-0.5 text-2xs text-mist-600">In use</span>
              {usedColors.length === 0 && (

                <span
                  className="h-5 w-5 rounded-[3px] bg-white/[0.04]"
                  title="Colors you paint with show up here"
                />
              )}
              {usedColors.slice(0, 10).map((c) => (
                <Swatch
                  key={c}
                  color={c}
                  primary={primary}
                  secondary={secondary}
                  onPick={setPrimary}
                  onPickSecond={setSecondary}
                  className="h-5 w-5 rounded-[3px]"
                />
              ))}
            </div>
          </div>

          {}
          <div className="flex w-[250px] flex-col gap-4">
            <div>
              <span className="label-base">Preview</span>
              <div className="flex items-end gap-2 rounded-lg bg-ink-900/50 p-3 shadow-panel">
                <span
                  className="overflow-hidden rounded"
                  style={{
                    backgroundImage: showChecker ? 'repeating-conic-gradient(#31363e 0% 25%, #262b32 0% 50%)' : 'none',
                    backgroundColor: showChecker ? undefined : '#262b32',
                    backgroundSize: '12px 12px'
                  }}
                >
                  <canvas ref={previewRefs[0]} width={64} height={64} className="block" style={{ imageRendering: 'pixelated' }} />
                </span>
                <span className="flex h-11 w-11 items-center justify-center rounded bg-ink-950">
                  <canvas ref={previewRefs[1]} width={32} height={32} className="block" style={{ imageRendering: 'pixelated' }} />
                </span>
                <span className="text-2xs leading-snug text-mist-600">
                  in-game
                  <br />
                  size
                </span>
              </div>
            </div>

            <button
              onClick={() => setPresetOpen(true)}
              className="flex items-center justify-center gap-1.5 rounded-md bg-ink-750 py-2 text-2xs font-semibold uppercase tracking-wide text-mist-200 shadow-panel transition-colors hover:bg-ink-700 hover:text-gold-300"
            >
              <LayoutGrid size={12} /> Start from a texture
            </button>

            <button
              onClick={() => setStencilOpen(true)}
              className="-mt-2 flex items-center justify-center gap-1.5 rounded-md bg-ink-750 py-2 text-2xs font-semibold uppercase tracking-wide text-mist-200 shadow-panel transition-colors hover:bg-ink-700 hover:text-gold-300"
            >
              <Stamp size={12} /> Add a stencil
            </button>

            {}
            <div data-tour="pixel-layers" className="mt-auto">
              <div className="mb-1 flex items-center justify-between">
                <span className="label-base mb-0 flex items-center gap-1.5">
                  <Layers size={11} /> Layers
                </span>
                <button
                  onClick={() => {
                    if (layers.length >= MAX_LAYERS) addLayerAttention.callAttention()
                    else addLayer()
                  }}
                  aria-disabled={layers.length >= MAX_LAYERS}
                  title={layers.length >= MAX_LAYERS ? `Max ${MAX_LAYERS} layers` : 'Add layer'}
                  className={cn(
                    'rounded p-1 text-mist-500 transition-colors',
                    layers.length >= MAX_LAYERS ? 'opacity-35' : 'hover:bg-ink-750 hover:text-mist-200',
                    addLayerAttention.attention && 'jiggle'
                  )}
                >
                  <Plus size={13} />
                </button>
              </div>
              <div ref={layerListRef} className="space-y-0.5 rounded-lg bg-ink-900/50 p-1.5 shadow-panel">
                {

}
                <GlideList active={activeId} instant={draggingId !== null}>
                {[...layers].reverse().map((l) => (
                  <LayerRow
                    key={l.id}
                    layer={l}
                    active={l.id === activeId}
                    dragging={draggingId === l.id}
                    canDelete={layers.length > 1}
                    isTop={layers[layers.length - 1].id === l.id}
                    isBottom={layers[0].id === l.id}
                    onSelect={() => setActiveId(l.id)}
                    onPatch={(patch) => patchLayer(l.id, patch)}
                    onMove={(dir) => moveLayer(l.id, dir)}
                    onDuplicate={() => duplicateLayer(l.id)}
                    onMergeDown={() => mergeLayerDown(l.id)}
                    onDelete={() => deleteLayer(l.id)}
                    onDragStart={() => beginLayerDrag(l.id)}
                    onDragTo={(y) => dragLayerTo(l.id, y)}
                    onDragEnd={() => setDraggingId(null)}
                  />
                ))}
                </GlideList>
                {

}
                <div className="mt-2.5 space-y-1 border-t border-white/[0.05] px-1 pb-1 pt-3">
                  <LayerSlider
                    label="Opacity"
                    value={active.opacity}
                    min={0}
                    max={100}
                    onChange={(v) => patchLayer(active.id, { opacity: v })}
                  />
                  <LayerSlider
                    label="Hue"
                    value={active.hue}
                    min={-180}
                    max={180}
                    onChange={(v) => patchLayer(active.id, { hue: v })}
                  />
                  <LayerSlider
                    label="Sat"
                    value={active.saturation}
                    min={-100}
                    max={100}
                    onChange={(v) => patchLayer(active.id, { saturation: v })}
                  />
                  <LayerSlider
                    label="Light"
                    value={active.brightness}
                    min={-100}
                    max={100}
                    onChange={(v) => patchLayer(active.id, { brightness: v })}
                  />
                  {(active.hue !== 0 || active.saturation !== 0 || active.brightness !== 0) && (
                    <button
                      onClick={() => patchLayer(active.id, { hue: 0, saturation: 0, brightness: 0 })}
                      className="w-full rounded px-1 py-0.5 text-left text-2xs text-mist-600 transition-colors hover:text-gold-300"
                    >
                      Reset color shift
                    </button>
                  )}
                </div>
              </div>
            </div>

          </div>
        </div>

        {presetOpen && (
          <PresetPicker
            kind={existing?.kind ?? kind ?? 'block'}
            accent={accent}
            onAccent={setAccent}
            onPick={applyPick}
            onClose={() => setPresetOpen(false)}
          />
        )}

        {stencilOpen && (
          <StencilDialog
            below={stencilBase}
            full={flat.grid}
            angle={fx.light.angle}
            canAddLayer={layers.length < MAX_LAYERS}
            onApply={applyStencil}
            onClose={() => setStencilOpen(false)}
          />
        )}

        {

}
        <div className="flex items-center gap-3 border-t border-white/[0.04] px-4 py-3">
          <span
            className={cn(
              'min-w-0 flex-1 truncate text-2xs',
              saveBlocked ? 'text-ember-400' : autoNamed ? 'text-gold-400/90' : 'text-mist-600'
            )}
          >
            {

}
            {saveBlocked ??
              (autoNamed
                ? `A block already uses that name. Saving this as ${autoNamed}`
                : 'Right-drag erases · Alt-click samples · X mirrors · N noise brush · arrows nudge')}
          </span>
          <button
            onClick={close}
            className="shrink-0 rounded-md px-4 py-1.5 text-[13px] text-mist-400 transition-colors hover:bg-ink-750 hover:text-mist-200"
          >
            Cancel
          </button>
          <button
            data-tour="pixel-save"
            onClick={attemptSave}
            title={saveBlocked ?? undefined}

            className={cn(
              'flex shrink-0 items-center gap-1.5 rounded-md bg-gold-500 px-4 py-1.5 text-[13px] font-medium text-ink-950 transition-all hover:bg-gold-400 active:scale-[0.98]',
              saveBlocked && 'opacity-40',
              saveAttention.attention && 'jiggle'
            )}
          >
            <Check size={14} /> Save Texture
          </button>
        </div>
      </motion.div>
    </div>
  )
}

const DRAG_SLOP = 4

function ExportMenu(props: { name: string; png: () => string }): JSX.Element {
  const [open, setOpen] = useState(false)
  const [said, setSaid] = useState<string | null>(null)

  const flash = (msg: string): void => {
    setSaid(msg)
    setTimeout(() => setSaid(null), 1800)
  }

  const toFile = (): void => {
    setOpen(false)
    void window.artemis.texture
      .exportFile(props.png(), props.name || 'texture')
      .then((path) => path && flash('Saved'))
      .catch(() => flash('Could not save'))
  }

  const toClipboard = (): void => {
    setOpen(false)
    void window.artemis.texture
      .exportClipboard(props.png())
      .then((ok) => flash(ok ? 'Copied' : 'Could not copy'))
      .catch(() => flash('Could not copy'))
  }

  return (
    <div className="relative">
      {said && (
        <span className="absolute right-full top-1/2 mr-2 -translate-y-1/2 whitespace-nowrap text-2xs text-gold-400/90">
          {said}
        </span>
      )}
      <button
        onClick={() => setOpen((v) => !v)}
        title="Export this texture"
        className={cn(
          'rounded-md p-1.5 transition-colors',
          open ? 'bg-ink-750 text-mist-200' : 'text-mist-500 hover:bg-ink-750 hover:text-mist-200'
        )}
      >
        <Download size={15} />
      </button>
      {open && (
        <>
          {}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full z-50 mt-1.5 w-44 overflow-hidden rounded-md bg-ink-850 py-1 shadow-panel">
            <ExportItem icon={ImageDown} label="Save as PNG..." onSelect={toFile} />
            <ExportItem icon={ClipboardCopy} label="Copy to clipboard" onSelect={toClipboard} />
          </div>
        </>
      )}
    </div>
  )
}

function ExportItem(props: {
  icon: typeof Download
  label: string
  onSelect: () => void
}): JSX.Element {
  const Icon = props.icon
  return (
    <button
      onClick={props.onSelect}
      className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-2xs text-mist-300 transition-colors hover:bg-ink-750 hover:text-mist-100"
    >
      <Icon size={12} className="shrink-0 text-mist-500" />
      {props.label}
    </button>
  )
}

function LayerRow(props: {
  layer: Layer
  active: boolean
  dragging: boolean
  canDelete: boolean
  isTop: boolean
  isBottom: boolean
  onSelect: () => void
  onPatch: (patch: Partial<Omit<Layer, 'id' | 'grid'>>) => void
  onMove: (dir: 1 | -1) => void
  onDuplicate: () => void
  onMergeDown: () => void
  onDelete: () => void
  onDragStart: () => void
  onDragTo: (clientY: number) => void
  onDragEnd: () => void
}): JSX.Element {
  const { layer: l } = props

  const [editing, setEditing] = useState(false)
  const press = useRef<{ x: number; y: number } | null>(null)
  const dragged = useRef(false)

  useEffect(() => {
    if (!props.active) setEditing(false)
  }, [props.active])

  const endPress = (e: React.PointerEvent<HTMLDivElement>): void => {
    if (!press.current) return
    press.current = null
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId)
    }
    if (dragged.current) {
      props.onDragEnd()
      return
    }

    if (props.active) setEditing(true)
    else props.onSelect()
  }

  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>
        <div
          data-layer-row
          onPointerDown={(e) => {

            if (e.button !== 0 || (e.target as HTMLElement).closest('button, input')) return
            press.current = { x: e.clientX, y: e.clientY }
            dragged.current = false
            e.currentTarget.setPointerCapture(e.pointerId)
          }}
          onPointerMove={(e) => {
            const p = press.current
            if (!p) return
            if (!dragged.current) {
              if (Math.abs(e.clientX - p.x) < DRAG_SLOP && Math.abs(e.clientY - p.y) < DRAG_SLOP) return
              dragged.current = true
              props.onDragStart()
            }
            props.onDragTo(e.clientY)
          }}
          onPointerUp={endPress}
          onPointerCancel={endPress}
          title="Click to select, click again to rename, drag to reorder, right-click for options"
          data-glide-id={l.id}
          className={cn(
            'group relative flex select-none items-center gap-1 rounded-md px-1 py-0.5 transition-colors',
            props.dragging ? 'cursor-grabbing ring-1 ring-gold-500/40' : 'cursor-grab',

            props.active ? '' : 'hover:bg-ink-800'
          )}
        >
          <button
            onClick={(e) => {
              e.stopPropagation()
              props.onPatch({ visible: !l.visible })
            }}
            title={l.visible ? 'Hide layer' : 'Show layer'}
            className="rounded p-1 text-mist-500 transition-colors hover:text-mist-200"
          >
            {l.visible ? <Eye size={12} /> : <EyeOff size={12} className="text-mist-600" />}
          </button>
          {

}
          <button
            onClick={(e) => {
              e.stopPropagation()
              props.onPatch({ emissive: !l.emissive })
            }}
            title={
              l.emissive
                ? 'This layer glows in the dark. Click to stop it.'
                : 'Make this layer glow in the dark'
            }
            className={cn(
              'rounded p-1 transition-colors',
              l.emissive ? 'text-gold-400 hover:text-gold-300' : 'text-mist-600 hover:text-mist-300'
            )}
          >
            <Sun size={12} />
          </button>
          {editing ? (
            <input
              autoFocus
              className="w-0 min-w-0 flex-1 cursor-text select-text bg-transparent text-xs text-mist-100 outline-none"
              value={l.name}
              onChange={(e) => props.onPatch({ name: e.target.value })}
              onBlur={() => setEditing(false)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === 'Escape') e.currentTarget.blur()
              }}
            />
          ) : (
            <span
              className={cn(
                'min-w-0 flex-1 truncate text-xs',
                props.active ? 'text-mist-100' : l.visible ? 'text-mist-400' : 'text-mist-600'
              )}
            >
              {l.name}
            </span>
          )}
        </div>
      </ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content
          className="z-50 min-w-[140px] overflow-hidden rounded-md border border-white/[0.08] bg-ink-850 p-1 shadow-raised animate-in fade-in zoom-in-95"
        >
          <ContextMenuItem label="Raise" icon={ChevronUp} disabled={props.isTop} onSelect={() => props.onMove(1)} />
          <ContextMenuItem label="Lower" icon={ChevronDown} disabled={props.isBottom} onSelect={() => props.onMove(-1)} />
          <ContextMenu.Separator className="mx-1 my-1 h-px bg-white/[0.06]" />
          <ContextMenuItem label="Duplicate" icon={Copy} onSelect={props.onDuplicate} />
          <ContextMenuItem
            label="Merge down"
            icon={ArrowDownToLine}
            disabled={props.isBottom}
            onSelect={props.onMergeDown}
          />
          <ContextMenuItem label="Delete" icon={Trash2} disabled={!props.canDelete} onSelect={props.onDelete} danger />
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  )
}

function ContextMenuItem(props: { label: string, icon: LucideIcon, disabled?: boolean, danger?: boolean, onSelect: () => void }) {
  const { attention, callAttention } = useAttention()
  const Icon = props.icon
  return (
    <ContextMenu.Item
      aria-disabled={props.disabled}
      onSelect={(e) => {
        if (props.disabled) {
          e.preventDefault()
          callAttention()
        } else {
          props.onSelect()
        }
      }}
      className={cn(
        'flex cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-xs outline-none transition-colors',
        props.disabled ? 'text-mist-700' :
        props.danger ? 'text-mist-400 focus:bg-ember-500/15 focus:text-ember-400' :
        'text-mist-200 focus:bg-ink-750 focus:text-white',
        attention && 'jiggle'
      )}
    >
      <Icon size={12} className={props.danger && !props.disabled ? 'text-ember-400/80' : 'text-mist-500'} />
      {props.label}
    </ContextMenu.Item>
  )
}

function Panel(props: {
  children: React.ReactNode

  onHold?: (held: boolean) => void
}): JSX.Element {
  return (
    <div
      className="rounded-lg bg-ink-900/50 p-3 shadow-panel"
      onPointerEnter={props.onHold && (() => props.onHold?.(true))}
      onPointerLeave={props.onHold && (() => props.onHold?.(false))}
    >
      {props.children}
    </div>
  )
}

function ColorSlot(props: {
  value: string
  onChange: (v: string) => void
  title: string
  className?: string
}): JSX.Element {
  const empty = props.value === TRANSPARENT
  return (
    <label
      className={cn(
        'cursor-default overflow-hidden rounded-md shadow-panel',
        props.className
      )}
      style={empty ? CHECKER : { background: props.value }}
      title={empty ? `${props.title} (transparent)` : `${props.title} (${props.value})`}
    >
      <input
        type="color"
        value={empty ? '#000000' : props.value}
        className="h-full w-full opacity-0"
        onChange={(e) => props.onChange(e.target.value)}
      />
    </label>
  )
}

function Swatch(props: {
  color: string
  primary: string
  secondary: string
  onPick: (c: string) => void
  onPickSecond: (c: string) => void
  className?: string
  title?: string
}): JSX.Element {
  const empty = props.color === TRANSPARENT
  const isPrimary = props.primary === props.color
  const isSecondary = props.secondary === props.color
  return (
    <button
      onClick={() => props.onPick(props.color)}
      onContextMenu={(e) => {
        e.preventDefault()
        props.onPickSecond(props.color)
      }}
      title={props.title ?? `${props.color}. Right click for the second slot`}
      className={cn(
        'relative w-full transition-transform hover:z-10 hover:scale-110',

        isPrimary && 'z-10 ring-1 ring-gold-400',
        !isPrimary && isSecondary && 'z-10 ring-1 ring-dashed ring-mist-300',
        props.className
      )}
      style={empty ? CHECKER : { background: props.color }}
    />
  )
}

function ToolRow(props: { label: string; children: React.ReactNode }): JSX.Element {
  return (
    <div className="flex items-center gap-3">
      <span className="w-16 shrink-0 text-2xs uppercase tracking-wider text-mist-500">
        {props.label}
      </span>
      <div className="flex items-center gap-1">{props.children}</div>
    </div>
  )
}

function ToolButton(props: {
  icon: LucideIcon
  active?: boolean
  danger?: boolean
  onClick: () => void
  label: string
}): JSX.Element {
  const Icon = props.icon
  return (
    <button
      title={props.label}
      onClick={props.onClick}
      className={cn(
        'rounded-md p-1.5 transition-colors',
        props.active
          ? 'bg-gold-500/15 text-gold-300 shadow-glow-gold'
          : props.danger
            ? 'text-mist-500 hover:bg-ember-500/15 hover:text-ember-400'
            : 'text-mist-500 hover:bg-ink-750 hover:text-mist-200'
      )}
    >
      <Icon size={15} />
    </button>
  )
}

function LayerSlider(props: {
  label: string
  value: number
  min: number
  max: number
  onChange: (v: number) => void
}): JSX.Element {
  return (
    <div className="flex items-center gap-2">
      <span className="w-9 shrink-0 text-2xs text-mist-600">{props.label}</span>
      <input
        type="range"
        min={props.min}
        max={props.max}
        value={props.value}
        onChange={(e) => props.onChange(Number(e.target.value))}
        className="fx-slider min-w-0 flex-1"
      />
      <span className="w-8 shrink-0 text-right font-mono text-2xs text-mist-500">{props.value}</span>
    </div>
  )
}

function SliderRow(props: {
  value: number
  onChange: (v: number) => void

  onHold?: (held: boolean) => void
}): JSX.Element {
  const { onHold } = props

  const grab = (): void => {
    if (!onHold) return
    onHold(true)
    const release = (): void => {
      onHold(false)
      window.removeEventListener('pointerup', release)
      window.removeEventListener('pointercancel', release)
    }
    window.addEventListener('pointerup', release)
    window.addEventListener('pointercancel', release)
  }
  return (
    <div className="flex items-center gap-2">
      <input
        type="range"
        min={0}
        max={100}
        value={props.value}
        onChange={(e) => props.onChange(Number(e.target.value))}
        onPointerDown={grab}
        className="fx-slider min-w-0 flex-1"
      />
      <span className="w-7 shrink-0 text-right font-mono text-2xs text-mist-500">{props.value}</span>
    </div>
  )
}

function BakeButton(props: { disabled: boolean; onClick: () => void }): JSX.Element {
  const { attention, callAttention } = useAttention()
  return (
    <button
      onClick={() => {
        if (props.disabled) callAttention()
        else props.onClick()
      }}
      aria-disabled={props.disabled}
      title={
        props.disabled
          ? 'Turn Light on first, then Apply bakes it into the layers'
          : 'Bake this effect into the layers (undoable)'
      }
      className={cn(

        'shrink-0 whitespace-nowrap rounded-md px-2 py-1 text-2xs uppercase tracking-wide transition-colors',

        props.disabled
          ? 'cursor-not-allowed bg-ink-800/60 text-mist-600 ring-1 ring-inset ring-white/[0.05]'
          : 'bg-ink-750 text-mist-300 shadow-panel hover:bg-ink-700 hover:text-gold-300',
        attention && 'jiggle'
      )}
    >
      Apply
    </button>
  )
}

function LightBall(props: {
  angle: number
  onPointerDown: (e: React.PointerEvent) => void

  onHover: (over: boolean) => void
}): JSX.Element {
  const R = (CELL * 16) / 2 + PAD / 2
  const cx = CELL * 8 + PAD
  const x = cx + Math.cos(props.angle) * R
  const y = cx + Math.sin(props.angle) * R
  return (
    <div
      onPointerDown={props.onPointerDown}
      onPointerEnter={() => props.onHover(true)}
      onPointerLeave={() => props.onHover(false)}
      className="absolute z-10 cursor-grab active:cursor-grabbing"
      style={{ left: x - 13, top: y - 13, width: 26, height: 26 }}
      title="Drag to move the light"
    >
      <div
        className="h-full w-full rounded-full"
        style={{
          background:
            'radial-gradient(circle, #fff3d0 0%, #e6ad55 38%, rgba(230,173,85,0.25) 62%, transparent 75%)',
          filter: 'drop-shadow(0 0 8px rgba(230,173,85,0.65))'
        }}
      />
    </div>
  )
}
