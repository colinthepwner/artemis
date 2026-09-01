import { useRef } from 'react'
import { dismissedByDistance } from '@/components/ui/dismissDistant'

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

      if (outside.current || dismissedByDistance()) {
        e.preventDefault()
        outside.current = false
      }
    }
  }
}
