import type { ArtemisElement, ArtemisProject } from '../project'
import { oreFamily } from './family'

export interface TextureSlot {

  key: string
  label: string
  elementId: string

  paintable: boolean
}

function humanize(suffix: string): string {
  return suffix
    .split('_')
    .filter(Boolean)
    .map((s) => s[0].toUpperCase() + s.slice(1))
    .join(' ')
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
    case 'ore':
    case 'liquid':
    case 'plant':
      if (p['textureMode'] === 'topBottomSides') {
        block(`${el.name}_top`, 'Top')
        block(`${el.name}_bottom`, 'Bottom')
        block(`${el.name}_side`, 'Side')
      } else {
        block(el.name, humanize(el.name))
      }
      break

    case 'mob':
      slots.push({
        key: `entity/${el.name}`,
        label: 'Skin (64×32)',
        elementId: el.id,
        paintable: false
      })
      break
  }

  if (el.kind === 'ore') {
    const family = oreFamily(el)!
    if (family.dropsItem) item(family.base, humanize(family.base))
    for (const name of [...family.tools, ...family.armor]) item(name, humanize(name))
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
