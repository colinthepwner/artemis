import { contextBridge, ipcRenderer } from 'electron'
import { IPC, type ArtemisApi, type TestState, type UpdateState } from '../shared/ipc'

const api: ArtemisApi = {
  window: {
    minimize: () => ipcRenderer.send(IPC.WindowMinimize),
    maximizeToggle: () => ipcRenderer.send(IPC.WindowMaximizeToggle),
    close: () => ipcRenderer.send(IPC.WindowClose),
    isMaximized: () => ipcRenderer.invoke(IPC.WindowIsMaximized),
    onMaximizeChanged: (cb) => {
      const listener = (_e: Electron.IpcRendererEvent, maximized: boolean): void => cb(maximized)
      ipcRenderer.on(IPC.WindowMaximizeChanged, listener)
      return () => ipcRenderer.removeListener(IPC.WindowMaximizeChanged, listener)
    }
  },
  app: {
    platform: process.platform,
    version: process.env['npm_package_version'] ?? '0.1.0'
  },
  project: {
    save: (json, currentPath) => ipcRenderer.invoke(IPC.ProjectSave, json, currentPath),
    saveAs: (json, suggestedName) => ipcRenderer.invoke(IPC.ProjectSaveAs, json, suggestedName),
    open: () => ipcRenderer.invoke(IPC.ProjectOpen),
    openPath: (path) => ipcRenderer.invoke(IPC.ProjectOpenPath, path),
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
  test: {
    start: (projectJson) => ipcRenderer.invoke(IPC.TestStart, projectJson),
    stop: () => ipcRenderer.send(IPC.TestStop),
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
  update: {
    onState: (cb) => {
      const listener = (_e: Electron.IpcRendererEvent, state: UpdateState): void => cb(state)
      ipcRenderer.on(IPC.UpdateState, listener)
      return () => ipcRenderer.removeListener(IPC.UpdateState, listener)
    }
  }
}

contextBridge.exposeInMainWorld('artemis', api)
