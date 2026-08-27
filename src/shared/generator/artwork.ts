import type { ArtemisElement, ArtemisProject } from '../project'
import { textureSlotsForElement } from './textures'
import type { RegistryEntry } from './registry'

export function artworkFor(project: ArtemisProject, entry: RegistryEntry): string | undefined {
  const el = project.elements.find((e) => e.id === entry.elementId)
  if (!el) return undefined

  const dataOf = (id: string | undefined): string | undefined =>
    id ? project.textures.find((t) => t.id === id)?.data : undefined

  const prefix = entry.kind === 'item' ? 'item/' : 'block/'
  const base = `${prefix}${entry.registryName}`
  const slots = textureSlotsForElement(el).filter((s) => s.key.startsWith(base))

  const ordered = [
    slots.find((s) => s.key === base),
    slots.find((s) => s.key === `${base}_side`),
    ...slots
  ]
  for (const slot of ordered) {
    const data = slot && dataOf(project.textureAssignments[slot.key])
    if (data) return data
  }
  return undefined
}

export function slotArtwork(project: ArtemisProject, slotKey: string): string | undefined {
  const id = project.textureAssignments[slotKey]
  return id ? project.textures.find((t) => t.id === id)?.data : undefined
}

export function elementArtwork(
  project: ArtemisProject,
  el: ArtemisElement
): string | undefined {
  for (const slot of textureSlotsForElement(el)) {
    if (!slot.paintable) continue
    const data = slotArtwork(project, slot.key)
    if (data) return data
  }
  return undefined
}

export function blockFacesFor(
  project: ArtemisProject,
  el: ArtemisElement
): { top: string; side: string } | null {
  const uniform = slotArtwork(project, `block/${el.name}`)
  if (uniform) return { top: uniform, side: uniform }

  const top = slotArtwork(project, `block/${el.name}_top`)
  const side = slotArtwork(project, `block/${el.name}_side`)
  if (top && side) return { top, side }
  if (top) return { top, side: top }
  if (side) return { top: side, side }
  return null
}
