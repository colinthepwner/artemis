import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { ArrowUpCircle, ExternalLink, Save, X } from 'lucide-react'
import { useAppStore } from '@/store/appStore'
import { useProjectStore } from '@/store/projectStore'
import type { UpdateState } from '@shared/ipc'

export function UpdateBar(): JSX.Element | null {
  const [update, setUpdate] = useState<UpdateState>({ status: 'idle' })
  const [dismissed, setDismissed] = useState(false)
  const reduceAnimations = useAppStore((s) => s.reduceAnimations)
  const bootPhase = useAppStore((s) => s.bootPhase)
  const hasProject = useProjectStore((s) => s.project !== null)
  const dirty = useProjectStore((s) => s.dirty)
  const saveProject = useProjectStore((s) => s.saveProject)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const listen = window.artemis.update.onState

    if (typeof listen !== 'function') return
    return listen(setUpdate)
  }, [])

  const install = (): void => window.artemis.update.install()

  const saveThenInstall = async (): Promise<void> => {
    setSaving(true)
    try {
      await saveProject()
    } catch {

      setSaving(false)
      return
    }
    install()
  }

  if (bootPhase !== 'ready') return null

  const busy = update.status === 'downloading' || update.status === 'installing'
  if (!busy && (update.status !== 'available' || dismissed)) return null

  return (
    <motion.div
      initial={reduceAnimations ? false : { height: 0, opacity: 0 }}
      animate={{ height: 'auto', opacity: 1 }}
      transition={{ duration: reduceAnimations ? 0 : 0.22, ease: [0.22, 1, 0.36, 1] }}
      className="shrink-0 overflow-hidden border-b border-gold-500/20 bg-gold-500/[0.07]"
    >
      <div className="flex h-9 items-center gap-2.5 px-4">
        <ArrowUpCircle size={14} className="shrink-0 text-gold-400" strokeWidth={2} />

        {busy ? (
          <>
            <span className="text-2xs text-mist-300">
              {update.status === 'installing'
                ? `Installing ${update.version ? `v${update.version}` : 'the update'}, the app will restart`
                : `Downloading ${update.version ? `v${update.version}` : 'the update'}`}
            </span>
            {update.status === 'downloading' && (
              <>
                {}
                <div className="h-1 w-40 overflow-hidden rounded-full bg-ink-900">
                  <div
                    className="h-full rounded-full bg-gold-500 transition-[width] duration-200"
                    style={{ width: `${update.percent ?? 0}%` }}
                  />
                </div>
                <span className="font-mono text-2xs text-mist-500">{update.percent ?? 0}%</span>
              </>
            )}
          </>
        ) : (
          <>
            <span className="text-2xs text-mist-200">
              Artemis {update.version ? `v${update.version}` : 'update'} is out.
            </span>
            <span className="text-2xs text-mist-500">
              {update.selfInstall === false
                ? 'This build is managed outside Artemis.'
                : dirty
                  ? 'You have unsaved changes.'
                  : 'Updating restarts the app.'}
            </span>

            <div className="flex-1" />

            {

}
            {update.selfInstall === false ? (
              <a
                href={update.page}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1.5 rounded-md bg-gold-500 px-2.5 py-1 text-2xs font-medium text-ink-950 transition-all hover:bg-gold-400 active:scale-[0.98]"
              >
                <ExternalLink size={11} strokeWidth={2.4} /> Get it
              </a>
            ) : (
              <>
            {

}
            {hasProject && (
              <button
                onClick={() => void saveThenInstall()}
                disabled={saving}
                className="flex items-center gap-1.5 rounded-md bg-gold-500 px-2.5 py-1 text-2xs font-medium text-ink-950 transition-all hover:bg-gold-400 active:scale-[0.98] disabled:opacity-50"
              >
                <Save size={11} strokeWidth={2.4} /> {saving ? 'Saving…' : 'Save and update'}
              </button>
            )}
            <button
              onClick={install}
              className="rounded-md bg-ink-750 px-2.5 py-1 text-2xs text-mist-200 transition-colors hover:bg-ink-700"
            >
              {hasProject ? 'Update without saving' : 'Update now'}
            </button>
              </>
            )}
            <button
              onClick={() => setDismissed(true)}
              title="Not now"
              aria-label="Not now"
              className="rounded p-1 text-mist-500 transition-colors hover:bg-ink-750 hover:text-mist-200"
            >
              <X size={12} />
            </button>
          </>
        )}
      </div>
    </motion.div>
  )
}
