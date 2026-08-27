import { titleCase } from '../project'
import type { ArtemisElement, ArtemisProject } from '../project'
import { kitFamily } from './family'

export interface RegistryEntry {

  registryName: string
  displayName: string
  kind: 'block' | 'item'
  elementId: string
}

function displayNameOf(el: ArtemisElement, fallback: string): string {
  const p = el.properties as Record<string, unknown>
  return (p['displayName'] as string) || titleCase(fallback)
}

export function elementRegistryEntries(el: ArtemisElement): RegistryEntry[] {
  const out: RegistryEntry[] = []
  switch (el.kind) {
    case 'block':
    case 'liquid':
    case 'plant':
      out.push({
        registryName: el.name,
        displayName: displayNameOf(el, el.name),
        kind: 'block',
        elementId: el.id
      })
      break
    case 'item': {
      out.push({
        registryName: el.name,
        displayName: displayNameOf(el, el.name),
        kind: 'item',
        elementId: el.id
      })
      const family = kitFamily(el)!
      for (const name of [...family.tools, ...family.armor]) {
        out.push({ registryName: name, displayName: titleCase(name), kind: 'item', elementId: el.id })
      }
      break
    }
    case 'dimension': {

      const portal = `${el.name}_portal`
      if (!(el.detached ?? []).includes(portal)) {
        out.push({
          registryName: portal,
          displayName: `${displayNameOf(el, el.name)} Portal`,
          kind: 'block',
          elementId: el.id
        })
      }
      break
    }

    default:
      break
  }
  return out
}

export function projectRegistryEntries(project: ArtemisProject): RegistryEntry[] {
  return project.elements.flatMap(elementRegistryEntries)
}
