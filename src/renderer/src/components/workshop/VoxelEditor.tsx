import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Box,
  Check,
  Copy,
  Eraser,
  Layers,
  Pencil,
  Pipette,
  Plus,
  Redo2,
  RotateCcw,
  Trash2,
  TreePine,
  Undo2
} from 'lucide-react'
import * as ContextMenu from '@radix-ui/react-context-menu'
import { ContextMenuContent, ContextMenuItem, ContextMenuSeparator } from '@/components/ui/context'
import { useAppStore } from '@/store/appStore'
import { useProjectStore } from '@/store/projectStore'
import { menuOwnsKeyboard } from '@/components/ui/dismissDistant'
import { shadedTexture, useSwatchVersion } from '@/components/pixel/blockSwatches'
import { FACE_SHADE, faceTransform, type Face } from '@/components/preview/scene'
import { Slider } from '@/components/ui/controls'
import { titleCase } from '@shared/generator/templates/block'
import { TITLEBAR_UNSCALE } from '@shared/ui'
import type { ArtemisElement } from '@shared/project'
import type { BuildVariant, StructureProps, TreeProps } from '@shared/generator/props'
import { STRUCTURE_DEFAULTS, TREE_DEFAULTS } from '@shared/generator/props'
import {
  FACE_NORMALS,
  HALF,
  MAX_Y,
  highestY,
  inBounds,
  keyOf,
  newVariant,
  seedGrownVariant,
  visibleVoxels,
  type VoxelCell
} from './voxel'
import { shadeColor, useRefArt, useRefLabel, WorkshopBlockPicker, type RefArt } from './refArt'
import { isOpaqueArt, useOpacityVersion } from './opacity'
import { useFirstVisit } from '@/components/tutorial/useFirstVisit'
import { TreeTemplateDialog } from './TreeTemplateDialog'
import { cn } from '@/lib/cn'

const CUBE = 34
const GROUND = (HALF * 2 + 1) * CUBE

interface Camera {
  yaw: number
  pitch: number
  distance: number
}

const HOME: Camera = { yaw: -28, pitch: 18, distance: 900 }
const PERSPECTIVE = 640

type Tool = 'place' | 'erase' | 'pick'

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
    return used[used.length - 1] ?? (isTree ? treeProps.logBlock : 'block:PLANKS_OAK')
  })
  const [recent, setRecent] = useState<string[]>(() =>
    [...new Set(variants.flatMap((v) => Object.values(v.blocks)).reverse())].slice(0, 8)
  )
  const [pickerOpen, setPickerOpen] = useState(false)
  const [templatesOpen, setTemplatesOpen] = useState(false)
  const [clip, setClip] = useState(MAX_Y)
  const [camera, setCamera] = useState<Camera>(HOME)

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

  const setBlocks = (variant: BuildVariant, blocks: Record<string, string>): void => {
    const s = stackFor(variant.id)
    s.undo.push(variant.blocks)
    if (s.undo.length > 100) s.undo.shift()
    s.redo = []
    commitVariants(
      variants.map((v) => (v.id === variant.id ? { ...v, blocks } : v)),

      isTree && treeProps.design !== 'built' ? { design: 'built' } : undefined
    )
  }

  const undo = (): void => {
    if (!active) return
    const s = stackFor(active.id)
    const prev = s.undo.pop()
    if (!prev) return
    s.redo.push(active.blocks)
    commitVariants(variants.map((v) => (v.id === active.id ? { ...v, blocks: prev } : v)))
  }

  const redo = (): void => {
    if (!active) return
    const s = stackFor(active.id)
    const next = s.redo.pop()
    if (!next) return
    s.undo.push(active.blocks)
    commitVariants(variants.map((v) => (v.id === active.id ? { ...v, blocks: next } : v)))
  }

  const rememberRef = (ref: string): void => {
    setCurrentRef(ref)
    setRecent((r) => [ref, ...r.filter((x) => x !== ref)].slice(0, 8))
  }

  const placeAt = (x: number, y: number, z: number): void => {
    if (!active || !inBounds(x, y, z)) return
    const key = keyOf(x, y, z)
    if (active.blocks[key] === currentRef) return
    setBlocks(active, { ...active.blocks, [key]: currentRef })
  }

  const eraseAt = (x: number, y: number, z: number): void => {
    if (!active) return
    const key = keyOf(x, y, z)
    if (!(key in active.blocks)) return
    const next = { ...active.blocks }
    delete next[key]
    setBlocks(active, next)
  }

  const faceAction = (cell: { x: number; y: number; z: number; ref: string }, face: Face, erase: boolean): void => {
    if (erase || tool === 'erase') {
      eraseAt(cell.x, cell.y, cell.z)
      return
    }
    if (tool === 'pick') {
      rememberRef(cell.ref)
      setTool('place')
      return
    }
    const n = FACE_NORMALS[face]
    placeAt(cell.x + n.x, cell.y + n.y, cell.z + n.z)
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
    setRecent((r) => [...used, ...r.filter((x) => !used.includes(x))].slice(0, 8))
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

  const drag = useRef<{
    x: number
    y: number
    yaw: number
    pitch: number
    moved: boolean
    pointerId: number
  } | null>(null)
  const onPointerDown = (e: React.PointerEvent): void => {
    if (e.button !== 0) return

    drag.current = {
      x: e.clientX,
      y: e.clientY,
      yaw: camera.yaw,
      pitch: camera.pitch,
      moved: false,
      pointerId: e.pointerId
    }
  }
  const onPointerMove = (e: React.PointerEvent): void => {
    const d = drag.current
    if (!d) return
    const dx = e.clientX - d.x
    const dy = e.clientY - d.y
    if (!d.moved && Math.abs(dx) + Math.abs(dy) > 4) {
      d.moved = true
      ;(e.currentTarget as Element).setPointerCapture?.(d.pointerId)
    }
    if (!d.moved) return
    setCamera((c) => ({
      ...c,
      yaw: d.yaw + dx * 0.4,
      pitch: Math.max(4, Math.min(76, d.pitch + dy * 0.3))
    }))
  }
  const endDrag = (): void => {

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
      setCamera((c) => ({ ...c, distance: Math.max(160, Math.min(2600, c.distance + e.deltaY)) }))
    }
    window.addEventListener('wheel', onWheel, { passive: false })
    return () => window.removeEventListener('wheel', onWheel)
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (pickerOpen || templatesOpen) return

      if (menuOwnsKeyboard()) return
      if (e.key === 'Escape') onClose()
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
      if (e.key.toLowerCase() === 'b') setTool('place')
      if (e.key.toLowerCase() === 'e') setTool('erase')
      if (e.key.toLowerCase() === 'p') setTool('pick')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const refArt = useRefArt()
  const bakeVersion = useSwatchVersion()
  const cells = useMemo(
    () => (active ? visibleVoxels(active.blocks, clip) : []),
    [active, clip]
  )
  const blockCount = active ? Object.keys(active.blocks).length : 0
  const buildTop = active ? highestY(active.blocks) : 0

  const lift = Math.max(1.5, Math.min(buildTop, clip) * 0.45) * CUBE
  const world = `translateZ(${-camera.distance}px) rotateX(${-camera.pitch}deg) rotateY(${camera.yaw}deg) translateY(${lift}px)`

  const groundClick = (e: React.MouseEvent<HTMLDivElement>): void => {
    if (wasDrag() || !active || tool !== 'place') return
    const x = Math.floor(e.nativeEvent.offsetX / CUBE) - HALF
    const z = Math.floor(e.nativeEvent.offsetY / CUBE) - HALF
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
              { id: 'place', icon: Box, label: 'Place (B)' },
              { id: 'erase', icon: Eraser, label: 'Erase (E) — or right-click a block' },
              { id: 'pick', icon: Pipette, label: 'Pick block (P)' }
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
          title="Stamp a ready-made tree shape on top of the build"
          className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-2xs text-mist-400 transition-colors hover:bg-ink-750 hover:text-mist-200"
        >
          <TreePine size={13} /> Templates
        </button>

        <div className="mx-2 h-5 w-px bg-white/[0.07]" />

        {}
        <div
          data-tour="workshop-slice"
          className="flex w-44 items-center gap-2"
          title="Hide everything above this height, so you can work inside"
        >
          <span className="text-2xs text-mist-500">Slice</span>
          <div className="flex-1">
            <Slider value={clip} min={0} max={MAX_Y} step={1} onChange={setClip} />
          </div>
        </div>

        <div className="flex-1" />

        <span className="font-mono text-2xs text-mist-600">
          {blockCount} block{blockCount === 1 ? '' : 's'}
        </span>
        <button
          onClick={() => setCamera(HOME)}
          title="Reset the camera"
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
                  <TreePine size={13} /> Start from a template
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
              className="absolute left-1/2 top-1/2 h-0 w-0"
              style={{ transformStyle: 'preserve-3d', transform: world, willChange: 'transform' }}
            >
              {}
              <div
                className="absolute"
                onClick={groundClick}
                style={{
                  width: GROUND,
                  height: GROUND,
                  left: -GROUND / 2,
                  top: -GROUND / 2,
                  transform: 'rotateX(90deg)',
                  backgroundColor: '#5d8f42',
                  backgroundImage:
                    'linear-gradient(rgba(0,0,0,0.16) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.16) 1px, transparent 1px)',
                  backgroundSize: `${CUBE}px ${CUBE}px`
                }}
              >
                {}
                <div
                  className="pointer-events-none absolute border-2 border-gold-400/80"
                  style={{ left: HALF * CUBE, top: HALF * CUBE, width: CUBE, height: CUBE }}
                />
              </div>

              {cells.map((cell) => (
                <EditorCube
                  key={`${cell.x},${cell.y},${cell.z}`}
                  cell={cell}
                  art={refArt(cell.ref)}
                  bakeVersion={bakeVersion}
                  onFace={(face, erase) => {
                    if (!wasDrag()) faceAction(cell, face, erase)
                  }}
                />
              ))}
            </div>
          ) : (
            <div className="flex h-full items-center justify-center">
              <div className="rounded-xl bg-ink-950/60 px-6 py-5 text-center backdrop-blur-sm">
                <p className="text-[13px] text-mist-200">No variants yet.</p>
                <p className="mt-1 max-w-xs text-2xs leading-relaxed text-mist-400">
                  Add one on the left to start building. Click the ground to lay the first block;
                  the gold square is where the game will anchor it.
                </p>
              </div>
            </div>
          )}

          {}
          <p className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 rounded-md bg-ink-950/50 px-2.5 py-1 text-2xs text-mist-300 backdrop-blur-sm">
            Click a face to build off it · right-click removes · drag to orbit · scroll to zoom
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
        {recent
          .filter((r) => r !== currentRef)
          .slice(0, 7)
          .map((r) => (
            <PaletteChip key={r} refValue={r} art={refArt(r)} onClick={() => rememberRef(r)} />
          ))}
        <div className="flex-1" />
        <p className="text-2xs text-mist-600">
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

      {templatesOpen && (
        <TreeTemplateDialog
          current={active?.blocks ?? {}}
          defaultTrunk={isTree ? treeProps.logBlock : 'block:LOG_OAK'}
          defaultLeaves={isTree ? treeProps.leavesBlock : 'block:LEAVES_OAK'}
          onApply={applyTemplate}
          onClose={() => setTemplatesOpen(false)}
        />
      )}
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
}): JSX.Element {
  const label = useRefLabel(props.refValue)
  return (
    <button
      onClick={props.onClick}
      title={props.primary ? `${label} — click to change` : label}
      className={cn(
        'relative flex h-9 items-center gap-2 rounded-md px-2 transition-all hover:z-10',
        props.primary
          ? 'bg-ink-750 shadow-panel ring-1 ring-gold-500/50 hover:ring-gold-400'
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
      {props.primary && <span className="max-w-[140px] truncate text-xs text-mist-200">{label}</span>}
    </button>
  )
}

function EditorCube(props: {
  cell: VoxelCell
  art: RefArt

  bakeVersion: number
  onFace: (face: Face, erase: boolean) => void
}): JSX.Element {
  const { cell, art } = props
  const faces = cell.faces
  return (
    <div
      className="absolute"
      style={{
        transformStyle: 'preserve-3d',
        transform: `translate3d(${cell.x * CUBE}px, ${-cell.y * CUBE - CUBE / 2}px, ${cell.z * CUBE}px)`
      }}
    >
      {faces.map((face) => {
        const src = face === 'top' ? art.top : art.side
        return (
          <div
            key={face}
            onClick={(e) => {
              e.stopPropagation()
              props.onFace(face, false)
            }}
            onContextMenu={(e) => {
              e.preventDefault()
              e.stopPropagation()
              props.onFace(face, true)
            }}
            className="absolute transition-[filter] duration-75 hover:brightness-125"
            style={{
              width: CUBE,
              height: CUBE,
              left: -CUBE / 2,
              top: -CUBE / 2,
              transform: faceTransform(face, CUBE),
              backgroundColor: src ? undefined : shadeColor(art.color, FACE_SHADE[face]),
              backgroundImage: src ? `url(${shadedTexture(src, FACE_SHADE[face])})` : undefined,
              backgroundSize: '100% 100%',
              imageRendering: 'pixelated',

              boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.18)'
            }}
          />
        )
      })}
    </div>
  )
}
