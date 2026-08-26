import { useMemo, useState } from 'react'
import { useProjectStore } from '@/store/projectStore'
import { getVanillaRegistry } from '@shared/generator/vanilla'
import { projectRegistryEntries } from '@shared/generator/registry'
import { artworkFor } from '@shared/generator/artwork'
import { vanillaIcon } from './vanillaIcons'
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
  const label = useRefLabel(props.value)

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={props.value ? `${label} (${props.value})` : 'Click to pick'}
        className={cn(
          'input-base flex items-center truncate text-left',
          !props.value && 'text-mist-600',
          props.className
        )}
      >
        {label || props.placeholder || 'Pick'}
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

function useRefLabel(ref: string): string {
  const project = useProjectStore((s) => s.project)
  return useMemo(() => {
    const t = ref.trim()
    if (!t) return ''
    const vanilla = getVanillaRegistry(project?.meta.targetBta ?? '8.0.1')
    if (t.startsWith('block:')) {
      return vanilla.blocks.find((e) => e.field === t.slice(6))?.name ?? t.slice(6)
    }
    if (t.startsWith('item:')) {
      return vanilla.items.find((e) => e.field === t.slice(5))?.name ?? t.slice(5)
    }
    const custom = project ? projectRegistryEntries(project) : []
    return custom.find((e) => e.registryName === t)?.displayName ?? t
  }, [ref, project])
}

function ItemRefPicker(props: {
  filter?: 'block' | 'item'
  onClose: () => void
  onPick: (ref: string) => void
}): JSX.Element {
  const project = useProjectStore((s) => s.project)

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
          group: 'Items'
        }))
      )
    }
    return rows
  }, [vanilla, props.filter])

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
