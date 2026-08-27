import { useEffect, useState, type CSSProperties } from 'react'
import { motion } from 'framer-motion'
import type { UpdateState } from '@shared/ipc'
import { useAppStore } from '@/store/appStore'
import logoUrl from '@/assets/logo.png'

const DRAG: CSSProperties = { WebkitAppRegion: 'drag' } as CSSProperties

export function BootScreen(): JSX.Element | null {
  const phase = useAppStore((s) => s.bootPhase)
  const setPhase = useAppStore((s) => s.setBootPhase)
  const [update, setUpdate] = useState<UpdateState>({ status: 'checking' })

  const [faded, setFaded] = useState(false)

  useEffect(() => {

    const boot = (window.artemis as Partial<typeof window.artemis>).boot
    if (!boot) {
      setPhase('ready')
      return
    }

    let heard = false
    void boot.phase().then((p) => {
      if (!heard) setPhase(p)
    })
    const offPhase = boot.onPhase((p) => {
      heard = true
      setPhase(p)
    })
    const offUpdate = window.artemis.update.onState(setUpdate)
    return () => {
      offPhase()
      offUpdate()
    }
  }, [setPhase])

  if (phase === 'ready' && faded) return null

  const line =
    update.status === 'downloading'
      ? `Downloading ${update.version ? `v${update.version}` : 'update'}`
      : update.status === 'installing'
        ? 'Restarting Artemis'
        : 'Checking for updates'
  const sub =
    update.status === 'downloading'
      ? `${update.percent ?? 0}%`
      : update.status === 'installing'
        ? 'back in a moment'
        : ' '

  return (
    <motion.div
      className="fixed inset-0 z-[110] flex flex-col items-center justify-center bg-ink-950"
      style={DRAG}

      animate={{ opacity: phase === 'ready' ? 0 : 1 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      onAnimationComplete={() => {
        if (phase === 'ready') setFaded(true)
      }}
    >
      {

}
      <motion.div
        className="relative flex flex-col items-center"
        animate={{ opacity: phase === 'boot' ? 1 : 0 }}
        transition={{ duration: 0.14, ease: 'easeOut' }}
      >
        {

}
        <motion.div
          className="pointer-events-none absolute h-[240px] w-[380px] rounded-full blur-3xl"
          style={{ background: 'radial-gradient(ellipse, rgba(230,173,85,0.16), rgba(230,173,85,0) 70%)' }}
          animate={{ opacity: [0.5, 0.85, 0.5], scale: [0.95, 1.05, 0.95] }}
          transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
        />

        {

}
        <motion.img
          src={logoUrl}
          alt=""
          draggable={false}
          className="relative h-20 w-auto select-none drop-shadow-[0_8px_24px_rgba(0,0,0,0.5)]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        />

        <div className="relative mt-5 text-[13px] font-medium tracking-tight text-mist-100">{line}</div>

        {
}
        <div className="relative mt-3 h-1.5 w-56 overflow-hidden rounded-full bg-ink-800 shadow-panel">
          {update.status === 'downloading' ? (
            <motion.div
              className="working-shine h-full rounded-full"
              animate={{ width: `${Math.max(3, Math.min(100, update.percent ?? 0))}%` }}
              transition={{ type: 'spring', stiffness: 140, damping: 26 }}
            />
          ) : (
            <div className="working-shine h-full w-full rounded-full" />
          )}
        </div>

        <div className="relative mt-2 h-4 font-mono text-2xs text-mist-600">{sub}</div>
      </motion.div>

      <motion.div
        className="absolute bottom-3 font-mono text-2xs text-mist-700"
        animate={{ opacity: phase === 'boot' ? 1 : 0 }}
        transition={{ duration: 0.14, ease: 'easeOut' }}
      >
        Artemis {window.artemis.app.version}
      </motion.div>
    </motion.div>
  )
}
