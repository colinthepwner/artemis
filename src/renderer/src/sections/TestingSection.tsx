import { useEffect, useRef, useState } from 'react'
import { Play, Square, Skull, FolderOpen, Trash2, Loader2, CircleDot, Copy, Check } from 'lucide-react'
import { useProjectStore } from '@/store/projectStore'
import { useAppStore } from '@/store/appStore'
import { useTestStore } from '@/store/testStore'
import { useAttention } from '@/components/ui/attention'
import { UnfinishedList, useUnfinished } from '@/components/ui/Unfinished'
import { autoFixProject } from '@shared/readiness'
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

  const unfinished = useUnfinished()
  const { attention, callAttention } = useAttention()
  const [showUnfinished, setShowUnfinished] = useState(false)

  const attempt = (): void => {
    if (unfinished.length > 0) {
      setShowUnfinished(true)
      callAttention()
      return
    }
    setShowUnfinished(false)
    void start()
  }

  const start = async (): Promise<void> => {
    if (!project || running) return
    clear()
    const clone = JSON.parse(JSON.stringify(project))
    autoFixProject(clone)
    const res = await window.artemis.test.start(JSON.stringify(clone), {
      bundleTestMods: useAppStore.getState().bundleTestMods
    })
    if (!res.ok && res.error) useTestStore.getState().appendLine(`✗ ${res.error}`)
  }

  const [killable, setKillable] = useState(false)
  const escalation = useRef<number>()

  const stop = (): void => {
    window.artemis.test.stop()
    window.clearTimeout(escalation.current)
    escalation.current = window.setTimeout(() => setKillable(true), 1000)
  }

  const kill = (): void => {
    if (project) window.artemis.test.kill(project.meta.modId)
  }

  useEffect(() => {
    if (running) return
    window.clearTimeout(escalation.current)
    setKillable(false)
  }, [running])

  useEffect(() => () => window.clearTimeout(escalation.current), [])

  const [busyBurst, setBusyBurst] = useState(false)
  const lastBurst = useRef({ count: 0, at: 0 })
  useEffect(() => {
    const now = performance.now()
    const previous = lastBurst.current
    lastBurst.current = { count: lines.length, at: now }
    const arrived = lines.length - previous.count
    if (arrived < 6 || now - previous.at > 700) return
    setBusyBurst(true)
    const settle = window.setTimeout(() => setBusyBurst(false), 900)
    return () => window.clearTimeout(settle)
  }, [lines.length])

  const working = running || busyBurst

  const takeTestRunRequest = useAppStore((s) => s.takeTestRunRequest)
  const requested = useAppStore((s) => s.testRunRequested)
  useEffect(() => {
    if (requested && takeTestRunRequest()) attempt()

  }, [requested])

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
            data-tour="test-run"
            onClick={attempt}
            disabled={!project}
            className={cn(
              'flex items-center gap-1.5 rounded-md bg-moss-500 px-3 py-1.5 text-2xs font-semibold uppercase tracking-wide text-ink-950 transition-all',
              project ? 'hover:bg-moss-400 active:scale-[0.97]' : 'cursor-not-allowed opacity-40',
              attention && 'jiggle'
            )}
          >
            <Play size={13} strokeWidth={2.5} /> Run Client
          </button>
        ) : (
          <button
            onClick={killable ? kill : stop}
            title={
              killable
                ? 'The client is still up. This kills the game process itself.'
                : undefined
            }
            className={cn(
              'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-2xs font-semibold uppercase tracking-wide text-white transition-all active:scale-[0.97]',
              killable
                ? 'bg-ember-500 shadow-glow-ember hover:bg-ember-400'
                : 'bg-ember-600 hover:bg-ember-500'
            )}
          >
            {killable ? (
              <>
                <Skull size={13} strokeWidth={2.5} /> Kill Client
              </>
            ) : (
              <>
                <Square size={12} strokeWidth={2.5} /> Stop
              </>
            )}
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
        <CopyLogButton lines={lines} />
        <button
          onClick={clear}
          disabled={running || lines.length === 0}
          title="Clear log"
          className="rounded-md p-1.5 text-mist-500 transition-colors hover:bg-ink-750 hover:text-mist-200 disabled:opacity-40"
        >
          <Trash2 size={15} />
        </button>
      </div>

      {showUnfinished && unfinished.length > 0 && (
        <div className="shrink-0 px-4 pt-4">
          <UnfinishedList
            items={unfinished}
            proceed={{
              label: 'Run anyway — unfinished content ships as-is',
              onClick: () => {
                setShowUnfinished(false)
                void start()
              }
            }}
          />
        </div>
      )}

      <div className="min-h-0 flex-1 px-4 pb-0 pt-4">
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

      {

}
      <div
        className="shrink-0 overflow-hidden px-4 transition-[height,opacity] duration-300 ease-swift"
        style={{ height: working ? 22 : 0, opacity: working ? 1 : 0 }}
        aria-hidden={!working}
      >
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-ink-950 shadow-panel">
          <div className="working-shine h-full w-full" />
        </div>
      </div>
    </div>
  )
}

export function CopyLogButton({ lines }: { lines: string[] }): JSX.Element {
  const [copied, setCopied] = useState(false)

  const copy = (): void => {
    void navigator.clipboard.writeText(lines.join('\n')).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1400)
    })
  }

  return (
    <button
      onClick={copy}
      disabled={lines.length === 0}
      title="Copy the whole log"
      className={cn(
        'flex items-center gap-1.5 rounded-md px-2 py-1.5 text-2xs transition-colors disabled:opacity-40',
        copied ? 'text-moss-400' : 'text-mist-500 hover:bg-ink-750 hover:text-mist-200'
      )}
    >
      {copied ? <Check size={14} /> : <Copy size={14} />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  )
}

function lineTone(line: string): string {
  if (/(error|exception|failed|caused by)/i.test(line)) return 'text-ember-400'
  if (/(warn|deprecated)/i.test(line)) return 'text-gold-300/80'
  if (/(build successful|loaded .* mods|started up in)/i.test(line)) return 'text-moss-400'
  if (/^─+$/.test(line)) return 'text-ink-600'
  return ''
}
