import type { ArtemisProject, ElementKind } from './project'
import { textureSlotsForElement } from './generator/textures'
import { elementRegistryEntries } from './generator/registry'
import { getVanillaRegistry } from './generator/vanilla'
import { getMapping } from './generator/mappings'

export interface Unfinished {

  elementId: string
  elementKind: ElementKind | null

  title: string

  label: string

  detail?: string
}

function titleOf(properties: Record<string, unknown>, name: string): string {
  const display = properties['displayName']
  return typeof display === 'string' && display ? display : name
}

function danglingCheck(project: ArtemisProject): (ref: unknown) => boolean {
  const vanilla = getVanillaRegistry(project.meta.targetBta)

  const known = new Set<string>()
  for (const el of project.elements) {
    known.add(el.name)
    for (const entry of elementRegistryEntries(el)) known.add(entry.registryName)
  }

  return (ref: unknown): boolean => {
    if (typeof ref !== 'string') return false
    const t = ref.trim()
    if (!t) return false

    if (t.startsWith('block:')) return !vanilla.blocks.some((b) => b.field === t.slice(6))
    if (t.startsWith('item:')) return !vanilla.items.some((i) => i.field === t.slice(5))
    if (t.startsWith('biome:')) return !vanilla.biomes.some((b) => b.field === t.slice(6))
    if (known.has(t)) return false

    const upper = t.toUpperCase()
    if (vanilla.blocks.some((b) => b.field.toUpperCase() === upper)) return false
    if (vanilla.items.some((i) => i.field.toUpperCase() === upper)) return false
    if (vanilla.biomes.some((b) => b.field.toUpperCase() === upper)) return false
    return true
  }
}

export function unfinishedIn(project: ArtemisProject): Unfinished[] {
  const out: Unfinished[] = []

  if (project.elements.length === 0) {
    return [
      {
        elementId: '',
        elementKind: null,
        title: 'This mod',
        label: 'has nothing in it yet',
        detail: 'Add a block, an ore or a mob. Textures on their own are not content.'
      }
    ]
  }

  const claims = new Map<string, string>()
  for (const el of project.elements) {
    for (const entry of elementRegistryEntries(el)) {
      if (!claims.has(entry.registryName)) claims.set(entry.registryName, el.id)
    }
  }

  const frameClaims = new Map<string, string>()
  for (const el of project.elements) {
    if (el.kind !== 'dimension') continue
    const frame = String(el.properties['portalFrame'] ?? '').trim()
    if (frame && !frameClaims.has(frame)) frameClaims.set(frame, el.id)
  }

  const reservedFrames = new Set(getMapping(project.meta.targetBta).dimension.reservedFrames ?? [])

  const isDangling = danglingCheck(project)

  for (const el of project.elements) {
    const title = titleOf(el.properties, el.name)
    const base = { elementId: el.id, elementKind: el.kind, title }

    if (el.name.startsWith('new_')) {
      out.push({ ...base, label: 'still has its placeholder name', detail: el.name })
    } else {
      const clash = elementRegistryEntries(el).find(
        (entry) => claims.get(entry.registryName) !== el.id
      )
      if (clash) {
        out.push({
          ...base,
          label: 'has a name another element already uses',
          detail: clash.registryName
        })
      }
    }

    const missing = textureSlotsForElement(el)
      .filter((slot) => slot.paintable && !project.textureAssignments[slot.key])
      .map((slot) => slot.label)
    if (missing.length > 0) {
      out.push({
        ...base,
        label: missing.length === 1 ? 'has a texture to paint' : `has ${missing.length} textures to paint`,
        detail: missing.join(', ')
      })
    }

    const p = el.properties as Record<string, unknown>

    const checkRefs = (refs: unknown[], label: string) => {
      const dangling = refs.filter(isDangling)
      if (dangling.length > 0) {
        out.push({
          ...base,

          label: `${label} points at something that does not exist`,
          detail: (dangling[0] as string).trim()
        })
      }
    }

    if (el.kind === 'biome') {
      checkRefs([p['topBlock'], p['fillerBlock']], 'Surface/filler block')

      if (p['generateInOverworld'] !== false && p['generationStyle'] === 'climate') {
        const cr = getMapping(project.meta.targetBta).biome.climateRange
        const temp = typeof p['temperature'] === 'number' ? p['temperature'] : 0.7
        if (temp + cr.window < cr.minTemperature) {
          out.push({
            ...base,
            label: 'is set to Natural Climate at a temperature no world reaches',
            detail:
              `A real overworld never goes below ${cr.minTemperature} and this window tops out at ` +
              `${(temp + cr.window).toFixed(2)}, so nothing would ever match. Raise the ` +
              `temperature, or switch Generation Style to Replaces Vanilla Biome, which cannot ` +
              `come out empty.`
          })
        }
      }
    }
    if (el.kind === 'ore') {
      checkRefs([p['blockRef']], 'Ore block')
      if (!(p['blockRef'] as string | undefined)?.trim()) {
        out.push({ ...base, label: 'has no ore block picked', detail: 'No veins are generated without one.' })
      }
    }
    if (el.kind === 'plant') {
      const grounds = Array.isArray(p['growsOn']) ? (p['growsOn'] as string[]) : []
      checkRefs(grounds, 'Ground block')
      if (!grounds.some((r) => r?.trim())) {
        out.push({ ...base, label: 'has no ground it can grow on' })
      }
    }
    if (el.kind === 'block' || el.kind === 'plant') {
      if (p['drops'] === 'item') {
        checkRefs([p['dropItem']], 'Drop item')
        if (!(p['dropItem'] as string | undefined)?.trim()) {
          out.push({ ...base, label: 'is set to drop an item but none is picked' })
        }
      }
    }
    if (el.kind === 'dimension') {
      const biomes = Array.isArray(p['biomes']) ? (p['biomes'] as string[]) : []
      checkRefs([p['portalFrame']], 'Portal block')
      checkRefs(biomes, 'Biome')
      if (!biomes.some((r) => r?.trim())) {
        out.push({ ...base, label: 'has no biomes picked', detail: 'A dimension is made of biomes; without one nothing is generated.' })
      }
      const frame = String(p['portalFrame'] ?? '').trim()
      const owner = frame ? frameClaims.get(frame) : undefined
      if (owner && owner !== el.id) {
        const other = project.elements.find((e) => e.id === owner)
        out.push({
          ...base,
          label: 'shares its portal frame with another dimension',
          detail:
            `${other ? titleOf(other.properties, other.name) : 'Another dimension'} already opens ` +
            'on a frame of this block. Fire in one ring can only open one world, and which one ' +
            'it opens is decided by nothing but the order they were added: a ring built for this ' +
            'one opens the other instead. Pick a different frame block.'
        })
      }
      if (frame.startsWith('block:') && reservedFrames.has(frame.slice('block:'.length))) {
        out.push({
          ...base,
          label: 'is framed in a block the game already uses for a portal of its own',
          detail:
            'Fire lit in a ring of it opens the portal the game already has there, not this ' +
            'one, and the game gets first claim. Pick a different frame block.'
        })
      }
    }
    if (el.kind === 'recipe') {
      checkRefs([p['output']], 'Output')
      if (Array.isArray(p['inputs'])) checkRefs(p['inputs'], 'Input')
    }

    if (['ore', 'plant', 'tree', 'structure'].includes(el.kind) && Array.isArray(p['biomes'])) {
      checkRefs(p['biomes'], 'Biome filter')
    }
    if (el.kind === 'mob' && Array.isArray(p['spawnBiomes'])) {
      checkRefs(p['spawnBiomes'], 'Spawn biome')
    }
    if (el.kind === 'tree') {
      if (p['design'] === 'built') {
        const variants = Array.isArray(p['variants']) ? (p['variants'] as { blocks?: Record<string, string> }[]) : []
        const built = variants.filter((v) => Object.keys(v?.blocks ?? {}).length > 0)
        if (built.length === 0) {
          out.push({
            ...base,
            label: 'is set to a built shape but nothing is built',
            detail: 'Open it in the Workshop and place some blocks, or switch it back to Grown.'
          })
        }
        checkRefs(
          built.flatMap((v) => Object.values(v.blocks ?? {})),
          'Built block'
        )
      } else {
        checkRefs([p['logBlock'], p['leavesBlock']], 'Tree block')
      }
    }
    if (el.kind === 'structure') {
      const variants = Array.isArray(p['variants']) ? (p['variants'] as { blocks?: Record<string, string> }[]) : []
      const built = variants.filter((v) => Object.keys(v?.blocks ?? {}).length > 0)
      if (built.length === 0) {
        out.push({
          ...base,
          label: 'has nothing built yet',
          detail: 'Open it in the Workshop and place some blocks. Empty structures are skipped entirely.'
        })
      }
      checkRefs(
        built.flatMap((v) => Object.values(v.blocks ?? {})),
        'Structure block'
      )
    }
    if (el.kind === 'mob') {
      if (Array.isArray(p['drops'])) {
        checkRefs(p['drops'].map((d: any) => d?.ref), 'Drop')
      }
    }
  }

  return out
}

export function autoFixProject(project: ArtemisProject): void {

  const claims = new Map<string, string>()
  for (const el of project.elements) {
    const tryClaim = () => {
      const entries = elementRegistryEntries(el)
      for (const entry of entries) {
        if (claims.has(entry.registryName) && claims.get(entry.registryName) !== el.id) {
          return false
        }
      }
      return true
    }

    while (!tryClaim()) {
      const match = el.name.match(/_(\d+)$/)
      if (match) {
        const num = parseInt(match[1], 10) + 1
        el.name = el.name.replace(/_\d+$/, `_${num}`)
      } else {
        el.name = `${el.name}_2`
      }
    }

    for (const entry of elementRegistryEntries(el)) {
      claims.set(entry.registryName, el.id)
    }
  }

  const isDangling = danglingCheck(project)

  const clearDangling = (obj: any, key: string | number) => {
    if (isDangling(obj[key])) obj[key] = ''
  }

  for (const el of project.elements) {
    const p = el.properties as Record<string, any>
    if (el.kind === 'biome') {
      clearDangling(p, 'topBlock')
      clearDangling(p, 'fillerBlock')
    }
    if (el.kind === 'ore') {
      clearDangling(p, 'blockRef')
    }
    if (el.kind === 'plant') {
      if (Array.isArray(p['growsOn'])) {
        for (let i = 0; i < p['growsOn'].length; i++) clearDangling(p['growsOn'], i)
      }
    }
    if (el.kind === 'block' || el.kind === 'plant') {
      if (p['drops'] === 'item') clearDangling(p, 'dropItem')
    }
    if (el.kind === 'dimension') {
      clearDangling(p, 'portalFrame')
      if (Array.isArray(p['biomes'])) {
        for (let i = 0; i < p['biomes'].length; i++) clearDangling(p['biomes'], i)
      }
    }
    if (el.kind === 'recipe') {
      clearDangling(p, 'output')
      if (Array.isArray(p['inputs'])) {
        for (let i = 0; i < p['inputs'].length; i++) clearDangling(p['inputs'], i)
      }
    }
    if (el.kind === 'tree') {
      clearDangling(p, 'logBlock')
      clearDangling(p, 'leavesBlock')
    }

    if (el.kind === 'tree' || el.kind === 'structure') {
      const variants = Array.isArray(p['variants']) ? p['variants'] : []
      for (const variant of variants) {
        const blocks = variant?.blocks as Record<string, string> | undefined
        if (!blocks) continue
        for (const key of Object.keys(blocks)) {
          if (isDangling(blocks[key])) delete blocks[key]
        }
      }
    }
    if (el.kind === 'mob') {
      if (Array.isArray(p['drops'])) {
        for (const drop of p['drops']) {
          if (drop) clearDangling(drop, 'ref')
        }
      }
      if (Array.isArray(p['spawnBiomes'])) {
        p['spawnBiomes'] = p['spawnBiomes'].filter((r: unknown) => !isDangling(r))
      }
    }

    if (['ore', 'plant', 'tree', 'structure'].includes(el.kind) && Array.isArray(p['biomes'])) {
      p['biomes'] = p['biomes'].filter((r: unknown) => !isDangling(r))
    }
  }
}
