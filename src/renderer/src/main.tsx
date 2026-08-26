import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles/global.css'
import { useAppStore } from './store/appStore'
import { useProjectStore } from './store/projectStore'

;(window as unknown as Record<string, unknown>).__artemisStores = {
  app: useAppStore,
  project: useProjectStore
}

if (!window.artemis) {
  let mem: { path: string; json: string } | null = null
  window.artemis = {
    window: {
      minimize: () => {},
      maximizeToggle: () => {},
      close: () => {},
      isMaximized: async () => false,
      onMaximizeChanged: () => () => {}
    },
    app: { platform: 'win32' as NodeJS.Platform, version: 'dev' },
    project: {
      save: async (json) => ((mem = { path: 'browser-memory.artemis', json }), mem.path),
      saveAs: async (json, name) => ((mem = { path: `${name}.artemis`, json }), mem.path),
      open: async () => mem,
      openPath: async () => mem,
      dir: async () => 'Documents/ArtemisForBTA',
      recents: async () => [],
      addRecent: () => {},
      removeRecent: () => {}
    },
    export: {
      workspace: async () => ({
        ok: false,
        error: 'Export requires the desktop app.',
        log: ['Export is unavailable in browser preview.']
      }),
      openPath: () => {},
      revealJar: () => {}
    },
    test: {
      start: async () => ({ ok: false, error: 'Testing requires the desktop app.' }),
      stop: () => {},
      openWorkspace: () => {},
      onLog: () => () => {},
      onState: () => () => {}
    },
    update: { onState: () => () => {} }
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
