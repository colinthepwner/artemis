import { useEffect, useRef } from 'react'
import { motion, MotionConfig } from 'framer-motion'
import { TitleBar } from '@/components/titlebar/TitleBar'
import { Sidebar } from '@/components/layout/Sidebar'
import { InspectorPanel } from '@/components/layout/InspectorPanel'
import { useAppStore } from '@/store/appStore'
import { useSystemMenu } from '@/components/layout/useSystemMenu'
import { SetupScreen } from '@/components/layout/SetupScreen'
import { useProjectStore } from '@/store/projectStore'
import { useTestStore } from '@/store/testStore'
import { Dashboard } from '@/sections/Dashboard'
import { SettingsSection } from '@/sections/SettingsSection'
import { ExportSection } from '@/sections/ExportSection'
import { ElementSection } from '@/sections/ElementSection'
import { GallerySection } from '@/sections/GallerySection'
import { WorkshopSection } from '@/sections/WorkshopSection'
import { TestingSection } from '@/sections/TestingSection'
import { PixelEditorOverlay } from '@/components/pixel/PixelEditor'
import { VoxelEditorOverlay } from '@/components/workshop/VoxelEditor'
import { CreateMenu } from '@/components/layout/CreateMenu'
import { BootScreen } from '@/components/layout/BootScreen'
import { ConstructionNotice } from '@/components/layout/ConstructionNotice'
import { UpdateBar } from '@/components/layout/UpdateBar'
import { Tutorial } from '@/components/tutorial/Tutorial'
import { useDismissDistantMenus, useMenuOpenFlag } from '@/components/ui/dismissDistant'
import { ELEMENT_KINDS, type ElementKind } from '@shared/project'
import { LATEST_BTA } from '@shared/generator/mappings'

export default function App(): JSX.Element {
  const section = useAppStore((s) => s.section)
  const inspectorOpen = useAppStore((s) => s.inspectorOpen)
  const createMenuOpen = useAppStore((s) => s.createMenuOpen)
  const closeCreateMenu = useAppStore((s) => s.closeCreateMenu)

  const isElementSection = (ELEMENT_KINDS as readonly string[]).includes(section)

  const wasElementSection = useRef(isElementSection)
  const sectionJustChanged = wasElementSection.current !== isElementSection
  useEffect(() => {
    wasElementSection.current = isElementSection
  })

  useEffect(() => {
    const offLog = window.artemis.test.onLog((line) => useTestStore.getState().appendLine(line))
    const offState = window.artemis.test.onState((state) => useTestStore.getState().setState(state))
    return () => {
      offLog()
      offState()
    }
  }, [])

  useEffect(() => {

    const subscribe = window.artemis.project.onOpenRequested
    if (typeof subscribe !== 'function') return

    return subscribe((path) => {
      const store = useProjectStore.getState()
      if (
        store.dirty &&
        !window.confirm('This mod has unsaved changes. Open the other one anyway?')
      ) {
        return
      }
      void store.openProjectByPath(path).catch(() => {

      })
    })
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        void useProjectStore.getState().saveProject()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useDismissDistantMenus()
  useMenuOpenFlag()

  const reduceAnimations = useAppStore((s) => s.reduceAnimations)
  useEffect(() => {
    document.documentElement.dataset.reduceMotion = reduceAnimations ? 'true' : 'false'
  }, [reduceAnimations])

  const discordPresence = useAppStore((s) => s.discordPresence)
  const presenceName = useProjectStore((s) => s.project?.meta.name ?? null)
  const presenceBta = useProjectStore((s) => s.project?.meta.targetBta ?? LATEST_BTA)
  useEffect(() => {
    window.artemis.presence.update({
      enabled: discordPresence,
      projectName: presenceName,
      btaVersion: presenceBta
    })
  }, [discordPresence, presenceName, presenceBta])

  useSystemMenu()

  const savingMode = useAppStore((s) => s.savingMode)
  const dirty = useProjectStore((s) => s.dirty)
  const hasProject = useProjectStore((s) => s.project !== null)
  useEffect(() => {
    if (!hasProject || !dirty || savingMode === 'manual') return
    const after = savingMode === 'onChange' ? 900 : 60_000
    const timer = window.setTimeout(() => {
      void useProjectStore.getState().saveProject()
    }, after)
    return () => window.clearTimeout(timer)
  }, [dirty, hasProject, savingMode])

  return (
    <MotionConfig reducedMotion={reduceAnimations ? 'always' : 'user'}>
    <div className="flex h-full flex-col">
      <TitleBar />
      {

}
      <SetupScreen />
      {
}
      <UpdateBar />
      <div className="flex min-h-0 flex-1">
        <Sidebar />

        <main className="relative min-w-0 flex-1 bg-ink-900">
          {

}
          <motion.div
            key={section}
            className="absolute inset-0 flex flex-col"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
          >
            {section === 'dashboard' && <Dashboard />}
            {section === 'gallery' && <GallerySection />}
            {section === 'workshop' && <WorkshopSection />}
            {section === 'test' && <TestingSection />}
            {section === 'settings' && <SettingsSection />}
            {section === 'export' && <ExportSection />}
            {isElementSection && <ElementSection kind={section as ElementKind} />}
          </motion.div>
        </main>

        {

}
        <motion.div
          className="shrink-0 overflow-hidden"
          animate={{ width: inspectorOpen && isElementSection ? 400 : 0 }}
          transition={sectionJustChanged ? { duration: 0 } : { type: 'spring', stiffness: 400, damping: 40 }}
        >
          <InspectorPanel />
        </motion.div>
      </div>

      {
}
      {createMenuOpen && <CreateMenu onClose={closeCreateMenu} />}
      <PixelEditorOverlay />
      <VoxelEditorOverlay />
      <ConstructionNotice />
      {}
      <Tutorial />
      <BootScreen />
    </div>
    </MotionConfig>
  )
}
