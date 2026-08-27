import { useMemo } from 'react'
import { MultiSelect, Select, type MultiSelectGroup } from '@/components/ui/controls'
import { useProjectStore } from '@/store/projectStore'
import { getVanillaRegistry } from '@shared/generator/vanilla'
import { VANILLA_BIOME_PREFIX } from '@shared/generator/biomeFilter'
import { titleCase } from '@shared/generator/templates/block'
import type { BiomeProps } from '@shared/generator/props'

export function BiomesField(props: {
  value: string[]
  onChange: (v: string[]) => void

  allLabel?: string
}): JSX.Element {
  const project = useProjectStore((s) => s.project)
  const elements = project?.elements
  const targetBta = project?.meta.targetBta ?? '8.0.1'

  const groups = useMemo<MultiSelectGroup[]>(() => {
    const mine = (elements ?? [])
      .filter((e) => e.kind === 'biome')
      .map((e) => {
        const p = e.properties as Partial<BiomeProps>
        return {
          value: e.name,
          label: p.displayName || titleCase(e.name),

          tint: `#${(p.mapColor ?? '5cb04a').replace(/^#/, '')}`
        }
      })

    const vanilla = getVanillaRegistry(targetBta).biomes
    const realm = (r: 'Overworld' | 'Nether' | 'Other'): MultiSelectGroup['options'] =>
      vanilla
        .filter((b) => b.realm === r)
        .map((b) => ({ value: `${VANILLA_BIOME_PREFIX}${b.field}`, label: b.name }))

    const out: MultiSelectGroup[] = []
    if (mine.length) out.push({ label: 'This Mod', options: mine })
    out.push({ label: 'Overworld', options: realm('Overworld') })
    const nether = realm('Nether')
    if (nether.length) out.push({ label: 'Nether', options: nether })
    const other = realm('Other')
    if (other.length) out.push({ label: 'Other', options: other })
    return out
  }, [elements, targetBta])

  return (
    <MultiSelect
      selected={props.value}
      onChange={props.onChange}
      groups={groups}
      allLabel={props.allLabel ?? 'All biomes'}
      noun="biomes"
    />
  )
}

export function HostBiomeField(props: {
  value: string
  onChange: (v: string) => void
}): JSX.Element {
  const targetBta = useProjectStore((s) => s.project?.meta.targetBta ?? '8.0.1')
  const options = useMemo(
    () =>
      getVanillaRegistry(targetBta)
        .biomes.filter((b) => b.realm === 'Overworld')
        .map((b) => ({ value: `${VANILLA_BIOME_PREFIX}${b.field}`, label: b.name })),
    [targetBta]
  )
  return <Select value={props.value} onChange={props.onChange} options={options} />
}
