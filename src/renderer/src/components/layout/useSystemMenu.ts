import { useEffect } from 'react'
import type { MenuCommand, MenuState } from '@shared/ipc'
import { useAppStore } from '@/store/appStore'
import { useProjectStore } from '@/store/projectStore'
import { runEdit } from '@/lib/useProjectUndo'
import { WELCOME_TOUR } from '@/components/tutorial/steps'

export function useSystemMenu(): void {

  useEffect(() => {
    return window.artemis.menu.onCommand((command: MenuCommand) => {
      const app = useAppStore.getState()
      const project = useProjectStore.getState()

      const confirmDiscard = (): boolean =>
        !project.dirty || window.confirm('Discard unsaved changes to the current project?')

      switch (command) {
        case 'file.new':
          if (!confirmDiscard()) return
          project.closeProject()
          app.navigate('dashboard')
          return
        case 'file.open':
          if (!confirmDiscard()) return
          void project.openProject()
          return
        case 'file.save':
          void project.saveProject()
          return
        case 'edit.undo':

          runEdit('undo')
          break
        case 'edit.redo':
          runEdit('redo')
          break
        case 'file.export':
          app.navigate('export')
          return
        case 'settings.autoCapitalize':
          app.setAutoCapitalize(!app.autoCapitalize)
          return
        case 'settings.reduceAnimations':
          app.setReduceAnimations(!app.reduceAnimations)
          return
        case 'settings.discordPresence':
          app.setDiscordPresence(!app.discordPresence)
          return
        case 'settings.bundleTestMods':
          app.setBundleTestMods(!app.bundleTestMods)
          return
        case 'settings.saving.manual':
          app.setSavingMode('manual')
          return
        case 'settings.saving.periodic':
          app.setSavingMode('periodic')
          return
        case 'settings.saving.onChange':
          app.setSavingMode('onChange')
          return
        case 'help.tour':
          app.startTutorial(WELCOME_TOUR)
          return
        case 'help.feedback':
          app.setFeedbackOpen(true)
          return
      }
    })
  }, [])

  const hasProject = useProjectStore((s) => s.project !== null)
  const autoCapitalize = useAppStore((s) => s.autoCapitalize)
  const reduceAnimations = useAppStore((s) => s.reduceAnimations)
  const discordPresence = useAppStore((s) => s.discordPresence)
  const bundleTestMods = useAppStore((s) => s.bundleTestMods)
  const savingMode = useAppStore((s) => s.savingMode)

  useEffect(() => {
    const state: MenuState = {
      hasProject,
      autoCapitalize,
      reduceAnimations,
      discordPresence,
      bundleTestMods,
      savingMode
    }
    window.artemis.menu.setState(state)
  }, [hasProject, autoCapitalize, reduceAnimations, discordPresence, bundleTestMods, savingMode])
}
