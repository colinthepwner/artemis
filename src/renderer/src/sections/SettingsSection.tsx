import { useProjectStore } from '@/store/projectStore'
import { Save } from 'lucide-react'
import { ModIconField } from '@/components/pixel/ModIconField'

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
        <div>
          <label className="label-base">Authors (comma separated)</label>
          <input
            className="input-base"
            value={project.meta.authors.join(', ')}
            onChange={(e) =>
              updateMeta({ authors: e.target.value.split(',').map((a) => a.trim()).filter(Boolean) })
            }
          />
        </div>
        <ModIconField />
        <div>
          <label className="label-base">Description</label>
          <textarea
            className="input-base min-h-[80px] resize-y"
            value={project.meta.description}
            onChange={(e) => updateMeta({ description: e.target.value })}
          />
        </div>

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
