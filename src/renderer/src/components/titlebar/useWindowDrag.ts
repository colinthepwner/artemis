import { useRef } from 'react'

const THRESHOLD = 4

export interface DragPointer {
  button: number
  screenX: number
  screenY: number
}

export interface WindowDrag {

  onPointerDown: (e: DragPointer) => void

  moved: () => boolean
}

export function useWindowDrag(opts?: {

  onDragStart?: () => void
}): WindowDrag {
  const moved = useRef(false)

  const onPointerDown = (e: DragPointer): void => {

    if (e.button !== 0) return

    const bridge = window.artemis.window
    if (typeof bridge.dragStart !== 'function' || typeof bridge.dragMove !== 'function') return

    moved.current = false

    const startX = e.screenX
    const startY = e.screenY
    let dragging = false

    const onMove = (ev: PointerEvent): void => {
      const dx = ev.screenX - startX
      const dy = ev.screenY - startY
      if (!dragging) {
        if (Math.abs(dx) < THRESHOLD && Math.abs(dy) < THRESHOLD) return
        dragging = true
        moved.current = true

        opts?.onDragStart?.()

        bridge.dragStart()
      }
      bridge.dragMove(dx, dy)
    }

    const onUp = (): void => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      if (!dragging) return

      const swallow = (ev: MouseEvent): void => {
        ev.stopPropagation()
        ev.preventDefault()
      }
      window.addEventListener('click', swallow, { capture: true, once: true })

      window.setTimeout(() => window.removeEventListener('click', swallow, true), 0)
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
  }

  return { onPointerDown, moved: () => moved.current }
}
