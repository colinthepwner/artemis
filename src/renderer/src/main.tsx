import { bootGuardMounted } from './bootGuard'
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles/global.css'
import { useAppStore, loadPreferences } from './store/appStore'
import { useProjectStore } from './store/projectStore'
import { AsyncCrashOverlay, CrashBoundary } from './components/layout/CrashScreen'

;(window as unknown as Record<string, unknown>).__artemisStores = {
  app: useAppStore,
  project: useProjectStore
}

if (!window.artemis) {
  let mem: { path: string; json: string } | null = null
  window.artemis = {
    window: {
      close: () => {},
      relaunch: () => {},
      dragStart: () => {},
      dragMove: () => {}
    },

    app: {
      platform: 'win32' as NodeJS.Platform,
      version: 'dev',
      isDev: true,
      skipOnboarding: true
    },
    setup: {
      status: async () => ({ permissions: [], jdk: null, minJava: 17 }),
      openSettings: () => {},
      scanJdks: async () => [],
      pickJdk: async () => ({ ok: false }),
      chooseJdk: async () => null,
      installJdk: async () => ({ ok: false, error: 'Setup requires the desktop app.' }),
      onInstallProgress: () => () => {}
    },
    menu: { onCommand: () => () => {}, setState: () => {} },
    project: {
      save: async (json) => ((mem = { path: 'browser-memory.artemis', json }), mem.path),
      saveAs: async (json, name) => ((mem = { path: `${name}.artemis`, json }), mem.path),
      open: async () => mem,
      openPath: async () => mem,
      dir: async () => 'Documents/ArtemisForBTA',
      recents: async () => [],
      addRecent: () => {},
      removeRecent: () => {},

      onOpenRequested: () => () => {}
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
    prefs: { load: async () => ({}), save: () => {} },

    sound: { importAudio: async () => null },

    texture: { exportFile: async () => null, exportClipboard: async () => false },
    presence: { update: () => {} },
    test: {
      start: async () => ({ ok: false, error: 'Testing requires the desktop app.' }),
      stop: () => {},
      kill: () => {},
      openWorkspace: () => {},
      onLog: () => () => {},
      onState: () => () => {}
    },
    update: {
      onState: () => () => {},

      install: () => {}
    },

    boot: { phase: async () => 'ready', onPhase: () => () => {} },

    session: { onYieldRequested: () => () => {} },
    vanilla: { art: async () => ({ blocks: {}, items: {}, tops: {}, particles: {} }) }
  }
}

void loadPreferences().finally(() => {

  try {
    const root = document.getElementById('root')
    if (!root) throw new Error('the page has no #root to render into')
    ReactDOM.createRoot(root).render(
      <React.StrictMode>
        <CrashBoundary>
          <App />
          <AsyncCrashOverlay />
        </CrashBoundary>
      </React.StrictMode>
    )

    bootGuardMounted()
  } catch (err) {

    setTimeout(() => {
      throw err
    })
  }
})
