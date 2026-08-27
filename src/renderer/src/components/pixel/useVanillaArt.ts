import { useEffect, useState } from 'react'
import { useProjectStore } from '@/store/projectStore'
import { tintVanillaArt } from './foliageTints'

export interface VanillaArt {
  blocks: Record<string, string>
  items: Record<string, string>

  tops: Record<string, string>

  tints?: Record<string, string>
}

const EMPTY: VanillaArt = { blocks: {}, items: {}, tops: {} }

const inFlight = new Map<string, Promise<VanillaArt>>()

export function useVanillaArt(): VanillaArt {
  const targetBta = useProjectStore((s) => s.project?.meta.targetBta ?? '8.0.1')
  const [art, setArt] = useState<VanillaArt>(EMPTY)

  useEffect(() => {
    let live = true
    let pending = inFlight.get(targetBta)
    if (!pending) {
      pending = window.artemis.vanilla.art(targetBta).then(tintVanillaArt).catch(() => EMPTY)
      inFlight.set(targetBta, pending)
    }
    void pending.then((a) => live && setArt(a))
    return () => {
      live = false
    }
  }, [targetBta])

  return art
}
