import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Search, X } from 'lucide-react'
import { useProjectStore } from '@/store/projectStore'
import { TEXTURE_PRESETS, gridToDataUrl, type Grid, type TexturePreset } from './presets'
import { cn } from '@/lib/cn'

type Tab = 'vanilla' | 'mod'

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
  const [tab, setTab] = useState<Tab>('vanilla')
  const [query, setQuery] = useState('')
  const textures = useProjectStore((s) => s.project?.textures)

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') props.onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)

  }, [])

  const q = query.trim().toLowerCase()

  const vanilla = useMemo(
    () =>
      TEXTURE_PRESETS.map((p) => ({ preset: p, thumb: gridToDataUrl(p.generate(props.accent)) })).filter(
        ({ preset }) => !q || preset.label.toLowerCase().includes(q) || preset.group.toLowerCase().includes(q)
      ),
    [props.accent, q]
  )

  const mine = useMemo(
    () => (textures ?? []).filter((t) => !q || t.name.toLowerCase().includes(q)),
    [textures, q]
  )

  const groups: TexturePreset['group'][] = ['Terrain', 'Material', 'Tools', 'Armor']
  const count = tab === 'vanilla' ? vanilla.length : mine.length

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
        className="relative flex h-[70vh] w-[560px] flex-col overflow-hidden rounded-xl bg-ink-850 shadow-raised"
        initial={{ opacity: 0, scale: 0.97, y: 6 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.15, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="flex items-start gap-2 border-b border-white/[0.04] px-5 py-3.5">
          <div>
            <h2 className="text-[13px] font-semibold tracking-tight">Start from a texture</h2>
            <p className="mt-0.5 text-2xs text-mist-500">Fills the active layer. Your other layers stay put.</p>
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
          {(
            [
              { id: 'vanilla', label: 'Vanilla (BTA)', n: vanilla.length },
              { id: 'mod', label: 'This Mod', n: mine.length }
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
              <span className={cn('font-mono', tab === t.id ? 'text-gold-400/60' : 'text-mist-600')}>{t.n}</span>
            </button>
          ))}

          <div className="flex-1" />

          {tab === 'vanilla' && (
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
          )}
        </div>

        <div className="px-4 py-3">
          <div className="relative">
            <Search size={12} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-mist-600" />
            <input
              autoFocus
              className="input-base w-full py-1.5 pl-7 text-xs"
              placeholder={tab === 'vanilla' ? 'Search presets' : "Search this mod's textures"}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">
          {count === 0 ? (
            <p className="py-10 text-center text-2xs leading-relaxed text-mist-600">
              {tab === 'mod' && !q
                ? 'This mod has no textures yet. Paint one and it shows up here.'
                : 'No matches.'}
            </p>
          ) : tab === 'vanilla' ? (
            groups.map((group) => {
              const items = vanilla.filter(({ preset }) => preset.group === group)
              if (!items.length) return null
              return (
                <div key={group} className="mb-5">
                  <div className="mb-2 flex items-center gap-3">
                    <span className="text-2xs font-semibold uppercase tracking-wider text-mist-500">{group}</span>
                    <span className="h-px flex-1 bg-white/[0.05]" />
                  </div>
                  <div className="grid grid-cols-6 gap-2.5">
                    {items.map(({ preset, thumb }) => (
                      <Tile
                        key={preset.id}
                        src={thumb}
                        label={preset.label}
                        onClick={() => props.onPick({ grid: preset.generate(props.accent), name: preset.id })}
                      />
                    ))}
                  </div>
                </div>
              )
            })
          ) : (
            <div className="grid grid-cols-6 gap-2.5">
              {mine.map((t) => (
                <Tile
                  key={t.id}
                  src={t.data}
                  label={t.name}
                  onClick={() => props.onPick({ dataUrl: t.data, name: t.name })}
                />
              ))}
            </div>
          )}
        </div>
      </motion.div>
    </div>
  )
}

function Tile(props: { src: string; label: string; onClick: () => void }): JSX.Element {
  return (
    <button
      onClick={props.onClick}
      title={props.label}
      className="group relative flex flex-col items-center gap-1.5 hover:z-10"
    >
      <span
        className="overflow-hidden rounded-md shadow-panel transition-all group-hover:scale-105 group-hover:shadow-glow-gold"
        style={{
          backgroundImage: 'repeating-conic-gradient(#31363e 0% 25%, #262b32 0% 50%)',
          backgroundSize: '10px 10px'
        }}
      >
        <img
          src={props.src}
          alt={props.label}
          className="h-11 w-11"
          style={{ imageRendering: 'pixelated' }}
          draggable={false}
        />
      </span>
      <span className="w-full truncate text-center text-[10px] text-mist-600 group-hover:text-mist-300">
        {props.label}
      </span>
    </button>
  )
}
