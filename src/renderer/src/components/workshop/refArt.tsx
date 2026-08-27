import { useMemo } from 'react'
import { useProjectStore } from '@/store/projectStore'
import { getVanillaRegistry } from '@shared/generator/vanilla'
import { projectRegistryEntries } from '@shared/generator/registry'
import { artworkFor, blockFacesFor } from '@shared/generator/artwork'
import { vanillaIcon } from '@/components/pixel/vanillaIcons'
import { useVanillaArt } from '@/components/pixel/useVanillaArt'
import { PickerDialog, type PickerEntry } from '@/components/ui/PickerDialog'
import { isCrossPlantField } from './voxel'

export interface RefArt {
  top?: string
  side?: string
  color: string
}

export function refColor(ref: string): string {
  let hash = 0
  for (const ch of ref) hash = (hash * 31 + ch.charCodeAt(0)) | 0
  return `hsl(${((hash % 360) + 360) % 360} 35% 52%)`
}

export function shadeColor(hsl: string, shade: number): string {
  const m = hsl.match(/hsl\((\d+) (\d+)% (\d+)%\)/)
  if (!m) return hsl
  return `hsl(${m[1]} ${m[2]}% ${Math.round(Number(m[3]) * shade)}%)`
}

export function useRefArt(): (ref: string) => RefArt {
  const project = useProjectStore((s) => s.project)
  const art = useVanillaArt()
  return useMemo(() => {
    const cache = new Map<string, RefArt>()
    return (ref: string): RefArt => {
      const hit = cache.get(ref)
      if (hit) return hit
      let out: RefArt = { color: refColor(ref) }
      const t = ref.trim()
      if (t.startsWith('block:')) {
        const field = t.slice(6)
        const side = art.blocks[field]

        const fallback = art.tints?.[field] ?? refColor(ref)
        out = side ? { top: art.tops[field] ?? side, side, color: fallback } : { color: fallback }
      } else if (project) {
        const el = project.elements.find((e) => e.name === t)
        const faces = el ? blockFacesFor(project, el) : null
        if (faces) out = { ...faces, color: refColor(ref) }
      }
      cache.set(ref, out)
      return out
    }
  }, [project, art])
}

export function useRefLabel(ref: string): string {
  const project = useProjectStore((s) => s.project)
  return useMemo(() => {
    const t = ref.trim()
    if (!t) return 'Pick a block'
    const vanilla = getVanillaRegistry(project?.meta.targetBta ?? '8.0.1')
    if (t.startsWith('block:')) {
      const field = t.slice(6)
      return vanilla.blocks.find((e) => e.field === field)?.name ?? field
    }
    const entry = project ? projectRegistryEntries(project).find((e) => e.registryName === t) : undefined
    return entry?.displayName ?? t
  }, [ref, project])
}

export function WorkshopBlockPicker(props: {
  onClose: () => void
  onPick: (ref: string) => void
}): JSX.Element {
  const project = useProjectStore((s) => s.project)
  const art = useVanillaArt()
  const vanilla = useMemo(
    () => getVanillaRegistry(project?.meta.targetBta ?? '8.0.1'),
    [project?.meta.targetBta]
  )

  const vanillaEntries = useMemo<PickerEntry[]>(
    () =>
      vanilla.blocks
        .filter((e) => e.field !== 'AIR' && !isCrossPlantField(e.field))
        .map((e) => ({
          id: `block:${e.field}`,
          label: e.name,
          sub: e.field,
          kind: 'block' as const,
          icon: vanillaIcon(e.field, 'block'),
          image: art.blocks[e.field],
          group: 'Blocks'
        })),
    [vanilla, art]
  )

  const modEntries = useMemo<PickerEntry[]>(() => {
    if (!project) return []
    const kindOf = new Map(project.elements.map((e) => [e.id, e.kind]))
    return projectRegistryEntries(project)
      .filter((r) => r.kind === 'block' && kindOf.get(r.elementId) !== 'plant')
      .map((r) => ({
        id: r.registryName,
        label: r.displayName,
        sub: r.registryName,
        kind: 'block' as const,
        icon: vanillaIcon(r.registryName.toUpperCase(), 'block'),
        image: artworkFor(project, r),
        group: 'Blocks'
      }))
  }, [project])

  return (
    <PickerDialog
      title="Pick a building block"
      subtitle="What the build is made of. Plants are their own element and stay out of builds."
      tabs={[
        { id: 'vanilla', label: 'Vanilla (BTA)', entries: vanillaEntries },
        {
          id: 'mod',
          label: 'This Mod',
          entries: modEntries,
          empty: 'This mod has no blocks yet. Create some first.'
        }
      ]}
      onPick={(_tab, entry) => props.onPick(entry.id)}
      onClose={props.onClose}
    />
  )
}
