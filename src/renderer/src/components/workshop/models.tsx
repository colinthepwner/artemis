import { useEffect, useRef, type MouseEvent as ReactMouseEvent } from 'react'
import { shadedTexture } from '@/components/pixel/blockSwatches'
import type { Face } from '@/components/preview/scene'
import { splitAxis } from '@shared/generator/props'
import { shadeColor, type RefArt } from './refArt'
import { isCrossPlantField, type CellFace, type FaceRect, type VoxelCell } from './voxel'

export const CELL_SHADE: Record<CellFace, number> = {
  top: 1,
  bottom: 0.5,
  front: 0.8,
  back: 0.8,
  left: 0.6,
  right: 0.6
}

export function cellFaceTransform(face: CellFace, s: number): string {
  const half = s / 2
  switch (face) {
    case 'top':
      return `rotateX(90deg) translateZ(${half}px)`
    case 'bottom':
      return `rotateX(-90deg) translateZ(${half}px)`
    case 'front':
      return `translateZ(${half}px)`
    case 'back':
      return `rotateY(180deg) translateZ(${half}px)`
    case 'left':
      return `rotateY(-90deg) translateZ(${half}px)`
    case 'right':
      return `rotateY(90deg) translateZ(${half}px)`
  }
}

export const FACE_RES = 4

export type ModelKind =
  | 'cube'
  | 'fence'
  | 'gate'
  | 'pane'
  | 'torch'
  | 'slab'
  | 'ladder'
  | 'cross'
  | 'door'
  | 'trapdoor'
  | 'jar'
  | 'chest'
  | 'plate'
  | 'button'
  | 'pillar'

const PANE_FIELDS = /^(FENCE_CHAINLINK|FENCE_STEEL|FENCE_PAPER_WALL|PAPER_WALL)$/

export function modelKindOf(ref: string): ModelKind {
  const { ref: plain, axis } = splitAxis(ref.trim())

  if (axis) return 'pillar'
  const t = plain
  if (!t.startsWith('block:')) return 'cube'
  const field = t.slice(6)
  if (PANE_FIELDS.test(field)) return 'pane'
  if (field.startsWith('FENCE_GATE_')) return 'gate'
  if (field.startsWith('FENCE_')) return 'fence'
  if (field.startsWith('TORCH')) return 'torch'
  if (field.startsWith('SLAB_')) return 'slab'
  if (field.startsWith('LADDER_')) return 'ladder'
  if (field.startsWith('DOOR_')) return 'door'
  if (field.startsWith('TRAPDOOR_')) return 'trapdoor'
  if (field.startsWith('JAR_')) return 'jar'
  if (field.startsWith('CHEST_')) return 'chest'
  if (field.startsWith('PRESSURE_PLATE_')) return 'plate'
  if (field.startsWith('BUTTON_')) return 'button'

  if (field === 'COBWEB' || isCrossPlantField(field)) return 'cross'
  return 'cube'
}

export function isFullCube(kind: ModelKind): boolean {
  return kind === 'cube'
}

function connects(kind: ModelKind | undefined): boolean {
  return kind === 'cube' || kind === 'fence' || kind === 'gate' || kind === 'pane'
}

function facePress(
  onFace: (face: CellFace, secondary: boolean) => void,
  face: CellFace
): {
  onClick: (e: ReactMouseEvent) => void
  onContextMenu: (e: ReactMouseEvent) => void
} {
  return {
    onClick: (e) => {
      e.stopPropagation()
      onFace(face, false)
    },
    onContextMenu: (e) => {
      e.preventDefault()
      e.stopPropagation()
      onFace(face, true)
    }
  }
}

type Box = [number, number, number, number, number, number]

interface FaceGeom {
  face: CellFace
  w: number
  h: number
  cx: number
  cy: number
  cz: number
  rot: string

  hs: number
  vs: number
}

function boxFaces(box: Box, u: number): FaceGeom[] {
  const [x0, y0, z0, x1, y1, z1] = box
  const midX = ((x0 + x1) / 2 - 8) * u
  const midY = (8 - (y0 + y1) / 2) * u
  const midZ = ((z0 + z1) / 2 - 8) * u
  const wx = (x1 - x0) * u
  const wy = (y1 - y0) * u
  const wz = (z1 - z0) * u
  const all: FaceGeom[] = [
    { face: 'front', w: wx, h: wy, cx: midX, cy: midY, cz: (z1 - 8) * u, rot: '', hs: x0, vs: 16 - y1 },
    { face: 'back', w: wx, h: wy, cx: midX, cy: midY, cz: (z0 - 8) * u, rot: 'rotateY(180deg)', hs: 16 - x1, vs: 16 - y1 },
    { face: 'right', w: wz, h: wy, cx: (x1 - 8) * u, cy: midY, cz: midZ, rot: 'rotateY(90deg)', hs: 16 - z1, vs: 16 - y1 },
    { face: 'left', w: wz, h: wy, cx: (x0 - 8) * u, cy: midY, cz: midZ, rot: 'rotateY(-90deg)', hs: z0, vs: 16 - y1 },
    { face: 'top', w: wx, h: wz, cx: midX, cy: (8 - y1) * u, cz: midZ, rot: 'rotateX(90deg)', hs: x0, vs: z0 },
    { face: 'bottom', w: wx, h: wz, cx: midX, cy: (8 - y0) * u, cz: midZ, rot: 'rotateX(-90deg)', hs: x0, vs: 16 - z1 }
  ]
  return all.filter((f) => f.w > 0 && f.h > 0)
}

function Cuboid(props: {
  box: Box
  art: RefArt
  cube: number

  hideBottom?: boolean

  onFace?: (face: CellFace, secondary: boolean) => void
}): JSX.Element {
  const u = props.cube / 16
  return (
    <>
      {boxFaces(props.box, u).map((g, i) => {
        if (props.hideBottom && g.face === 'bottom' && props.box[1] === 0) return null
        const src = g.face === 'top' ? (props.art.top ?? props.art.side) : props.art.side
        const shade = CELL_SHADE[g.face]
        return (
          <div
            key={i}
            {...(props.onFace ? facePress(props.onFace, g.face) : {})}
            className={props.onFace ? 'absolute transition-[filter] duration-75 hover:brightness-125' : 'absolute'}
            style={{
              width: g.w * FACE_RES,
              height: g.h * FACE_RES,
              left: (-g.w * FACE_RES) / 2,
              top: (-g.h * FACE_RES) / 2,
              transform: `translate3d(${g.cx}px, ${g.cy}px, ${g.cz}px) ${g.rot} scale(${1 / FACE_RES})`,
              backgroundColor: src ? undefined : shadeColor(props.art.color, shade),
              backgroundImage: src ? `url(${shadedTexture(src, shade)})` : undefined,
              backgroundSize: `${props.cube * FACE_RES}px ${props.cube * FACE_RES}px`,
              backgroundPosition: `${-g.hs * u * FACE_RES}px ${-g.vs * u * FACE_RES}px`,
              imageRendering: 'pixelated',

              backfaceVisibility: 'hidden'
            }}
          />
        )
      })}
    </>
  )
}

type Support = 'floor' | Face

const HORIZONTALS: { face: Face; x: number; z: number }[] = [
  { face: 'back', x: 0, z: -1 },
  { face: 'front', x: 0, z: 1 },
  { face: 'left', x: -1, z: 0 },
  { face: 'right', x: 1, z: 0 }
]

export function ModelBlock(props: {
  cell: VoxelCell
  kind: ModelKind
  art: RefArt
  cube: number
  neighborKind: (x: number, y: number, z: number) => ModelKind | undefined

  bakeVersion: number

  onFace: (face: CellFace, secondary: boolean) => void
}): JSX.Element {
  const { cell, kind, art, cube, neighborKind, onFace } = props
  const u = cube / 16
  const grounded = cell.y === 0

  const joined = (face: Face): boolean => {
    const h = HORIZONTALS.find((d) => d.face === face)!
    return connects(neighborKind(cell.x + h.x, cell.y, cell.z + h.z))
  }

  const support = (wallsOnly: boolean): Support => {
    if (!wallsOnly && neighborKind(cell.x, cell.y - 1, cell.z) !== undefined) return 'floor'
    for (const d of HORIZONTALS) {
      if (neighborKind(cell.x + d.x, cell.y, cell.z + d.z) === 'cube') return d.face
    }
    return wallsOnly ? 'back' : 'floor'
  }

  let body: JSX.Element
  switch (kind) {
    case 'slab':
      body = <Cuboid box={[0, 0, 0, 16, 8, 16]} art={art} cube={cube} hideBottom={grounded} onFace={onFace} />
      break

    case 'fence': {
      const boxes: Box[] = [[6, 0, 6, 10, 16, 10]]
      if (joined('right')) boxes.push([10, 12, 7, 16, 15, 9], [10, 6, 7, 16, 9, 9])
      if (joined('left')) boxes.push([0, 12, 7, 6, 15, 9], [0, 6, 7, 6, 9, 9])
      if (joined('front')) boxes.push([7, 12, 10, 9, 15, 16], [7, 6, 10, 9, 9, 16])
      if (joined('back')) boxes.push([7, 12, 0, 9, 15, 6], [7, 6, 0, 9, 9, 6])
      body = (
        <>
          {boxes.map((b, i) => (
            <Cuboid key={i} box={b} art={art} cube={cube} hideBottom={grounded} onFace={onFace} />
          ))}
        </>
      )
      break
    }

    case 'gate': {

      const alongX = joined('left') || joined('right') || !(joined('front') || joined('back'))

      const boxes: Box[] = alongX
        ? [
            [0, 5, 7, 2, 16, 9],
            [14, 5, 7, 16, 16, 9],
            [2, 6, 7, 6, 15, 9],
            [10, 6, 7, 14, 15, 9],
            [6, 6, 7, 10, 9, 9],
            [6, 12, 7, 10, 15, 9]
          ]
        : [
            [7, 5, 0, 9, 16, 2],
            [7, 5, 14, 9, 16, 16],
            [7, 6, 2, 9, 15, 6],
            [7, 6, 10, 9, 15, 14],
            [7, 6, 6, 9, 9, 10],
            [7, 12, 6, 9, 15, 10]
          ]
      body = (
        <>
          {boxes.map((b, i) => (
            <Cuboid key={i} box={b} art={art} cube={cube} onFace={onFace} />
          ))}
        </>
      )
      break
    }

    case 'pane': {
      const j = {
        left: joined('left'),
        right: joined('right'),
        front: joined('front'),
        back: joined('back')
      }
      const any = j.left || j.right || j.front || j.back
      const boxes: Box[] = []

      if (!any) boxes.push([0, 0, 7, 16, 16, 9])
      else {
        boxes.push([7, 0, 7, 9, 16, 9])
        if (j.right) boxes.push([9, 0, 7, 16, 16, 9])
        if (j.left) boxes.push([0, 0, 7, 7, 16, 9])
        if (j.front) boxes.push([7, 0, 9, 9, 16, 16])
        if (j.back) boxes.push([7, 0, 0, 9, 16, 7])
      }
      body = (
        <>
          {boxes.map((b, i) => (
            <Cuboid key={i} box={b} art={art} cube={cube} hideBottom={grounded} onFace={onFace} />
          ))}
        </>
      )
      break
    }

    case 'ladder': {

      const at = support(true)
      const face = at === 'front' ? 'back' : at === 'back' ? 'front' : at === 'left' ? 'right' : 'left'

      const inset = cellFaceTransform(face, cube).replace(/translateZ\([^)]*\)/, `translateZ(${-7 * u}px)`)
      body = (
        <div
          {...facePress(onFace, face)}
          className="absolute transition-[filter] duration-75 hover:brightness-125"
          style={{
            width: cube * FACE_RES,
            height: cube * FACE_RES,
            left: (-cube * FACE_RES) / 2,
            top: (-cube * FACE_RES) / 2,
            transform: `${inset} scale(${1 / FACE_RES})`,
            backgroundColor: art.side ? undefined : shadeColor(art.color, 0.8),
            backgroundImage: art.side ? `url(${shadedTexture(art.side, 0.8)})` : undefined,
            backgroundSize: '100% 100%',
            imageRendering: 'pixelated',
            backfaceVisibility: 'visible'
          }}
        />
      )
      break
    }

    case 'torch': {
      const at = support(false)
      const stick = <Cuboid box={[7, 0, 7, 9, 10, 9]} art={art} cube={cube} hideBottom={grounded} onFace={onFace} />
      if (at === 'floor') {
        body = stick
      } else {

        const lean =
          at === 'left'
            ? `translate3d(${-4 * u}px, ${-2 * u}px, 0) rotateZ(27deg)`
            : at === 'right'
              ? `translate3d(${4 * u}px, ${-2 * u}px, 0) rotateZ(-27deg)`
              : at === 'back'
                ? `translate3d(0, ${-2 * u}px, ${-4 * u}px) rotateX(-27deg)`
                : `translate3d(0, ${-2 * u}px, ${4 * u}px) rotateX(27deg)`
        body = (
          <div className="absolute" style={{ transformStyle: 'preserve-3d', transform: lean }}>
            <Cuboid box={[7, 0, 7, 9, 10, 9]} art={art} cube={cube} onFace={onFace} />
          </div>
        )
      }
      break
    }

    case 'trapdoor':

      body = <Cuboid box={[0, 0, 0, 16, 3, 16]} art={art} cube={cube} hideBottom={grounded} onFace={onFace} />
      break

    case 'plate':
      body = <Cuboid box={[1, 0, 1, 15, 1, 15]} art={art} cube={cube} hideBottom={grounded} onFace={onFace} />
      break

    case 'jar':
      body = <Cuboid box={[5, 0, 5, 11, 8, 11]} art={art} cube={cube} hideBottom={grounded} onFace={onFace} />
      break

    case 'chest':

      body = <Cuboid box={[1, 0, 1, 15, 14, 15]} art={art} cube={cube} hideBottom={grounded} onFace={onFace} />
      break

    case 'door': {

      const at = support(true)
      const box: Box =
        at === 'back'
          ? [0, 0, 0, 16, 16, 3]
          : at === 'front'
            ? [0, 0, 13, 16, 16, 16]
            : at === 'left'
              ? [0, 0, 0, 3, 16, 16]
              : [13, 0, 0, 16, 16, 16]
      body = <Cuboid box={box} art={art} cube={cube} onFace={onFace} />
      break
    }

    case 'button': {
      const at = support(true)
      const box: Box =
        at === 'back'
          ? [5, 6, 0, 11, 10, 2]
          : at === 'front'
            ? [5, 6, 14, 11, 10, 16]
            : at === 'left'
              ? [0, 6, 5, 2, 10, 11]
              : [14, 6, 5, 16, 10, 11]
      body = <Cuboid box={box} art={art} cube={cube} onFace={onFace} />
      break
    }

    case 'cross': {

      const S = FACE_RES
      body = (
        <>
          {[45, -45].map((angle) => (
            <div
              key={angle}
              {...facePress(onFace, 'top')}
              className="absolute transition-[filter] duration-75 hover:brightness-125"
              style={{
                width: cube * S,
                height: cube * S,
                left: (-cube * S) / 2,
                top: (-cube * S) / 2,
                transform: `rotateY(${angle}deg) scale(${1 / S})`,
                backgroundColor: art.side ? undefined : art.color,
                backgroundImage: art.side ? `url(${art.side})` : undefined,
                backgroundSize: '100% 100%',
                imageRendering: 'pixelated',
                backfaceVisibility: 'visible'
              }}
            />
          ))}
        </>
      )
      break
    }

    case 'pillar': {

      const axis = splitAxis(cell.ref).axis ?? 'x'
      const ends: CellFace[] = axis === 'x' ? ['left', 'right'] : ['front', 'back']
      const S = FACE_RES
      const faces: CellFace[] = ['top', 'bottom', 'front', 'back', 'left', 'right']
      body = (
        <>
          {faces.map((face) => {
            if (face === 'bottom' && grounded) return null
            const isEnd = ends.includes(face)
            const src = isEnd ? (art.top ?? art.side) : art.side
            const shade = CELL_SHADE[face]
            return (
              <div
                key={face}
                {...facePress(onFace, face)}
                className="absolute transition-[filter] duration-75 hover:brightness-125"
                style={{
                  width: cube * S,
                  height: cube * S,
                  left: (-cube * S) / 2,
                  top: (-cube * S) / 2,
                  transform: `${cellFaceTransform(face, cube)}${isEnd ? '' : ' rotateZ(90deg)'} scale(${1 / S})`,
                  backgroundColor: src ? undefined : shadeColor(art.color, shade),
                  backgroundImage: src ? `url(${shadedTexture(src, shade)})` : undefined,
                  backgroundSize: '100% 100%',
                  imageRendering: 'pixelated',
                  backfaceVisibility: 'hidden'
                }}
              />
            )
          })}
        </>
      )
      break
    }

    default:

      body = <Cuboid box={[0, 0, 0, 16, 16, 16]} art={art} cube={cube} hideBottom={grounded} onFace={onFace} />
  }

  return (
    <div
      className="absolute"
      style={{
        transformStyle: 'preserve-3d',
        transform: `translate3d(${cell.x * cube}px, ${-cell.y * cube - cube / 2}px, ${cell.z * cube}px)`
      }}
    >
      {body}
    </div>
  )
}

const BLEED = 0.35

export function MergedFace(props: {
  rect: FaceRect
  art: RefArt
  cube: number

  bakeVersion: number
  onCell: (x: number, y: number, z: number, face: CellFace, secondary: boolean) => void
}): JSX.Element {
  const { rect, art, cube } = props
  const { face, plane, u0, v0, w, h } = rect

  const S = Math.max(1, Math.min(FACE_RES, Math.floor(2560 / (Math.max(w, h) * cube))))
  const uMid = (u0 + (w - 1) / 2) * cube
  const vMid = (v0 + (h - 1) / 2) * cube

  let cx = 0
  let cy = 0
  let cz = 0
  let rot = ''
  switch (face) {
    case 'top':
      cx = uMid
      cy = -(plane * cube + cube)
      cz = vMid
      rot = 'rotateX(90deg)'
      break
    case 'bottom':
      cx = uMid
      cy = -(plane * cube)
      cz = vMid
      rot = 'rotateX(-90deg)'
      break
    case 'front':
      cx = uMid
      cy = -(vMid + cube / 2)
      cz = plane * cube + cube / 2
      break
    case 'back':
      cx = uMid
      cy = -(vMid + cube / 2)
      cz = plane * cube - cube / 2
      rot = 'rotateY(180deg)'
      break
    case 'right':
      cx = plane * cube + cube / 2
      cy = -(vMid + cube / 2)
      cz = uMid
      rot = 'rotateY(90deg)'
      break
    case 'left':
      cx = plane * cube - cube / 2
      cy = -(vMid + cube / 2)
      cz = uMid
      rot = 'rotateY(-90deg)'
      break
  }

  const cellAt = (ox: number, oy: number): { x: number; y: number; z: number } => {
    const iu = Math.max(0, Math.min(w - 1, Math.floor((ox - BLEED * S) / (cube * S))))
    const iv = Math.max(0, Math.min(h - 1, Math.floor((oy - BLEED * S) / (cube * S))))
    switch (face) {
      case 'top':
        return { x: u0 + iu, y: plane, z: v0 + iv }
      case 'bottom':
        return { x: u0 + iu, y: plane, z: v0 + (h - 1 - iv) }
      case 'front':
        return { x: u0 + iu, y: v0 + (h - 1 - iv), z: plane }
      case 'back':
        return { x: u0 + (w - 1 - iu), y: v0 + (h - 1 - iv), z: plane }
      case 'right':
        return { x: plane, y: v0 + (h - 1 - iv), z: u0 + (w - 1 - iu) }
      case 'left':
        return { x: plane, y: v0 + (h - 1 - iv), z: u0 + iu }
    }
  }

  const src = face === 'top' ? (art.top ?? art.side) : art.side
  const shade = CELL_SHADE[face]
  const ew = (w * cube + 2 * BLEED) * S
  const eh = (h * cube + 2 * BLEED) * S
  return (
    <div
      onClick={(e) => {
        e.stopPropagation()
        const c = cellAt(e.nativeEvent.offsetX, e.nativeEvent.offsetY)
        props.onCell(c.x, c.y, c.z, face, false)
      }}
      onContextMenu={(e) => {
        e.preventDefault()
        e.stopPropagation()
        const c = cellAt(e.nativeEvent.offsetX, e.nativeEvent.offsetY)
        props.onCell(c.x, c.y, c.z, face, true)
      }}
      className="absolute transition-[filter] duration-75 hover:brightness-110"
      style={{
        width: ew,
        height: eh,
        left: -ew / 2,
        top: -eh / 2,
        transform: `translate3d(${cx}px, ${cy}px, ${cz}px) ${rot} scale(${1 / S})`,
        backgroundColor: src ? undefined : shadeColor(art.color, shade),
        backgroundImage: src ? `url(${shadedTexture(src, shade)})` : undefined,

        backgroundSize: `${cube * S}px ${cube * S}px`,
        backgroundPosition: `${BLEED * S}px ${BLEED * S}px`,
        imageRendering: 'pixelated',
        backfaceVisibility: 'hidden'
      }}
    />
  )
}

export function BreakBurst(props: {
  x: number
  y: number
  z: number
  src?: string
  color: string
  cube: number
  cam: { current: { yaw: number; pitch: number } | null }
  onDone: () => void
}): JSX.Element {
  const host = useRef<HTMLDivElement | null>(null)
  const cube = props.cube
  const u = cube / 16
  const S = FACE_RES

  const parts = useRef(
    Array.from({ length: 20 }, () => {
      const px = (Math.random() - 0.5) * cube * 0.7
      const py = (Math.random() - 0.5) * cube * 0.7
      const pz = (Math.random() - 0.5) * cube * 0.7
      const spread = Math.hypot(px, pz) || 1
      return {
        px,
        py,
        pz,
        vx: (px / spread) * cube * (1.2 + Math.random() * 2.4),
        vy: cube * (2 + Math.random() * 3),
        vz: (pz / spread) * cube * (1.2 + Math.random() * 2.4),
        life: 0.22 + Math.random() * 0.28,
        age: 0,
        cropU: Math.floor(Math.random() * 13),
        cropV: Math.floor(Math.random() * 13)
      }
    })
  ).current

  useEffect(() => {
    const el = host.current
    if (!el) return
    let raf = 0
    let last = performance.now()

    const floor = -(props.y * cube + cube / 2) + 1
    const tick = (now: number): void => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      const cam = props.cam.current
      const yaw = cam?.yaw ?? 0
      const pitch = cam?.pitch ?? 0
      let alive = 0
      for (let i = 0; i < parts.length; i++) {
        const p = parts[i]
        const node = el.children[i] as HTMLElement | undefined
        if (!node) continue
        p.age += dt
        if (p.age >= p.life) {
          node.style.display = 'none'
          continue
        }
        alive++
        p.vy -= cube * 23 * dt
        p.px += p.vx * dt
        p.py += p.vy * dt
        p.pz += p.vz * dt

        if (p.py < floor) {
          p.py = floor
          p.vy = 0
          p.vx *= 0.7
          p.vz *= 0.7
        }
        const t = p.age / p.life
        const shrink = t > 0.75 ? (1 - t) / 0.25 : 1
        node.style.transform = `translate3d(${p.px}px, ${-p.py}px, ${p.pz}px) rotateY(${-yaw}deg) rotateX(${pitch}deg) scale(${(1 / S) * shrink})`
      }
      if (alive === 0) {
        props.onDone()
        return
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)

  }, [])

  const size = 2.8 * u * S
  return (
    <div
      ref={host}
      className="pointer-events-none absolute"
      style={{
        transformStyle: 'preserve-3d',
        transform: `translate3d(${props.x * cube}px, ${-props.y * cube - cube / 2}px, ${props.z * cube}px)`
      }}
    >
      {parts.map((p, i) => (
        <div
          key={i}
          className="absolute"
          style={{
            width: size,
            height: size,
            left: -size / 2,
            top: -size / 2,
            backgroundColor: props.src ? undefined : props.color,
            backgroundImage: props.src ? `url(${props.src})` : undefined,
            backgroundSize: `${cube * S}px ${cube * S}px`,
            backgroundPosition: `${-p.cropU * u * S}px ${-p.cropV * u * S}px`,
            imageRendering: 'pixelated'
          }}
        />
      ))}
    </div>
  )
}

export interface SelBounds {
  x0: number
  y0: number
  z0: number
  x1: number
  y1: number
  z1: number
}

export function SelectionBox(props: { box: SelBounds; cube: number }): JSX.Element {
  const { box, cube } = props
  const u = cube / 16
  const pad = 0.6
  const b: Box = [
    -pad,
    -pad,
    -pad,
    (box.x1 - box.x0 + 1) * 16 + pad,
    (box.y1 - box.y0 + 1) * 16 + pad,
    (box.z1 - box.z0 + 1) * 16 + pad
  ]
  return (
    <div
      className="pointer-events-none absolute"
      style={{
        transformStyle: 'preserve-3d',
        transform: `translate3d(${box.x0 * cube}px, ${-box.y0 * cube - cube / 2}px, ${box.z0 * cube}px)`
      }}
    >
      {boxFaces(b, u).map((g, i) => (
        <div
          key={i}
          className="absolute"
          style={{
            width: g.w,
            height: g.h,
            left: -g.w / 2,
            top: -g.h / 2,
            transform: `translate3d(${g.cx}px, ${g.cy}px, ${g.cz}px) ${g.rot}`,
            backgroundColor: 'rgba(250, 204, 21, 0.08)',
            border: '1px solid rgba(250, 204, 21, 0.65)'
          }}
        />
      ))}
    </div>
  )
}
