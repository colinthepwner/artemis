import { useEffect, useRef } from 'react'
import { Play, Square, FolderOpen, Trash2, Loader2, CircleDot } from 'lucide-react'
import { useProjectStore } from '@/store/projectStore'
import { useTestStore } from '@/store/testStore'
import { cn } from '@/lib/cn'
import type { TestPhase } from '@shared/ipc'

const PHASE_LABEL: Record<TestPhase, string> = {
  idle: 'Idle',
  exporting: 'Exporting workspace',
  building: 'Building & downloading',
  running: 'Game running',
  stopped: 'Stopped',
  error: 'Error'
}

const PHASE_TONE: Record<TestPhase, string> = {
  idle: 'text-mist-500',
  exporting: 'text-sky-400',
  building: 'text-gold-400',
  running: 'text-moss-400',
  stopped: 'text-mist-400',
  error: 'text-ember-400'
}

export function TestingSection(): JSX.Element {
  const project = useProjectStore((s) => s.project)
  const { phase, running, lines, exitCode } = useTestStore()
  const clear = useTestStore((s) => s.clear)
  const logRef = useRef<HTMLDivElement>(null)
  const stickToBottom = useRef(true)

  useEffect(() => {
    const el = logRef.current
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight
  }, [lines])

  const onScroll = (): void => {
    const el = logRef.current
    if (!el) return
    stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40
  }

  const start = async (): Promise<void> => {
    if (!project || running) return
    clear()
    const res = await window.artemis.test.start(JSON.stringify(project))
    if (!res.ok && res.error) useTestStore.getState().appendLine(`✗ ${res.error}`)
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-12 shrink-0 items-center gap-3 border-b border-white/[0.04] px-5">
        <h2 className="text-sm font-semibold tracking-tight">Test</h2>
        <div className="flex items-center gap-1.5">
          <CircleDot size={11} className={cn(PHASE_TONE[phase], phase === 'running' && 'animate-pulse')} />
          <span className={cn('text-2xs', PHASE_TONE[phase])}>{PHASE_LABEL[phase]}</span>
          {exitCode !== null && phase !== 'running' && (
            <span className="font-mono text-2xs text-mist-600">exit {exitCode}</span>
          )}
        </div>
        <div className="flex-1" />

        {!running ? (
          <button
            onClick={() => void start()}
            disabled={!project}
            className={cn(
              'flex items-center gap-1.5 rounded-md bg-moss-500 px-3 py-1.5 text-2xs font-semibold uppercase tracking-wide text-ink-950 transition-all',
              project ? 'hover:bg-moss-400 active:scale-[0.97]' : 'cursor-not-allowed opacity-40'
            )}
          >
            <Play size={13} strokeWidth={2.5} /> Run Client
          </button>
        ) : (
          <button
            onClick={() => window.artemis.test.stop()}
            className="flex items-center gap-1.5 rounded-md bg-ember-500 px-3 py-1.5 text-2xs font-semibold uppercase tracking-wide text-white transition-all hover:bg-ember-400 active:scale-[0.97]"
          >
            <Square size={12} strokeWidth={2.5} /> Stop
          </button>
        )}
        <button
          onClick={() => project && window.artemis.test.openWorkspace(project.meta.modId)}
          disabled={!project}
          title="Open the test workspace folder"
          className="rounded-md p-1.5 text-mist-500 transition-colors hover:bg-ink-750 hover:text-mist-200 disabled:opacity-40"
        >
          <FolderOpen size={15} />
        </button>
        <button
          onClick={clear}
          disabled={running || lines.length === 0}
          title="Clear log"
          className="rounded-md p-1.5 text-mist-500 transition-colors hover:bg-ink-750 hover:text-mist-200 disabled:opacity-40"
        >
          <Trash2 size={15} />
        </button>
      </div>

      <div className="min-h-0 flex-1 p-4">
        {lines.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-ink-800 shadow-panel">
              {running ? (
                <Loader2 size={20} className="animate-spin text-gold-400" />
              ) : (
                <Play size={18} className="text-mist-600" strokeWidth={1.5} />
              )}
            </div>
            <p className="max-w-md text-[13px] leading-relaxed text-mist-500">
              Launch BTA with your mod loaded to test it live. Artemis exports a workspace and runs{' '}
              <span className="font-mono text-mist-400">gradle runClient</span>. The build and game
              log stream here.
            </p>
            <p className="max-w-md text-2xs leading-relaxed text-mist-600">
              Requires a JDK 17. Gradle is downloaded automatically the first time. That first run
              also pulls Minecraft and dependencies, so it can take several minutes.
            </p>
          </div>
        ) : (
          <div
            ref={logRef}
            onScroll={onScroll}
            className="selectable h-full overflow-auto rounded-lg bg-ink-950 p-4 font-mono text-[11.5px] leading-[1.5] text-mist-400 shadow-panel"
          >
            {lines.map((line, i) => (
              <div key={i} className={cn('whitespace-pre-wrap break-all', lineTone(line))}>
                {line}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function lineTone(line: string): string {
  if (/(error|exception|failed|caused by)/i.test(line)) return 'text-ember-400'
  if (/(warn|deprecated)/i.test(line)) return 'text-gold-300/80'
  if (/(build successful|loaded .* mods|started up in)/i.test(line)) return 'text-moss-400'
  if (/^─+$/.test(line)) return 'text-ink-600'
  return ''
}
