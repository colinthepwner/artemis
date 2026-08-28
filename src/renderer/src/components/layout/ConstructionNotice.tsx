import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { HardHat, MessageSquare } from 'lucide-react'
import { useAppStore } from '@/store/appStore'

const SEEN_KEY = 'artemis.construction-notice.seen'

const TAPE =
  'repeating-linear-gradient(45deg, #e6ad55 0 14px, #07090c 14px 28px)'

export function ConstructionNotice(): JSX.Element | null {
  const [open, setOpen] = useState(false)

  const setStartupNoticeOpen = useAppStore((s) => s.setStartupNoticeOpen)

  const bootPhase = useAppStore((s) => s.bootPhase)

  useEffect(() => {

    if (window.artemis.app.skipOnboarding) {
      setOpen(false)
      setStartupNoticeOpen(false)
      return
    }

    if (import.meta.env.DEV) {
      setOpen(true)
      setStartupNoticeOpen(true)
      return
    }
    let showing = false
    try {
      showing = !localStorage.getItem(SEEN_KEY)
    } catch {

    }
    setOpen(showing)

    setStartupNoticeOpen(showing)
  }, [setStartupNoticeOpen])

  const dismiss = (): void => {
    try {
      localStorage.setItem(SEEN_KEY, '1')
    } catch {

    }
    setOpen(false)
    setStartupNoticeOpen(false)
  }

  useEffect(() => {

    if (!open || bootPhase !== 'ready') return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' || e.key === 'Enter') dismiss()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)

  }, [open, bootPhase])

  if (window.artemis.app.skipOnboarding) return null
  if (!open || bootPhase !== 'ready') return null

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center">
      {

}
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
        transition={{ duration: 0.3, delay: 0.04, ease: [0.22, 1, 0.36, 1] }}
        className="relative w-[460px] overflow-hidden rounded-xl bg-ink-850 shadow-raised"
      >
        <div className="h-2.5 w-full" style={{ backgroundImage: TAPE }} />

        <div className="p-6 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-gold-500/10">
            <HardHat size={22} className="text-gold-400" strokeWidth={1.75} />
          </div>

          <h2 className="text-base font-semibold tracking-tight text-mist-50">
            Artemis is under construction
          </h2>

          <p className="mx-auto mt-2.5 max-w-sm text-[13px] leading-relaxed text-mist-400">
            This is an early build. Things will be rough around the edges, features will move, and
            you should keep backups of anything you care about.
          </p>

          <div className="mt-4 flex items-start gap-2.5 rounded-lg bg-ink-800 p-3.5 text-left shadow-panel">
            <MessageSquare size={14} className="mt-px shrink-0 text-gold-400" />
            <p className="text-2xs leading-relaxed text-mist-400">
              Found a bug or something confusing? Report it to{' '}
              <span className="font-medium text-gold-300">@colinthepwner</span>. Say what you were
              doing and what happened, and it gets fixed a lot faster.
            </p>
          </div>

          <button
            onClick={dismiss}
            autoFocus
            className="mt-5 w-full rounded-md bg-gold-500 py-2.5 text-[13px] font-medium text-ink-950 transition-all hover:bg-gold-400 active:scale-[0.99]"
          >
            Got it
          </button>
        </div>

        <div className="h-2.5 w-full" style={{ backgroundImage: TAPE }} />
      </motion.div>
    </div>
  )
}
