import { useCallback, useEffect, useRef, useState } from 'react'

export function useAttention(): { attention: boolean; callAttention: () => void } {
  const [attention, setAttention] = useState(false)
  const timer = useRef<number>()

  const callAttention = useCallback(() => {

    setAttention(false)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      setAttention(true)
      timer.current = window.setTimeout(() => setAttention(false), 450)
    }, 0)
  }, [])

  useEffect(() => () => window.clearTimeout(timer.current), [])

  return { attention, callAttention }
}
