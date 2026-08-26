import type { ArtemisElement, ArtemisProject } from '../project'
import { oreFamily } from './family'

export interface RegistryEntry {

  registryName: string
  displayName: string
  kind: 'block' | 'item'
  elementId: string
}

function humanize(name: string): string {
  return name
    .split('_')
    .filter(Boolean)
    .map((s) => s[0].toUpperCase() + s.slice(1))
    .join(' ')
}

function displayNameOf(el: ArtemisElement, fallback: string): string {
  const p = el.properties as Record<string, unknown>
  return (p['displayName'] as string) || humanize(fallback)
}

export function elementRegistryEntries(el: ArtemisElement): RegistryEntry[] {
  const out: RegistryEntry[] = []
  switch (el.kind) {
    case 'block':
    case 'liquid':
    case 'plant':
    case 'tree':
      out.push({
        registryName: el.name,
        displayName: displayNameOf(el, el.name),
        kind: 'block',
        elementId: el.id
      })
      break
    case 'ore': {
      out.push({
        registryName: el.name,
        displayName: displayNameOf(el, el.name),
        kind: 'block',
        elementId: el.id
      })
      const family = oreFamily(el)!
      if (family.dropsItem) {
        out.push({ registryName: family.base, displayName: humanize(family.base), kind: 'item', elementId: el.id })
      }
      for (const name of [...family.tools, ...family.armor]) {
        out.push({ registryName: name, displayName: humanize(name), kind: 'item', elementId: el.id })
      }
      break
    }
    case 'mob':

      break
  }
  return out
}

export function projectRegistryEntries(project: ArtemisProject): RegistryEntry[] {
  return project.elements.flatMap(elementRegistryEntries)
}
