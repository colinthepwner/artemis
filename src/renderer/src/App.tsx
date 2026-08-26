import { useEffect } from 'react'
import { motion } from 'framer-motion'
import { TitleBar } from '@/components/titlebar/TitleBar'
import { Sidebar } from '@/components/layout/Sidebar'
import { InspectorPanel } from '@/components/layout/InspectorPanel'
import { useAppStore } from '@/store/appStore'
import { useProjectStore } from '@/store/projectStore'
import { useTestStore } from '@/store/testStore'
import { Dashboard } from '@/sections/Dashboard'
import { SettingsSection } from '@/sections/SettingsSection'
import { ExportSection } from '@/sections/ExportSection'
import { ElementSection } from '@/sections/ElementSection'
import { GallerySection } from '@/sections/GallerySection'
import { TestingSection } from '@/sections/TestingSection'
import { PixelEditorOverlay } from '@/components/pixel/PixelEditor'
import { CreateMenu } from '@/components/layout/CreateMenu'
import { UpdateOverlay } from '@/components/layout/UpdateOverlay'
import { ConstructionNotice } from '@/components/layout/ConstructionNotice'
import { ELEMENT_KINDS, type ElementKind } from '@shared/project'

export default function App(): JSX.Element {
  const section = useAppStore((s) => s.section)
  const inspectorOpen = useAppStore((s) => s.inspectorOpen)
  const createMenuOpen = useAppStore((s) => s.createMenuOpen)
  const closeCreateMenu = useAppStore((s) => s.closeCreateMenu)

  const isElementSection = (ELEMENT_KINDS as readonly string[]).includes(section)

  useEffect(() => {
    const offLog = window.artemis.test.onLog((line) => useTestStore.getState().appendLine(line))
    const offState = window.artemis.test.onState((state) => useTestStore.getState().setState(state))
    return () => {
      offLog()
      offState()
    }
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

  return (
    <div className="flex h-full flex-col">
      <TitleBar />
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
            {section === 'test' && <TestingSection />}
            {section === 'settings' && <SettingsSection />}
            {section === 'export' && <ExportSection />}
            {isElementSection && <ElementSection kind={section as ElementKind} />}
          </motion.div>
        </main>

        {}
        <motion.div
          className="shrink-0 overflow-hidden"
          animate={{ width: inspectorOpen && isElementSection ? 400 : 0 }}
          transition={{ type: 'spring', stiffness: 400, damping: 40 }}
        >
          <InspectorPanel />
        </motion.div>
      </div>

      {}
      {createMenuOpen && <CreateMenu onClose={closeCreateMenu} />}
      <PixelEditorOverlay />
      <ConstructionNotice />
      <UpdateOverlay />
    </div>
  )
}
