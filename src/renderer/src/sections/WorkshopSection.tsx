import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Boxes, Copy, Hammer, Plus, Settings2, Trash2 } from 'lucide-react'
import * as ContextMenu from '@radix-ui/react-context-menu'
import { ContextMenuContent, ContextMenuItem, ContextMenuSeparator } from '@/components/ui/context'
import { useAppStore } from '@/store/appStore'
import { useProjectStore } from '@/store/projectStore'
import { VoxelSprite } from '@/components/workshop/VoxelSprite'
import { KIND_COLORS, KIND_ICONS } from '@/lib/kindIcons'
import { titleCase } from '@shared/generator/templates/block'
import type { ArtemisElement } from '@shared/project'
import type { BuildVariant, TreeProps } from '@shared/generator/props'
import { cn } from '@/lib/cn'

type Shelf = 'tree' | 'structure' | 'model'

export function WorkshopSection(): JSX.Element {
  const project = useProjectStore((s) => s.project)
  const allElements = useProjectStore((s) => s.project?.elements)
  const createElement = useProjectStore((s) => s.createElement)
  const duplicateElement = useProjectStore((s) => s.duplicateElement)
  const removeElement = useProjectStore((s) => s.removeElement)
  const navigate = useAppStore((s) => s.navigate)
  const openEditor = useAppStore((s) => s.openEditor)
  const openWorkshopEditor = useAppStore((s) => s.openWorkshopEditor)

  const [shelf, setShelf] = useState<Shelf>('tree')

  const trees = useMemo(() => allElements?.filter((e) => e.kind === 'tree') ?? [], [allElements])
  const structures = useMemo(
    () => allElements?.filter((e) => e.kind === 'structure') ?? [],
    [allElements]
  )
  const shown = shelf === 'tree' ? trees : shelf === 'structure' ? structures : []

  const createNew = (): void => {
    if (shelf === 'model' || !project) return
    const id = createElement(shelf)

    openWorkshopEditor(id)
  }

  const openSettings = (el: ArtemisElement): void => {
    navigate(el.kind)
    openEditor(el.id)
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-12 shrink-0 items-center gap-3 border-b border-white/[0.04] px-5">
        <h2 className="text-sm font-semibold tracking-tight">Workshop</h2>

        <div className="ml-2 flex gap-1 rounded-md bg-ink-900/60 p-0.5 shadow-panel">
          {(
            [
              { id: 'tree', label: 'Trees', count: trees.length },
              { id: 'structure', label: 'Structures', count: structures.length },
              { id: 'model', label: 'Models', count: null }
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              onClick={() => setShelf(t.id)}
              className={cn(
                'relative flex items-center gap-1.5 rounded px-2.5 py-1 text-2xs font-semibold uppercase tracking-wide transition-colors',
                shelf === t.id ? 'z-10 text-gold-400' : 'text-mist-500 hover:text-mist-300'
              )}
            >
              {shelf === t.id && (
                <motion.span
                  layoutId="workshop-shelf"
                  className="absolute inset-0 rounded bg-ink-750 shadow-panel"
                  transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                />
              )}
              <span className="relative z-10">{t.label}</span>
              {t.count !== null && (
                <span
                  className={cn(
                    'relative z-10 font-mono font-normal',
                    shelf === t.id ? 'text-gold-400/60' : 'text-mist-600'
                  )}
                >
                  {t.count}
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="flex-1" />
        {shelf !== 'model' && (
          <button
            data-tour="workshop-new"
            onClick={createNew}
            className="flex items-center gap-1.5 rounded-md bg-gold-500 px-3 py-1.5 text-2xs font-semibold uppercase tracking-wide text-ink-950 transition-all hover:bg-gold-400 active:scale-[0.97]"
          >
            <Plus size={13} strokeWidth={2.5} /> New {shelf === 'tree' ? 'Tree' : 'Structure'}
          </button>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        {shelf === 'model' ? (
          <ModelsComingSoon />
        ) : shown.length === 0 ? (
          <EmptyShelf shelf={shelf} onCreate={createNew} />
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(170px,1fr))] gap-3">
            {shown.map((el) => (
              <BuildCard
                key={el.id}
                element={el}
                onOpen={() => openWorkshopEditor(el.id)}
                onSettings={() => openSettings(el)}
                onDuplicate={() => {
                  const copy = duplicateElement(el.id)
                  if (copy) openWorkshopEditor(copy)
                }}
                onDelete={() => removeElement(el.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function BuildCard(props: {
  element: ArtemisElement
  onOpen: () => void
  onSettings: () => void
  onDuplicate: () => void
  onDelete: () => void
}): JSX.Element {
  const { element } = props
  const display = (element.properties['displayName'] as string) || titleCase(element.name)
  const isTree = element.kind === 'tree'
  const p = element.properties as Partial<TreeProps>
  const variants = (p.variants ?? []) as BuildVariant[]
  const built = variants.filter((v) => Object.keys(v.blocks ?? {}).length > 0)
  const grown = isTree && p.design !== 'built'
  const Icon = KIND_ICONS[element.kind]
  const accent = KIND_COLORS[element.kind]

  const thumb = built[0]?.blocks
  const kindIcon = <Icon size={26} strokeWidth={1.5} style={{ color: accent, opacity: 0.7 }} />

  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          onClick={props.onOpen}
          className="card group relative flex cursor-default flex-col items-center gap-2 p-3 transition hover:z-10 hover:bg-ink-750 hover:shadow-raised"
        >
          <div className="flex h-[88px] w-full items-center justify-center overflow-hidden rounded-md bg-ink-900/60">
            {

}
            {thumb ? (
              <VoxelSprite blocks={thumb} size={86} maxCells={4000} fallback={kindIcon} />
            ) : (
              kindIcon
            )}
          </div>
          <span className="w-full truncate text-center text-[13px] font-medium text-mist-50">
            {display}
          </span>
          <span className="flex items-center gap-1.5 text-2xs text-mist-500">
            {grown ? (
              <span title="Uses the procedural trunk-and-canopy shape from its settings">Grown shape</span>
            ) : built.length > 0 ? (
              <span>
                {built.length} variant{built.length === 1 ? '' : 's'}
              </span>
            ) : (
              <span className="text-ember-400/80">nothing built</span>
            )}
          </span>
        </motion.div>
      </ContextMenu.Trigger>
      <ContextMenuContent>
        <ContextMenuItem label="Open 3D editor" icon={Boxes} onSelect={props.onOpen} />
        <ContextMenuItem
          label={isTree ? 'Tree settings' : 'Structure settings'}
          icon={Settings2}
          onSelect={props.onSettings}
        />
        <ContextMenuItem label="Duplicate" icon={Copy} onSelect={props.onDuplicate} />
        <ContextMenuSeparator />
        <ContextMenuItem label="Delete" icon={Trash2} danger onSelect={props.onDelete} />
      </ContextMenuContent>
    </ContextMenu.Root>
  )
}

function EmptyShelf({ shelf, onCreate }: { shelf: 'tree' | 'structure'; onCreate: () => void }): JSX.Element {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-ink-800 shadow-panel">
        <Hammer size={20} className="text-mist-600" strokeWidth={1.5} />
      </div>
      <p className="max-w-sm text-[13px] leading-relaxed text-mist-500">
        {shelf === 'tree'
          ? 'Build trees block by block in 3D, in as many variants as a forest needs. The world plants one at random each time.'
          : 'Build structures block by block in 3D — ruins, huts, monuments — with variants so no two placements look stamped.'}
      </p>
      <button
        onClick={onCreate}
        className="flex items-center gap-1.5 rounded-md bg-ink-750 px-4 py-2 text-[13px] text-mist-200 transition-colors hover:bg-ink-700"
      >
        <Plus size={14} /> Build your first {shelf}
      </button>
    </div>
  )
}

function ModelsComingSoon(): JSX.Element {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-ink-800 shadow-panel">
        <Boxes size={20} className="text-mist-600" strokeWidth={1.5} />
      </div>
      <p className="text-[13px] font-medium text-mist-300">Models are on the bench.</p>
      <p className="max-w-sm text-2xs leading-relaxed text-mist-600">
        Custom shapes for items, plants and mobs will be sculpted here, in the same editor the trees
        and structures use. Nothing to do yet.
      </p>
    </div>
  )
}
