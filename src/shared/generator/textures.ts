import { titleCase } from '../project'
import type { ArtemisElement, ArtemisProject } from '../project'
import { kitFamily } from './family'

export interface TextureSlot {

  key: string

  path?: string
  label: string
  elementId: string

  paintable: boolean
}

export function textureSlotsForElement(el: ArtemisElement): TextureSlot[] {
  const p = el.properties as Record<string, unknown>
  const slots: TextureSlot[] = []
  const block = (key: string, label: string): void => {
    slots.push({ key: `block/${key}`, label, elementId: el.id, paintable: true })
  }
  const item = (key: string, label: string): void => {
    slots.push({ key: `item/${key}`, label, elementId: el.id, paintable: true })
  }

  switch (el.kind) {
    case 'block':
    case 'liquid':
    case 'plant':
      if (p['textureMode'] === 'perFace') {

        block(`${el.name}_top`, 'Top')
        block(`${el.name}_bottom`, 'Bottom')
        block(`${el.name}_north`, 'North')
        block(`${el.name}_east`, 'East')
        block(`${el.name}_south`, 'South')
        block(`${el.name}_west`, 'West')
      } else if (p['textureMode'] === 'topBottomSides') {
        block(`${el.name}_top`, 'Top')
        block(`${el.name}_bottom`, 'Bottom')
        block(`${el.name}_side`, 'Side')
      } else {
        block(el.name, titleCase(el.name))
      }
      break
    case 'item':
      item(el.name, titleCase(el.name))
      break
    case 'dimension':

      block(`${el.name}_portal`, 'Portal')
      break

    case 'mob':
      slots.push({
        key: `entity/${el.name}`,

        path: `entity/${el.name}/0`,
        label: 'Skin (64×32)',
        elementId: el.id,
        paintable: false
      })
      break
  }

  if (el.kind === 'gearset') {
    const family = kitFamily(el)!
    for (const name of [...family.tools, ...family.armor]) item(name, titleCase(name))
  }

  return slots
}

export function textureSlotsFor(project: ArtemisProject): TextureSlot[] {
  const seen = new Set<string>()
  const out: TextureSlot[] = []
  for (const el of project.elements) {
    for (const slot of textureSlotsForElement(el)) {
      if (!seen.has(slot.key)) {
        seen.add(slot.key)
        out.push(slot)
      }
    }
  }
  return out
}
