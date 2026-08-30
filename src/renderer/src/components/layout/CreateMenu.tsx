import { motion } from 'framer-motion'
import { X } from 'lucide-react'
import { useAppStore } from '@/store/appStore'
import { useProjectStore } from '@/store/projectStore'
import { useCloseOnEscape } from '@/components/ui/dismissDistant'
import { KIND_COLORS, KIND_ICONS } from '@/lib/kindIcons'
import { KIND_LABELS } from '@/sections/forms/registry'
import type { ElementKind } from '@shared/project'

interface Entry {
  kind: ElementKind
  desc: string
}

const TERRAIN: Entry[] = [
  { kind: 'block', desc: 'A solid block: material, mining & drops' },
  { kind: 'liquid', desc: 'A flowing fluid, water- or lava-like' },
  { kind: 'plant', desc: 'A cross-model plant, can grow tall' },
  { kind: 'tree', desc: 'Grown from a recipe, or built in 3D' }
]

const WORLD: Entry[] = [
  { kind: 'ore', desc: 'Grows veins of a block you designed' },
  { kind: 'structure', desc: 'A build stamped into the world, in variants' },
  { kind: 'biome', desc: 'Climate, colors & weather' },
  { kind: 'dimension', desc: 'A world of your biomes, behind a portal' }
]

const SINGLES: { title: string; entry: Entry }[] = [
  { title: 'Items', entry: { kind: 'item', desc: 'A material, a drop, a trinket' } },
  { title: 'Gear', entry: { kind: 'gearset', desc: 'Tools and armor, nine pieces from one set of numbers' } },
  { title: 'Crafting', entry: { kind: 'recipe', desc: 'Shaped, shapeless or furnace' } },
  { title: 'Entities', entry: { kind: 'mob', desc: 'A living entity with spawns & drops' } }
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

  useCloseOnEscape(onClose)

  return (

    <div className="fixed inset-0 z-50 overflow-y-auto">
      <motion.div
        className="acrylic fixed inset-0"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.14 }}
        onClick={onClose}
      />
      <div className="relative flex min-h-full items-center justify-center p-6">
      <motion.div

        className="relative w-[min(92vw,880px)] overflow-hidden rounded-xl bg-ink-850 shadow-raised"
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
          {

}
          <div className="flex items-center gap-2">
            {

}
            <kbd className="inline-flex h-[18px] items-center justify-center rounded bg-ink-800 px-1.5 font-mono text-[10px] leading-none text-mist-500 shadow-panel">
              Esc
            </kbd>
            <button
              onClick={onClose}
              className="rounded-md p-1.5 text-mist-500 transition-colors hover:bg-ink-750 hover:text-mist-200"
            >
              <X size={15} />
            </button>
          </div>
        </div>

        <div className="p-6 pt-4">
          <SectionLabel>Blocks & Terrain</SectionLabel>
          <div className="grid grid-cols-4 gap-2">
            {TERRAIN.map((entry) => (
              <CreateCard key={entry.kind} entry={entry} onClick={() => create(entry.kind)} />
            ))}
          </div>

          <div className="mt-5">
            <SectionLabel>World</SectionLabel>
            <div className="grid grid-cols-4 gap-2">
              {WORLD.map((entry) => (
                <CreateCard key={entry.kind} entry={entry} onClick={() => create(entry.kind)} />
              ))}
            </div>
          </div>

          <div className="mt-5 grid grid-cols-4 gap-2">
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
  const Icon = KIND_ICONS[entry.kind]
  const accent = KIND_COLORS[entry.kind]
  return (
    <button

      data-tour={`create-${entry.kind}`}
      onClick={onClick}
      className="group relative flex h-full w-full flex-col items-center gap-2 rounded-lg border border-white/[0.05] bg-ink-800/60 px-3 py-4 text-center transition duration-150 hover:z-10 hover:border-gold-500/40 hover:bg-ink-750 active:scale-[0.98]"
    >
      {
}
      <div

        className="flex h-10 w-10 items-center justify-center rounded-lg shadow-panel"
        style={{ background: `${accent}1a` }}
      >
        <Icon size={19} strokeWidth={1.75} style={{ color: accent }} />
      </div>
      <div className="text-[13px] font-medium text-mist-100">{KIND_LABELS[entry.kind].label}</div>
      <div className="text-2xs leading-snug text-mist-500">{entry.desc}</div>
    </button>
  )
}
