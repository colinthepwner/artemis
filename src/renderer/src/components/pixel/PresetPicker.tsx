import { useMemo } from 'react'
import { useProjectStore } from '@/store/projectStore'
import { projectRegistryEntries } from '@shared/generator/registry'
import { artworkFor } from '@shared/generator/artwork'
import { PickerDialog, type PickerEntry } from '@/components/ui/PickerDialog'
import { TEXTURE_PRESETS, gridToDataUrl, type Grid } from './presets'

export interface PresetPick {

  grid?: Grid
  dataUrl?: string

  name: string
}

export function PresetPicker(props: {

  accent: string
  onAccent: (v: string) => void
  onPick: (pick: PresetPick) => void
  onClose: () => void
}): JSX.Element {
  const project = useProjectStore((s) => s.project)
  const textures = useProjectStore((s) => s.project?.textures)

  const presets = useMemo(
    () =>
      TEXTURE_PRESETS.map((p) => ({
        preset: p,
        entry: {
          id: p.id,
          label: p.label,
          image: gridToDataUrl(p.generate(props.accent)),
          group: p.group
        } as PickerEntry
      })),
    [props.accent]
  )

  const mod = useMemo(() => {
    const rows: { entry: PickerEntry; pick: PresetPick }[] = []
    if (!project) return rows
    const claimed = new Set<string>()

    for (const r of projectRegistryEntries(project)) {
      const art = artworkFor(project, r)
      if (!art) continue
      claimed.add(art)
      rows.push({
        entry: {
          id: `ref:${r.registryName}`,
          label: r.displayName,
          sub: r.registryName,
          kind: r.kind,
          image: art,
          group: r.kind === 'block' ? 'Blocks' : 'Items'
        },
        pick: { dataUrl: art, name: r.registryName }
      })
    }

    for (const t of textures ?? []) {
      if (claimed.has(t.data)) continue
      rows.push({
        entry: {
          id: `tex:${t.id}`,
          label: t.name,
          image: t.data,
          kind: t.kind ?? 'block',
          group: 'Not used yet'
        },
        pick: { dataUrl: t.data, name: t.name }
      })
    }
    return rows
  }, [project, textures])

  return (
    <PickerDialog
      title="Start from a texture"
      subtitle="Fills the active layer. Your other layers stay put."
      tabs={[
        { id: 'vanilla', label: 'Presets', entries: presets.map((p) => p.entry) },
        {
          id: 'mod',
          label: 'This Mod',
          entries: mod.map((m) => m.entry),
          empty: 'This mod has no artwork yet. Paint something and it shows up here.'
        }
      ]}
      accessory={(tabId) =>
        tabId === 'vanilla' ? (
          <label
            className="relative h-6 w-10 shrink-0 cursor-default overflow-hidden rounded-md shadow-panel"
            style={{ background: props.accent }}
            title="Recolors the ore, gem, tool and armor presets"
          >
            <input
              type="color"
              className="absolute inset-0 h-full w-full opacity-0"
              value={props.accent}
              onChange={(e) => props.onAccent(e.target.value)}
            />
          </label>
        ) : null
      }
      onPick={(tabId, entry) => {
        if (tabId === 'vanilla') {
          const hit = presets.find((p) => p.entry.id === entry.id)
          if (hit) props.onPick({ grid: hit.preset.generate(props.accent), name: hit.preset.id })
          return
        }
        const hit = mod.find((m) => m.entry.id === entry.id)
        if (hit) props.onPick(hit.pick)
      }}
      onClose={props.onClose}
    />
  )
}
