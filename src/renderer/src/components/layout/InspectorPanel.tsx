import { Code2 } from 'lucide-react'
import { useAppStore } from '@/store/appStore'
import { useProjectStore } from '@/store/projectStore'
import { CodePreview } from '@/components/ui/CodePreview'

export function InspectorPanel(): JSX.Element {
  const editingId = useAppStore((s) => s.editingId)
  const element = useProjectStore((s) =>
    editingId ? s.project?.elements.find((e) => e.id === editingId) : undefined
  )

  return (
    <aside className="panel flex h-full w-[400px] flex-col border-l border-white/[0.04]">
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-white/[0.04] px-4">
        <Code2 size={14} className="text-gold-400" />
        <span className="text-2xs font-medium uppercase tracking-wider text-mist-400">Code Preview</span>
        {element && <span className="ml-auto truncate font-mono text-2xs text-mist-500">{element.name}</span>}
      </div>

      {element ? (
        <CodePreview element={element} />
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-8 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-ink-800 shadow-panel">
            <Code2 size={20} className="text-mist-600" strokeWidth={1.5} />
          </div>
          <p className="text-xs leading-relaxed text-mist-500">
            Select or create an element and its generated Java will appear here, live.
          </p>
        </div>
      )}
    </aside>
  )
}
