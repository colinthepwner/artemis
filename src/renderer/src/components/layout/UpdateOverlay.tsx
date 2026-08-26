import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import type { UpdateState } from '@shared/ipc'
import logoUrl from '@/assets/logo.png'

export function UpdateOverlay(): JSX.Element | null {
  const [state, setState] = useState<UpdateState>({ status: 'idle' })

  useEffect(() => window.artemis.update.onState(setState), [])

  if (state.status !== 'downloading' && state.status !== 'installing') return null

  const installing = state.status === 'installing'
  const percent = installing ? 100 : (state.percent ?? 0)

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-ink-950">
      {
}
      <motion.div
        className="pointer-events-none absolute h-[420px] w-[420px] rounded-full blur-3xl"
        style={{ background: 'radial-gradient(circle, rgba(230,173,85,0.16), rgba(230,173,85,0) 70%)' }}
        animate={{ opacity: [0.5, 0.85, 0.5], scale: [0.95, 1.05, 0.95] }}
        transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
      />

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
        className="relative w-[340px] text-center"
      >
        <img
          src={logoUrl}
          alt=""
          draggable={false}
          className="mx-auto mb-6 h-24 w-auto select-none drop-shadow-[0_8px_24px_rgba(0,0,0,0.5)]"
        />

        <div className="text-[13px] font-medium tracking-tight text-mist-50">
          {installing ? 'Restarting Artemis' : 'Downloading update'}
        </div>
        {state.version && (
          <p className="mt-1 font-mono text-2xs text-gold-400/80">version {state.version}</p>
        )}

        <ProgressBar percent={percent} indeterminate={installing} />

        <div className="mt-2.5 flex items-center justify-between font-mono text-2xs text-mist-600">
          <span>{installing ? 'finishing up' : formatBytes(state.transferred, state.total)}</span>
          <span>{installing ? '' : `${percent}%`}</span>
        </div>

        <p className="mt-5 text-2xs leading-relaxed text-mist-500">
          {installing
            ? 'The app will reopen in a moment.'
            : 'Artemis is updating itself and will restart when it finishes.'}
        </p>
      </motion.div>
    </div>
  )
}

function ProgressBar({ percent, indeterminate }: { percent: number; indeterminate: boolean }): JSX.Element {
  return (
    <div className="mt-5 h-1.5 w-full overflow-hidden rounded-full bg-ink-800 shadow-panel">
      <motion.div
        className="relative h-full rounded-full bg-gradient-to-r from-gold-600 via-gold-500 to-gold-300"
        initial={{ width: 0 }}
        animate={{ width: `${Math.max(2, Math.min(100, percent))}%` }}

        transition={{ type: 'spring', stiffness: 140, damping: 26 }}
      >
        {
}
        <motion.span
          className="absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-white/35 to-transparent"
          animate={{ x: ['-120%', '380%'] }}
          transition={{
            duration: indeterminate ? 1 : 1.6,
            repeat: Infinity,
            ease: 'easeInOut'
          }}
        />
      </motion.div>
    </div>
  )
}

function formatBytes(transferred?: number, total?: number): string {
  if (!total) return 'starting'
  const mb = (n: number): string => (n / 1024 / 1024).toFixed(1)
  return `${mb(transferred ?? 0)} / ${mb(total)} MB`
}
