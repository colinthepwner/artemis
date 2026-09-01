import { useState } from 'react'
import { useProjectStore } from '@/store/projectStore'
import { Plus, Save, Trash2 } from 'lucide-react'
import { ModIconField } from '@/components/pixel/ModIconField'
import { Select } from '@/components/ui/controls'
import type { ModDependency } from '@shared/project'

function AuthorsField(): JSX.Element {
  const authors = useProjectStore((s) => s.project?.meta.authors) ?? NONE
  const updateMeta = useProjectStore((s) => s.updateMeta)

  const [draft, setDraft] = useState<string | null>(null)

  return (
    <div>
      <label className="label-base">Authors (comma separated)</label>
      <input
        className="input-base"
        value={draft ?? authors.join(', ')}
        onChange={(e) => {
          setDraft(e.target.value)
          updateMeta({
            authors: e.target.value
              .split(',')
              .map((a) => a.trim())
              .filter(Boolean)
          })
        }}
        onBlur={() => setDraft(null)}
      />
    </div>
  )
}

const NONE: never[] = []

export function SettingsSection(): JSX.Element | null {
  const project = useProjectStore((s) => s.project)
  const updateMeta = useProjectStore((s) => s.updateMeta)
  const saveProject = useProjectStore((s) => s.saveProject)
  const filePath = useProjectStore((s) => s.filePath)

  if (!project) return null

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="mx-auto max-w-lg">
      <h2 className="text-sm font-semibold tracking-tight">Settings</h2>

      <div className="mt-5 space-y-4">
        <div>
          <label className="label-base">Mod Name</label>
          <input
            className="input-base"
            value={project.meta.name}
            onChange={(e) => updateMeta({ name: e.target.value })}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label-base">Version</label>
            <input
              className="input-base font-mono"
              value={project.meta.version}
              onChange={(e) => updateMeta({ version: e.target.value })}
            />
          </div>
          <div>
            <label className="label-base">Mod ID</label>
            {
}
            <input className="input-base font-mono opacity-50" value={project.meta.modId} readOnly />
          </div>
        </div>
        <AuthorsField />
        <ModIconField />
        <div>
          <label className="label-base">Description</label>
          <textarea
            className="input-base min-h-[80px] resize-y"
            value={project.meta.description}
            onChange={(e) => updateMeta({ description: e.target.value })}
          />
        </div>

        <DependencyList
          value={project.meta.dependencies ?? []}
          onChange={(dependencies) => updateMeta({ dependencies })}
        />

        <div className="flex items-center gap-3 pt-2">
          <button
            onClick={() => void saveProject()}
            className="flex shrink-0 items-center gap-2 rounded-md bg-gold-500 px-4 py-2 text-[13px] font-medium text-ink-950 transition-colors hover:bg-gold-400"
          >
            <Save size={14} /> Save Project
          </button>
          {
}
          {filePath && (
            <span className="min-w-0 truncate font-mono text-2xs text-mist-600" title={filePath}>
              {filePath}
            </span>
          )}
        </div>
      </div>
      </div>
    </div>
  )
}

function DependencyList(props: {
  value: ModDependency[]
  onChange: (v: ModDependency[]) => void
}): JSX.Element {
  const { value, onChange } = props
  const patch = (i: number, p: Partial<ModDependency>): void =>
    onChange(value.map((d, n) => (n === i ? { ...d, ...p } : d)))

  return (
    <div>
      <label className="label-base">Other Mods</label>
      <p className="mb-2 text-2xs leading-relaxed text-mist-600">
        Mods this one wants beside it. Optional ones are only recommended, so your mod still
        loads without them. Declaring one here does not let you write code against it.
      </p>
      <div className="space-y-2">
        {value.map((dep, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              className="input-base min-w-0 flex-1 font-mono text-2xs"
              placeholder="modid"
              value={dep.modId}
              onChange={(e) => patch(i, { modId: e.target.value.trim() })}
            />
            <input
              className="input-base w-24 shrink-0 font-mono text-2xs"
              placeholder="*"
              value={dep.version}
              onChange={(e) => patch(i, { version: e.target.value })}
            />
            <span className="w-28 shrink-0">
            <Select
              value={dep.optional ? 'optional' : 'needed'}
              onChange={(v) => patch(i, { optional: v === 'optional' })}
              options={[
                { value: 'needed', label: 'Needed' },
                { value: 'optional', label: 'Optional' }
              ]}
            />
            </span>
            <button
              onClick={() => onChange(value.filter((_, n) => n !== i))}
              title="Remove"
              className="shrink-0 rounded-md p-1.5 text-mist-500 transition-colors hover:bg-ember-500/15 hover:text-ember-400"
            >
              <Trash2 size={13} />
            </button>
          </div>
        ))}
        <button
          onClick={() => onChange([...value, { modId: '', version: '*', optional: true }])}
          className="flex w-full items-center justify-center gap-1.5 rounded-md bg-ink-750 py-2 text-2xs text-mist-300 transition-colors hover:bg-ink-700"
        >
          <Plus size={13} /> Add a mod
        </button>
      </div>
    </div>
  )
}
