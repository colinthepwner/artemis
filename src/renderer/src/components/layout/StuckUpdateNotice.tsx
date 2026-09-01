import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { AlertTriangle, Download } from 'lucide-react'
import { useAppStore } from '@/store/appStore'
import { useDismissOnKey } from '@/components/ui/dismissDistant'
import { useUpdateState } from '@/lib/useUpdateState'

const SEEN_PREFIX = 'artemis.stuck-update.seen.'

export function StuckUpdateNotice(): JSX.Element | null {
  const update = useUpdateState()
  const [dismissed, setDismissed] = useState(false)

  const setStartupNoticeOpen = useAppStore((s) => s.setStartupNoticeOpen)

  const bootPhase = useAppStore((s) => s.bootPhase)

  const version = update.version
  const stuck = update.status === 'available' && update.stuck === true && !!version

  useEffect(() => {
    if (!version) return
    try {
      setDismissed(localStorage.getItem(`${SEEN_PREFIX}${version}`) === '1')
    } catch {

      setDismissed(false)
    }
  }, [version])

  const open = stuck && !dismissed && bootPhase === 'ready'

  useEffect(() => {
    if (open) setStartupNoticeOpen(true)
  }, [open, setStartupNoticeOpen])

  const dismiss = (): void => {
    try {
      if (version) localStorage.setItem(`${SEEN_PREFIX}${version}`, '1')
    } catch {

    }
    setDismissed(true)
    setStartupNoticeOpen(false)
  }

  useDismissOnKey(open, dismiss)

  if (!open) return null

  const page = update.page

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center">
      <motion.div
        className="acrylic absolute inset-0"
        initial={{ opacity: 0, backdropFilter: 'blur(0px) saturate(1)' }}
        animate={{ opacity: 1, backdropFilter: 'blur(18px) saturate(1.3)' }}
        transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
        onClick={dismiss}
      />

      <motion.div

        initial={{ opacity: 0, scale: 0.82 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
        className="relative w-[min(92vw,460px)] overflow-hidden rounded-xl bg-ink-850 shadow-raised"
      >
        <div className="flex items-start gap-3 px-6 pt-6">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-ember-500/15">
            <AlertTriangle size={18} className="text-ember-400" strokeWidth={2} />
          </span>
          <div className="min-w-0">
            <h2 className="text-base font-semibold tracking-tight text-mist-50">
              That update didn&apos;t take
            </h2>
            <p className="mt-1 text-2xs text-mist-500">
              You&apos;re still on {window.artemis.app.version || 'this version'}, and{' '}
              {version} is out.
            </p>
          </div>
        </div>

        <div className="space-y-3 px-6 py-5">
          <p className="text-[13px] leading-relaxed text-mist-300">
            Artemis downloaded {version} and restarted, but came back on the old version. It has
            tried this one before, so it will not keep trying and filling your disk with copies of
            it.
          </p>
          <p className="text-[13px] leading-relaxed text-mist-400">
            Download it by hand to get the newest features and fixes. It keeps your projects and
            settings: put the new one where the old one was.
          </p>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-white/[0.04] px-6 py-4">
          <button
            onClick={dismiss}
            className="rounded-md px-3 py-2 text-[13px] text-mist-400 transition-colors hover:bg-ink-800 hover:text-mist-200"
          >
            Not now
          </button>
          {

}
          {page && (

            <a
              href={page}
              target="_blank"
              rel="noreferrer"
              onClick={dismiss}
              className="flex items-center gap-1.5 rounded-md bg-gold-500 px-3 py-2 text-[13px] font-medium text-ink-950 transition-colors hover:bg-gold-400"
            >
              <Download size={14} strokeWidth={2.2} /> Get {version}
            </a>
          )}
        </div>
      </motion.div>
    </div>
  )
}
