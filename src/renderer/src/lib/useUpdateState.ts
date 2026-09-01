import { useEffect, useState } from 'react'
import type { UpdateState } from '@shared/ipc'

export function useUpdateState(): UpdateState {
  const [update, setUpdate] = useState<UpdateState>({ status: 'idle' })
  useEffect(() => {
    const listen = window.artemis.update.onState

    if (typeof listen !== 'function') return
    return listen(setUpdate)
  }, [])
  return update
}
