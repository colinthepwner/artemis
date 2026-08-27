import { titleCase } from './project'
import type { ArtemisElement, ArtemisProject } from './project'
import type { AnySetProps, BlockProps, ItemProps, OreProps } from './generator/props'

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
          category: 'material',
          generateSet: p.generateSet ?? false,
          set: p.set ?? {}
        }
        out.push({
          id: crypto.randomUUID(),
          kind: 'item',
          name: base,
          properties: itemProps,
          createdAt: el.createdAt,
          updatedAt: el.updatedAt
        })
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

    out.push(el)
  }

  project.elements = out
  migrateSpawns(project)
  migrateTreeFeature(project)
  return project
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
