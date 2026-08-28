import { useRef } from 'react'

export function useOutsideClose(): {
  markOutside: () => void
  onCloseAutoFocus: (e: Event) => void
} {
  const outside = useRef(false)
  return {
    markOutside: () => {
      outside.current = true
    },
    onCloseAutoFocus: (e: Event) => {
      if (outside.current) {
        e.preventDefault()
        outside.current = false
      }
    }
  }
}
