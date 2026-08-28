import { useCallback, useEffect, useLayoutEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { ArrowLeft, ArrowRight, Compass, X } from 'lucide-react'
import { useAppStore, type SectionId } from '@/store/appStore'
import { TOUR_SPEED, useTypedText } from '@/components/ui/typing'
import { TOURS, WELCOME_TOUR } from './steps'

const seenKey = (tour: string): string =>
  tour === WELCOME_TOUR ? 'artemis.tutorial.seen' : `artemis.tour.${tour}.seen`

const HALO = 6

const GAP = 14

const BUBBLE_W = 340
const BUBBLE_H = 190

const MARGIN = 16

interface Rect {
  top: number
  left: number
  width: number
  height: number
}

function useAnchorRect(anchor: string | undefined): Rect | null {
  const [rect, setRect] = useState<Rect | null>(null)

  useLayoutEffect(() => {
    if (!anchor) {
      setRect(null)
      return
    }
    let live = true
    let frame = 0

    let last = ''
    const measure = (): void => {
      if (!live) return
      const el = document.querySelector(`[data-tour="${anchor}"]`)
      if (!el) {
        if (last !== 'none') {
          last = 'none'
          setRect(null)
        }
      } else {
        const r = el.getBoundingClientRect()

        if (r.width > 0 && r.height > 0) {
          const key = `${r.top},${r.left},${r.width},${r.height}`
          if (key !== last) {
            last = key
            setRect({ top: r.top, left: r.left, width: r.width, height: r.height })
          }
        }
      }

      frame = window.requestAnimationFrame(measure)
    }
    measure()
    return () => {
      live = false
      window.cancelAnimationFrame(frame)
    }
  }, [anchor])

  return rect
}

function placeBubble(rect: Rect | null): { top: number; left: number } {
  const vw = window.innerWidth
  const vh = window.innerHeight
  if (!rect) {
    return { top: Math.max(MARGIN, (vh - BUBBLE_H) / 2), left: Math.max(MARGIN, (vw - BUBBLE_W) / 2) }
  }
  const right = rect.left + rect.width + HALO + GAP
  const left = rect.left - HALO - GAP - BUBBLE_W
  const below = rect.top + rect.height + HALO + GAP
  const above = rect.top - HALO - GAP - BUBBLE_H

  let x: number
  let y: number
  if (right + BUBBLE_W + MARGIN <= vw) {
    x = right
    y = rect.top + rect.height / 2 - BUBBLE_H / 2
  } else if (left >= MARGIN) {
    x = left
    y = rect.top + rect.height / 2 - BUBBLE_H / 2
  } else if (below + BUBBLE_H + MARGIN <= vh) {
    x = rect.left + rect.width / 2 - BUBBLE_W / 2
    y = below
  } else {
    x = rect.left + rect.width / 2 - BUBBLE_W / 2
    y = above
  }

  const placedTop = Math.min(Math.max(MARGIN, y), Math.max(MARGIN, vh - BUBBLE_H - MARGIN))
  const placedLeft = Math.min(Math.max(MARGIN, x), Math.max(MARGIN, vw - BUBBLE_W - MARGIN))
  return clearOfWindowControls(placedTop, placedLeft)
}

function windowControlsRect(): DOMRect | null {
  const el = document.querySelector('[data-window-controls-gap="right"]')
  if (!el) return null
  const r = el.getBoundingClientRect()
  return r.width > 0 && r.height > 0 ? r : null
}

function clearOfWindowControls(top: number, left: number): { top: number; left: number } {
  const controls = windowControlsRect()
  if (!controls) return { top, left }
  const overlapsX = left + BUBBLE_W > controls.left && left < controls.right
  const overlapsY = top < controls.bottom && top + BUBBLE_H > controls.top
  if (!overlapsX || !overlapsY) return { top, left }
  const vh = window.innerHeight
  const dropped = controls.bottom + GAP

  if (dropped + BUBBLE_H + MARGIN > vh) return { top, left }
  return { top: dropped, left }
}

export function markTourSeen(tour: string): void {
  try {
    localStorage.setItem(seenKey(tour), '1')
  } catch {

  }
}

export function tourIsDue(tour: string): boolean {

  if (window.artemis.app.skipOnboarding) return false
  if (import.meta.env.DEV) return true
  try {
    return !localStorage.getItem(seenKey(tour))
  } catch {
    return false
  }
}

export function Tutorial(): JSX.Element | null {
  const tour = useAppStore((s) => s.activeTour)
  const open = tour !== null
  const startTutorial = useAppStore((s) => s.startTutorial)
  const endTutorial = useAppStore((s) => s.endTutorial)
  const showSection = useAppStore((s) => s.showSection)
  const noticeOpen = useAppStore((s) => s.startupNoticeOpen)
  const bootPhase = useAppStore((s) => s.bootPhase)
  const reduceAnimations = useAppStore((s) => s.reduceAnimations)
  const [index, setIndex] = useState(0)

  const [revealed, setRevealed] = useState(false)

  const [offered, setOffered] = useState(false)

  useEffect(() => {

    if (offered || noticeOpen || bootPhase !== 'ready') return
    setOffered(true)
    if (tourIsDue(WELCOME_TOUR)) startTutorial(WELCOME_TOUR)
  }, [offered, noticeOpen, bootPhase, startTutorial])

  const [cameFrom, setCameFrom] = useState<{ section: SectionId; editingId: string | null } | null>(
    null
  )

  useEffect(() => {
    if (open) {
      setIndex(0)
      setRevealed(false)
      const { section, editingId } = useAppStore.getState()
      setCameFrom({ section, editingId })
    }
  }, [open])

  const steps = (tour && TOURS[tour]) || []
  const step = steps[Math.min(index, Math.max(0, steps.length - 1))]

  const wanted = step?.section
  useEffect(() => {
    if (open && wanted) showSection(wanted)
  }, [open, wanted, showSection])

  const last = index >= steps.length - 1

  const finish = useCallback((): void => {
    if (tour) markTourSeen(tour)

    if (cameFrom && steps.some((s) => s.section)) {
      showSection(cameFrom.section, cameFrom.editingId)
    }
    endTutorial()
  }, [tour, steps, cameFrom, showSection, endTutorial])

  const rect = useAnchorRect(open ? step?.anchor : undefined)
  const { text, done } = useTypedText(step?.body ?? '', {
    paused: !open || revealed,
    rate: TOUR_SPEED
  })

  const advance = useCallback((): void => {
    if (!revealed && !done) {
      setRevealed(true)
      return
    }
    if (last) {
      finish()
      return
    }
    setIndex((i) => i + 1)
    setRevealed(false)
  }, [revealed, done, last, finish])

  const back = useCallback((): void => {
    setIndex((i) => Math.max(0, i - 1))
    setRevealed(true)
  }, [])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') finish()
      if (e.key === 'Enter' || e.key === 'ArrowRight' || e.key === ' ') {
        e.preventDefault()
        advance()
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        back()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, advance, back, finish])

  if (!open || !step || bootPhase !== 'ready') return null

  const shown = revealed ? step.body : text
  const landed = revealed || done
  const bubble = placeBubble(rect)
  const halo = rect
    ? {
        top: rect.top - HALO,
        left: rect.left - HALO,
        width: rect.width + HALO * 2,
        height: rect.height + HALO * 2
      }
    : null

  return (
    <div className="fixed inset-0 z-[95]">
      {

}
      {halo ? (
        <motion.div
          className="pointer-events-none absolute rounded-lg ring-2 ring-gold-400/70"

          initial={reduceAnimations ? false : { opacity: 0, ...halo }}
          animate={{ opacity: 1, ...halo }}
          transition={{ duration: reduceAnimations ? 0 : 0.22, ease: [0.22, 1, 0.36, 1] }}
          style={{ boxShadow: '0 0 0 9999px rgba(6, 8, 11, 0.66)' }}
        />
      ) : (
        <div className="absolute inset-0" style={{ background: 'rgba(6, 8, 11, 0.66)' }} />
      )}

      {

}
      <div className="absolute inset-0" onClick={advance} />

      {

}
      <motion.div
        className="absolute left-0 top-0 flex flex-col rounded-xl bg-ink-850 p-4 shadow-raised"
        style={{ width: BUBBLE_W, minHeight: BUBBLE_H }}
        initial={
          reduceAnimations ? false : { opacity: 0, scale: 0.96, x: bubble.left, y: bubble.top }
        }
        animate={{ opacity: 1, scale: 1, x: bubble.left, y: bubble.top }}
        transition={{ duration: reduceAnimations ? 0 : 0.24, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="mb-2.5 flex items-center gap-2">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-gold-500/10">
            <Compass size={13} className="text-gold-400" strokeWidth={2} />
          </span>
          <h3 className="min-w-0 flex-1 truncate text-[13px] font-semibold tracking-tight text-mist-50">
            {step.title}
          </h3>
          <span className="shrink-0 font-mono text-[10px] text-mist-600">
            {index + 1}/{steps.length}
          </span>
        </div>

        {

}
        <p className="text-[13px] leading-relaxed text-mist-300">
          {shown}
          {

}
          {!landed && (
            <span className="relative inline-block h-[1em] w-0 align-baseline">
              <span className="pixel-caret absolute bottom-[0.12em] left-[0.08em] h-[0.1em] w-[0.5em] bg-gold-400" />
            </span>
          )}
          <span className="invisible" aria-hidden>
            {step.body.slice(shown.length)}
          </span>
        </p>

        {
}
        <p
          className={`mt-2 text-2xs leading-relaxed text-gold-300/80 transition-opacity duration-200 ${
            landed && step.made ? 'opacity-100' : 'opacity-0'
          }`}
        >
          {step.made ?? ''}
        </p>

        <div className="mt-auto flex items-center gap-2 pt-3.5">
          <button
            onClick={finish}
            className="flex items-center gap-1 rounded-md px-2 py-1.5 text-2xs text-mist-500 transition-colors hover:bg-ink-800 hover:text-mist-300"
          >
            <X size={11} strokeWidth={2} /> Skip the tour
          </button>
          {

}
          {index > 0 && (
            <button
              onClick={back}
              className="flex items-center gap-1 rounded-md px-2 py-1.5 text-2xs text-mist-500 transition-colors hover:bg-ink-800 hover:text-mist-300"
            >
              <ArrowLeft size={11} strokeWidth={2} /> Back
            </button>
          )}
          <button
            onClick={advance}
            autoFocus
            className="ml-auto flex items-center gap-1.5 rounded-md bg-gold-500 px-3 py-1.5 text-[13px] font-medium text-ink-950 transition-all hover:bg-gold-400 active:scale-[0.98]"
          >
            {last ? 'Start building' : landed ? 'Next' : 'Show it all'}
            {!last && <ArrowRight size={13} strokeWidth={2.2} />}
          </button>
        </div>
      </motion.div>
    </div>
  )
}
