import { useEffect } from 'react'
import { useAppStore } from '@/store/appStore'
import { TOURS } from './steps'
import { tourIsDue } from './Tutorial'

export function useFirstVisit(tour: string): void {
  const startTutorial = useAppStore((s) => s.startTutorial)
  useEffect(() => {
    if (!TOURS[tour] || !tourIsDue(tour)) return
    startTutorial(tour)

  }, [tour, startTutorial])
}
