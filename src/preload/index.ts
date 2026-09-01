import { contextBridge, ipcRenderer } from 'electron'
import {
  IPC,
  type ArtemisApi,
  type BootPhase,
  type MenuCommand,
  type TestState,
  type UpdateState
} from '../shared/ipc'

const api: ArtemisApi = {
  window: {
    close: () => ipcRenderer.send(IPC.WindowClose),
    relaunch: () => ipcRenderer.send(IPC.WindowRelaunch),
    dragStart: () => ipcRenderer.send(IPC.WindowDragStart),
    dragMove: (dx, dy) => ipcRenderer.send(IPC.WindowDragMove, dx, dy)
  },
  sound: {
    importAudio: () => ipcRenderer.invoke(IPC.SoundImport)
  },
  texture: {
    exportFile: (dataUrl, suggestedName) =>
      ipcRenderer.invoke(IPC.TextureExportFile, dataUrl, suggestedName),
    exportClipboard: (dataUrl) => ipcRenderer.invoke(IPC.TextureExportClipboard, dataUrl)
  },
  app: {
    platform: process.platform,

    isDev: process.env['ARTEMIS_IS_DEV'] === '1',
    skipOnboarding: process.env['ARTEMIS_SKIP_ONBOARDING'] === '1',

    version: process.env['ARTEMIS_VERSION'] ?? ''
  },
  setup: {
    status: () => ipcRenderer.invoke(IPC.SetupStatus),
    openSettings: (issue) => ipcRenderer.send(IPC.SetupOpenSettings, issue),
    scanJdks: () => ipcRenderer.invoke(IPC.JdkScan),
    pickJdk: () => ipcRenderer.invoke(IPC.JdkPick),
    chooseJdk: (home) => ipcRenderer.invoke(IPC.JdkChoose, home),
    installJdk: () => ipcRenderer.invoke(IPC.JdkInstall),
    onInstallProgress: (cb) => {
      const listener = (_e: Electron.IpcRendererEvent, percent: number): void => cb(percent)
      ipcRenderer.on(IPC.JdkInstallProgress, listener)
      return () => ipcRenderer.removeListener(IPC.JdkInstallProgress, listener)
    }
  },
  menu: {
    onCommand: (cb) => {
      const listener = (_e: Electron.IpcRendererEvent, command: MenuCommand): void => cb(command)
      ipcRenderer.on(IPC.MenuCommand, listener)
      return () => ipcRenderer.removeListener(IPC.MenuCommand, listener)
    },
    setState: (state) => ipcRenderer.send(IPC.MenuState, state)
  },
  project: {
    save: (json, currentPath) => ipcRenderer.invoke(IPC.ProjectSave, json, currentPath),
    saveAs: (json, suggestedName) => ipcRenderer.invoke(IPC.ProjectSaveAs, json, suggestedName),
    open: () => ipcRenderer.invoke(IPC.ProjectOpen),
    openPath: (path) => ipcRenderer.invoke(IPC.ProjectOpenPath, path),
    onOpenRequested: (cb) => {
      const fn = (_e: unknown, path: string): void => cb(path)
      ipcRenderer.on(IPC.ProjectOpenRequested, fn)
      return () => ipcRenderer.removeListener(IPC.ProjectOpenRequested, fn)
    },
    dir: () => ipcRenderer.invoke(IPC.ProjectsDir),
    recents: () => ipcRenderer.invoke(IPC.RecentsList),
    addRecent: (entry) => ipcRenderer.send(IPC.RecentsAdd, entry),
    removeRecent: (path) => ipcRenderer.send(IPC.RecentsRemove, path)
  },
  export: {
    workspace: (projectJson) => ipcRenderer.invoke(IPC.ExportWorkspace, projectJson),
    openPath: (path) => ipcRenderer.send(IPC.ShellOpenPath, path),
    revealJar: (path) => ipcRenderer.send(IPC.ShellShowItemInFolder, path)
  },
  prefs: {
    load: () => ipcRenderer.invoke(IPC.PrefsLoad),
    save: (prefs) => ipcRenderer.send(IPC.PrefsSave, prefs)
  },
  presence: {
    update: (state) => ipcRenderer.send(IPC.PresenceUpdate, state)
  },
  feedback: {
    send: (kind, message) => ipcRenderer.invoke(IPC.FeedbackSend, kind, message)
  },
  test: {
    start: (projectJson, options) => ipcRenderer.invoke(IPC.TestStart, projectJson, options),
    stop: () => ipcRenderer.send(IPC.TestStop),
    kill: (modId) => ipcRenderer.send(IPC.TestKill, modId),
    openWorkspace: (modId) => ipcRenderer.send(IPC.TestOpenWorkspace, modId),
    onLog: (cb) => {
      const listener = (_e: Electron.IpcRendererEvent, line: string): void => cb(line)
      ipcRenderer.on(IPC.TestLog, listener)
      return () => ipcRenderer.removeListener(IPC.TestLog, listener)
    },
    onState: (cb) => {
      const listener = (_e: Electron.IpcRendererEvent, state: TestState): void => cb(state)
      ipcRenderer.on(IPC.TestState, listener)
      return () => ipcRenderer.removeListener(IPC.TestState, listener)
    }
  },
  vanilla: {
    art: (btaVersion) => ipcRenderer.invoke(IPC.VanillaArt, btaVersion)
  },
  update: {
    onState: (cb) => {
      const listener = (_e: Electron.IpcRendererEvent, state: UpdateState): void => cb(state)
      ipcRenderer.on(IPC.UpdateState, listener)
      return () => ipcRenderer.removeListener(IPC.UpdateState, listener)
    },
    install: () => ipcRenderer.send(IPC.UpdateInstall)
  },
  boot: {
    phase: () => ipcRenderer.invoke(IPC.BootGetPhase),
    onPhase: (cb) => {
      const listener = (_e: Electron.IpcRendererEvent, phase: BootPhase): void => cb(phase)
      ipcRenderer.on(IPC.BootPhase, listener)
      return () => ipcRenderer.removeListener(IPC.BootPhase, listener)
    }
  },
  session: {
    onYieldRequested: (cb) => {

      const listener = (): void => {
        void cb().finally(() => ipcRenderer.send(IPC.SessionYielded))
      }
      ipcRenderer.on(IPC.SessionYield, listener)
      return () => ipcRenderer.removeListener(IPC.SessionYield, listener)
    }
  }
}

contextBridge.exposeInMainWorld('artemis', api)
