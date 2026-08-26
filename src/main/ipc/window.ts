import { BrowserWindow, ipcMain } from 'electron'
import { IPC } from '../../shared/ipc'

export function registerWindowIpc(win: BrowserWindow): void {
  ipcMain.on(IPC.WindowMinimize, () => win.minimize())

  ipcMain.on(IPC.WindowMaximizeToggle, () => {
    if (win.isMaximized()) win.unmaximize()
    else win.maximize()
  })

  ipcMain.on(IPC.WindowClose, () => win.close())

  ipcMain.handle(IPC.WindowIsMaximized, () => win.isMaximized())

  const pushState = (): void => {
    if (!win.isDestroyed()) {
      win.webContents.send(IPC.WindowMaximizeChanged, win.isMaximized())
    }
  }
  win.on('maximize', pushState)
  win.on('unmaximize', pushState)

  win.on('closed', () => {
    ipcMain.removeAllListeners(IPC.WindowMinimize)
    ipcMain.removeAllListeners(IPC.WindowMaximizeToggle)
    ipcMain.removeAllListeners(IPC.WindowClose)
    ipcMain.removeHandler(IPC.WindowIsMaximized)
  })
}
