import type { ArtemisProject } from '../project'
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
