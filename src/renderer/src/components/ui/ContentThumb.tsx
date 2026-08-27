import type { LucideIcon } from 'lucide-react'
import { useProjectStore } from '@/store/projectStore'
import { blockFacesFor, elementArtwork, slotArtwork } from '@shared/generator/artwork'
import { KIND_COLORS, KIND_ICONS } from '@/lib/kindIcons'
import type { ArtemisElement } from '@shared/project'

const SOLID = new Set(['block', 'ore'])

export function isSolidKind(kind: string): boolean {
  return SOLID.has(kind)
}

export function ContentThumb(props: {
  element: ArtemisElement
  size?: number
}): JSX.Element {
  const project = useProjectStore((s) => s.project)
  const size = props.size ?? 18

  let subject = props.element
  if (props.element.kind === 'ore' && project) {
    const ref = (props.element.properties['blockRef'] as string | undefined)?.trim()
    const target = ref ? project.elements.find((e) => e.name === ref) : undefined
    if (target) subject = target
  }
  const faces = project ? blockFacesFor(project, subject) : null

  if (SOLID.has(subject.kind) && faces) {
    return <IsoBlock top={faces.top} side={faces.side} size={size} />
  }
  const flat = project ? elementArtwork(project, subject) : undefined
  if (flat) return <FlatArt src={flat} size={size} />

  return (
    <IconThumb
      icon={KIND_ICONS[props.element.kind]}
      size={size}
      color={KIND_COLORS[props.element.kind]}
    />
  )
}

export function SlotThumb(props: {
  slotKey: string
  size?: number
  icon: LucideIcon
}): JSX.Element {
  const project = useProjectStore((s) => s.project)
  const size = props.size ?? 16
  const art = project ? slotArtwork(project, props.slotKey) : undefined
  return art ? <FlatArt src={art} size={size} /> : <IconThumb icon={props.icon} size={size} />
}

function FlatArt(props: { src: string; size: number }): JSX.Element {
  return (
    <span
      className="shrink-0 rounded-[2px]"
      style={{
        width: props.size,
        height: props.size,
        backgroundImage: `url(${props.src})`,
        backgroundSize: 'contain',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
        imageRendering: 'pixelated'
      }}
    />
  )
}

function IconThumb(props: { icon: LucideIcon; size: number; color?: string }): JSX.Element {
  const Icon = props.icon
  return (
    <span
      className="flex shrink-0 items-center justify-center"
      style={{ width: props.size, height: props.size }}
    >
      <Icon
        size={Math.round(props.size * 0.74)}
        strokeWidth={1.8}
        className={props.color ? undefined : 'text-mist-500'}
        style={props.color ? { color: props.color, opacity: 0.85 } : undefined}
      />
    </span>
  )
}

const STANDING = Math.sqrt(1.5)
const CUBE_ASPECT = (1 + STANDING) / 2

export function IsoBlock(props: { top: string; side: string; size: number }): JSX.Element {

  const w = props.size / CUBE_ASPECT
  const f = w / 2
  const th = w / 4
  const ox = (props.size - w) / 2

  const face = (src: string, transform: string, brightness: number, key: string): JSX.Element => (
    <span
      key={key}
      className="absolute left-0 top-0 origin-top-left"
      style={{
        width: f,
        height: f,
        transform,
        backgroundImage: `url(${src})`,
        backgroundSize: 'contain',
        backgroundPosition: 'center',
        imageRendering: 'pixelated',
        filter: brightness === 1 ? undefined : `brightness(${brightness})`
      }}
    />
  )
  return (
    <span className="relative block shrink-0" style={{ width: props.size, height: props.size }}>
      {face(props.side, `matrix(1, 0.5, 0, ${STANDING}, ${ox}, ${th})`, 0.8, 'left')}
      {face(props.side, `matrix(1, -0.5, 0, ${STANDING}, ${ox + f}, ${2 * th})`, 0.6, 'right')}
      {}
      {face(props.top, `matrix(1, -0.5, 1, 0.5, ${ox}, ${th})`, 1, 'top')}
    </span>
  )
}
