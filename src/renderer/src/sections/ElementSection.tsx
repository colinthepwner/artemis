import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { Plus, Trash2, PanelRight, Copy, Pencil } from 'lucide-react'
import { useAppStore } from '@/store/appStore'
import { useProjectStore } from '@/store/projectStore'
import * as ContextMenu from '@radix-ui/react-context-menu'
import { ContextMenuContent, ContextMenuItem, ContextMenuSeparator } from '@/components/ui/context'
import type { ArtemisElement, ElementKind } from '@shared/project'
import { FORM_REGISTRY, KIND_LABELS } from '@/sections/forms/registry'
import { ContentThumb } from '@/components/ui/ContentThumb'
import { PANE_ENTER } from '@/components/ui/enter'

export function ElementSection({ kind }: { kind: ElementKind }): JSX.Element {
  const editingId = useAppStore((s) => s.editingId)
  const openEditor = useAppStore((s) => s.openEditor)
  const toggleInspector = useAppStore((s) => s.toggleInspector)

  const allElements = useProjectStore((s) => s.project?.elements)
  const elements = useMemo(
    () => allElements?.filter((e) => e.kind === kind) ?? [],
    [allElements, kind]
  )
  const removeElement = useProjectStore((s) => s.removeElement)
  const createElement = useProjectStore((s) => s.createElement)
  const duplicateElement = useProjectStore((s) => s.duplicateElement)

  const { label, labelPlural } = KIND_LABELS[kind]
  const Form = FORM_REGISTRY[kind]
  const editing = editingId ? elements.find((e) => e.id === editingId) : undefined

  const createNew = (): void => {
    openEditor(createElement(kind))
  }

  return (
    <div className="flex h-full flex-col">
      {}
      <div className="flex h-12 shrink-0 items-center gap-3 border-b border-white/[0.04] px-5">
        <h2 className="text-sm font-semibold tracking-tight">{labelPlural}</h2>
        <span className="rounded-full bg-ink-800 px-2 py-px font-mono text-2xs text-mist-500">
          {elements.length}
        </span>
        <div className="flex-1" />
        <button
            data-tour="section-new"
            onClick={createNew}
            className="flex shrink-0 items-center gap-1.5 rounded-md bg-gold-500 px-3 py-1.5 text-2xs font-semibold uppercase tracking-wide text-ink-950 transition-all hover:bg-gold-400 active:scale-[0.97]"
          >
            <Plus size={13} strokeWidth={2.5} /> New {label}
        </button>
        {

}
        {editingId && (
          <button
            onClick={toggleInspector}
            title="Toggle code preview"
            className="shrink-0 rounded-md p-1.5 text-mist-500 transition-colors hover:bg-ink-750 hover:text-mist-200"
          >
            <PanelRight size={15} />
          </button>
        )}
      </div>

      {
}
      <div className="relative min-h-0 flex-1">
        {editingId ? (
          <motion.div key={editingId} className="absolute inset-0" {...PANE_ENTER}>
            <Form kind={kind} element={editing ?? null} onClose={() => openEditor(null)} />
          </motion.div>
        ) : (
          <motion.div key="list" className="absolute inset-0 overflow-y-auto p-5" {...PANE_ENTER}>
            {elements.length === 0 ? (
              <EmptyState label={label} onCreate={createNew} />
            ) : (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">
                {elements.map((el) => (
                  <ElementCard
                    key={el.id}
                    element={el}
                    onOpen={() => openEditor(el.id)}
                    onDuplicate={() => {
                      const copy = duplicateElement(el.id)
                      if (copy) openEditor(copy)
                    }}
                    onDelete={() => removeElement(el.id)}
                  />
                ))}
              </div>
            )}
          </motion.div>
        )}
      </div>
    </div>
  )
}

function ElementCard(props: {
  element: ArtemisElement
  onOpen: () => void
  onDuplicate: () => void
  onDelete: () => void
}): JSX.Element {
  const display = (props.element.properties['displayName'] as string) || props.element.name
  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.96 }}
          onClick={props.onOpen}
          className="card group relative cursor-default p-4 transition duration-150 hover:bg-ink-750 hover:shadow-raised"
        >
          <div className="flex items-center gap-2.5">
            <ContentThumb element={props.element} size={28} />
            <div className="min-w-0">
              <div className="truncate text-[13px] font-medium text-mist-50">{display}</div>
              <div className="mt-1 truncate font-mono text-2xs text-mist-500">
                {props.element.name}
              </div>
            </div>
          </div>
        </motion.div>
      </ContextMenu.Trigger>
      <ContextMenuContent>
        <ContextMenuItem label="Edit" icon={Pencil} onSelect={props.onOpen} />
        <ContextMenuItem label="Duplicate" icon={Copy} onSelect={props.onDuplicate} />
        <ContextMenuSeparator />
        <ContextMenuItem label="Delete" icon={Trash2} danger onSelect={props.onDelete} />
      </ContextMenuContent>
    </ContextMenu.Root>
  )
}

function EmptyState({ label, onCreate }: { label: string; onCreate: () => void }): JSX.Element {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3">
      <p className="text-[13px] text-mist-500">Nothing here yet.</p>
      <button
        onClick={onCreate}
        className="flex items-center gap-1.5 rounded-md bg-ink-750 px-4 py-2 text-[13px] text-mist-200 transition-colors hover:bg-ink-700"
      >
        <Plus size={14} /> Create your first {label.toLowerCase()}
      </button>
    </div>
  )
}
