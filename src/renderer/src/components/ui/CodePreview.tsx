import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { AlertTriangle, Maximize2, Minimize2, Pencil, RotateCcw } from 'lucide-react'
import type { ArtemisElement } from '@shared/project'
import { previewElement, type GeneratedFile } from '@shared/generator/CodeGenerator'
import { useProjectStore } from '@/store/projectStore'
import { CodeEditor } from './CodeEditor'
import { cn } from '@/lib/cn'

export function CodePreview({ element }: { element: ArtemisElement }): JSX.Element {
  const [expanded, setExpanded] = useState(false)
  const body = <PreviewBody element={element} expanded={expanded} onExpand={setExpanded} />

  if (!expanded) return body

  return (
    <>
      <div className="flex flex-1 items-center justify-center px-8 text-center">
        <p className="text-2xs leading-relaxed text-mist-600">Editing full screen.</p>
      </div>
      <div className="fixed inset-0 z-[70] flex items-center justify-center">
        <motion.div
          className="acrylic absolute inset-0"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.12 }}
          onClick={() => setExpanded(false)}
        />
        <motion.div
          className="relative flex h-[92vh] w-[92vw] max-w-[1400px] flex-col overflow-hidden rounded-xl bg-ink-850 shadow-raised"
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
        >
          {body}
        </motion.div>
      </div>
    </>
  )
}

function PreviewBody({
  element,
  expanded,
  onExpand
}: {
  element: ArtemisElement
  expanded: boolean
  onExpand: (v: boolean) => void
}): JSX.Element {
  const project = useProjectStore((s) => s.project)
  const setCodeOverride = useProjectStore((s) => s.setCodeOverride)
  const [activeIdx, setActiveIdx] = useState(0)

  const result = useMemo(() => {
    if (!project) return { files: [] as GeneratedFile[], error: null as string | null }
    try {
      return { files: previewElement(project, element.id), error: null }
    } catch (e) {
      return { files: [], error: e instanceof Error ? e.message : String(e) }
    }
  }, [project, element])

  if (result.error) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
        <AlertTriangle size={18} className="text-ember-400" />
        <p className="font-mono text-2xs leading-relaxed text-ember-400">{result.error}</p>
      </div>
    )
  }

  const files = result.files
  const idx = Math.min(activeIdx, Math.max(0, files.length - 1))
  const active = files[idx]
  const override = active ? project?.codeOverrides[active.path] : undefined
  const edited = override !== undefined

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-1 border-b border-white/[0.04] px-2 py-1.5">
        <div className="flex min-w-0 flex-1 gap-1 overflow-x-auto">
          {files.map((f, i) => {
            const isEdited = project?.codeOverrides[f.path] !== undefined
            return (
              <button
                key={f.path}
                onClick={() => setActiveIdx(i)}
                className={cn(
                  'flex items-center gap-1.5 whitespace-nowrap rounded px-2 py-1 font-mono text-2xs transition-colors',
                  i === idx
                    ? 'bg-ink-750 text-gold-300'
                    : 'text-mist-500 hover:bg-ink-800 hover:text-mist-300'
                )}
              >
                {f.path.split('/').pop()}
                {isEdited && <Pencil size={9} className="text-gold-400" />}
              </button>
            )
          })}
        </div>

        {edited && active && (
          <button
            onClick={() => setCodeOverride(active.path, null)}
            title="Discard the edits and follow the form again"
            className="flex shrink-0 items-center gap-1 rounded px-2 py-1 text-2xs text-mist-500 transition-colors hover:bg-ink-750 hover:text-ember-400"
          >
            <RotateCcw size={11} /> Revert
          </button>
        )}
        <button
          onClick={() => onExpand(!expanded)}
          title={expanded ? 'Collapse' : 'Edit full screen'}
          className="shrink-0 rounded p-1.5 text-mist-500 transition-colors hover:bg-ink-750 hover:text-mist-200"
        >
          {expanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
        </button>
      </div>

      {edited && (
        <div className="flex shrink-0 items-center gap-2 bg-gold-500/10 px-3 py-1.5">
          <Pencil size={11} className="shrink-0 text-gold-400" />
          <span className="text-2xs leading-snug text-gold-300">
            Hand-edited. This file is exported as written and no longer follows the form.
          </span>
        </div>
      )}

      {active ? (
        <CodeEditor
          key={active.path}
          value={override ?? active.content}
          onChange={(next) => setCodeOverride(active.path, next === active.content ? null : next)}
          className="min-h-0 flex-1 overflow-hidden bg-ink-900/60"
        />
      ) : (
        <div className="flex flex-1 items-center justify-center text-2xs text-mist-600">
          Nothing generated yet. Fill in the form.
        </div>
      )}

      <div className="flex shrink-0 items-center gap-3 border-t border-white/[0.04] px-3 py-1.5">
        <span className="truncate font-mono text-[10px] text-mist-600">{active?.path}</span>
        <div className="flex-1" />
        <span className="shrink-0 text-[10px] text-mist-600">
          Ctrl+Space completions · Ctrl+F find
        </span>
      </div>
    </div>
  )
}
