import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'

export const GLIDE_MS = 200

export function GlideList(props: {

  active: string | null

  present?: boolean

  instant?: boolean
  className?: string
  children: ReactNode
}): JSX.Element {
  const host = useRef<HTMLDivElement>(null)
  const [pill, setPill] = useState<{ top: number; height: number } | null>(null)
  const here = props.present ?? true

  useLayoutEffect(() => {
    if (!here || props.active === null) return
    const row = host.current?.querySelector<HTMLElement>(`[data-glide-id="${props.active}"]`)

    if (row) setPill({ top: row.offsetTop, height: row.offsetHeight })
  }, [props.active, here, props.children])

  const [arriving, setArriving] = useState(false)
  const wasHere = useRef(here)
  useLayoutEffect(() => {
    if (here && !wasHere.current) {
      setArriving(true)
      const settled = window.setTimeout(() => setArriving(false), GLIDE_MS)
      wasHere.current = here
      return () => window.clearTimeout(settled)
    }
    wasHere.current = here
    return
  }, [here])

  const still = arriving || props.instant

  return (
    <div ref={host} className={props.className ? `relative ${props.className}` : 'relative'}>
      {

}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 rounded-md bg-ink-750 shadow-panel ease-swift"
        style={{
          transform: `translateY(${pill?.top ?? 0}px)`,
          height: pill?.height ?? 0,
          opacity: here && props.active !== null && pill ? 1 : 0,
          transitionProperty: still ? 'opacity' : 'transform, opacity',
          transitionDuration: `${props.instant ? 0 : GLIDE_MS}ms`
        }}
      />
      {props.children}
    </div>
  )
}
