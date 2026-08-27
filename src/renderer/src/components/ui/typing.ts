import { useEffect, useState } from 'react'
import { useAppStore } from '@/store/appStore'

const NEAR_KEYS: Record<string, string> = {
  Q: 'WAS',
  W: 'QESA',
  E: 'WRSD',
  R: 'ETDF',
  T: 'RYFG',
  Y: 'TUGH',
  U: 'YIHJ',
  I: 'UOJK',
  O: 'IPKL',
  P: 'OL',
  A: 'QWSZ',
  S: 'AWDXZ',
  D: 'SEFCX',
  F: 'DRGVC',
  G: 'FTHBV',
  H: 'GYJNB',
  J: 'HUKMN',
  K: 'JILM',
  L: 'KOP',
  Z: 'ASX',
  X: 'ZSDC',
  C: 'XDFV',
  V: 'CFGB',
  B: 'VGHN',
  N: 'BHJM',
  M: 'NJK'
}

const GAP_MIN = 68
const GAP_MAX = 152

const LEAD_IN_MS = 280

const HESITATE_CHANCE = 0.22
const HESITATE_MIN = 90
const HESITATE_MAX = 210

const NOTICE_MS = 300

const RECOVER_MS = 210

const SENTENCE_LENGTH = 12
const SENTENCE_SPEED = 0.42

export const TOUR_SPEED = 0.4

const between = (lo: number, hi: number): number => lo + Math.random() * (hi - lo)

function keyGap(speed: number): number {
  const base = between(GAP_MIN, GAP_MAX)
  const gap = Math.random() < HESITATE_CHANCE ? base + between(HESITATE_MIN, HESITATE_MAX) : base
  return gap * speed
}

export interface TypeFrame {
  text: string

  delay: number
}

export function buildTypeScript(phrase: string, fumble: boolean, rate = 1): TypeFrame[] {
  const speed = (phrase.length > SENTENCE_LENGTH ? SENTENCE_SPEED : 1) * rate

  const candidates = phrase
    .split('')
    .map((_, i) => i)
    .filter((i) => i > 0 && NEAR_KEYS[phrase[i]])
  const at =
    fumble && candidates.length ? candidates[Math.floor(Math.random() * candidates.length)] : -1

  const frames: TypeFrame[] = []
  for (let i = 0; i < phrase.length; i++) {

    const gap = i === 0 ? LEAD_IN_MS * rate : keyGap(speed)
    if (i === at) {
      const near = NEAR_KEYS[phrase[i]]
      const wrong = near[Math.floor(Math.random() * near.length)]

      frames.push({ text: phrase.slice(0, i) + wrong, delay: gap })
      frames.push({ text: phrase.slice(0, i), delay: NOTICE_MS })
      frames.push({ text: phrase.slice(0, i + 1), delay: RECOVER_MS })
      continue
    }
    frames.push({ text: phrase.slice(0, i + 1), delay: gap })
  }
  return frames
}

export interface TypedText {

  text: string

  done: boolean
}

export function useTypedText(
  phrase: string,
  options: { paused?: boolean; fumble?: boolean; rate?: number } = {}
): TypedText {
  const { paused = false, fumble = false, rate = 1 } = options
  const reduceAnimations = useAppStore((s) => s.reduceAnimations)
  const [text, setText] = useState(reduceAnimations ? phrase : '')

  useEffect(() => {
    if (reduceAnimations) {
      setText(phrase)
      return
    }
    setText('')
    if (paused) return

    const frames = buildTypeScript(phrase, fumble, rate)

    let at = 0
    const timers = frames.map((f) => {
      at += f.delay
      return window.setTimeout(() => setText(f.text), at)
    })
    return () => timers.forEach(window.clearTimeout)
  }, [phrase, paused, fumble, rate, reduceAnimations])

  return { text, done: text === phrase }
}
