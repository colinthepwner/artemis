import { useMemo } from 'react'
import { ArrowRight, CircleAlert } from 'lucide-react'
import { useAppStore } from '@/store/appStore'
import { useProjectStore } from '@/store/projectStore'
import { unfinishedIn, type Unfinished } from '@shared/readiness'
import { ContentThumb } from '@/components/ui/ContentThumb'

export function useUnfinished(): Unfinished[] {
  const project = useProjectStore((s) => s.project)
  return useMemo(() => (project ? unfinishedIn(project) : []), [project])
}

export function UnfinishedList(props: {
  items: Unfinished[]

  proceed?: { label: string; onClick: () => void }
}): JSX.Element {
  const navigate = useAppStore((s) => s.navigate)
  const openEditor = useAppStore((s) => s.openEditor)
  const openCreateMenu = useAppStore((s) => s.openCreateMenu)
  const elements = useProjectStore((s) => s.project?.elements)

  const open = (item: Unfinished): void => {

    if (!item.elementId || !item.elementKind) {
      openCreateMenu()
      return
    }
    navigate(item.elementKind)
    openEditor(item.elementId)
  }

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center gap-2 border-b border-white/[0.04] px-4 py-2.5">
        <CircleAlert size={13} className="text-ember-400" />
        <span className="text-2xs font-semibold uppercase tracking-wider text-mist-300">
          {props.items.length} thing{props.items.length === 1 ? '' : 's'} left to finish
        </span>
      </div>
      <div className="max-h-64 overflow-y-auto p-1.5">
        {props.items.map((item, i) => {
          const element = elements?.find((e) => e.id === item.elementId)
          return (
            <button
              key={`${item.elementId}-${i}`}
              onClick={() => open(item)}
              className="group flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-left transition-colors hover:bg-ink-750"
            >
              {element && <ContentThumb element={element} size={20} />}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] text-mist-100">
                  {item.title} {item.label}
                </span>
                {item.detail && (
                  <span className="mt-0.5 block truncate font-mono text-2xs text-mist-600">
                    {item.detail}
                  </span>
                )}
              </span>
              <ArrowRight
                size={13}
                className="shrink-0 text-mist-600 transition-colors group-hover:text-gold-400"
              />
            </button>
          )
        })}
      </div>
      {props.proceed && (
        <div className="flex items-center justify-end border-t border-white/[0.04] px-4 py-2">
          <button
            onClick={props.proceed.onClick}
            className="rounded-md px-2.5 py-1 text-2xs text-mist-500 transition-colors hover:bg-ink-750 hover:text-mist-300"
          >
            {props.proceed.label}
          </button>
        </div>
      )}
    </div>
  )
}
