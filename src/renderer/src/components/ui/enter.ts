import type { CSSProperties } from 'react'
import type { Transition } from 'framer-motion'

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1]

export const PANE_ENTER: {
  initial: { opacity: number; y: number }
  animate: { opacity: number; y: number }
  transition: Transition
  style: CSSProperties
} = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.18, ease: EASE },
  style: { willChange: 'transform, opacity' }
}
