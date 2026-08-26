import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Search, X } from 'lucide-react'
import { useProjectStore } from '@/store/projectStore'
import { getVanillaRegistry } from '@shared/generator/vanilla'
import { projectRegistryEntries } from '@shared/generator/registry'
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
        {label || props.placeholder || 'Pick…'}
      </button>
      {open && (
        <ItemRefModal
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

type Tab = 'vanilla' | 'custom'

interface PickRow {
  ref: string
  name: string
  id: string
  kind: 'Block' | 'Item'
}

function ItemRefModal(props: {
  filter?: 'block' | 'item'
  onClose: () => void
  onPick: (ref: string) => void
}): JSX.Element {
  const project = useProjectStore((s) => s.project)
  const [tab, setTab] = useState<Tab>('vanilla')
  const [query, setQuery] = useState('')

  const vanilla = useMemo(
    () => getVanillaRegistry(project?.meta.targetBta ?? '8.0.1'),
    [project?.meta.targetBta]
  )
  const custom = useMemo(() => (project ? projectRegistryEntries(project) : []), [project])

  const q = query.trim().toLowerCase()
  const matches = (name: string, id: string): boolean =>
    !q || name.toLowerCase().includes(q) || id.toLowerCase().includes(q)

  const vanillaRows = useMemo<PickRow[]>(() => {
    const rows: PickRow[] = []
    if (props.filter !== 'item') {
      rows.push(
        ...vanilla.blocks.map((e) => ({
          ref: `block:${e.field}`,
          name: e.name,
          id: e.field,
          kind: 'Block' as const
        }))
      )
    }
    if (props.filter !== 'block') {
      rows.push(
        ...vanilla.items.map((e) => ({
          ref: `item:${e.field}`,
          name: e.name,
          id: e.field,
          kind: 'Item' as const
        }))
      )
    }
    return rows.filter((r) => matches(r.name, r.id))

  }, [vanilla, q, props.filter])

  const customRows = useMemo<PickRow[]>(
    () =>
      custom
        .filter((r) => (props.filter ? r.kind === props.filter : true))
        .filter((r) => matches(r.displayName, r.registryName))
        .map((r) => ({
          ref: r.registryName,
          name: r.displayName,
          id: r.registryName,
          kind: r.kind === 'block' ? ('Block' as const) : ('Item' as const)
        })),

    [custom, q, props.filter]
  )

  const rows = tab === 'vanilla' ? vanillaRows : customRows

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') props.onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)

  }, [])

  const what =
    props.filter === 'block' ? 'blocks' : props.filter === 'item' ? 'items' : 'blocks & items'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <motion.div
        className="acrylic absolute inset-0"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.12 }}
        onClick={props.onClose}
      />
      <motion.div
        className="relative flex h-[70vh] w-[460px] flex-col overflow-hidden rounded-xl bg-ink-850 shadow-raised"
        initial={{ opacity: 0, scale: 0.97, y: 6 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.15, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="flex items-center gap-2 border-b border-white/[0.04] px-4 py-3">
          <span className="text-[13px] font-semibold tracking-tight">Pick {what}</span>
          <div className="flex-1" />
          <button
            onClick={props.onClose}
            className="rounded-md p-1 text-mist-500 transition-colors hover:bg-ink-750 hover:text-mist-200"
          >
            <X size={14} />
          </button>
        </div>

        <div className="flex gap-1 px-3 pt-2.5">
          {(
            [
              { id: 'vanilla', label: 'Vanilla (BTA)', count: vanillaRows.length },
              { id: 'custom', label: 'This Mod', count: customRows.length }
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-2xs font-semibold uppercase tracking-wide transition-colors',
                tab === t.id
                  ? 'bg-ink-750 text-gold-400 shadow-panel'
                  : 'text-mist-500 hover:bg-ink-800 hover:text-mist-300'
              )}
            >
              {t.label}
              <span className={cn('font-mono', tab === t.id ? 'text-gold-400/60' : 'text-mist-600')}>
                {t.count}
              </span>
            </button>
          ))}
        </div>

        <div className="px-3 py-2.5">
          <div className="relative">
            <Search size={12} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-mist-600" />
            <input
              autoFocus
              className="input-base w-full py-1.5 pl-7 text-xs"
              placeholder={tab === 'vanilla' ? `Search vanilla ${what}…` : `Search this mod's ${what}…`}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {

                if (e.key === 'Enter' && rows[0]) props.onPick(rows[0].ref)
              }}
            />
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
          {rows.length === 0 ? (
            <p className="py-8 text-center text-2xs leading-relaxed text-mist-600">
              {tab === 'custom' && !q
                ? `This mod doesn't have any ${what} yet. Create some first.`
                : 'No matches.'}
            </p>
          ) : (
            rows.map((r, i) => (
              <button
                key={r.ref}
                onClick={() => props.onPick(r.ref)}
                className={cn(
                  'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-ink-750',
                  i === 0 && q && 'bg-ink-800'
                )}
              >
                <span
                  className={cn(
                    'w-11 shrink-0 rounded px-1.5 py-0.5 text-center text-[9px] font-semibold uppercase tracking-wide',
                    r.kind === 'Block' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-sky-500/15 text-sky-400'
                  )}
                >
                  {r.kind}
                </span>
                <span className="truncate text-xs text-mist-200">{r.name}</span>
                <span className="ml-auto shrink-0 truncate font-mono text-[10px] text-mist-600">{r.id}</span>
              </button>
            ))
          )}
        </div>
      </motion.div>
    </div>
  )
}
