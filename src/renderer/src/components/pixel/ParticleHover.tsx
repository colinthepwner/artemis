import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useVanillaArt } from './useVanillaArt'
import { useAppStore } from '@/store/appStore'

const SPRITE: Record<string, { file: string; tint?: string }> = {

  acidBoiling: { file: 'acid_boiling' },
  dripAcid: { file: 'acid_boiling' },
  blueflame: { file: 'fire_blue' },
  flame: { file: 'fire' },
  soulflame: { file: 'fire_soul' },
  bubble: { file: 'bubble' },
  bubbleboiling: { file: 'bubble_boiling' },
  dripWater: { file: 'bubble' },
  dripLava: { file: 'bubble_lava' },
  lava: { file: 'bubble_lava' },
  heart: { file: 'heart' },
  note: { file: 'note' },
  splash: { file: 'splash_rain_0' },

  smoke: { file: 'puff_6', tint: '#9a9a9a' },
  ventsmoke: { file: 'puff_6', tint: '#7d7d7d' },
  largesmoke: { file: 'puff_large_2', tint: '#8f8f8f' },
  explode: { file: 'puff_large_2', tint: '#d8d2c4' },
  ashmote: { file: 'puff_5', tint: '#8a8378' },
  reddust: { file: 'puff_6', tint: '#e2564a' },
  portal: { file: 'puff_6', tint: '#a353d9' },
  slimechunk: { file: 'puff_6', tint: '#7bd86a' },
  fallingleaf: { file: 'puff_5', tint: '#6a9a3c' },
  snowshovel: { file: 'puff_6', tint: '#eef4ff' },
  footstep: { file: 'puff_5', tint: '#b9a88c' },
  arrowtrail: { file: 'puff_4', tint: '#d9d9d9' },
  rubyglassLightning: { file: 'puff_5', tint: '#ff6f8f' },

  fireflyBlue: { file: 'puff_3', tint: '#7fb8ff' },
  fireflyGreen: { file: 'puff_3', tint: '#9de04f' },
  fireflyOrange: { file: 'puff_3', tint: '#ffb35c' },
  fireflyRed: { file: 'puff_3', tint: '#ff7a6b' }
}

const MAX = 24

const LIFE = 1600

const EVERY = 45

interface Mote {
  id: number

  x: number
  y: number

  vx: number
  vy: number
  size: number
  born: number
}

export function ParticleHover(props: {

  particle: string

  follow?: boolean
  children: React.ReactNode
  className?: string
}): JSX.Element {
  const art = useVanillaArt()
  const reduceAnimations = useAppStore((s) => s.reduceAnimations)
  const [motes, setMotes] = useState<Mote[]>([])
  const frameRef = useRef(0)
  const lastSpawn = useRef(0)
  const seq = useRef(0)

  const chosen = SPRITE[props.particle]

  const sprite = chosen ? art.particles?.[chosen.file] : undefined
  const live = !reduceAnimations && !!sprite

  useEffect(() => {
    if (!motes.length) return
    const step = (): void => {
      const now = performance.now()
      setMotes((list) => {
        const kept = list.filter((m) => now - m.born < LIFE)
        return kept.length === list.length ? list : kept
      })
      frameRef.current = requestAnimationFrame(step)
    }
    frameRef.current = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frameRef.current)
  }, [motes.length])

  const spawn = useCallback(
    (clientX: number, clientY: number): void => {
      if (!live) return
      const now = performance.now()
      if (now - lastSpawn.current < EVERY) return
      lastSpawn.current = now
      const x = clientX
      const y = clientY
      setMotes((list) =>
        [
          ...list,
          {
            id: seq.current++,
            x,
            y,

            vx: (Math.random() - 0.5) * 10,
            vy: -6 - Math.random() * 8,

            size: 8 + Math.round(Math.random() * 4),
            born: now
          }
        ].slice(-MAX)
      )
    },
    [live]
  )

  const onMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>): void => spawn(e.clientX, e.clientY),
    [spawn]
  )

  useEffect(() => {
    if (!props.follow || !live) return
    const onDoc = (e: PointerEvent): void => spawn(e.clientX, e.clientY)
    document.addEventListener('pointermove', onDoc)
    return () => document.removeEventListener('pointermove', onDoc)
  }, [props.follow, live, spawn])

  return (
    <div className={props.className} onPointerMove={onMove}>
      {props.children}
      {

}
      {live &&
        motes.length > 0 &&
        createPortal(
          <div className="pointer-events-none fixed inset-0 z-[120]">
            {motes.map((m) => (
              <span
                key={m.id}
                aria-hidden
                className="mote"
                style={{
                  position: 'fixed',
                  left: m.x,
                  top: m.y,
                  width: m.size,
                  height: m.size,
                  marginLeft: -m.size / 2,
                  marginTop: -m.size / 2,

                  imageRendering: 'pixelated',

                  ...(chosen?.tint
                    ? {
                        backgroundColor: chosen.tint,
                        maskImage: `url(${sprite})`,
                        WebkitMaskImage: `url(${sprite})`,
                        maskSize: '100% 100%',
                        WebkitMaskSize: '100% 100%',
                        maskRepeat: 'no-repeat',
                        WebkitMaskRepeat: 'no-repeat'
                      }
                    : { backgroundImage: `url(${sprite})`, backgroundSize: '100% 100%' }),

                  ['--mote-dx' as string]: `${m.vx * (LIFE / 1000)}px`,
                  ['--mote-dy' as string]: `${m.vy * (LIFE / 1000)}px`,
                  animation: `mote-drift ${LIFE}ms linear forwards`
                }}
              />
            ))}
          </div>,
          document.body
        )}
    </div>
  )
}
