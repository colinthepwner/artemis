import { useEffect } from 'react'
import { motion } from 'framer-motion'
import {
  Box,
  Droplets,
  Gem,
  Sprout,
  TreePine,
  UtensilsCrossed,
  Rabbit,
  Mountain,
  X,
  type LucideIcon
} from 'lucide-react'
import { useAppStore } from '@/store/appStore'
import { useProjectStore } from '@/store/projectStore'
import type { ElementKind } from '@shared/project'

interface Entry {
  kind: ElementKind
  label: string
  icon: LucideIcon
  desc: string
}

const TERRAIN: Entry[] = [
  { kind: 'block', label: 'Block', icon: Box, desc: 'A solid block with custom material & drops' },
  { kind: 'ore', label: 'Ore', icon: Gem, desc: 'Ore + material item, optional auto gear set' },
  { kind: 'liquid', label: 'Liquid', icon: Droplets, desc: 'A flowing fluid, water- or lava-like' },
  { kind: 'plant', label: 'Plant', icon: Sprout, desc: 'A cross-model flower or shrub' },
  { kind: 'tree', label: 'Tree', icon: TreePine, desc: 'Log + leaves with a world feature' }
]

const SINGLES: { title: string; entry: Entry }[] = [
  {
    title: 'Crafting',
    entry: { kind: 'recipe', label: 'Recipe', icon: UtensilsCrossed, desc: 'Shaped, shapeless or furnace' }
  },
  {
    title: 'Entities',
    entry: { kind: 'mob', label: 'Mob', icon: Rabbit, desc: 'A living entity with stats & drops' }
  },
  {
    title: 'World',
    entry: { kind: 'biome', label: 'Biome', icon: Mountain, desc: 'Climate, colors & spawns' }
  }
]

export function CreateMenu({ onClose }: { onClose: () => void }): JSX.Element {
  const navigate = useAppStore((s) => s.navigate)
  const openEditor = useAppStore((s) => s.openEditor)
  const createElement = useProjectStore((s) => s.createElement)

  const create = (kind: ElementKind): void => {
    navigate(kind)
    const id = createElement(kind)
    openEditor(id)
    onClose()
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)

  }, [])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <motion.div
        className="acrylic absolute inset-0"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.14 }}
        onClick={onClose}
      />
      <motion.div
        className="relative w-[640px] overflow-hidden rounded-xl bg-ink-850 shadow-raised"
        initial={{ opacity: 0, scale: 0.97, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="flex items-start gap-2 border-b border-white/[0.04] px-6 py-4">
          <div>
            <h2 className="text-base font-semibold tracking-tight">Add to your mod</h2>
            <p className="mt-0.5 text-2xs text-mist-500">
              Pick a type. The next screen walks you through it.
            </p>
          </div>
          <div className="flex-1" />
          <kbd className="rounded bg-ink-800 px-1.5 py-0.5 font-mono text-[10px] text-mist-500 shadow-panel">
            Esc
          </kbd>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-mist-500 transition-colors hover:bg-ink-750 hover:text-mist-200"
          >
            <X size={15} />
          </button>
        </div>

        <div className="p-6 pt-4">
          <SectionLabel>Blocks & Terrain</SectionLabel>
          <div className="grid grid-cols-3 gap-2">
            {TERRAIN.map((entry) => (
              <CreateCard key={entry.kind} entry={entry} onClick={() => create(entry.kind)} />
            ))}
          </div>

          <div className="mt-5 grid grid-cols-3 gap-2">
            {SINGLES.map(({ title, entry }) => (

              <div key={entry.kind} className="grid grid-rows-[auto_1fr]">
                <SectionLabel>{title}</SectionLabel>
                <CreateCard entry={entry} onClick={() => create(entry.kind)} />
              </div>
            ))}
          </div>
        </div>
      </motion.div>
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <div className="mb-2 flex items-center gap-3">
      <span className="text-2xs font-semibold uppercase tracking-wider text-mist-500">{children}</span>
      <span className="h-px flex-1 bg-white/[0.05]" />
    </div>
  )
}

function CreateCard({ entry, onClick }: { entry: Entry; onClick: () => void }): JSX.Element {
  const Icon = entry.icon
  return (
    <button
      onClick={onClick}
      className="group relative flex h-full w-full flex-col items-center gap-2 rounded-lg border border-white/[0.05] bg-ink-800/60 px-3 py-4 text-center transition-all duration-150 hover:z-10 hover:border-gold-500/40 hover:bg-ink-750 active:scale-[0.98]"
    >
      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-ink-900/70 shadow-panel transition-colors group-hover:bg-gold-500/10">
        <Icon
          size={19}
          strokeWidth={1.75}
          className="text-gold-400/70 transition-colors group-hover:text-gold-400"
        />
      </div>
      <div className="text-[13px] font-medium text-mist-100">{entry.label}</div>
      <div className="text-2xs leading-snug text-mist-500">{entry.desc}</div>
    </button>
  )
}
