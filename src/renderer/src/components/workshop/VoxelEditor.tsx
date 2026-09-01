import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Box,
  BoxSelect,
  Castle,
  Check,
  ClipboardPaste,
  Copy,
  Eraser,
  FlipHorizontal2,
  Frame,
  Layers,
  Maximize2,
  Minimize2,
  PaintBucket,
  Pencil,
  Pipette,
  Plus,
  Redo2,
  RotateCcw,
  RotateCw,
  Scissors,
  ScissorsLineDashed,
  Trash2,
  TreePine,
  Undo2
} from 'lucide-react'
import * as ContextMenu from '@radix-ui/react-context-menu'
import { ContextMenuContent, ContextMenuItem, ContextMenuSeparator } from '@/components/ui/context'
import { useAppStore } from '@/store/appStore'
import { useProjectStore } from '@/store/projectStore'
import { menuOwnsKeyboard } from '@/components/ui/dismissDistant'
import { useSwatch, useSwatchVersion } from '@/components/pixel/blockSwatches'
import {
  BreakBurst,
  MergedFace,
  ModelBlock,
  modelKindOf,
  SelectionBox,
  type ModelKind,
  type SelBounds
} from './models'
import { Slider } from '@/components/ui/controls'
import { titleCase } from '@shared/generator/templates/block'
import { TITLEBAR_UNSCALE } from '@shared/ui'
import type { ArtemisElement } from '@shared/project'
import type { BuildVariant, StructureProps, TreeProps } from '@shared/generator/props'
import { isAxisCapable, splitAxis, STRUCTURE_DEFAULTS, TREE_DEFAULTS, withAxis } from '@shared/generator/props'
import {
  FACE_NORMALS,
  HALF,
  MAX_Y,
  highestY,
  inBounds,
  keyOf,
  mergeFaces,
  newVariant,
  parseKey,
  seedGrownVariant,
  visibleVoxels,
  type CellFace,
  type VoxelCell
} from './voxel'
import { useRefArt, useRefLabel, WorkshopBlockPicker, type RefArt } from './refArt'
import { isOpaqueArt, useOpacityVersion } from './opacity'
import { useFirstVisit } from '@/components/tutorial/useFirstVisit'
import { TreeTemplateDialog } from './TreeTemplateDialog'
import { StructureTemplateDialog } from './StructureTemplateDialog'
import { cn } from '@/lib/cn'

const CUBE = 34
const GROUND = (HALF * 2 + 1) * CUBE
const PERSPECTIVE = 640

const GROUND_RES = 2

interface Freecam {
  x: number
  y: number
  z: number
  yaw: number
  pitch: number
}

function forwardOf(yaw: number, pitch: number): { x: number; y: number; z: number } {
  const ry = (yaw * Math.PI) / 180
  const rp = (pitch * Math.PI) / 180
  return { x: Math.sin(ry) * Math.cos(rp), y: -Math.sin(rp), z: -Math.cos(ry) * Math.cos(rp) }
}

function homeCamera(buildTop: number): Freecam {
  const yaw = -28
  const pitch = 18
  const dist = 1400
  const aimY = Math.max(2.5, buildTop * 0.5) * CUBE
  const f = forwardOf(yaw, pitch)
  return { x: -f.x * dist, y: aimY - f.y * dist, z: -f.z * dist, yaw, pitch }
}

function camString(c: Freecam): string {
  return `translateZ(${PERSPECTIVE}px) rotateX(${-c.pitch}deg) rotateY(${c.yaw}deg) translate3d(${-c.x}px, ${c.y}px, ${-c.z}px)`
}

const FLY_RANGE = CUBE * (HALF + 40)
function clampCam(c: Freecam): void {
  c.x = Math.max(-FLY_RANGE, Math.min(FLY_RANGE, c.x))
  c.z = Math.max(-FLY_RANGE, Math.min(FLY_RANGE, c.z))
  c.y = Math.max(CUBE * 0.4, Math.min(CUBE * (MAX_Y + 24), c.y))
  c.pitch = Math.max(-88, Math.min(88, c.pitch))
}

const FLY_SPEED = CUBE * 10
const FLY_KEYS = new Set(['w', 'a', 's', 'd', 'space', 'shift'])

type Tool = 'place' | 'erase' | 'pick' | 'select'

export function VoxelEditorOverlay(): JSX.Element | null {
  const state = useAppStore((s) => s.workshopEditor)
  const element = useProjectStore((s) =>
    state ? s.project?.elements.find((e) => e.id === state.elementId) : undefined
  )
  const close = useAppStore((s) => s.closeWorkshopEditor)
  if (!state) return null
  if (!element || (element.kind !== 'tree' && element.kind !== 'structure')) {

    close()
    return null
  }
  return <VoxelEditor element={element} onClose={close} />
}

function VoxelEditor({
  element,
  onClose
}: {
  element: ArtemisElement
  onClose: () => void
}): JSX.Element {

  useFirstVisit('workshop')
  const updateElement = useProjectStore((s) => s.updateElement)
  const isTree = element.kind === 'tree'
  const treeProps = { ...TREE_DEFAULTS, ...(element.properties as Partial<TreeProps>) }
  const structProps = { ...STRUCTURE_DEFAULTS, ...(element.properties as Partial<StructureProps>) }
  const variants: BuildVariant[] = isTree ? treeProps.variants : structProps.variants
  const display = (element.properties['displayName'] as string) || titleCase(element.name)

  const [activeId, setActiveId] = useState<string | null>(variants[0]?.id ?? null)
  const active = variants.find((v) => v.id === activeId) ?? variants[0] ?? null

  const [tool, setTool] = useState<Tool>('place')
  const [currentRef, setCurrentRef] = useState<string>(() => {
    const used = variants.flatMap((v) => Object.values(v.blocks))
    const last = used[used.length - 1]
    return last ? splitAxis(last).ref : isTree ? treeProps.logBlock : 'block:PLANKS_OAK'
  })
  const [recent, setRecent] = useState<string[]>(() => {
    const used = [
      ...new Set(
        variants
          .flatMap((v) => Object.values(v.blocks))
          .map((v) => splitAxis(v).ref)
          .reverse()
      )
    ].slice(0, 24)
    return used.length ? used : [isTree ? treeProps.logBlock : 'block:PLANKS_OAK']
  })
  const [pickerOpen, setPickerOpen] = useState(false)
  const [templatesOpen, setTemplatesOpen] = useState(false)
  const [clip, setClip] = useState(MAX_Y)
  const [viewOpen, setViewOpen] = useState(false)

  const commitVariants = (next: BuildVariant[], extra?: Record<string, unknown>): void => {
    updateElement(element.id, {
      properties: { ...element.properties, variants: next, ...extra }
    })
  }

  const undoStacks = useRef(new Map<string, { undo: Record<string, string>[]; redo: Record<string, string>[] }>())
  const stackFor = (id: string): { undo: Record<string, string>[]; redo: Record<string, string>[] } => {
    let s = undoStacks.current.get(id)
    if (!s) {
      s = { undo: [], redo: [] }
      undoStacks.current.set(id, s)
    }
    return s
  }

  const coalesceTag = useRef<string | null>(null)
  const setBlocks = (variant: BuildVariant, blocks: Record<string, string>, coalesce?: string): void => {
    const s = stackFor(variant.id)
    if (!coalesce || coalesceTag.current !== coalesce) s.undo.push(variant.blocks)
    if (s.undo.length > 100) s.undo.shift()
    s.redo = []
    coalesceTag.current = coalesce ?? null
    commitVariants(
      variants.map((v) => (v.id === variant.id ? { ...v, blocks } : v)),

      isTree && treeProps.design !== 'built' ? { design: 'built' } : undefined
    )
  }

  const undo = (): void => {
    if (!active) return
    coalesceTag.current = null
    const s = stackFor(active.id)
    const prev = s.undo.pop()
    if (!prev) return
    s.redo.push(active.blocks)
    commitVariants(variants.map((v) => (v.id === active.id ? { ...v, blocks: prev } : v)))
  }

  const redo = (): void => {
    if (!active) return
    coalesceTag.current = null
    const s = stackFor(active.id)
    const next = s.redo.pop()
    if (!next) return
    s.undo.push(active.blocks)
    commitVariants(variants.map((v) => (v.id === active.id ? { ...v, blocks: next } : v)))
  }

  const refArt = useRefArt()

  const burstSerial = useRef(0)
  const [bursts, setBursts] = useState<
    { id: number; x: number; y: number; z: number; src?: string; color: string }[]
  >([])
  const spawnBurst = (x: number, y: number, z: number, ref: string): void => {
    const art = refArt(ref)
    burstSerial.current++
    setBursts((b) => [
      ...b.slice(-7),
      { id: burstSerial.current, x, y, z, src: art.side ?? art.top, color: art.color }
    ])
  }

  const rememberRef = (raw: string): void => {

    const ref = splitAxis(raw).ref
    setCurrentRef(ref)
    setRecent((r) => [ref, ...r.filter((x) => x !== ref)].slice(0, 24))
  }

  const placeAt = (x: number, y: number, z: number, value = currentRef): void => {
    if (!active || !inBounds(x, y, z)) return
    const key = keyOf(x, y, z)
    if (active.blocks[key] === value) return
    setBlocks(active, { ...active.blocks, [key]: value })
  }

  const eraseAt = (x: number, y: number, z: number): void => {
    if (!active) return
    const key = keyOf(x, y, z)
    if (!(key in active.blocks)) return
    spawnBurst(x, y, z, active.blocks[key])
    const next = { ...active.blocks }
    delete next[key]
    setBlocks(active, next)
  }

  const [selA, setSelA] = useState<{ x: number; y: number; z: number } | null>(null)
  const [selB, setSelB] = useState<{ x: number; y: number; z: number } | null>(null)
  const [clipboard, setClipboard] = useState<{
    sx: number
    sy: number
    sz: number
    cells: Record<string, string>
  } | null>(null)
  const [pasting, setPasting] = useState(false)

  useEffect(() => {
    setSelA(null)
    setSelB(null)
    setPasting(false)
  }, [activeId])

  const selBox: SelBounds | null = useMemo(() => {
    if (!selA) return null
    const b = selB ?? selA
    return {
      x0: Math.min(selA.x, b.x),
      x1: Math.max(selA.x, b.x),
      y0: Math.min(selA.y, b.y),
      y1: Math.max(selA.y, b.y),
      z0: Math.min(selA.z, b.z),
      z1: Math.max(selA.z, b.z)
    }
  }, [selA, selB])

  const forEachSelected = (
    fn: (key: string, ref: string, rx: number, ry: number, rz: number) => void
  ): void => {
    if (!active || !selBox) return
    for (const [key, ref] of Object.entries(active.blocks)) {
      const { x, y, z } = parseKey(key)
      if (x < selBox.x0 || x > selBox.x1) continue
      if (y < selBox.y0 || y > selBox.y1) continue
      if (z < selBox.z0 || z > selBox.z1) continue
      fn(key, ref, x - selBox.x0, y - selBox.y0, z - selBox.z0)
    }
  }

  const copySel = (): boolean => {
    if (!selBox) return false
    const cells: Record<string, string> = {}
    let n = 0
    forEachSelected((_key, ref, rx, ry, rz) => {
      cells[keyOf(rx, ry, rz)] = ref
      n++
    })
    if (!n) return false
    setClipboard({
      sx: selBox.x1 - selBox.x0 + 1,
      sy: selBox.y1 - selBox.y0 + 1,
      sz: selBox.z1 - selBox.z0 + 1,
      cells
    })
    return true
  }

  const deleteSel = (): void => {
    if (!active || !selBox) return
    const next = { ...active.blocks }
    let n = 0
    forEachSelected((key) => {
      delete next[key]
      n++
    })
    if (n) setBlocks(active, next)
  }

  const cutSel = (): void => {
    if (copySel()) deleteSel()
  }

  const remapSel = (
    dims: { sx: number; sy: number; sz: number },
    map: (rx: number, ry: number, rz: number) => [number, number, number][],

    reword?: (value: string) => string
  ): void => {
    if (!active || !selBox) return
    const next = { ...active.blocks }
    const moved: [number, number, number, string][] = []
    forEachSelected((key, ref, rx, ry, rz) => {
      delete next[key]
      for (const [nx, ny, nz] of map(rx, ry, rz)) moved.push([nx, ny, nz, reword ? reword(ref) : ref])
    })
    if (!moved.length) return
    for (const [nx, ny, nz, ref] of moved) {
      const x = selBox.x0 + nx
      const y = selBox.y0 + ny
      const z = selBox.z0 + nz
      if (inBounds(x, y, z)) next[keyOf(x, y, z)] = ref
    }
    setBlocks(active, next)
    setSelA({ x: selBox.x0, y: selBox.y0, z: selBox.z0 })
    setSelB({
      x: Math.min(selBox.x0 + dims.sx - 1, HALF),
      y: Math.min(selBox.y0 + dims.sy - 1, MAX_Y),
      z: Math.min(selBox.z0 + dims.sz - 1, HALF)
    })
  }

  const rotateSel = (): void => {
    if (!selBox) return
    const sx = selBox.x1 - selBox.x0 + 1
    const sy = selBox.y1 - selBox.y0 + 1
    const sz = selBox.z1 - selBox.z0 + 1
    remapSel(
      { sx: sz, sy, sz: sx },
      (rx, ry, rz) => [[rz, ry, sx - 1 - rx]],

      (v) => {
        const { ref, axis } = splitAxis(v)
        return withAxis(ref, axis === 'x' ? 'z' : axis === 'z' ? 'x' : null)
      }
    )
  }

  const flipSel = (): void => {
    if (!selBox) return
    const sx = selBox.x1 - selBox.x0 + 1
    const sy = selBox.y1 - selBox.y0 + 1
    const sz = selBox.z1 - selBox.z0 + 1
    remapSel({ sx, sy, sz }, (rx, ry, rz) => [[sx - 1 - rx, ry, rz]])
  }

  const growSel = (): void => {
    if (!selBox) return
    const sx = selBox.x1 - selBox.x0 + 1
    const sy = selBox.y1 - selBox.y0 + 1
    const sz = selBox.z1 - selBox.z0 + 1
    remapSel({ sx: sx * 2, sy: sy * 2, sz: sz * 2 }, (rx, ry, rz) => {
      const out: [number, number, number][] = []
      for (const dx of [0, 1]) for (const dy of [0, 1]) for (const dz of [0, 1]) {
        out.push([rx * 2 + dx, ry * 2 + dy, rz * 2 + dz])
      }
      return out
    })
  }

  const shrinkSel = (): void => {
    if (!selBox) return
    const sx = selBox.x1 - selBox.x0 + 1
    const sy = selBox.y1 - selBox.y0 + 1
    const sz = selBox.z1 - selBox.z0 + 1
    if (sx < 2 && sy < 2 && sz < 2) return
    remapSel(
      { sx: Math.ceil(sx / 2), sy: Math.ceil(sy / 2), sz: Math.ceil(sz / 2) },
      (rx, ry, rz) => [[Math.floor(rx / 2), Math.floor(ry / 2), Math.floor(rz / 2)]]
    )
  }

  const moveSel = (dx: number, dy: number, dz: number): void => {
    if (!active || !selBox) return
    if (selBox.x0 + dx < -HALF || selBox.x1 + dx > HALF) return
    if (selBox.y0 + dy < 0 || selBox.y1 + dy > MAX_Y) return
    if (selBox.z0 + dz < -HALF || selBox.z1 + dz > HALF) return
    const next = { ...active.blocks }
    const moved: [number, number, number, string][] = []
    forEachSelected((key, ref, rx, ry, rz) => {
      delete next[key]
      moved.push([rx, ry, rz, ref])
    })
    for (const [rx, ry, rz, ref] of moved) {
      next[keyOf(selBox.x0 + dx + rx, selBox.y0 + dy + ry, selBox.z0 + dz + rz)] = ref
    }
    if (moved.length) setBlocks(active, next, 'move-selection')

    setSelA({ x: selBox.x0 + dx, y: selBox.y0 + dy, z: selBox.z0 + dz })
    setSelB({ x: selBox.x1 + dx, y: selBox.y1 + dy, z: selBox.z1 + dz })
  }

  const nudgeFor = (key: string, vertical: boolean): [number, number, number] | null => {
    if (vertical) {
      if (key === 'ArrowUp') return [0, 1, 0]
      if (key === 'ArrowDown') return [0, -1, 0]
      return null
    }
    const rad = (Math.round(camRef.current!.yaw / 90) * 90 * Math.PI) / 180
    const fx = Math.round(Math.sin(rad))
    const fz = Math.round(-Math.cos(rad))
    switch (key) {
      case 'ArrowUp':
        return [fx, 0, fz]
      case 'ArrowDown':
        return [-fx, 0, -fz]
      case 'ArrowLeft':
        return [fz, 0, -fx]
      case 'ArrowRight':
        return [-fz, 0, fx]
      default:
        return null
    }
  }

  const FILL_CAP = 4096
  const fillSel = (hollow: boolean): void => {
    if (!active || !selBox) return
    const sx = selBox.x1 - selBox.x0 + 1
    const sy = selBox.y1 - selBox.y0 + 1
    const sz = selBox.z1 - selBox.z0 + 1
    const shell = sx * sy * sz - Math.max(0, sx - 2) * Math.max(0, sy - 2) * Math.max(0, sz - 2)
    if ((hollow ? shell : sx * sy * sz) > FILL_CAP) return
    const next = { ...active.blocks }
    for (let x = selBox.x0; x <= selBox.x1; x++) {
      for (let y = selBox.y0; y <= selBox.y1; y++) {
        for (let z = selBox.z0; z <= selBox.z1; z++) {
          const onShell =
            x === selBox.x0 || x === selBox.x1 || y === selBox.y0 || y === selBox.y1 || z === selBox.z0 || z === selBox.z1
          if (!hollow || onShell) next[keyOf(x, y, z)] = currentRef
          else delete next[keyOf(x, y, z)]
        }
      }
    }
    setBlocks(active, next)
  }

  const pasteAt = (tx: number, ty: number, tz: number): void => {
    if (!active || !clipboard) return
    const next = { ...active.blocks }
    let n = 0
    for (const [rel, ref] of Object.entries(clipboard.cells)) {
      const r = parseKey(rel)
      if (!inBounds(tx + r.x, ty + r.y, tz + r.z)) continue
      next[keyOf(tx + r.x, ty + r.y, tz + r.z)] = ref
      n++
    }
    if (n) setBlocks(active, next)
  }

  const faceAction = (
    cell: { x: number; y: number; z: number; ref: string },
    face: CellFace,
    secondary: boolean
  ): void => {
    if (tool === 'erase') {
      eraseAt(cell.x, cell.y, cell.z)
      return
    }
    if (tool === 'pick') {
      if (secondary) eraseAt(cell.x, cell.y, cell.z)
      else {
        rememberRef(cell.ref)
        setTool('place')
      }
      return
    }
    if (tool === 'select') {
      if (secondary) {
        eraseAt(cell.x, cell.y, cell.z)
        return
      }
      if (pasting) {
        const n = FACE_NORMALS[face]
        pasteAt(cell.x + n.x, cell.y + n.y, cell.z + n.z)
        return
      }
      const c = { x: cell.x, y: cell.y, z: cell.z }

      coalesceTag.current = null

      if (!selA || selB) {
        setSelA(c)
        setSelB(null)
      } else {
        setSelB(c)
      }
      return
    }
    if (secondary) {
      const n = FACE_NORMALS[face]

      const axis = isAxisCapable(currentRef)
        ? face === 'left' || face === 'right'
          ? 'x'
          : face === 'front' || face === 'back'
            ? 'z'
            : null
        : null
      placeAt(cell.x + n.x, cell.y + n.y, cell.z + n.z, withAxis(currentRef, axis))
    } else {
      eraseAt(cell.x, cell.y, cell.z)
    }
  }

  const freeName = (wanted: string): string => {
    const taken = new Set(variants.map((v) => v.name.toLowerCase()))
    if (!taken.has(wanted.toLowerCase())) return wanted
    for (let i = 2; ; i++) {
      const name = `${wanted} ${i}`
      if (!taken.has(name.toLowerCase())) return name
    }
  }

  const addVariant = (seeded?: BuildVariant): void => {
    const v = seeded ?? newVariant(freeName(`Variant ${variants.length + 1}`))
    commitVariants([...variants, v], isTree && treeProps.design !== 'built' ? { design: 'built' } : undefined)
    setActiveId(v.id)
  }

  const applyTemplate = (addedCells: Record<string, string>): void => {

    const used = [...new Set(Object.values(addedCells))]
    setRecent((r) => [...used, ...r.filter((x) => !used.includes(x))].slice(0, 24))
    if (active) {
      setBlocks(active, { ...active.blocks, ...addedCells })
    } else {
      const v: BuildVariant = { ...newVariant(freeName('Variant 1')), blocks: addedCells }
      commitVariants(
        [...variants, v],
        isTree && treeProps.design !== 'built' ? { design: 'built' } : undefined
      )
      setActiveId(v.id)
    }
  }

  const duplicateVariant = (src: BuildVariant): void => {
    const copy: BuildVariant = {
      id: crypto.randomUUID(),
      name: freeName(`${src.name.replace(/ copy( \d+)?$/i, '')} copy`),
      blocks: { ...src.blocks }
    }
    const at = variants.findIndex((v) => v.id === src.id)
    const next = [...variants]
    next.splice(at + 1, 0, copy)
    commitVariants(next)
    setActiveId(copy.id)
  }

  const deleteVariant = (id: string): void => {
    const next = variants.filter((v) => v.id !== id)
    commitVariants(next)
    if (activeId === id) setActiveId(next[0]?.id ?? null)
  }

  const renameVariant = (id: string, name: string): void => {
    const trimmed = name.trim()
    if (!trimmed) return
    commitVariants(variants.map((v) => (v.id === id ? { ...v, name: trimmed } : v)))
  }

  const camRef = useRef<Freecam | null>(null)
  if (camRef.current === null) {
    camRef.current = homeCamera(variants[0] ? highestY(variants[0].blocks) : 0)
  }
  const worldRef = useRef<HTMLDivElement | null>(null)
  const applyCam = (): void => {
    if (worldRef.current && camRef.current) {
      worldRef.current.style.transform = camString(camRef.current)
    }
  }

  const setWorldLive = (on: boolean): void => {
    if (worldRef.current) worldRef.current.style.pointerEvents = on ? '' : 'none'
  }

  const canvasRef = useRef<HTMLDivElement | null>(null)
  const marqueeRef = useRef<HTMLDivElement | null>(null)
  const drag = useRef<{
    x: number
    y: number
    mode: 'look' | 'pan' | 'marquee'
    yaw: number
    pitch: number
    cx: number
    cy: number
    cz: number
    moved: boolean
    pointerId: number
  } | null>(null)
  const onPointerDown = (e: React.PointerEvent): void => {
    if (e.button !== 0 && e.button !== 1 && e.button !== 2) return

    const c = camRef.current!
    const marquee = e.button === 0 && tool === 'select' && !pasting
    drag.current = {
      x: e.clientX,
      y: e.clientY,
      mode: marquee ? 'marquee' : e.button === 1 ? 'pan' : 'look',
      yaw: c.yaw,
      pitch: c.pitch,
      cx: c.x,
      cy: c.y,
      cz: c.z,
      moved: false,
      pointerId: e.pointerId
    }
  }
  const onPointerMove = (e: React.PointerEvent): void => {
    const d = drag.current
    if (!d) return
    const dx = e.clientX - d.x
    const dy = e.clientY - d.y

    if (!d.moved && Math.abs(dx) + Math.abs(dy) > 9) {
      d.moved = true
      ;(e.currentTarget as Element).setPointerCapture?.(d.pointerId)
      setWorldLive(false)
    }
    if (!d.moved) return
    if (d.mode === 'marquee') {

      const box = marqueeRef.current
      const host = canvasRef.current
      if (box && host) {
        const r = host.getBoundingClientRect()
        box.style.display = 'block'
        box.style.left = `${Math.min(d.x, e.clientX) - r.left}px`
        box.style.top = `${Math.min(d.y, e.clientY) - r.top}px`
        box.style.width = `${Math.abs(dx)}px`
        box.style.height = `${Math.abs(dy)}px`
      }
      return
    }
    const c = camRef.current!
    if (d.mode === 'pan') {

      const ry = (d.yaw * Math.PI) / 180
      const r = { x: Math.cos(ry), z: Math.sin(ry) }
      const f = forwardOf(d.yaw, d.pitch)
      const up = { x: -r.z * f.y, y: r.z * f.x - r.x * f.z, z: r.x * f.y }
      const k = 1.1
      c.x = d.cx - r.x * dx * k + up.x * dy * k
      c.y = d.cy + up.y * dy * k
      c.z = d.cz - r.z * dx * k + up.z * dy * k
    } else {

      c.yaw = d.yaw + dx * 0.25
      c.pitch = d.pitch + dy * 0.25
    }
    clampCam(c)
    applyCam()
  }

  const marqueeSelect = (x0c: number, y0c: number, x1c: number, y1c: number): void => {
    const host = canvasRef.current
    if (!active || !host) return
    const r = host.getBoundingClientRect()
    const midX = r.left + r.width / 2
    const midY = r.top + r.height / 2
    const minX = Math.min(x0c, x1c) - midX
    const maxX = Math.max(x0c, x1c) - midX
    const minY = Math.min(y0c, y1c) - midY
    const maxY = Math.max(y0c, y1c) - midY
    const c = camRef.current!
    const yawR = (c.yaw * Math.PI) / 180
    const pitchR = (c.pitch * Math.PI) / 180
    const cosY = Math.cos(yawR)
    const sinY = Math.sin(yawR)
    const cosP = Math.cos(pitchR)
    const sinP = Math.sin(pitchR)
    let hit: SelBounds | null = null
    for (const key of Object.keys(active.blocks)) {
      const { x, y, z } = parseKey(key)

      if (y > clip) continue

      const wx = x * CUBE - c.x
      const wy = -(y * CUBE + CUBE / 2) + c.y
      const wz = z * CUBE - c.z
      const rx = wx * cosY + wz * sinY
      const rz = -wx * sinY + wz * cosY
      const vy = wy * cosP + rz * sinP
      const vz = -wy * sinP + rz * cosP
      if (vz > -1) continue
      const k = PERSPECTIVE / -vz
      const sx = rx * k
      const sy = vy * k
      if (sx < minX || sx > maxX || sy < minY || sy > maxY) continue
      if (!hit) hit = { x0: x, x1: x, y0: y, y1: y, z0: z, z1: z }
      else {
        hit.x0 = Math.min(hit.x0, x)
        hit.x1 = Math.max(hit.x1, x)
        hit.y0 = Math.min(hit.y0, y)
        hit.y1 = Math.max(hit.y1, y)
        hit.z0 = Math.min(hit.z0, z)
        hit.z1 = Math.max(hit.z1, z)
      }
    }
    coalesceTag.current = null
    if (hit) {
      setSelA({ x: hit.x0, y: hit.y0, z: hit.z0 })
      setSelB({ x: hit.x1, y: hit.y1, z: hit.z1 })
    } else {
      setSelA(null)
      setSelB(null)
    }
  }

  const endDrag = (e?: React.PointerEvent): void => {
    const d = drag.current
    if (d?.mode === 'marquee' && d.moved && e) {
      marqueeSelect(d.x, d.y, e.clientX, e.clientY)
    }
    if (marqueeRef.current) marqueeRef.current.style.display = 'none'
    setWorldLive(true)

    setTimeout(() => {
      drag.current = null
    }, 0)
  }
  const wasDrag = (): boolean => Boolean(drag.current?.moved)

  const hovering = useRef(false)
  useEffect(() => {
    const onWheel = (e: WheelEvent): void => {
      if (!hovering.current) return
      e.preventDefault()

      const c = camRef.current!
      const f = forwardOf(c.yaw, c.pitch)
      c.x -= f.x * e.deltaY
      c.y -= f.y * e.deltaY
      c.z -= f.z * e.deltaY
      clampCam(c)
      applyCam()
    }
    window.addEventListener('wheel', onWheel, { passive: false })
    return () => window.removeEventListener('wheel', onWheel)
  }, [])

  const keysRef = useRef(new Set<string>())
  const dialogRef = useRef(false)
  dialogRef.current = pickerOpen || templatesOpen
  useEffect(() => {
    const keyName = (e: KeyboardEvent): string => (e.key === ' ' ? 'space' : e.key.toLowerCase())
    const down = (e: KeyboardEvent): void => {

      if (e.ctrlKey || e.metaKey || e.altKey) return
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      const k = keyName(e)
      if (!FLY_KEYS.has(k)) return
      keysRef.current.add(k)
      e.preventDefault()
    }
    const up = (e: KeyboardEvent): void => {
      keysRef.current.delete(keyName(e))
    }

    const clear = (): void => keysRef.current.clear()
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', clear)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', clear)
    }
  }, [])

  useEffect(() => {
    let raf = 0
    let last = performance.now()
    let flying = false
    const tick = (now: number): void => {

      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      const keys = keysRef.current
      const moving = keys.size > 0 && !dialogRef.current
      if (moving !== flying) {
        flying = moving
        setWorldLive(!moving)
      }

      if (!drag.current && marqueeRef.current && marqueeRef.current.style.display !== 'none') {
        marqueeRef.current.style.display = 'none'
      }
      if (moving) {
        const c = camRef.current!
        const f = forwardOf(c.yaw, c.pitch)
        const ry = (c.yaw * Math.PI) / 180
        const step = FLY_SPEED * dt
        if (keys.has('w')) {
          c.x += f.x * step
          c.y += f.y * step
          c.z += f.z * step
        }
        if (keys.has('s')) {
          c.x -= f.x * step
          c.y -= f.y * step
          c.z -= f.z * step
        }
        if (keys.has('a')) {
          c.x -= Math.cos(ry) * step
          c.z -= Math.sin(ry) * step
        }
        if (keys.has('d')) {
          c.x += Math.cos(ry) * step
          c.z += Math.sin(ry) * step
        }
        if (keys.has('space')) c.y += step
        if (keys.has('shift')) c.y -= step
        clampCam(c)
        applyCam()
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (pickerOpen || templatesOpen) return

      if (menuOwnsKeyboard()) return
      if (e.key === 'Escape') {

        if (viewOpen) {
          setViewOpen(false)
          return
        }
        if (pasting) {
          setPasting(false)
          return
        }
        if (selA) {
          setSelA(null)
          setSelB(null)
          return
        }
        onClose()
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) redo()
        else undo()
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault()
        redo()
      }
      if (e.target instanceof HTMLInputElement) return
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
        e.preventDefault()
        copySel()
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'x') {
        e.preventDefault()
        cutSel()
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') {
        if (clipboard) {
          e.preventDefault()
          setTool('select')
          setPasting(true)
        }
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && tool === 'select') deleteSel()
      if (e.key.toLowerCase() === 'r' && tool === 'select' && !e.ctrlKey && !e.metaKey) rotateSel()
      if (tool === 'select' && selBox && e.key.startsWith('Arrow') && !e.ctrlKey && !e.metaKey) {
        const d = nudgeFor(e.key, e.altKey)
        if (d) {
          e.preventDefault()
          moveSel(...d)
        }
        return
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return
      if (e.key.toLowerCase() === 'b') setTool('place')
      if (e.key.toLowerCase() === 'e') setTool('erase')
      if (e.key.toLowerCase() === 'p') setTool('pick')
      if (e.key.toLowerCase() === 'v') setTool('select')

      if (/^[1-9]$/.test(e.key)) {
        const slot = recent[Number(e.key) - 1]
        if (slot) {
          setCurrentRef(slot)
          setTool('place')
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const bakeVersion = useSwatchVersion()
  const opacityVersion = useOpacityVersion()
  const grass = useSwatch('grass')
  const project = useProjectStore((s) => s.project)

  const kindOf = useMemo(() => {
    const plants = new Set(
      (project?.elements ?? []).filter((e) => e.kind === 'plant').map((e) => e.name)
    )
    return (ref: string): ModelKind => (plants.has(ref.trim()) ? 'cross' : modelKindOf(ref))
  }, [project])

  const scene = useMemo(() => {
    if (!active) return { models: [] as VoxelCell[], rects: [] as ReturnType<typeof mergeFaces> }
    const cells = visibleVoxels(
      active.blocks,
      clip,

      (ref) => kindOf(ref) === 'cube' && isOpaqueArt(refArt(ref)),

      true
    )
    return {

      models: cells.filter((c) => kindOf(c.ref) !== 'cube'),
      rects: mergeFaces(cells.filter((c) => kindOf(c.ref) === 'cube'))
    }

  }, [active, clip, refArt, opacityVersion, kindOf])
  const blockCount = active ? Object.keys(active.blocks).length : 0
  const buildTop = active ? highestY(active.blocks) : 0

  const kindAt = useMemo(() => {
    const blocks = active?.blocks ?? {}
    return (x: number, y: number, z: number): ModelKind | undefined => {
      const ref = blocks[keyOf(x, y, z)]
      return ref === undefined ? undefined : kindOf(ref)
    }
  }, [active, kindOf])

  const groundCell = (e: React.MouseEvent<HTMLDivElement>): { x: number; z: number } => ({
    x: Math.floor(e.nativeEvent.offsetX / (CUBE * GROUND_RES)) - HALF,
    z: Math.floor(e.nativeEvent.offsetY / (CUBE * GROUND_RES)) - HALF
  })

  const groundClick = (e: React.MouseEvent<HTMLDivElement>): void => {
    if (wasDrag() || !active || tool !== 'select') return
    const { x, z } = groundCell(e)
    if (pasting) {
      pasteAt(x, 0, z)
      return
    }

    coalesceTag.current = null
    const c = { x, y: 0, z }
    if (!selA || selB) {
      setSelA(c)
      setSelB(null)
    } else {
      setSelB(c)
    }
  }

  const groundBuild = (e: React.MouseEvent<HTMLDivElement>): void => {
    e.preventDefault()
    e.stopPropagation()
    if (wasDrag() || !active || tool !== 'place') return
    const { x, z } = groundCell(e)
    placeAt(x, 0, z)
  }

  return (

    <div
      className="fixed inset-x-0 bottom-0 z-40 flex flex-col bg-ink-900"
      style={{ top: 40 * TITLEBAR_UNSCALE }}
    >
      {}
      <div className="flex h-12 shrink-0 items-center gap-3 border-b border-white/[0.06] px-4">
        <Layers size={15} className="text-gold-400" />
        <div className="min-w-0">
          <span className="text-[13px] font-semibold tracking-tight">{display}</span>
          <span className="ml-2 font-mono text-2xs text-mist-600">{element.name}</span>
        </div>

        <div className="mx-2 h-5 w-px bg-white/[0.07]" />

        {}
        <div className="flex gap-1 rounded-md bg-ink-900/70 p-0.5 shadow-panel">
          {(
            [
              { id: 'place', icon: Box, label: 'Build (B) — right-click builds, left-click breaks, like the game. Logs lie along the face you build off.' },
              { id: 'erase', icon: Eraser, label: 'Erase (E) — either button removes' },
              { id: 'pick', icon: Pipette, label: 'Pick block (P)' },
              { id: 'select', icon: BoxSelect, label: 'Select (V) — drag around blocks or click two corners, then move, fill, copy, or rotate' }
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              onClick={() => setTool(t.id)}
              title={t.label}
              className={cn(
                'relative rounded p-1.5 transition-colors hover:z-10',
                tool === t.id ? 'bg-ink-750 text-gold-400 shadow-panel' : 'text-mist-500 hover:text-mist-300'
              )}
            >
              <t.icon size={14} />
            </button>
          ))}
        </div>

        <button
          onClick={undo}
          title="Undo (Ctrl+Z)"
          className="rounded-md p-1.5 text-mist-500 transition-colors hover:bg-ink-750 hover:text-mist-200"
        >
          <Undo2 size={14} />
        </button>
        <button
          onClick={redo}
          title="Redo (Ctrl+Y)"
          className="rounded-md p-1.5 text-mist-500 transition-colors hover:bg-ink-750 hover:text-mist-200"
        >
          <Redo2 size={14} />
        </button>

        <div className="mx-2 h-5 w-px bg-white/[0.07]" />

        {}
        <button
          onClick={() => setTemplatesOpen(true)}
          title={
            isTree
              ? 'Stamp a ready-made tree shape on top of the build'
              : 'Stamp a ready-made structure, a dungeon to a whole labyrinth, on top of the build'
          }
          className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-2xs text-mist-400 transition-colors hover:bg-ink-750 hover:text-mist-200"
        >
          {isTree ? <TreePine size={13} /> : <Castle size={13} />} Templates
        </button>

        <div className="mx-2 h-5 w-px bg-white/[0.07]" />

        {

}
        <div data-tour="workshop-slice" className="relative">
          <button
            onClick={() => setViewOpen((o) => !o)}
            title="Hide everything above a height, for a floor-plan view of the build"
            className={cn(
              'flex items-center gap-1.5 rounded-md px-2 py-1.5 text-2xs transition-colors hover:bg-ink-750',
              clip < MAX_Y ? 'text-gold-400' : 'text-mist-400 hover:text-mist-200'
            )}
          >
            <Scissors size={13} /> Cutaway
            {clip < MAX_Y && <span className="font-mono">{clip}</span>}
          </button>
          {viewOpen && (
            <>
              <div className="fixed inset-0 z-20" onClick={() => setViewOpen(false)} />
              <div className="absolute left-0 top-full z-30 mt-1 w-64 rounded-lg border border-white/[0.06] bg-ink-800 p-3 shadow-panel">
                <p className="text-2xs leading-relaxed text-mist-500">
                  Hides every block above this height. For working inside, flying is usually
                  easier: WASD goes straight through walls.
                </p>
                <div className="mt-2.5 flex items-center gap-2">
                  <div className="flex-1">
                    <Slider value={clip} min={0} max={MAX_Y} step={1} onChange={setClip} />
                  </div>
                  <span className="w-6 text-right font-mono text-2xs text-mist-300">{clip}</span>
                </div>
                {clip < MAX_Y && (
                  <button
                    onClick={() => setClip(MAX_Y)}
                    className="mt-2.5 w-full rounded-md bg-ink-750 px-2 py-1.5 text-2xs text-mist-300 transition-colors hover:bg-ink-700 hover:text-mist-100"
                  >
                    Show everything again
                  </button>
                )}
              </div>
            </>
          )}
        </div>

        <div className="flex-1" />

        <span className="font-mono text-2xs text-mist-600">
          {blockCount} block{blockCount === 1 ? '' : 's'}
        </span>
        <button
          onClick={() => {
            camRef.current = homeCamera(buildTop)
            applyCam()
          }}
          title="Fly back to the starting view"
          className="rounded-md p-1.5 text-mist-500 transition-colors hover:bg-ink-750 hover:text-mist-200"
        >
          <RotateCcw size={14} />
        </button>
        <button
          onClick={onClose}
          className="flex items-center gap-1.5 rounded-md bg-gold-500 px-3 py-1.5 text-2xs font-semibold uppercase tracking-wide text-ink-950 transition-all hover:bg-gold-400 active:scale-[0.97]"
        >
          <Check size={13} strokeWidth={2.5} /> Done
        </button>
      </div>

      <div className="flex min-h-0 flex-1">
        {}
        <div
          data-tour="workshop-variants"
          className="flex w-[210px] shrink-0 flex-col border-r border-white/[0.06] bg-ink-900/40"
        >
          <div className="flex items-center gap-2 px-3 pb-1 pt-3">
            <span className="label-base mb-0">Variants</span>
            <span className="font-mono text-2xs text-mist-600">{variants.length}</span>
            <div className="flex-1" />
            <button
              onClick={() => addVariant()}
              title="Add a variant"
              className="rounded p-1 text-mist-500 transition-colors hover:bg-ink-750 hover:text-gold-400"
            >
              <Plus size={13} />
            </button>
          </div>
          <p className="px-3 pb-2 text-2xs leading-relaxed text-mist-600">
            Alternate builds of the same thing. The game picks one at random each time it places it.
          </p>
          <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
            {variants.map((v) => (
              <VariantRow
                key={v.id}
                variant={v}
                active={v.id === active?.id}
                onSelect={() => setActiveId(v.id)}
                onDuplicate={() => duplicateVariant(v)}
                onDelete={() => deleteVariant(v.id)}
                onRename={(name) => renameVariant(v.id, name)}
              />
            ))}
            {variants.length === 0 && (
              <div className="flex flex-col gap-2 px-1 pt-2">
                <button
                  onClick={() => addVariant()}
                  className="flex items-center justify-center gap-1.5 rounded-md bg-ink-750 px-3 py-2 text-xs text-mist-200 transition-colors hover:bg-ink-700"
                >
                  <Plus size={13} /> New empty variant
                </button>
                {isTree && (
                  <button
                    onClick={() => addVariant(seedGrownVariant(treeProps))}
                    className="flex items-center justify-center gap-1.5 rounded-md bg-ink-750 px-3 py-2 text-xs text-mist-200 transition-colors hover:bg-ink-700"
                    title="Starts from the trunk-and-canopy this tree already grows"
                  >
                    <Plus size={13} /> Start from grown shape
                  </button>
                )}
                <button
                  onClick={() => setTemplatesOpen(true)}
                  className="flex items-center justify-center gap-1.5 rounded-md bg-ink-750 px-3 py-2 text-xs text-mist-200 transition-colors hover:bg-ink-700"
                  title="Pick a ready-made silhouette and build from there"
                >
                  {isTree ? <TreePine size={13} /> : <Castle size={13} />} Start from a template
                </button>
              </div>
            )}
          </div>

          {
}
          {isTree && treeProps.design !== 'built' && variants.length > 0 && (
            <div className="border-t border-white/[0.06] p-3">
              <p className="text-2xs leading-relaxed text-mist-500">
                This tree is still set to its <span className="text-mist-300">Grown</span> shape, so
                these builds are not exported.
              </p>
              <button
                onClick={() => commitVariants(variants, { design: 'built' })}
                className="mt-2 w-full rounded-md bg-gold-500/15 px-3 py-1.5 text-2xs font-semibold text-gold-400 transition-colors hover:bg-gold-500/25"
              >
                Use built shape
              </button>
            </div>
          )}
        </div>

        {}
        <div
          ref={canvasRef}
          className="relative min-w-0 flex-1 cursor-grab select-none overflow-hidden active:cursor-grabbing"
          style={{
            background: 'linear-gradient(#4c86cc 0%, #8ab6e3 100%)',
            perspective: `${PERSPECTIVE}px`
          }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onPointerEnter={() => (hovering.current = true)}
          onPointerLeave={() => {
            hovering.current = false
            endDrag()
          }}
          onContextMenu={(e) => e.preventDefault()}
        >
          {active ? (
            <div

              key="world"
              ref={(el) => {
                worldRef.current = el
                if (el && camRef.current) el.style.transform = camString(camRef.current)
              }}
              className="absolute left-1/2 top-1/2 h-0 w-0"
              style={{ transformStyle: 'preserve-3d', willChange: 'transform' }}
            >
              {
}
              <div
                className="absolute"
                onClick={groundClick}
                onContextMenu={groundBuild}
                style={{
                  width: GROUND * GROUND_RES,
                  height: GROUND * GROUND_RES,
                  left: (-GROUND * GROUND_RES) / 2,
                  top: (-GROUND * GROUND_RES) / 2,
                  transform: `rotateX(90deg) scale(${1 / GROUND_RES})`,
                  backgroundColor: '#5d8f42',
                  backgroundImage:
                    `linear-gradient(rgba(0,0,0,0.16) ${GROUND_RES}px, transparent ${GROUND_RES}px), linear-gradient(90deg, rgba(0,0,0,0.16) ${GROUND_RES}px, transparent ${GROUND_RES}px)` +
                    (grass ? `, url(${grass.texture})` : ''),
                  backgroundSize: `${CUBE * GROUND_RES}px ${CUBE * GROUND_RES}px`,
                  imageRendering: 'pixelated'
                }}
              >
                {}
                <div
                  className="pointer-events-none absolute border-4 border-gold-400/80"
                  style={{
                    left: HALF * CUBE * GROUND_RES,
                    top: HALF * CUBE * GROUND_RES,
                    width: CUBE * GROUND_RES,
                    height: CUBE * GROUND_RES
                  }}
                />
              </div>

              {tool === 'select' && selBox && <SelectionBox box={selBox} cube={CUBE} />}

              {scene.rects.map((rect) => (
                <MergedFace
                  key={`${rect.face}|${rect.plane}|${rect.u0},${rect.v0}|${rect.w}x${rect.h}|${rect.ref}`}
                  rect={rect}
                  art={refArt(rect.ref)}
                  cube={CUBE}
                  bakeVersion={bakeVersion}
                  onCell={(x, y, z, face, secondary) => {
                    if (!wasDrag()) faceAction({ x, y, z, ref: rect.ref }, face, secondary)
                  }}
                />
              ))}

              {scene.models.map((cell) => (
                <ModelBlock
                  key={`${cell.x},${cell.y},${cell.z}`}
                  cell={cell}
                  kind={kindOf(cell.ref)}
                  art={refArt(cell.ref)}
                  cube={CUBE}
                  neighborKind={kindAt}
                  bakeVersion={bakeVersion}
                  onFace={(face, secondary) => {
                    if (!wasDrag()) faceAction(cell, face, secondary)
                  }}
                />
              ))}

              {bursts.map((b) => (
                <BreakBurst
                  key={b.id}
                  x={b.x}
                  y={b.y}
                  z={b.z}
                  src={b.src}
                  color={b.color}
                  cube={CUBE}
                  cam={camRef}
                  onDone={() => setBursts((list) => list.filter((x) => x.id !== b.id))}
                />
              ))}
            </div>
          ) : (
            <div key="empty" className="flex h-full items-center justify-center">
              <div className="rounded-xl bg-ink-950/60 px-6 py-5 text-center backdrop-blur-sm">
                <p className="text-[13px] text-mist-200">No variants yet.</p>
                <p className="mt-1 max-w-xs text-2xs leading-relaxed text-mist-400">
                  Add one on the left to start building. Right-click the ground to lay the first
                  block; the gold square is where the game will anchor it.
                </p>
              </div>
            </div>
          )}

          {}
          {tool === 'select' && active && (
            <div className="absolute left-1/2 top-3 flex -translate-x-1/2 items-center gap-0.5 rounded-lg bg-ink-950/90 p-1 shadow-panel">
              <span className="px-2 font-mono text-2xs text-mist-400">
                {selBox
                  ? `${selBox.x1 - selBox.x0 + 1}×${selBox.y1 - selBox.y0 + 1}×${selBox.z1 - selBox.z0 + 1}`
                  : 'click two corners'}
              </span>
              {(
                [
                  { icon: Copy, label: 'Copy (Ctrl+C)', run: copySel },
                  { icon: ScissorsLineDashed, label: 'Cut (Ctrl+X)', run: cutSel },
                  { icon: PaintBucket, label: 'Fill the box with the current block', run: () => fillSel(false) },
                  { icon: Frame, label: 'Hollow: walls of the current block, empty inside', run: () => fillSel(true) },
                  { icon: Trash2, label: 'Delete (Del)', run: deleteSel },
                  { icon: RotateCw, label: 'Rotate 90° (R)', run: rotateSel },
                  { icon: FlipHorizontal2, label: 'Mirror', run: flipSel },
                  { icon: Maximize2, label: 'Double the size', run: growSel },
                  { icon: Minimize2, label: 'Halve the size', run: shrinkSel }
                ] as const
              ).map((b) => (
                <button
                  key={b.label}
                  onClick={b.run}
                  disabled={!selBox}
                  title={b.label}
                  className="rounded p-1.5 text-mist-300 transition-colors hover:bg-ink-750 hover:text-mist-100 disabled:pointer-events-none disabled:opacity-30"
                >
                  <b.icon size={13} />
                </button>
              ))}
              <div className="mx-0.5 h-4 w-px bg-white/[0.08]" />
              <button
                onClick={() => setPasting((p) => !p)}
                disabled={!clipboard}
                title="Paste (Ctrl+V): then click where the copy goes"
                className={cn(
                  'flex items-center gap-1 rounded p-1.5 text-2xs transition-colors disabled:pointer-events-none disabled:opacity-30',
                  pasting
                    ? 'bg-gold-500/20 text-gold-400'
                    : 'text-mist-300 hover:bg-ink-750 hover:text-mist-100'
                )}
              >
                <ClipboardPaste size={13} />
                {pasting && <span>click a spot…</span>}
              </button>
            </div>
          )}

          {}
          <div
            ref={marqueeRef}
            className="pointer-events-none absolute border border-dashed border-gold-400/80 bg-gold-400/10"
            style={{ display: 'none' }}
          />

          {}
          {

}
          <p className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 rounded-md bg-ink-950/80 px-2.5 py-1 text-2xs text-mist-300">
            {tool === 'select'
              ? pasting
                ? 'Click a face or the ground to stamp the copy there · Esc stops pasting'
                : 'Drag a box around blocks, or click two corners · arrows move it, Alt+arrows for up and down · right-drag looks · Esc lets go'
              : 'WASD flies, Space and Shift rise and sink · drag to look, middle-drag to pan · right-click builds · left-click breaks'}
          </p>
        </div>
      </div>

      {}
      <div
        data-tour="workshop-palette"
        className="flex h-14 shrink-0 items-center gap-3 border-t border-white/[0.06] bg-ink-900/60 px-4"
      >
        <span className="label-base mb-0">Block</span>
        <PaletteChip refValue={currentRef} art={refArt(currentRef)} onClick={() => setPickerOpen(true)} primary />
        <div className="mx-1 h-6 w-px bg-white/[0.07]" />
        {

}
        <div
          className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto py-1"
          onWheel={(e) => {
            e.currentTarget.scrollLeft += e.deltaY
          }}
        >
          {recent.map((r, i) => (
            <PaletteChip
              key={r}
              refValue={r}
              art={refArt(r)}
              selected={r === currentRef}
              index={i < 9 ? i + 1 : undefined}
              onClick={() => setCurrentRef(r)}
            />
          ))}
        </div>
        <p className="max-w-xs shrink-0 text-2xs text-mist-600">
          {isTree
            ? 'Blocks off the trunk column only ever fill air in the world, so the tree drapes over terrain.'
            : 'Structures stamp their blocks as-is, terrain included.'}
        </p>
      </div>

      {pickerOpen && (
        <WorkshopBlockPicker
          onClose={() => setPickerOpen(false)}
          onPick={(ref) => {
            rememberRef(ref)
            setTool('place')
            setPickerOpen(false)
          }}
        />
      )}

      {
}
      {templatesOpen &&
        (isTree ? (
          <TreeTemplateDialog
            current={active?.blocks ?? {}}
            defaultTrunk={treeProps.logBlock}
            defaultLeaves={treeProps.leavesBlock}
            onApply={applyTemplate}
            onClose={() => setTemplatesOpen(false)}
          />
        ) : (
          <StructureTemplateDialog
            current={active?.blocks ?? {}}
            onApply={applyTemplate}
            onClose={() => setTemplatesOpen(false)}
          />
        ))}
    </div>
  )
}

function VariantRow(props: {
  variant: BuildVariant
  active: boolean
  onSelect: () => void
  onDuplicate: () => void
  onDelete: () => void
  onRename: (name: string) => void
}): JSX.Element {
  const { variant } = props
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(variant.name)
  const count = Object.keys(variant.blocks).length

  const commit = (): void => {
    setEditing(false)
    props.onRename(draft)
  }

  if (editing) {
    return (
      <div className="mb-0.5 px-1">
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit()
            if (e.key === 'Escape') setEditing(false)
          }}
          className="input-base w-full py-1 text-xs"
        />
      </div>
    )
  }

  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>
        <button
          onClick={props.onSelect}
          onDoubleClick={() => {
            setDraft(variant.name)
            setEditing(true)
          }}
          className={cn(
            'group mb-0.5 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors',
            props.active
              ? 'bg-ink-750 text-mist-50 shadow-panel'
              : 'text-mist-400 hover:bg-ink-750/60 hover:text-mist-200'
          )}
        >
          <Layers size={12} className={props.active ? 'text-gold-400' : 'text-mist-600'} />
          <span className="min-w-0 flex-1 truncate">{variant.name}</span>
          <span className={cn('font-mono text-2xs', count === 0 ? 'text-ember-400/80' : 'text-mist-600')}>
            {count === 0 ? 'empty' : count}
          </span>
        </button>
      </ContextMenu.Trigger>
      <ContextMenuContent>
        <ContextMenuItem
          label="Rename"
          icon={Pencil}
          onSelect={() => {
            setDraft(variant.name)
            setEditing(true)
          }}
        />
        <ContextMenuItem label="Duplicate" icon={Copy} onSelect={props.onDuplicate} />
        <ContextMenuSeparator />
        <ContextMenuItem label="Delete" icon={Trash2} danger onSelect={props.onDelete} />
      </ContextMenuContent>
    </ContextMenu.Root>
  )
}

function PaletteChip(props: {
  refValue: string
  art: RefArt
  onClick: () => void
  primary?: boolean

  selected?: boolean

  index?: number
}): JSX.Element {
  const label = useRefLabel(props.refValue)
  return (
    <button
      onClick={props.onClick}
      title={props.primary ? `${label} — click to change` : props.index ? `${label} (${props.index})` : label}
      className={cn(
        'relative flex h-9 shrink-0 items-center gap-2 rounded-md px-2 transition-all hover:z-10',
        props.primary
          ? 'bg-ink-750 shadow-panel ring-1 ring-gold-500/50 hover:ring-gold-400'
          : props.selected
            ? 'bg-ink-750 shadow-panel ring-1 ring-gold-500/60'
            : 'hover:bg-ink-750'
      )}
    >
      <span
        className="h-6 w-6 shrink-0 overflow-hidden rounded-[3px] shadow-panel"
        style={{
          backgroundColor: props.art.side ? undefined : props.art.color,
          backgroundImage: props.art.side ? `url(${props.art.side})` : undefined,
          backgroundSize: '100% 100%',
          imageRendering: 'pixelated'
        }}
      />
      {props.index !== undefined && (
        <span className="pointer-events-none absolute bottom-0 right-0.5 font-mono text-[9px] leading-none text-mist-500">
          {props.index}
        </span>
      )}
      {props.primary && <span className="max-w-[140px] truncate text-xs text-mist-200">{label}</span>}
    </button>
  )
}
