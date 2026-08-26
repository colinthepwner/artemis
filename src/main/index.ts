import { app, BrowserWindow, shell } from 'electron'
import { join } from 'path'
import { registerWindowIpc } from './ipc/window'
import { registerProjectIpc } from './ipc/project'
import { registerExportIpc } from './export/exporter'
import { registerTestIpc } from './test/runner'
import { checkForUpdates } from './updater'

process.env['ELECTRON_DISABLE_SECURITY_WARNINGS'] = 'true'

app.setName('Artemis')
if (process.platform === 'win32') app.setAppUserModelId('com.colin.artemis')

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1480,
    height: 920,
    minWidth: 1120,
    minHeight: 700,
    show: false,
    frame: false,
    backgroundColor: '#07090c',
    title: 'Artemis',
    icon: join(__dirname, '../../resources/icon.png'),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()

    if (mainWindow) void checkForUpdates(mainWindow)
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https:')) shell.openExternal(url)
    return { action: 'deny' }
  })

  registerWindowIpc(mainWindow)

  if (process.env['ELECTRON_RENDERER_URL']) {

    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  mainWindow.on('closed', () => (mainWindow = null))
}

app.whenReady().then(() => {
  registerProjectIpc()
  registerExportIpc()
  registerTestIpc()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
