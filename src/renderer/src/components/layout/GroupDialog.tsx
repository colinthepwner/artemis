import { motion } from 'framer-motion'
import { X } from 'lucide-react'
import { useAppStore } from '@/store/appStore'
import { useProjectStore } from '@/store/projectStore'
import { useCloseOnEscape } from '@/components/ui/dismissDistant'
import { Field, Select } from '@/components/ui/controls'
import { GROUP_SHELVES } from '@/sections/forms/shelves'
import { FORM_REGISTRY, KIND_LABELS } from '@/sections/forms/registry'
import { SharedTargetProvider } from '@/sections/forms/FormShell'
import { ContentThumb } from '@/components/ui/ContentThumb'
import { GROUP_COLORS, KIND_COLORS, KIND_ICONS } from '@/lib/kindIcons'
import { titleCase } from '@shared/generator/templates/block'
import type { ArtemisElement } from '@shared/project'
import { cn } from '@/lib/cn'

export function GroupDialog({
  groupId,
  onClose
}: {
  groupId: string
  onClose: () => void
}): JSX.Element | null {
  const groups = useProjectStore((s) => s.project?.groups)
  const elements = useProjectStore((s) => s.project?.elements)
  const updateGroup = useProjectStore((s) => s.updateGroup)
  const openEditor = useAppStore((s) => s.openEditor)
  const navigate = useAppStore((s) => s.navigate)
  useCloseOnEscape(onClose)

  const group = groups?.find((g) => g.id === groupId)
  if (!group) return null

  const members = group.members
    .map((id) => elements?.find((e) => e.id === id))
    .filter((e): e is ArtemisElement => !!e)
  const sharedKeys = Object.keys(group.props ?? {})
  const kind = group.kind
  const Form = kind ? FORM_REGISTRY[kind] : null
  const KindIcon = kind ? KIND_ICONS[kind] : null
  const noun = kind ? KIND_LABELS[kind] : null

  const standIn: ArtemisElement | null = kind
    ? {
        id: `group:${group.id}`,
        kind,
        name: group.name,
        properties: group.props ?? {},
        createdAt: '',
        updatedAt: ''
      }
    : null

  const open = (el: ArtemisElement): void => {
    navigate(el.kind)
    openEditor(el.id)
    onClose()
  }

  const stopSharing = (key: string): void => {
    const next = { ...(group.props ?? {}) }
    delete next[key]
    updateGroup(group.id, { props: next })
  }

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
          className="relative flex w-[min(92vw,760px)] flex-col overflow-hidden rounded-xl bg-ink-850 shadow-raised"
          initial={{ opacity: 0, scale: 0.97, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="flex items-center gap-3 border-b border-white/[0.04] px-6 py-4">
            <span
              className="h-3 w-3 shrink-0 rounded-full ring-1 ring-inset ring-white/20"
              style={{ background: group.color }}
            />
            <div className="min-w-0">
              <h2 className="truncate text-base font-semibold tracking-tight">{group.name}</h2>
              <p className="mt-0.5 text-2xs text-mist-500">{summary(members.length, sharedKeys.length, noun)}</p>
            </div>
            <div className="flex-1" />
            <kbd className="inline-flex h-[18px] items-center justify-center rounded bg-ink-800 px-1.5 font-mono text-[10px] leading-none text-mist-500 shadow-panel">
              Esc
            </kbd>
            <button
              onClick={onClose}
              aria-label="Close"
              className="rounded-md p-1.5 text-mist-500 transition-colors hover:bg-ink-750 hover:text-mist-200"
            >
              <X size={15} />
            </button>
          </div>

          <div className="min-h-0 overflow-y-auto">
            <div className="space-y-4 px-6 py-5">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label-base">Name</label>
                  <input
                    className="input-base"
                    value={group.name}
                    autoFocus
                    onChange={(e) => updateGroup(group.id, { name: e.target.value })}
                  />
                </div>
                <Field
                  label="Creative Shelf"
                  hint="Members land here together, in the order the sidebar lists them."
                >
                  <Select
                    value={group.shelf ?? ''}
                    onChange={(v) => updateGroup(group.id, { shelf: v })}
                    options={GROUP_SHELVES}
                  />
                </Field>
              </div>

              <div>
                <label className="label-base">Colour</label>
                <div className="flex flex-wrap gap-1.5">
                  {GROUP_COLORS.map((c) => (
                    <button
                      key={c}
                      onClick={() => updateGroup(group.id, { color: c })}
                      aria-label={`Colour ${c}`}
                      className={cn(
                        'h-6 w-6 rounded-md ring-1 ring-inset ring-white/15 transition-transform hover:scale-110',
                        group.color === c && 'ring-2 ring-white/60'
                      )}
                      style={{ background: c }}
                    />
                  ))}
                </div>
              </div>

              {sharedKeys.length > 0 && (
                <div>
                  <label className="label-base">Shared right now</label>
                  <p className="mb-2 text-2xs leading-relaxed text-mist-600">
                    These override what each member says. Drop one and every member keeps the value
                    it has this moment.
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {sharedKeys.map((key) => (
                      <button
                        key={key}
                        onClick={() => stopSharing(key)}
                        title="Stop sharing this"
                        className="flex items-center gap-1.5 rounded-md bg-ink-800 py-1 pl-2.5 pr-1.5 font-mono text-2xs text-mist-300 transition-colors hover:bg-ink-750"
                      >
                        {key}
                        <X size={11} className="text-mist-500" />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {members.length > 0 && (
                <div>
                  <label className="label-base">In this group</label>
                  <p className="mb-2 text-2xs leading-relaxed text-mist-600">
                    Drag rows in the sidebar to add, remove or reorder. The order is what a player
                    sees on the shelf.
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {members.map((el) => (
                      <button
                        key={el.id}
                        onClick={() => open(el)}
                        title={`Open ${titleCase(el.name)}`}
                        className="flex items-center gap-1.5 rounded-md bg-ink-800 py-1 pl-1.5 pr-2.5 text-2xs text-mist-200 transition-colors hover:bg-ink-750"
                      >
                        <ContentThumb element={el} size={14} />
                        <span className="truncate">
                          {(el.properties['displayName'] as string) || titleCase(el.name)}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {

}
            {Form && standIn && kind && noun && (
              <div className="border-t border-white/[0.04]">
                <div className="flex items-center gap-2 px-6 pt-4">
                  {KindIcon && (
                    <KindIcon size={12} strokeWidth={2} style={{ color: KIND_COLORS[kind] }} />
                  )}
                  <span className="label-base mb-0">Shared {noun.label} settings</span>
                </div>
                <p className="px-6 pb-1 pt-1.5 text-2xs leading-relaxed text-mist-600">
                  Anything you change below is set on every {noun.label.toLowerCase()} in the group
                  and overrides what it says itself. What you leave alone stays each one&apos;s own.
                </p>
                <div className="h-[420px]">
                  <SharedTargetProvider group={group}>
                    <Form element={standIn} kind={kind} onClose={onClose} />
                  </SharedTargetProvider>
                </div>
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </div>
  )
}

function summary(
  members: number,
  shared: number,
  noun: { label: string; labelPlural: string } | null
): string {
  if (members === 0 || !noun) {
    return 'Nothing filed in it yet. The first thing you put in decides what it holds.'
  }
  const what = `${members} ${(members === 1 ? noun.label : noun.labelPlural).toLowerCase()}`
  if (shared === 0) return `${what}, nothing shared yet.`
  return `${what}, ${shared} shared ${shared === 1 ? 'setting' : 'settings'}.`
}
