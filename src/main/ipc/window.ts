import { BrowserWindow, ipcMain } from 'electron'
import { IPC } from '../../shared/ipc'

export function registerWindowIpc(win: BrowserWindow): void {
  ipcMain.on(IPC.WindowClose, () => win.close())

  ipcMain.on(IPC.WindowRelaunch, () => {
    import('electron').then(({ app }) => {
      app.relaunch()
      app.quit()
    })
  })

  let origin: { x: number; y: number } | null = null
  ipcMain.on(IPC.WindowDragStart, () => {
    if (win.isDestroyed() || win.isMaximized()) {
      origin = null
      return
    }
    const [x, y] = win.getPosition()
    origin = { x, y }
  })
  ipcMain.on(IPC.WindowDragMove, (_e, dx: number, dy: number) => {
    if (!origin || win.isDestroyed()) return
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) return
    win.setPosition(origin.x + Math.round(dx), origin.y + Math.round(dy))
  })

  win.on('closed', () => {
    ipcMain.removeAllListeners(IPC.WindowClose)
    ipcMain.removeAllListeners(IPC.WindowRelaunch)
    ipcMain.removeAllListeners(IPC.WindowDragStart)
    ipcMain.removeAllListeners(IPC.WindowDragMove)
  })
}
