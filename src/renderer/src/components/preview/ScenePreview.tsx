import { useEffect, useMemo, useRef, useState } from 'react'
import { RotateCcw } from 'lucide-react'
import { useProjectStore } from '@/store/projectStore'
import { blockFacesFor, elementArtwork } from '@shared/generator/artwork'
import { shadedTexture, useSwatch, useSwatchVersion } from '@/components/pixel/blockSwatches'
import type { ArtemisElement } from '@shared/project'
import type { PlantProps } from '@shared/generator/props'
import {
  FACE_SHADE,
  PLANT_SPOTS,
  faceTransform,
  visibleFaces,
  wordCells,
  type Face
} from './scene'

const CUBE = 34

const GROUND = 161

interface Camera {
  yaw: number
  pitch: number
  distance: number
}

const PERSPECTIVE = 640
const horizonOffset = (pitch: number): number =>
  PERSPECTIVE * Math.tan((pitch * Math.PI) / 180)

const REF_SWATCH: Record<string, string> = {
  'block:GRASS': 'grass',
  'block:DIRT': 'dirt',
  'block:SAND': 'sand',
  'block:GRAVEL': 'gravel',
  'block:STONE': 'stone',
  'block:MOSS_STONE': 'moss',
  'block:BLOCK_SNOW': 'snow'
}

const HOME_WORD: Camera = { yaw: -16, pitch: 12, distance: 1150 }

const HOME_PLANTS: Camera = { yaw: -16, pitch: 20, distance: 300 }

export function ScenePreview(props: { element: ArtemisElement }): JSX.Element | null {
  const project = useProjectStore((s) => s.project)
  const home = props.element.kind === 'plant' ? HOME_PLANTS : HOME_WORD
  const [camera, setCamera] = useState<Camera>(home)
  const drag = useRef<{ x: number; y: number; yaw: number; pitch: number } | null>(null)

  const kind = props.element.kind
  const isPlant = kind === 'plant'

  const growsOn = (props.element.properties as Partial<PlantProps>).growsOn
  const firstRef = (Array.isArray(growsOn) ? growsOn : []).find((r) => r?.trim())?.trim()
  const swatchKey = (firstRef && REF_SWATCH[firstRef]) ?? 'grass'
  const vanillaGround = useSwatch(isPlant ? swatchKey : 'grass')
  const modGroundEl =
    isPlant && firstRef && !firstRef.includes(':')
      ? project?.elements.find((e) => e.name === firstRef)
      : undefined
  const modGroundArt = modGroundEl && project ? blockFacesFor(project, modGroundEl)?.top : undefined
  const ground = modGroundArt ? { texture: modGroundArt } : vanillaGround

  let subject = props.element
  if (kind === 'ore' && project) {
    const ref = (props.element.properties['blockRef'] as string | undefined)?.trim()
    const target = ref && !ref.includes(':') ? project.elements.find((e) => e.name === ref) : undefined
    if (target) subject = target
  }
  const faces = project ? blockFacesFor(project, subject) : null
  const flat = project ? elementArtwork(project, subject) : undefined

  const word = useMemo(() => visibleFaces(wordCells('ARTEMIS')), [])

  const bakeVersion = useSwatchVersion()

  const contents = useMemo(
    () => {
      if (isPlant) {
        if (!flat) return []
        return PLANT_SPOTS.map((spot) => (
          <Billboard key={`${spot.x},${spot.z}`} src={flat} x={spot.x * CUBE} z={spot.z * CUBE} />
        ))
      }
      if (!faces) return []
      return word.map(({ cell, faces: shown }) => (
        <Cube
          key={`${cell.x},${cell.y},${cell.z}`}
          top={faces.top}
          side={faces.side}
          faces={shown}
          x={cell.x * CUBE}
          y={cell.y * CUBE}
          z={cell.z * CUBE}
        />
      ))
    },

    [isPlant, word, flat, faces?.top, faces?.side, bakeVersion]
  )

  const onPointerDown = (e: React.PointerEvent): void => {
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
    drag.current = { x: e.clientX, y: e.clientY, yaw: camera.yaw, pitch: camera.pitch }
  }
  const onPointerMove = (e: React.PointerEvent): void => {
    const d = drag.current
    if (!d) return
    setCamera((c) => ({
      ...c,
      yaw: d.yaw + (e.clientX - d.x) * 0.4,

      pitch: Math.max(4, Math.min(76, d.pitch + (e.clientY - d.y) * 0.3))
    }))
  }
  const endDrag = (): void => {
    drag.current = null
  }

  const hovering = useRef(false)
  useEffect(() => {
    const onWheel = (e: WheelEvent): void => {
      if (!hovering.current) return
      e.preventDefault()

      setCamera((c) => ({ ...c, distance: Math.max(130, Math.min(2400, c.distance + e.deltaY)) }))
    }
    window.addEventListener('wheel', onWheel, { passive: false })
    return () => window.removeEventListener('wheel', onWheel)
  }, [])

  if (!isPlant && !faces)
    return (
      <Empty
        label={
          kind === 'ore'
            ? 'Shown once the block it places has a painted texture of its own.'
            : 'Paint a texture to see it in the world.'
        }
      />
    )
  if (isPlant && !flat) return <Empty label="Paint a texture to see it in the world." />

  const lift = (isPlant ? 0.5 : 2.6) * CUBE

  const world = `translateZ(${-camera.distance}px) rotateX(${-camera.pitch}deg) rotateY(${camera.yaw}deg) translateY(${lift}px)`

  return (
    <div className="relative">
      <div
        className="relative h-[300px] cursor-grab select-none overflow-hidden rounded-lg active:cursor-grabbing"
        style={{

          background: 'linear-gradient(#5a97dd 0%, #93c1ea 100%)',
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
      >
        <div
          className="absolute left-1/2 top-1/2 h-0 w-0"
          style={{ transformStyle: 'preserve-3d', transform: world, willChange: 'transform' }}
        >
            {}
          <div
            className="absolute"
            style={{
              width: GROUND * CUBE,
              height: GROUND * CUBE,
              left: (-GROUND * CUBE) / 2,
              top: (-GROUND * CUBE) / 2,

              transform: 'rotateX(90deg)',
              backgroundImage: ground ? `url(${ground.texture})` : undefined,
              backgroundColor: ground ? undefined : '#6a9c46',
              backgroundSize: `${CUBE}px ${CUBE}px`,

              imageRendering: 'pixelated'
            }}
          />

          {contents}
        </div>

        <button
          onClick={() => setCamera(home)}
          title="Back to where it started"
          className="absolute right-2 top-2 rounded-md bg-ink-950/50 p-1.5 text-mist-200 backdrop-blur-sm hover:bg-ink-950/75"
        >
          <RotateCcw size={13} />
        </button>
      </div>
      <p className="mt-1.5 text-2xs text-mist-600">
        Drag to look around, scroll to step back.{' '}
        {isPlant ? 'Standing on the ground you picked.' : 'Your block, spelling something.'}
      </p>
    </div>
  )
}

function Empty({ label }: { label: string }): JSX.Element {
  return (
    <div className="flex h-[140px] items-center justify-center rounded-lg bg-ink-900/60 shadow-panel">
      <p className="text-2xs text-mist-600">{label}</p>
    </div>
  )
}

function Cube(props: {
  top: string
  side: string
  faces: Face[]
  x: number
  y: number
  z: number
}): JSX.Element {
  return (
    <div
      className="absolute"
      style={{
        transformStyle: 'preserve-3d',

        transform: `translate3d(${props.x}px, ${-props.y * 1 - CUBE / 2}px, ${props.z}px)`
      }}
    >
      {props.faces.map((face) => (
        <div
          key={face}
          className="absolute"
          style={{
            width: CUBE,
            height: CUBE,
            left: -CUBE / 2,
            top: -CUBE / 2,
            transform: faceTransform(face, CUBE),

            backgroundImage: `url(${shadedTexture(face === 'top' ? props.top : props.side, FACE_SHADE[face])})`,
            backgroundSize: '100% 100%',
            imageRendering: 'pixelated'
          }}
        />
      ))}
    </div>
  )
}

function Billboard(props: { src: string; x: number; z: number }): JSX.Element {
  return (
    <div
      className="absolute"
      style={{
        transformStyle: 'preserve-3d',
        transform: `translate3d(${props.x}px, ${-CUBE / 2}px, ${props.z}px)`
      }}
    >
      {[45, -45].map((angle) => (
        <div
          key={angle}
          className="absolute"
          style={{
            width: CUBE,
            height: CUBE,
            left: -CUBE / 2,
            top: -CUBE / 2,
            transform: `rotateY(${angle}deg)`,
            backfaceVisibility: 'visible',
            backgroundImage: `url(${props.src})`,
            backgroundSize: '100% 100%',
            imageRendering: 'pixelated'
          }}
        />
      ))}
    </div>
  )
}

export const SCENE_KINDS = new Set(['block', 'ore', 'plant'])

export function hasScenePreview(element: ArtemisElement): boolean {
  return SCENE_KINDS.has(element.kind)
}

export function ScenePanel(props: { element: ArtemisElement }): JSX.Element | null {
  if (!hasScenePreview(props.element)) return null
  return (
    <div className="mt-5 border-t border-white/[0.04] pt-4">
      <span className="label-base">In the world</span>
      <ScenePreview element={props.element} />
    </div>
  )
}
