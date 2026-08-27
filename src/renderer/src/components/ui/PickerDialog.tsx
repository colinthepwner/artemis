import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Search, X, type LucideIcon } from 'lucide-react'
import { useCloseOnEscape } from '@/components/ui/dismissDistant'
import { cn } from '@/lib/cn'

export interface PickerEntry {
  id: string
  label: string

  sub?: string

  image?: string
  icon?: LucideIcon

  kind?: 'block' | 'item'

  group?: string
}

export interface PickerTab {
  id: string
  label: string
  entries: PickerEntry[]

  empty?: string
}

export function PickerDialog(props: {
  title: string
  subtitle?: string
  tabs: PickerTab[]

  accessory?: (tabId: string) => React.ReactNode
  onPick: (tabId: string, entry: PickerEntry) => void
  onClose: () => void
}): JSX.Element {
  const [tabId, setTabId] = useState(props.tabs[0]?.id ?? '')
  const [query, setQuery] = useState('')

  useCloseOnEscape(props.onClose)

  const q = query.trim().toLowerCase()
  const filtered = useMemo(() => {
    const match = (e: PickerEntry): boolean =>
      !q || e.label.toLowerCase().includes(q) || (e.sub ?? '').toLowerCase().includes(q)
    return props.tabs.map((t) => ({ ...t, entries: t.entries.filter(match) }))
  }, [props.tabs, q])

  const tab = filtered.find((t) => t.id === tabId) ?? filtered[0]
  const entries = tab?.entries ?? []

  const groups = useMemo(() => {
    const seen: string[] = []
    for (const e of entries) {
      const g = e.group ?? ''
      if (!seen.includes(g)) seen.push(g)
    }
    return seen
  }, [entries])

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <motion.div
        className="acrylic absolute inset-0"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.12 }}
        onClick={props.onClose}
      />
      <motion.div
        className="relative flex h-[72vh] w-[620px] flex-col overflow-hidden rounded-xl bg-ink-850 shadow-raised"
        initial={{ opacity: 0, scale: 0.97, y: 6 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.15, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="flex items-start gap-2 border-b border-white/[0.04] px-5 py-3.5">
          <div className="min-w-0">
            <h2 className="text-[13px] font-semibold tracking-tight">{props.title}</h2>
            {props.subtitle && <p className="mt-0.5 text-2xs text-mist-500">{props.subtitle}</p>}
          </div>
          <div className="flex-1" />
          <button
            onClick={props.onClose}
            className="rounded-md p-1.5 text-mist-500 transition-colors hover:bg-ink-750 hover:text-mist-200"
          >
            <X size={15} />
          </button>
        </div>

        <div className="flex items-center gap-1 px-4 pt-3">
          {filtered.map((t) => (
            <button
              key={t.id}
              onClick={() => setTabId(t.id)}
              className={cn(
                'relative flex items-center gap-1.5 rounded-md px-3 py-1.5 text-2xs font-semibold uppercase tracking-wide transition-colors',
                t.id === tab?.id ? 'z-10 text-gold-400' : 'text-mist-500 hover:text-mist-300'
              )}
            >
              {t.id === tab?.id && (
                <motion.span
                  layoutId="picker-tab"
                  className="absolute inset-0 rounded-md bg-ink-750 shadow-panel"
                  transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                />
              )}
              <span className="relative z-10">{t.label}</span>
              <span
                className={cn(
                  'relative z-10 font-mono',
                  t.id === tab?.id ? 'text-gold-400/60' : 'text-mist-600'
                )}
              >
                {t.entries.length}
              </span>
            </button>
          ))}
          <div className="flex-1" />
          {props.accessory?.(tab?.id ?? '')}
        </div>

        <div className="px-4 py-3">
          <div className="relative">
            <Search size={12} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-mist-600" />
            <input
              autoFocus
              className="input-base w-full py-1.5 pl-7 text-xs"
              placeholder={`Search ${tab?.label.toLowerCase() ?? ''}`}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && entries[0] && tab) props.onPick(tab.id, entries[0])
              }}
            />
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">
          {entries.length === 0 ? (
            <p className="py-12 text-center text-2xs leading-relaxed text-mist-600">
              {q ? 'No matches.' : (tab?.empty ?? 'Nothing here yet.')}
            </p>
          ) : (
            groups.map((group) => {
              const items = entries.filter((e) => (e.group ?? '') === group)
              return (
                <div key={group} className="mb-5 last:mb-0">
                  {group && (
                    <div className="mb-2.5 flex items-center gap-3">
                      <span className="text-2xs font-semibold uppercase tracking-wider text-mist-500">
                        {group}
                      </span>
                      <span className="h-px flex-1 bg-white/[0.05]" />
                    </div>
                  )}
                  <div className="grid grid-cols-5 gap-2.5">
                    {items.map((e) => (
                      <Tile key={e.id} entry={e} onClick={() => tab && props.onPick(tab.id, e)} />
                    ))}
                  </div>
                </div>
              )
            })
          )}
        </div>
      </motion.div>
    </div>
  )
}

function Tile({ entry, onClick }: { entry: PickerEntry; onClick: () => void }): JSX.Element {
  const Icon = entry.icon
  const isItem = entry.kind === 'item'
  return (
    <button
      onClick={onClick}
      title={entry.sub ? `${entry.label} (${entry.sub})` : entry.label}
      className="group relative flex flex-col items-center gap-1.5 rounded-lg p-2 transition-colors hover:z-10 hover:bg-ink-800"
    >
      <span
        className={cn(
          'flex h-12 w-12 items-center justify-center overflow-hidden rounded-md shadow-panel transition-all group-hover:shadow-glow-gold',
          !entry.image && 'bg-ink-900/70'
        )}
        style={
          entry.image
            ? {
                backgroundImage: 'repeating-conic-gradient(#31363e 0% 25%, #262b32 0% 50%)',
                backgroundSize: '10px 10px'
              }
            : undefined
        }
      >
        {entry.image ? (
          <img
            src={entry.image}
            alt={entry.label}
            className="h-full w-full"
            style={{ imageRendering: 'pixelated' }}
            draggable={false}
          />
        ) : Icon ? (
          <Icon
            size={18}
            strokeWidth={1.6}
            className={cn(
              'transition-colors',
              isItem ? 'text-sky-400/70 group-hover:text-sky-400' : 'text-emerald-400/70 group-hover:text-emerald-400'
            )}
          />
        ) : null}
      </span>
      <span className="w-full truncate text-center text-[10px] leading-tight text-mist-300 group-hover:text-mist-100">
        {entry.label}
      </span>
      {entry.sub && (
        <span className="w-full truncate text-center font-mono text-[9px] leading-none text-mist-600">
          {entry.sub}
        </span>
      )}
    </button>
  )
}
