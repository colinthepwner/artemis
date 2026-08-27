import { useCallback, useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { motion } from 'framer-motion'
import { AlertTriangle, Check, Coffee, Download, FolderSearch, RefreshCw, Search, X } from 'lucide-react'
import type { JdkCandidate, PermissionIssue, SetupStatus } from '@shared/ipc'
import { useAppStore } from '@/store/appStore'
import logoUrl from '@/assets/logo.png'

const DRAG: CSSProperties = { WebkitAppRegion: 'drag' } as CSSProperties
const NO_DRAG: CSSProperties = { WebkitAppRegion: 'no-drag' } as CSSProperties

export function SetupScreen(): JSX.Element | null {
  const bootPhase = useAppStore((s) => s.bootPhase)
  const [status, setStatus] = useState<SetupStatus | null>(null)
  const [dismissed, setDismissed] = useState(false)

  const isDev = window.artemis.app.isDev
  const skip = window.artemis.app.skipOnboarding

  const refresh = useCallback(async (): Promise<SetupStatus> => {
    const next = await window.artemis.setup.status()
    setStatus(next)
    return next
  }, [])

  useEffect(() => {

    if (skip || bootPhase !== 'ready') return
    void refresh()
  }, [skip, bootPhase, refresh])

  if (skip || dismissed || !status) return null

  const issue = status.permissions[0] ?? null
  const needsJdk = !issue && status.jdk === null
  if (!issue && !needsJdk) return null

  return (
    <motion.div
      className="fixed inset-0 z-[120] flex flex-col items-center justify-center bg-ink-950"
      style={DRAG}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
    >
      {}
      <motion.div
        className="pointer-events-none absolute h-[340px] w-[520px] rounded-full blur-3xl"
        style={{
          background: 'radial-gradient(ellipse, rgba(230,173,85,0.13), rgba(230,173,85,0) 70%)'
        }}
        animate={{ opacity: [0.45, 0.8, 0.45], scale: [0.96, 1.04, 0.96] }}
        transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
      />

      {

}
      {isDev && (
        <button
          style={NO_DRAG}
          onClick={() => setDismissed(true)}
          aria-label="Skip setup (development builds only)"
          title="Skip setup. Development builds only."
          className="absolute right-4 top-4 flex items-center gap-1.5 rounded-md border border-white/10 px-2.5 py-1 text-2xs text-mist-400 transition-colors hover:bg-ink-800 hover:text-mist-100"
        >
          <X size={12} strokeWidth={2.4} /> dev: skip
        </button>
      )}

      <div className="relative flex w-[520px] max-w-[86vw] flex-col items-center" style={NO_DRAG}>
        <img
          src={logoUrl}
          alt=""
          draggable={false}
          className="h-14 w-auto select-none drop-shadow-[0_8px_24px_rgba(0,0,0,0.5)]"
        />
        {issue ? (
          <PermissionStep issue={issue} onRecheck={refresh} />
        ) : (
          <JdkStep minJava={status.minJava} onDone={refresh} />
        )}
      </div>
    </motion.div>
  )
}

function StepFrame(props: { title: string; blurb: string; children: ReactNode }): JSX.Element {
  return (
    <>
      <h1 className="mt-5 text-center text-[15px] font-medium tracking-tight text-mist-50">
        {props.title}
      </h1>
      <p className="mt-2 max-w-[440px] text-center text-2xs leading-relaxed text-mist-400">
        {props.blurb}
      </p>
      <div className="mt-5 w-full">{props.children}</div>
    </>
  )
}

function Action(props: {
  icon: ReactNode
  label: string
  hint?: string
  primary?: boolean
  busy?: boolean
  onClick: () => void
}): JSX.Element {
  return (
    <button
      onClick={props.onClick}
      disabled={props.busy}
      className={
        'flex w-full items-center gap-3 rounded-lg px-3.5 py-2.5 text-left transition-colors disabled:opacity-60 ' +
        (props.primary
          ? 'bg-gold-500 text-ink-950 hover:bg-gold-400'
          : 'border border-white/10 text-mist-200 hover:bg-ink-800')
      }
    >
      <span className={props.primary ? 'text-ink-950' : 'text-mist-400'}>{props.icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-medium">{props.label}</span>
        {props.hint && (
          <span
            className={
              'mt-0.5 block text-2xs ' + (props.primary ? 'text-ink-950/70' : 'text-mist-500')
            }
          >
            {props.hint}
          </span>
        )}
      </span>
    </button>
  )
}

function PermissionStep(props: {
  issue: PermissionIssue
  onRecheck: () => Promise<SetupStatus>
}): JSX.Element {
  const [checking, setChecking] = useState(false)
  const [stillThere, setStillThere] = useState(false)

  const recheck = async (): Promise<void> => {
    setChecking(true)
    setStillThere(false)
    const next = await props.onRecheck()
    setChecking(false)

    if (next.permissions.some((p) => p.id === props.issue.id)) setStillThere(true)
  }

  return (
    <StepFrame title={props.issue.title} blurb={props.issue.detail}>
      <ol className="mb-4 space-y-1.5 rounded-lg border border-white/[0.07] bg-ink-900/60 p-3.5">
        {props.issue.steps.map((step, i) => (
          <li key={i} className="flex gap-2.5 text-2xs leading-relaxed text-mist-300">
            <span className="mt-px w-4 shrink-0 text-right font-mono text-mist-600">{i + 1}</span>
            <span className="min-w-0">{step}</span>
          </li>
        ))}
      </ol>

      <div className="space-y-2">
        <Action
          primary
          icon={<AlertTriangle size={15} strokeWidth={2.2} />}
          label={props.issue.canOpenSettings ? 'Open privacy settings' : 'Show me the folder'}
          hint={props.issue.path}
          onClick={() => window.artemis.setup.openSettings(props.issue)}
        />
        <Action
          icon={<RefreshCw size={15} strokeWidth={2.2} className={checking ? 'animate-spin' : ''} />}
          label={checking ? 'Checking…' : 'Check again'}
          hint={stillThere ? 'Still blocked. The change may need Artemis restarted.' : undefined}
          busy={checking}
          onClick={() => void recheck()}
        />
      </div>

      {
}
      <p className="mt-3 text-center font-mono text-[10px] text-mist-600">{props.issue.reason}</p>
    </StepFrame>
  )
}

function JdkStep(props: { minJava: number; onDone: () => Promise<SetupStatus> }): JSX.Element {
  const [found, setFound] = useState<JdkCandidate[] | null>(null)
  const [scanning, setScanning] = useState(false)
  const [installing, setInstalling] = useState(false)
  const [percent, setPercent] = useState(0)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => window.artemis.setup.onInstallProgress(setPercent), [])

  useEffect(() => {
    let live = true
    setScanning(true)
    void window.artemis.setup.scanJdks().then((list) => {
      if (!live) return
      setFound(list)
      setScanning(false)
    })
    return () => {
      live = false
    }
  }, [])

  const use = async (home: string): Promise<void> => {
    setError(null)
    const c = await window.artemis.setup.chooseJdk(home)
    if (!c) {
      setError('That one could not be used after all. It may have just been removed.')
      return
    }
    await props.onDone()
  }

  const pick = async (): Promise<void> => {
    setError(null)
    const r = await window.artemis.setup.pickJdk()
    if (r.error) setError(r.error)
    if (r.ok) await props.onDone()
  }

  const install = async (): Promise<void> => {
    setError(null)
    setInstalling(true)
    setPercent(0)
    const r = await window.artemis.setup.installJdk()
    setInstalling(false)
    if (r.error) setError(r.error)
    if (r.ok) await props.onDone()
  }

  return (
    <StepFrame
      title="Artemis needs Java to build your mod"
      blurb={`Gradle does the building and Gradle is itself a Java program, so one has to be on this machine before anything can be compiled. Java ${props.minJava} or newer. Artemis will remember whichever you choose.`}
    >
      {found && found.length > 0 && (
        <div className="mb-3 space-y-2">
          <p className="text-2xs text-mist-500">
            {found.length === 1 ? 'Found one already installed' : `Found ${found.length} already installed`}
          </p>
          {found.map((c) => (
            <Action
              key={c.home}
              primary={c === found[0]}
              icon={<Check size={15} strokeWidth={2.4} />}
              label={`Use Java ${c.version}`}
              hint={`${c.source} · ${c.home}`}
              onClick={() => void use(c.home)}
            />
          ))}
        </div>
      )}

      <div className="space-y-2">
        {

}
        {found !== null && found.length === 0 && (
          <Action
            primary
            icon={<Download size={15} strokeWidth={2.2} />}
            label={installing ? `Installing Java… ${percent}%` : 'Install Java for me'}
            hint={installing ? 'About 180 MB, one time' : 'Downloads Eclipse Temurin 21 from Adoptium'}
            busy={installing}
            onClick={() => void install()}
          />
        )}
        <Action
          icon={<FolderSearch size={15} strokeWidth={2.2} />}
          label="Choose a folder"
          hint="If you already manage your own JDKs"
          busy={installing}
          onClick={() => void pick()}
        />
        <Action
          icon={<Search size={15} strokeWidth={2.2} className={scanning ? 'animate-pulse' : ''} />}
          label={scanning ? 'Looking…' : 'Look again'}
          hint="Checks the usual places, plus SDKMAN, asdf and Homebrew"
          busy={scanning || installing}
          onClick={() => {
            setScanning(true)
            void window.artemis.setup.scanJdks().then((list) => {
              setFound(list)
              setScanning(false)
            })
          }}
        />
        {found !== null && found.length > 0 && (
          <Action
            icon={<Download size={15} strokeWidth={2.2} />}
            label={installing ? `Installing Java… ${percent}%` : 'Install a fresh one instead'}
            busy={installing}
            onClick={() => void install()}
          />
        )}
      </div>

      {installing && (
        <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-ink-800">
          <motion.div
            className="working-shine h-full rounded-full"
            animate={{ width: `${Math.max(3, percent)}%` }}
            transition={{ type: 'spring', stiffness: 140, damping: 26 }}
          />
        </div>
      )}

      {error && (
        <p className="mt-3 flex items-start gap-2 text-2xs leading-relaxed text-ember-400">
          <Coffee size={13} strokeWidth={2.2} className="mt-px shrink-0" />
          <span>{error}</span>
        </p>
      )}
    </StepFrame>
  )
}
