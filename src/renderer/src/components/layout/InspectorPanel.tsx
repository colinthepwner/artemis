import { useState } from 'react'
import { Code2, PanelRightClose, PanelRightOpen } from 'lucide-react'
import { useAppStore } from '@/store/appStore'
import { useProjectStore } from '@/store/projectStore'
import { CodePreview } from '@/components/ui/CodePreview'

export function InspectorPanel(): JSX.Element {
  const [open, setOpen] = useState(false)
  const editingId = useAppStore((s) => s.editingId)
  const element = useProjectStore((s) =>
    editingId ? s.project?.elements.find((e) => e.id === editingId) : undefined
  )

  if (!open) {
    return (
      <aside className="panel flex h-full w-10 shrink-0 flex-col items-center border-l border-white/[0.04] py-3">
        <button
          onClick={() => setOpen(true)}
          title="Show code preview"
          className="flex flex-col items-center gap-3 rounded-md px-1.5 py-2 text-mist-500 transition-colors hover:bg-ink-750 hover:text-mist-200"
        >
          <PanelRightOpen size={14} />
          <Code2 size={14} className="text-gold-400/70" />
          {
}
          <span className="text-2xs font-medium uppercase tracking-wider [writing-mode:vertical-rl]">
            Code Preview
          </span>
        </button>
      </aside>
    )
  }

  return (
    <aside className="panel flex h-full w-[400px] shrink-0 flex-col border-l border-white/[0.04]">
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-white/[0.04] px-3">
        <button
          onClick={() => setOpen(false)}
          title="Hide code preview"
          className="rounded-md p-1 text-mist-500 transition-colors hover:bg-ink-750 hover:text-mist-200"
        >
          <PanelRightClose size={14} />
        </button>
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
