import { useMemo, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import type { ArtemisElement } from '@shared/project'
import { previewElement, type GeneratedFile } from '@shared/generator/CodeGenerator'
import { useProjectStore } from '@/store/projectStore'
import { cn } from '@/lib/cn'

export function CodePreview({ element }: { element: ArtemisElement }): JSX.Element {
  const project = useProjectStore((s) => s.project)
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
  const active = files[Math.min(activeIdx, files.length - 1)]

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {}
      <div className="flex shrink-0 gap-1 overflow-x-auto border-b border-white/[0.04] px-2 py-1.5">
        {files.map((f, i) => (
          <button
            key={f.path}
            onClick={() => setActiveIdx(i)}
            className={cn(
              'whitespace-nowrap rounded px-2 py-1 font-mono text-2xs transition-colors',
              i === (activeIdx < files.length ? activeIdx : files.length - 1)
                ? 'bg-ink-750 text-gold-300'
                : 'text-mist-500 hover:bg-ink-800 hover:text-mist-300'
            )}
          >
            {f.path.split('/').pop()}
          </button>
        ))}
      </div>

      {active ? (
        <pre className="selectable min-h-0 flex-1 overflow-auto bg-ink-900/60 p-4 font-mono text-[11.5px] leading-[1.55]">
          <JavaCode source={active.content} />
        </pre>
      ) : (
        <div className="flex flex-1 items-center justify-center text-2xs text-mist-600">
          Nothing generated yet. Fill in the form.
        </div>
      )}
    </div>
  )
}

const TOKEN_RE = new RegExp(
  [
    '(\\/\\*[\\s\\S]*?\\*\\/|\\/\\/[^\\n]*)',
    '("(?:[^"\\\\]|\\\\.)*")',
    "('(?:[^'\\\\]|\\\\.)*')",
    '(@\\w+)',
    '\\b(package|import|public|private|protected|static|final|class|interface|extends|implements|new|return|void|if|else|for|while|int|float|double|boolean|true|false|null|this|super|override)\\b',
    '\\b(\\d+(?:\\.\\d+)?[fFdDlL]?|0x[0-9a-fA-F]+)\\b',
    '\\b([A-Z][A-Za-z0-9_]*)\\b'
  ].join('|'),
  'g'
)

const TOKEN_CLASS = [
  '',
  'text-mist-600 italic',
  'text-moss-400',
  'text-moss-400',
  'text-sky-400',
  'text-gold-400',
  'text-[#d0879b]',
  'text-sky-400/90'
]

function JavaCode({ source }: { source: string }): JSX.Element {
  const parts = useMemo(() => {
    const out: { text: string; cls: string }[] = []
    let last = 0
    for (const m of source.matchAll(TOKEN_RE)) {
      const idx = m.index ?? 0
      if (idx > last) out.push({ text: source.slice(last, idx), cls: '' })
      const groupIdx = m.slice(1).findIndex((g) => g !== undefined) + 1
      out.push({ text: m[0], cls: TOKEN_CLASS[groupIdx] ?? '' })
      last = idx + m[0].length
    }
    if (last < source.length) out.push({ text: source.slice(last), cls: '' })
    return out
  }, [source])

  return (
    <code className="text-mist-200">
      {parts.map((p, i) =>
        p.cls ? (
          <span key={i} className={p.cls}>
            {p.text}
          </span>
        ) : (
          p.text
        )
      )}
    </code>
  )
}
