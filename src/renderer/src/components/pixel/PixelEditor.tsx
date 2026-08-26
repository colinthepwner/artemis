import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Droplet,
  Eraser,
  Eye,
  EyeOff,
  FlipHorizontal,
  FlipHorizontal2,
  FlipVertical,
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
import { useProjectStore } from '@/store/projectStore'
import {
  PIXEL_PALETTE,
  blendColors,
  rgbaToDataUrl,
  dataUrlToGrid,
  shade,
  type Grid
} from './presets'
import { PresetPicker, type PresetPick } from './PresetPicker'
import { StencilDialog, type StencilApplyOptions } from './StencilDialog'
import type { Stencil, StencilResult } from './stencils'
import { bakeLighting, compositeLayers, DEFAULT_FX, type PixelFx } from './effects'
import { cn } from '@/lib/cn'

type Tool =
  | 'pencil'
  | 'eraser'
  | 'fill'
  | 'line'
  | 'rect'
  | 'eyedropper'
  | 'lighten'
  | 'darken'
  | 'noise'
  | 'smooth'

const CELL = 22
const PAD = 28
const EMPTY: Grid = Array(256).fill('')
const MAX_LAYERS = 6

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

function neighbours(g: Grid, i: number): string[] {
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
  grid
})

const snapshot = (layers: Layer[]): Layer[] => layers.map((l) => ({ ...l, grid: [...l.grid] }))

export function PixelEditorOverlay(): JSX.Element | null {
  const editorState = useAppStore((s) => s.textureEditor)
  if (!editorState) return null

  return <PixelEditor key={editorState.textureId ?? 'new'} />
}

function PixelEditor(): JSX.Element {
  const { textureId, assignSlotAfter, kind, suggestedName } = useAppStore((s) => s.textureEditor)!
  const close = useAppStore((s) => s.closeTextureEditor)
  const addTexture = useProjectStore((s) => s.addTexture)
  const updateTexture = useProjectStore((s) => s.updateTexture)
  const assignTexture = useProjectStore((s) => s.assignTexture)
  const allTextures = useProjectStore((s) => s.project?.textures)
  const existing = useProjectStore((s) =>
    textureId ? s.project?.textures.find((t) => t.id === textureId) : undefined
  )

  const [layers, setLayers] = useState<Layer[]>(() => [makeLayer('Background')])
  const [activeId, setActiveId] = useState(() => layers[0].id)
  const [name, setName] = useState(existing?.name ?? suggestedName ?? '')
  const [color, setColor] = useState('#7d7d7d')
  const [accent, setAccent] = useState('#d85555')
  const [tool, setTool] = useState<Tool>('pencil')
  const [mirror, setMirror] = useState(false)
  const [fx, setFx] = useState<PixelFx>(DEFAULT_FX)

  const [noise, setNoise] = useState(45)
  const [hover, setHover] = useState<number | null>(null)
  const [shapePreview, setShapePreview] = useState<number[] | null>(null)
  const [presetOpen, setPresetOpen] = useState(false)
  const [stencilOpen, setStencilOpen] = useState(false)
  const undoStack = useRef<Layer[][]>([])
  const redoStack = useRef<Layer[][]>([])
  const strokeActive = useRef(false)
  const strokeErase = useRef(false)
  const strokeTouched = useRef<Set<number>>(new Set())
  const lastCell = useRef<number | null>(null)
  const shapeAnchor = useRef<number | null>(null)
  const shapeCellsRef = useRef<number[]>([])

  const active = layers.find((l) => l.id === activeId) ?? layers[0]

  useEffect(() => {
    if (existing?.data) {
      void dataUrlToGrid(existing.data).then((g) =>
        setLayers((ls) => ls.map((l, i) => (i === 0 ? { ...l, grid: g } : l)))
      )
    }

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
    const prev = undoStack.current.pop()
    if (!prev) return
    redoStack.current.push(snapshot(layersRef.current))
    restore(prev)
  }, [restore])

  const redo = useCallback(() => {
    const next = redoStack.current.pop()
    if (!next) return
    undoStack.current.push(snapshot(layersRef.current))
    restore(next)
  }, [restore])

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

  const transform = useCallback(
    (fn: (g: Grid) => Grid) => {
      pushUndo()
      setActiveGrid(fn)
    },
    [pushUndo, setActiveGrid]
  )

  useEffect(() => {
    const TOOL_KEYS: Record<string, Tool> = {
      b: 'pencil',
      e: 'eraser',
      f: 'fill',
      l: 'line',
      r: 'rect',
      i: 'eyedropper',
      u: 'lighten',
      d: 'darken',
      n: 'noise',
      s: 'smooth'
    }
    const onKey = (e: KeyboardEvent): void => {
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
        if (shapeAnchor.current !== null) {
          shapeAnchor.current = null
          setShapePreview(null)
          return
        }
        return close()
      }
      if (e.key === 'ArrowUp') return (e.preventDefault(), transform((g) => shiftGrid(g, 0, -1)))
      if (e.key === 'ArrowDown') return (e.preventDefault(), transform((g) => shiftGrid(g, 0, 1)))
      if (e.key === 'ArrowLeft') return (e.preventDefault(), transform((g) => shiftGrid(g, -1, 0)))
      if (e.key === 'ArrowRight') return (e.preventDefault(), transform((g) => shiftGrid(g, 1, 0)))
      if (e.key === 'Delete' || e.key === 'Backspace') return clearActive()
      const k = e.key.toLowerCase()
      if (k === 'x') return setMirror((m) => !m)
      if (TOOL_KEYS[k]) return setTool(TOOL_KEYS[k])
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [undo, redo, close, transform, clearActive])

  const withMirror = useCallback(
    (cells: number[]): number[] => {
      if (!mirror) return cells
      const out = new Set(cells)
      for (const c of cells) out.add(mirrorOf(c))
      return [...out]
    },
    [mirror]
  )

  const paintCells = (cells: number[], erase: boolean): void => {
    const expanded = withMirror(cells)

    if (ADJUST_TOOLS.includes(tool)) {
      const fresh = expanded.filter((i) => !strokeTouched.current.has(i))
      if (!fresh.length) return
      const factors = new Map<number, number>()
      for (const i of fresh) {
        strokeTouched.current.add(i)
        factors.set(
          i,
          tool === 'noise' ? noiseFactor(noise) : tool === 'lighten' ? 1.16 : 0.86
        )
      }
      setActiveGrid((g) => {
        let next: Grid | null = null
        for (const [i, f] of factors) {
          const cur = g[i]
          if (!cur) continue

          const v =
            tool === 'smooth'
              ? blendColors([cur, ...neighbours(g, i)], 0.65)
              : shade(cur, f)
          if (v === cur) continue
          next ??= [...g]
          next[i] = v
        }
        return next ?? g
      })
      return
    }

    const value = erase || tool === 'eraser' ? '' : color
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

  const floodFill = (idx: number): void => {
    pushUndo()
    setActiveGrid((g) => {
      const target = g[idx]
      if (target === color) return g
      const next = [...g]
      const queue = [idx]
      while (queue.length) {
        const i = queue.pop()!
        if (next[i] !== target) continue
        next[i] = color
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

    if (e.altKey || tool === 'eyedropper') {
      const c = flat.grid[idx]
      if (c) {
        setColor(c)
        if (tool === 'eyedropper') setTool('pencil')
      }
      return
    }

    if (!active.visible) patchLayer(active.id, { visible: true })
    if (tool === 'fill') {
      if (e.buttons !== 2) floodFill(idx)
      return
    }
    strokeErase.current = e.buttons === 2
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
    paintCells([idx], strokeErase.current)
  }

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>): void => {
    const idx = cellFromEvent(e)
    setHover(idx)
    if (idx === null) return
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
    paintCells(cells, strokeErase.current)
  }

  const onPointerUp = (): void => {
    if (shapeAnchor.current !== null) {
      const cells = shapeCellsRef.current
      shapeAnchor.current = null
      setShapePreview(null)
      if (cells.length) {
        pushUndo()
        const value = strokeErase.current ? '' : color
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

  const composite = useMemo(() => compositeLayers(layers, fx), [layers, fx])
  const displayed = composite.grid

  const flat = useMemo(() => compositeLayers(layers), [layers])

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
      ctx.fillStyle = strokeErase.current ? 'rgba(255,255,255,0.55)' : color
      for (const i of shapePreview) ctx.fillRect(i % 16, Math.floor(i / 16), 1, 1)
    }

    for (const ref of previewRefs) {
      const pctx = ref.current?.getContext('2d')
      if (!pctx || !canvasRef.current) continue
      pctx.imageSmoothingEnabled = false
      pctx.clearRect(0, 0, ref.current!.width, ref.current!.height)
      pctx.drawImage(canvasRef.current, 0, 0, ref.current!.width, ref.current!.height)
    }

  }, [displayed, composite, shapePreview, color])

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
    const move = (ev: PointerEvent): void => {
      if (!draggingLight.current) return
      const angle = angleFromEvent(ev)
      setFx((f) => ({ ...f, light: { ...f.light, angle } }))
    }
    const up = (): void => {
      draggingLight.current = false
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

  const fillNoise = (): void => {
    pushUndo()
    setActiveGrid((g) => g.map((c) => (c ? shade(c, noiseFactor(noise)) : c)))
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
      if (opts.newLayer && layers.length < MAX_LAYERS) {
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
  const nameTaken = (allTextures ?? []).some(
    (t) => t.id !== textureId && t.name.toLowerCase() === finalName.toLowerCase()
  )
  const saveBlocked = !finalName ? 'Name this texture first' : nameTaken ? 'That name is already used' : null

  const save = (): void => {
    if (saveBlocked) return

    const data = rgbaToDataUrl(displayed, composite.alpha)
    if (textureId) {
      updateTexture(textureId, { name: finalName, data })
      if (assignSlotAfter) assignTexture(assignSlotAfter, textureId)
    } else {
      const id = addTexture(finalName, data, existing?.kind ?? kind ?? 'block')
      if (assignSlotAfter) assignTexture(assignSlotAfter, id)
    }
    close()
  }

  const [hx, hy] = hover !== null ? xy(hover) : [null, null]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {}
      <motion.div
        className="acrylic absolute inset-0"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.15 }}
        onClick={close}
      />
      <motion.div
        className="relative flex max-h-[94vh] flex-col rounded-xl bg-ink-850 shadow-raised"
        initial={{ opacity: 0, scale: 0.97, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
      >
        {

}
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 border-b border-white/[0.04] px-4 py-2.5">
          <span className="justify-self-start text-2xs font-semibold uppercase tracking-wider text-gold-400/80">
            Texture Editor
          </span>
          <input
            className={cn(
              'input-base w-64 py-1 text-center font-mono text-xs',
              saveBlocked && 'shadow-glow-ember'
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
            <button
              onClick={close}
              className="rounded-md p-1.5 text-mist-500 transition-colors hover:bg-ink-750 hover:text-mist-200"
            >
              <X size={15} />
            </button>
          </div>
        </div>

        <div className="flex min-h-0 gap-5 overflow-y-auto p-5">
          {}
          <div className="flex w-[420px] flex-col gap-3">
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
                  <LightBall angle={fx.light.angle} onPointerDown={onLightDown} />
                </>
              )}
              <div
                className="absolute cursor-crosshair overflow-hidden rounded-md shadow-panel"
                style={{
                  left: PAD,
                  top: PAD,
                  width: CELL * 16,
                  height: CELL * 16,
                  backgroundImage: 'repeating-conic-gradient(#31363e 0% 25%, #262b32 0% 50%)',
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
                {}
                {hover !== null && (
                  <div
                    className="pointer-events-none absolute ring-1 ring-inset ring-white/60"
                    style={{ left: (hover % 16) * CELL, top: Math.floor(hover / 16) * CELL, width: CELL, height: CELL }}
                  />
                )}
              </div>
            </div>

            {}
            <Panel>
              <div className="flex flex-wrap items-center gap-1">
                <ToolButton icon={Pencil} active={tool === 'pencil'} onClick={() => setTool('pencil')} label="Pencil (B)" />
                <ToolButton icon={Eraser} active={tool === 'eraser'} onClick={() => setTool('eraser')} label="Eraser (E), or right-drag" />
                <ToolButton icon={PaintBucket} active={tool === 'fill'} onClick={() => setTool('fill')} label="Fill (F)" />
                <Divider />
                <ToolButton icon={Slash} active={tool === 'line'} onClick={() => setTool('line')} label="Line (L), drag to draw" />
                <ToolButton icon={Square} active={tool === 'rect'} onClick={() => setTool('rect')} label="Rectangle (R), hold Shift for filled" />
                <Divider />
                <ToolButton icon={SunMedium} active={tool === 'lighten'} onClick={() => setTool('lighten')} label="Lighten (U)" />
                <ToolButton icon={Moon} active={tool === 'darken'} onClick={() => setTool('darken')} label="Darken (D)" />
                <ToolButton icon={Sparkles} active={tool === 'noise'} onClick={() => setTool('noise')} label="Noise brush (N)" />
                <ToolButton icon={Droplet} active={tool === 'smooth'} onClick={() => setTool('smooth')} label="Smooth (S), blends a pixel with its neighbours" />
                <Divider />
                <ToolButton icon={Pipette} active={tool === 'eyedropper'} onClick={() => setTool('eyedropper')} label="Pick color (I), or Alt-click" />
                <ToolButton icon={FlipHorizontal2} active={mirror} onClick={() => setMirror((m) => !m)} label="Mirror painting (X)" />
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-1 border-t border-white/[0.04] pt-2">
                <span className="mr-1 text-2xs text-mist-600">Layer</span>
                <ToolButton icon={FlipHorizontal} onClick={() => transform(flipHGrid)} label="Flip horizontal" />
                <ToolButton icon={FlipVertical} onClick={() => transform(flipVGrid)} label="Flip vertical" />
                <ToolButton icon={RotateCw} onClick={() => transform(rotateGrid)} label="Rotate 90 degrees" />
                <Divider />
                <ToolButton icon={ArrowLeft} onClick={() => transform((g) => shiftGrid(g, -1, 0))} label="Nudge left" />
                <ToolButton icon={ArrowUp} onClick={() => transform((g) => shiftGrid(g, 0, -1))} label="Nudge up" />
                <ToolButton icon={ArrowDown} onClick={() => transform((g) => shiftGrid(g, 0, 1))} label="Nudge down" />
                <ToolButton icon={ArrowRight} onClick={() => transform((g) => shiftGrid(g, 1, 0))} label="Nudge right" />

                {
}
                <div className="ml-auto flex items-center gap-1 rounded-md bg-ink-950/60 px-1 py-0.5 shadow-panel">
                  <ToolButton icon={Undo2} onClick={undo} label="Undo (Ctrl+Z)" />
                  <ToolButton icon={Redo2} onClick={redo} label="Redo (Ctrl+Y or Ctrl+Shift+Z)" />
                  <ToolButton icon={Trash2} onClick={clearActive} label="Clear layer (Del)" danger />
                </div>
              </div>
            </Panel>

            {}
            <Panel>
              <div className="mb-2.5 flex items-center gap-2">
                <label
                  className="relative h-8 w-10 shrink-0 cursor-default overflow-hidden rounded-md shadow-panel"
                  style={{ background: color }}
                  title="Current color, click for the full picker"
                >
                  <input
                    type="color"
                    value={color}
                    className="absolute inset-0 h-full w-full opacity-0"
                    onChange={(e) => setColor(e.target.value)}
                  />
                </label>
                <input
                  className="input-base w-[84px] py-1 text-center font-mono text-2xs"
                  value={color}
                  onChange={(e) => {
                    const v = e.target.value.startsWith('#') ? e.target.value : `#${e.target.value}`
                    if (/^#[0-9a-fA-F]{6}$/.test(v)) setColor(v.toLowerCase())
                  }}
                  onFocus={(e) => e.target.select()}
                />
                <div className="flex-1" />
                {usedColors.length > 0 && (
                  <div className="flex items-center gap-1">
                    <span className="mr-0.5 text-2xs text-mist-600">In use</span>
                    {usedColors.slice(0, 10).map((c) => (
                      <button
                        key={c}
                        onClick={() => setColor(c)}
                        title={c}
                        className={cn(
                          'relative h-5 w-5 rounded-[3px] transition-transform hover:z-10 hover:scale-125',
                          color === c && 'z-10 ring-1 ring-gold-400'
                        )}
                        style={{ background: c }}
                      />
                    ))}
                  </div>
                )}
              </div>
              <div className="grid grid-cols-12 gap-1.5">
                {PIXEL_PALETTE.map((c) => (
                  <button
                    key={c}
                    onClick={() => setColor(c)}
                    className={cn(
                      'relative h-6 rounded-[4px] transition-transform hover:z-10 hover:scale-110',
                      color === c && 'z-10 ring-1 ring-gold-400'
                    )}
                    style={{ background: c }}
                  />
                ))}
              </div>
            </Panel>

            {}
            <Panel>
              <div className="flex items-center gap-3">
                <span className="flex w-16 shrink-0 items-center gap-1.5 text-2xs uppercase tracking-wider text-mist-500">
                  <Sparkles size={11} /> Noise
                </span>
                <div className="flex-1">
                  <SliderRow value={noise} onChange={setNoise} />
                </div>
                <button
                  onClick={fillNoise}
                  title="Scatter noise across the whole layer at this strength"
                  className="shrink-0 rounded-md bg-ink-750 px-2.5 py-1 text-2xs uppercase tracking-wide text-mist-300 transition-colors hover:bg-ink-700 hover:text-gold-300"
                >
                  Fill
                </button>
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
                <div className="flex-1">
                  <SliderRow
                    value={fx.light.strength}
                    onChange={(v) => setFx((f) => ({ ...f, light: { ...f.light, strength: v, enabled: true } }))}
                  />
                </div>
                <BakeButton disabled={!fx.light.enabled} onClick={bakeLight} />
              </div>
            </Panel>
          </div>

          {}
          <div className="flex w-[250px] flex-col gap-4">
            <div>
              <span className="label-base">Preview</span>
              <div className="flex items-end gap-2 rounded-lg bg-ink-900/50 p-3 shadow-panel">
                <span
                  className="overflow-hidden rounded"
                  style={{
                    backgroundImage: 'repeating-conic-gradient(#31363e 0% 25%, #262b32 0% 50%)',
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
            <div>
              <div className="mb-1 flex items-center justify-between">
                <span className="label-base mb-0 flex items-center gap-1.5">
                  <Layers size={11} /> Layers
                </span>
                <button
                  onClick={addLayer}
                  disabled={layers.length >= MAX_LAYERS}
                  title={layers.length >= MAX_LAYERS ? `Max ${MAX_LAYERS} layers` : 'Add layer'}
                  className={cn(
                    'rounded p-1 text-mist-500 transition-colors hover:bg-ink-750 hover:text-mist-200',
                    layers.length >= MAX_LAYERS && 'pointer-events-none opacity-35'
                  )}
                >
                  <Plus size={13} />
                </button>
              </div>
              <div ref={layerListRef} className="space-y-0.5 rounded-lg bg-ink-900/50 p-1.5 shadow-panel">
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
                    onDelete={() => deleteLayer(l.id)}
                    onDragStart={() => beginLayerDrag(l.id)}
                    onDragTo={(y) => dragLayerTo(l.id, y)}
                    onDragEnd={() => setDraggingId(null)}
                  />
                ))}
                {

}
                <div className="mt-1 space-y-1 border-t border-white/[0.05] px-1 pt-1.5">
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
              saveBlocked ? 'text-ember-400' : 'text-mist-600'
            )}
          >
            {saveBlocked ?? 'Right-drag erases · Alt-click samples · X mirrors · N noise brush · arrows nudge'}
          </span>
          <button
            onClick={close}
            className="shrink-0 rounded-md px-4 py-1.5 text-[13px] text-mist-400 transition-colors hover:bg-ink-750 hover:text-mist-200"
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={!!saveBlocked}
            className={cn(
              'flex shrink-0 items-center gap-1.5 rounded-md bg-gold-500 px-4 py-1.5 text-[13px] font-medium text-ink-950 transition-all hover:bg-gold-400 active:scale-[0.98]',
              saveBlocked && 'pointer-events-none opacity-40'
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
      title="Click to select, click again to rename, drag to reorder"
      className={cn(
        'group flex select-none items-center gap-1 rounded-md px-1 py-0.5 transition-colors',
        props.dragging ? 'cursor-grabbing ring-1 ring-gold-500/40' : 'cursor-grab',
        props.active ? 'bg-ink-750 shadow-panel' : 'hover:bg-ink-800'
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
      <div className="flex opacity-0 transition-opacity group-hover:opacity-100">
        {}
        <RowBtn title="Raise" disabled={props.isTop} onClick={() => props.onMove(1)}>
          <ChevronUp size={11} />
        </RowBtn>
        <RowBtn title="Lower" disabled={props.isBottom} onClick={() => props.onMove(-1)}>
          <ChevronDown size={11} />
        </RowBtn>
        <RowBtn title="Duplicate" onClick={props.onDuplicate}>
          <Copy size={10} />
        </RowBtn>
        <RowBtn title="Delete" disabled={!props.canDelete} onClick={props.onDelete} danger>
          <Trash2 size={10} />
        </RowBtn>
      </div>
    </div>
  )
}

function RowBtn(props: {
  title: string
  disabled?: boolean
  danger?: boolean
  onClick: () => void
  children: React.ReactNode
}): JSX.Element {
  return (
    <button
      title={props.title}
      disabled={props.disabled}
      onClick={(e) => {
        e.stopPropagation()
        props.onClick()
      }}
      className={cn(
        'rounded p-0.5 transition-colors',
        props.disabled
          ? 'pointer-events-none text-mist-700'
          : props.danger
            ? 'text-mist-600 hover:text-ember-400'
            : 'text-mist-500 hover:text-mist-200'
      )}
    >
      {props.children}
    </button>
  )
}

function Panel({ children }: { children: React.ReactNode }): JSX.Element {
  return <div className="rounded-lg bg-ink-900/50 p-3 shadow-panel">{children}</div>
}

function Divider(): JSX.Element {
  return <span className="mx-1 h-5 w-px bg-white/[0.07]" />
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

function SliderRow(props: { value: number; onChange: (v: number) => void }): JSX.Element {
  return (
    <div className="flex items-center gap-2">
      <input
        type="range"
        min={0}
        max={100}
        value={props.value}
        onChange={(e) => props.onChange(Number(e.target.value))}
        className="fx-slider flex-1"
      />
      <span className="w-7 text-right font-mono text-2xs text-mist-500">{props.value}</span>
    </div>
  )
}

function BakeButton(props: { disabled: boolean; onClick: () => void }): JSX.Element {
  return (
    <button
      onClick={props.onClick}
      disabled={props.disabled}
      title={
        props.disabled
          ? 'Turn Light on first, then Apply bakes it into the layers'
          : 'Bake this effect into the layers (undoable)'
      }
      className={cn(
        'rounded-md px-2 py-1 text-2xs uppercase tracking-wide transition-colors',

        props.disabled
          ? 'cursor-not-allowed bg-ink-800/60 text-mist-600 ring-1 ring-inset ring-white/[0.05]'
          : 'bg-ink-750 text-mist-300 shadow-panel hover:bg-ink-700 hover:text-gold-300'
      )}
    >
      Apply
    </button>
  )
}

function LightBall(props: {
  angle: number
  onPointerDown: (e: React.PointerEvent) => void
}): JSX.Element {
  const R = (CELL * 16) / 2 + PAD / 2
  const cx = CELL * 8 + PAD
  const x = cx + Math.cos(props.angle) * R
  const y = cx + Math.sin(props.angle) * R
  return (
    <div
      onPointerDown={props.onPointerDown}
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
