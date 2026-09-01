import { useEffect, useRef } from 'react'

const LEAVE_DISTANCE = 140

export function menuOwnsKeyboard(): boolean {
  return !!document.querySelector('[role="menu"], [role="listbox"]')
}

export function useCloseOnEscape(onClose: () => void, blocked?: () => boolean): void {
  const latest = useRef({ onClose, blocked })
  latest.current = { onClose, blocked }
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return
      if (latest.current.blocked?.()) return
      if (menuOwnsKeyboard()) return
      latest.current.onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}

let distantAt = -Infinity

export function dismissedByDistance(): boolean {
  return performance.now() - distantAt < 300
}

export function useDismissDistantMenus(): void {
  useEffect(() => {

    let armed = false

    const onMove = (e: PointerEvent): void => {
      const menu = document.querySelector('[data-radix-popper-content-wrapper] [data-state="open"]')
      if (!menu) {
        armed = false
        return
      }
      const r = menu.getBoundingClientRect()

      const dx = Math.max(r.left - e.clientX, 0, e.clientX - r.right)
      const dy = Math.max(r.top - e.clientY, 0, e.clientY - r.bottom)
      const distance = Math.hypot(dx, dy)

      if (!armed) {
        if (distance < LEAVE_DISTANCE) armed = true
        return
      }
      if (distance <= LEAVE_DISTANCE) return
      armed = false

      distantAt = performance.now()
      menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    }

    window.addEventListener('pointermove', onMove)
    return () => window.removeEventListener('pointermove', onMove)
  }, [])
}

export function useMenuOpenFlag(): void {
  useEffect(() => {
    const root = document.documentElement
    const sync = (): void => {
      const open = !!document.querySelector('[data-radix-popper-content-wrapper] [data-state="open"]')
      const flag = open ? 'true' : 'false'
      if (root.dataset.menuOpen !== flag) root.dataset.menuOpen = flag
    }
    sync()
    const observer = new MutationObserver(sync)
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['data-state']
    })
    return () => {
      observer.disconnect()
      delete root.dataset.menuOpen
    }
  }, [])
}

export function useDismissOnKey(active: boolean, dismiss: () => void): void {

  const latest = useRef(dismiss)
  latest.current = dismiss
  useEffect(() => {
    if (!active) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' || e.key === 'Enter') latest.current()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active])
}
