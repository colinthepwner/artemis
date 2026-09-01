import { useEffect } from 'react'
import { useAppStore } from '@/store/appStore'
import { useProjectStore } from '@/store/projectStore'
import { menuOwnsKeyboard } from '@/components/ui/dismissDistant'

type Direction = 'undo' | 'redo'

function ownedElsewhere(): boolean {
  const { textureEditor, workshopEditor } = useAppStore.getState()
  if (textureEditor !== null || workshopEditor !== null) return true
  if (menuOwnsKeyboard()) return true
  const el = document.activeElement as HTMLElement | null
  return el?.isContentEditable === true
}

export function runEdit(direction: Direction): boolean {
  if (ownedElsewhere()) return false
  const { undo, redo, project } = useProjectStore.getState()
  if (!project) return false
  if (direction === 'redo') redo()
  else undo()
  return true
}

export function useProjectUndo(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (!e.ctrlKey && !e.metaKey) return
      const key = e.key.toLowerCase()
      if (key !== 'z' && key !== 'y') return

      if (runEdit(key === 'y' || e.shiftKey ? 'redo' : 'undo')) e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}
