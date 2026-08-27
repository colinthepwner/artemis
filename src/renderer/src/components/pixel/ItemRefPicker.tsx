import { useMemo, useState } from 'react'
import { useProjectStore } from '@/store/projectStore'
import { getVanillaRegistry } from '@shared/generator/vanilla'
import { projectRegistryEntries } from '@shared/generator/registry'
import { artworkFor } from '@shared/generator/artwork'
import { vanillaIcon } from './vanillaIcons'
import { useVanillaArt } from './useVanillaArt'
import { swatchFor } from './blockSwatches'
import { PickerDialog, type PickerEntry } from '@/components/ui/PickerDialog'
import { cn } from '@/lib/cn'

export function ItemRefField(props: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  className?: string
  filter?: 'block' | 'item'
}): JSX.Element {
  const [open, setOpen] = useState(false)
  const { label, image } = useRefDisplay(props.value)

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={props.value ? `${label} (${props.value})` : 'Click to pick'}
        className={cn(
          'input-base flex items-center gap-2 truncate text-left',
          !props.value && 'text-mist-600',
          props.className
        )}
      >
        {}
        {image && (
          <img
            src={image}
            alt=""
            draggable={false}
            className="h-4 w-4 shrink-0 rounded-[2px] shadow-panel"
            style={{ imageRendering: 'pixelated' }}
          />
        )}
        <span className="truncate">{label || props.placeholder || 'Pick'}</span>
      </button>
      {open && (
        <ItemRefPicker
          filter={props.filter}
          onClose={() => setOpen(false)}
          onPick={(ref) => {
            props.onChange(ref)
            setOpen(false)
          }}
        />
      )}
    </>
  )
}

function useRefDisplay(ref: string): { label: string; image?: string } {
  const project = useProjectStore((s) => s.project)
  const art = useVanillaArt()
  return useMemo(() => {
    const t = ref.trim()
    if (!t) return { label: '' }
    const vanilla = getVanillaRegistry(project?.meta.targetBta ?? '8.0.1')
    if (t.startsWith('block:')) {
      const field = t.slice(6)
      return {
        label: vanilla.blocks.find((e) => e.field === field)?.name ?? field,
        image: art.blocks[field]
      }
    }
    if (t.startsWith('item:')) {
      const field = t.slice(5)
      return {
        label: vanilla.items.find((e) => e.field === field)?.name ?? field,
        image: art.items[field]
      }
    }
    const custom = project ? projectRegistryEntries(project) : []
    const entry = custom.find((e) => e.registryName === t)
    if (entry) {
      return { label: entry.displayName, image: project ? artworkFor(project, entry) : undefined }
    }

    return { label: t, image: swatchFor(t, art)?.texture }
  }, [ref, project, art])
}

function ItemRefPicker(props: {
  filter?: 'block' | 'item'
  onClose: () => void
  onPick: (ref: string) => void
}): JSX.Element {
  const project = useProjectStore((s) => s.project)
  const art = useVanillaArt()

  const vanilla = useMemo(
    () => getVanillaRegistry(project?.meta.targetBta ?? '8.0.1'),
    [project?.meta.targetBta]
  )

  const vanillaEntries = useMemo<PickerEntry[]>(() => {
    const rows: PickerEntry[] = []
    if (props.filter !== 'item') {
      rows.push(
        ...vanilla.blocks.map((e) => ({
          id: `block:${e.field}`,
          label: e.name,
          sub: e.field,
          kind: 'block' as const,
          icon: vanillaIcon(e.field, 'block'),
          image: art.blocks[e.field],
          group: 'Blocks'
        }))
      )
    }
    if (props.filter !== 'block') {
      rows.push(
        ...vanilla.items.map((e) => ({
          id: `item:${e.field}`,
          label: e.name,
          sub: e.field,
          kind: 'item' as const,
          icon: vanillaIcon(e.field, 'item'),
          image: art.items[e.field],
          group: 'Items'
        }))
      )
    }
    return rows
  }, [vanilla, art, props.filter])

  const modEntries = useMemo<PickerEntry[]>(() => {
    if (!project) return []
    return projectRegistryEntries(project)
      .filter((r) => (props.filter ? r.kind === props.filter : true))
      .map((r) => ({
        id: r.registryName,
        label: r.displayName,
        sub: r.registryName,
        kind: r.kind,
        icon: vanillaIcon(r.registryName.toUpperCase(), r.kind),
        image: artworkFor(project, r),
        group: r.kind === 'block' ? 'Blocks' : 'Items'
      }))
  }, [project, props.filter])

  const what =
    props.filter === 'block' ? 'blocks' : props.filter === 'item' ? 'items' : 'blocks & items'

  return (
    <PickerDialog
      title={`Pick ${what}`}
      subtitle="Used directly in the generated code."
      tabs={[
        { id: 'vanilla', label: 'Vanilla (BTA)', entries: vanillaEntries },
        {
          id: 'mod',
          label: 'This Mod',
          entries: modEntries,
          empty: `This mod has no ${what} yet. Create some first.`
        }
      ]}
      onPick={(_tab, entry) => props.onPick(entry.id)}
      onClose={props.onClose}
    />
  )
}
