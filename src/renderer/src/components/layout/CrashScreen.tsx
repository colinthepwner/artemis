import { Component, useEffect, useState, type ReactNode } from 'react'
import { AlertTriangle, Copy, Check, RotateCcw } from 'lucide-react'

interface CrashInfo {
  message: string
  stack: string

  source: string
}

function buildReport(crash: CrashInfo): string {
  return [
    `Artemis crash report`,
    `Version: ${window.artemis?.app?.version ?? 'unknown'}`,
    `When: ${new Date().toISOString()}`,
    `Caught by: ${crash.source}`,
    ``,
    crash.message,
    ``,
    crash.stack
  ].join('\n')
}

function toCrash(value: unknown, source: string): CrashInfo {
  if (value instanceof Error) {
    return { message: value.message || String(value), stack: value.stack ?? '', source }
  }
  return { message: String(value), stack: '', source }
}

export function CrashScreen(props: { crash: CrashInfo; onDismiss?: () => void }): JSX.Element {
  const { crash } = props
  const [copied, setCopied] = useState(false)

  const copy = (): void => {
    void navigator.clipboard.writeText(buildReport(crash)).then(() => {
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    })
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-ink-950/80">
      <div className="flex max-h-[80vh] w-[640px] flex-col overflow-hidden rounded-xl bg-ink-850 shadow-raised">
        <div className="flex items-center gap-2.5 border-b border-white/[0.04] px-5 py-4">
          <AlertTriangle size={16} className="shrink-0 text-ember-400" />
          <div className="min-w-0 flex-1">
            <h2 className="text-[15px] font-semibold tracking-tight text-mist-50">
              Artemis hit a problem
            </h2>
            <p className="mt-0.5 text-2xs text-mist-500">
              Your project is safe: edits are saved to the project file, not to this window.
            </p>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <p className="break-words font-mono text-xs leading-relaxed text-ember-300">
            {crash.message}
          </p>
          {crash.stack && (
            <pre className="mt-3 overflow-x-auto rounded-md bg-ink-950/60 p-3 font-mono text-[11px] leading-relaxed text-mist-500">
              {crash.stack}
            </pre>
          )}
        </div>

        <div className="flex items-center gap-2 border-t border-white/[0.04] px-5 py-3">
          <button
            onClick={copy}
            className="flex shrink-0 items-center gap-1.5 rounded-md bg-gold-500 px-3 py-1.5 text-2xs font-semibold uppercase tracking-wide text-ink-950 transition-all hover:bg-gold-400 active:scale-[0.97]"
          >
            {copied ? <Check size={12} /> : <Copy size={12} />}
            {copied ? 'Copied' : 'Copy details'}
          </button>
          <div className="flex-1" />
          {props.onDismiss && (
            <button
              onClick={props.onDismiss}
              className="shrink-0 rounded-md bg-ink-750 px-3 py-1.5 text-2xs font-semibold uppercase tracking-wide text-mist-300 transition-colors hover:bg-ink-700"
            >
              Dismiss
            </button>
          )}
          <button
            onClick={() => window.artemis.window.relaunch()}
            className="flex shrink-0 items-center gap-1.5 rounded-md bg-ink-750 px-3 py-1.5 text-2xs font-semibold uppercase tracking-wide text-mist-300 transition-colors hover:bg-ink-700"
          >
            <RotateCcw size={12} /> Restart
          </button>
        </div>
      </div>
    </div>
  )
}

export function AsyncCrashOverlay(): JSX.Element | null {
  const [crash, setCrash] = useState<CrashInfo | null>(null)

  useEffect(() => {
    const onError = (e: ErrorEvent): void => {
      setCrash(toCrash(e.error ?? e.message, 'window error'))
    }
    const onRejection = (e: PromiseRejectionEvent): void => {
      setCrash(toCrash(e.reason, 'unhandled promise rejection'))
    }
    window.addEventListener('error', onError)
    window.addEventListener('unhandledrejection', onRejection)
    return () => {
      window.removeEventListener('error', onError)
      window.removeEventListener('unhandledrejection', onRejection)
    }
  }, [])

  useEffect(() => {
    const hot = import.meta.hot
    if (!hot) return
    const onBuildError = (payload: {
      err?: { message?: string; stack?: string; frame?: string }
    }): void => {
      const err = payload?.err
      if (!err) return

      setCrash({
        message: [err.message, err.frame].filter(Boolean).join('\n\n'),
        stack: err.stack ?? '',
        source: 'build error'
      })
    }

    const onUpdated = (): void => setCrash(null)
    hot.on('vite:error', onBuildError)
    hot.on('vite:afterUpdate', onUpdated)
    return () => {
      hot.off?.('vite:error', onBuildError)
      hot.off?.('vite:afterUpdate', onUpdated)
    }
  }, [])

  if (!crash) return null
  return <CrashScreen crash={crash} onDismiss={() => setCrash(null)} />
}

interface BoundaryState {
  crash: CrashInfo | null
}

export class CrashBoundary extends Component<{ children: ReactNode }, BoundaryState> {
  state: BoundaryState = { crash: null }

  static getDerivedStateFromError(error: unknown): BoundaryState {
    return { crash: toCrash(error, 'render') }
  }

  render(): ReactNode {
    if (this.state.crash) return <CrashScreen crash={this.state.crash} />
    return this.props.children
  }
}
