import { titleCase } from './project'
import type { ArtemisElement, ArtemisProject } from './project'
import type {
  AnySetProps,
  BlockProps,
  ItemProps,
  LegacyBlockUseRule,
  OreProps,
  UseEffect,
  UseRule
} from './generator/props'

const LEGACY_GROUND: Record<string, string[]> = {
  grass: ['block:GRASS', 'block:DIRT'],
  dirt: ['block:DIRT'],
  sand: ['block:SAND'],
  gravel: ['block:GRAVEL'],
  stone: ['block:STONE'],
  moss: ['block:MOSS_STONE'],
  snow: ['block:BLOCK_SNOW']
}

interface LegacyOreProps extends Partial<BlockProps> {
  dropMode?: 'block' | 'item'
  dropItemName?: string
  veinSize?: number
  veinsPerChunk?: number
  minY?: number
  maxY?: number
  biomes?: string[]
  generateSet?: boolean
  set?: Partial<AnySetProps>
}

function migrateUseRules(legacy: LegacyBlockUseRule[], cost: number, seed: string): UseRule[] {
  return legacy.map((r, i) => {
    const effects: UseEffect[] = []
    if ((r.becomes ?? '').trim()) effects.push({ kind: 'becomes', block: r.becomes })
    if ((r.drops ?? '').trim()) {
      effects.push({ kind: 'drops', item: r.drops, count: Math.max(1, Math.round(r.dropCount || 1)) })
    }
    if ((r.sound ?? '').trim()) effects.push({ kind: 'sound', event: r.sound })
    if ((r.particle ?? '').trim()) {
      effects.push({
        kind: 'particles',
        name: r.particle,
        count: Math.max(1, Math.round(r.particleCount || 8))
      })
    }
    if (cost > 0) effects.push({ kind: 'cost', amount: Math.round(cost) })

    return { id: `${seed}-use-${i}`, on: 'block' as const, target: r.target ?? '', effects }
  })
}

function isLegacyUseRule(r: unknown): r is LegacyBlockUseRule {
  return !!r && typeof r === 'object' && !Array.isArray((r as { effects?: unknown }).effects)
}

export function migrateProject(project: ArtemisProject): ArtemisProject {
  const taken = new Set(project.elements.map((e) => e.name))
  const freeName = (wanted: string): string => {
    let name = wanted
    for (let i = 2; taken.has(name); i++) name = `${wanted}_${i}`
    taken.add(name)
    return name
  }

  const out: ArtemisElement[] = []
  for (const el of project.elements) {

    if (el.kind === 'plant' && typeof el.properties['growsOn'] === 'string') {
      const key = el.properties['growsOn'] as string
      out.push({
        ...el,
        properties: {
          ...el.properties,
          growsOn: LEGACY_GROUND[key] ?? ['block:GRASS', 'block:DIRT']
        }
      })
      continue
    }

    if (el.kind === 'ore' && !('blockRef' in el.properties)) {
      const p = el.properties as LegacyOreProps
      const display = (p.displayName as string) || titleCase(el.name)
      const dropsItem = p.dropMode !== 'block'
      const base = (p.dropItemName || el.name.replace(/_ore$/, '')).trim()

      const blockProps: Partial<BlockProps> & Record<string, unknown> = {
        displayName: display,
        material: p.material ?? 'stone',
        sound: p.sound ?? 'stone',
        hardness: p.hardness ?? 3,
        resistance: p.resistance ?? 5,
        luminance: p.luminance ?? 0,
        tags: p.tags ?? ['mineableByPickaxe'],
        textureMode: p.textureMode ?? 'all',
        harvestLevel: p.harvestLevel ?? 0,
        creativeCategory: (p.creativeCategory as string) ?? 'block',
        notInCreativeMenu: p.notInCreativeMenu ?? false,
        drops: dropsItem ? 'item' : 'default',
        dropItem: dropsItem ? base : '',
        dropCountMin: 1,
        dropCountMax: 1
      }
      out.push({
        id: crypto.randomUUID(),
        kind: 'block',
        name: el.name,
        properties: blockProps,
        createdAt: el.createdAt,
        updatedAt: el.updatedAt
      })

      if (dropsItem) {
        const itemProps: Partial<Omit<ItemProps, 'set'>> & Record<string, unknown> = {
          displayName: titleCase(base),
          stackSize: 64,
          category: 'material'
        }
        out.push({
          id: crypto.randomUUID(),
          kind: 'item',
          name: base,
          properties: itemProps,
          createdAt: el.createdAt,
          updatedAt: el.updatedAt
        })

        if (p.generateSet) {
          out.push({
            id: crypto.randomUUID(),
            kind: 'gearset',
            name: base,
            properties: { displayName: titleCase(base), ...(p.set ?? {}) },
            createdAt: el.createdAt,
            updatedAt: el.updatedAt
          })
        }
      }

      const oreProps: Partial<OreProps> & Record<string, unknown> = {
        displayName: display ? `${display} Veins` : '',
        blockRef: el.name,
        veinSize: p.veinSize ?? 8,
        veinsPerChunk: p.veinsPerChunk ?? 6,
        minY: p.minY ?? 0,
        maxY: p.maxY ?? 48,
        biomes: p.biomes ?? []
      }
      out.push({ ...el, name: freeName(`${el.name}_veins`), properties: oreProps })
      continue
    }

    if (el.kind === 'item' && (el.properties as Partial<ItemProps>).generateSet) {
      const p = el.properties as Partial<ItemProps>
      const set: Partial<AnySetProps> = p.set ?? {}
      const { generateSet: _gone, set: _alsoGone, ...keep } = p
      out.push({ ...el, detached: undefined, properties: keep as Record<string, unknown> })
      out.push({
        id: crypto.randomUUID(),
        kind: 'gearset',

        name: el.name,
        properties: {
          displayName: (p.displayName as string) || titleCase(el.name),
          ...set
        },
        detached: el.detached,
        createdAt: el.createdAt,
        updatedAt: el.updatedAt
      })
      continue
    }

    const props = el.properties as Partial<ItemProps> & { blockUseCost?: number }
    if (Array.isArray(props.blockUses) && props.blockUses.some(isLegacyUseRule)) {
      out.push({
        ...el,
        properties: {
          ...props,
          blockUses: migrateUseRules(
            props.blockUses as unknown as LegacyBlockUseRule[],
            props.blockUseCost ?? 0,
            el.id
          ),

          blockUseCost: undefined
        }
      } as ArtemisElement)
      continue
    }

    out.push(el)
  }

  const owned = new Set(out.map((e) => e.name))
  for (const el of out) {
    if (!el.detached?.length) continue
    const kept = el.detached.filter((n) => owned.has(n))
    if (kept.length !== el.detached.length) {
      el.detached = kept.length ? kept : undefined
    }
  }

  project.elements = out
  migrateSpawns(project)
  migrateTreeFeature(project)
  migrateGroups(project)
  migrateSounds(project)
  return project
}

function migrateSounds(project: ArtemisProject): void {
  for (const sound of project.sounds ?? []) {
    const legacy = sound as unknown as { ogg?: string }
    if (typeof legacy.ogg !== 'string') continue
    sound.audio ??= legacy.ogg
    sound.format ??= 'ogg'
    delete legacy.ogg
  }
}

function migrateGroups(project: ArtemisProject): void {
  if (!project.groups) return
  const kindOf = new Map(project.elements.map((e) => [e.id, e.kind]))

  const claimed = new Set<string>()
  for (const g of project.groups) {
    g.name ||= 'Group'
    g.shelf ??= ''
    g.color ||= '#e6ad55'

    const members: string[] = []
    let kind = g.kind
    for (const id of g.members ?? []) {
      const memberKind = kindOf.get(id)
      if (!memberKind || claimed.has(id)) continue
      kind ??= memberKind
      if (memberKind !== kind) continue
      claimed.add(id)
      members.push(id)
    }
    g.members = members

    if (members.length === 0) {
      delete g.kind
      delete g.props
    } else {
      g.kind = kind
      if (g.props && Object.keys(g.props).length === 0) delete g.props
    }
  }
}

function migrateTreeFeature(project: ArtemisProject): void {
  for (const biome of project.elements) {
    if (biome.kind !== 'biome') continue
    if (!('treeFeature' in biome.properties)) continue
    const legacy = String(biome.properties['treeFeature'] ?? '').trim()
    delete biome.properties['treeFeature']

    if (legacy === 'none') {
      biome.properties['vanillaTrees'] = false
      continue
    }
    if (!legacy) continue

    const tree = project.elements.find((e) => e.kind === 'tree' && e.name === legacy)
    if (!tree) continue
    const biomes = Array.isArray(tree.properties['biomes'])
      ? (tree.properties['biomes'] as string[])
      : []
    if (!biomes.includes(biome.name)) {
      tree.properties['biomes'] = [...biomes, biome.name]
    }
  }
}

function migrateSpawns(project: ArtemisProject): void {
  const legacyMobs = project.elements.filter(
    (el) => el.kind === 'mob' && !('spawnWeight' in el.properties)
  )
  if (legacyMobs.length === 0) return

  const spawnsFor = new Map<string, { weight: number; biomes: string[] }>()
  for (const biome of project.elements) {
    if (biome.kind !== 'biome') continue
    const spawns = biome.properties['spawns']
    if (!Array.isArray(spawns)) continue
    for (const entry of spawns as { entity?: string; weight?: number }[]) {
      if (!entry?.entity) continue
      const acc = spawnsFor.get(entry.entity) ?? { weight: entry.weight ?? 10, biomes: [] }
      acc.biomes.push(biome.name)
      spawnsFor.set(entry.entity, acc)
    }
    delete biome.properties['spawns']
  }

  for (const mob of legacyMobs) {
    const moved = spawnsFor.get(mob.name)
    mob.properties['spawnWeight'] = moved ? Math.max(1, Math.round(moved.weight)) : 0
    mob.properties['spawnBiomes'] = moved ? moved.biomes : []
  }
}
