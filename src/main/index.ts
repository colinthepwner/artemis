import { app, BrowserWindow, shell, type BrowserWindowConstructorOptions } from 'electron'
import { UI_SCALE } from '../shared/ui'
import {
  MAC_TRAFFIC_LIGHT_POSITION,
  TITLEBAR_HEIGHT,
  desktopPlatform,
  usesControlsOverlay
} from '../shared/platform'
import { join } from 'path'
import { registerWindowIpc } from './ipc/window'
import { installAppMenu } from './appMenu'
import { registerSetupIpc } from './ipc/setup'
import { registerProjectIpc } from './ipc/project'
import { registerExportIpc } from './export/exporter'
import { registerTestIpc } from './test/runner'
import {
  announceOfferedUpdate,
  checkForUpdates,
  registerUpdateIpc,
  watchForUpdates
} from './updater'
import { registerVanillaIpc } from './vanillaTextures'
import { loadWindowState, rememberWindowState } from './windowState'
import { registerPresenceIpc } from './discordPresence'
import { BOOT_WIDTH, BOOT_HEIGHT, registerBootIpc, runBootSequence } from './boot'
import {
  projectPathFromArgv,
  registerFileAssociation
} from './fileAssociation'
import { IPC } from '../shared/ipc'

process.env['ELECTRON_DISABLE_SECURITY_WARNINGS'] = 'true'

app.setName('Artemis')

process.env['ARTEMIS_IS_DEV'] = app.isPackaged ? '0' : '1'

if (process.platform === 'win32') app.setAppUserModelId('com.colin.artemis')

let mainWindow: BrowserWindow | null = null

let pendingOpen: string | null = projectPathFromArgv(process.argv)

function deliverPendingOpen(): void {
  if (!pendingOpen || !mainWindow) return
  const path = pendingOpen
  pendingOpen = null
  mainWindow.webContents.send(IPC.ProjectOpenRequested, path)
}

if (app.isPackaged) {
  if (!app.requestSingleInstanceLock()) {

    app.exit(0)
  } else {
    app.on('second-instance', (_event, argv) => {
      const path = projectPathFromArgv(argv)
      if (path) pendingOpen = path
      if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore()
        mainWindow.focus()
      }
      deliverPendingOpen()
    })
  }
}

function chromeOptions(): BrowserWindowConstructorOptions {
  if (desktopPlatform(process.platform) === 'darwin') {
    return {
      titleBarStyle: 'hiddenInset',
      trafficLightPosition: MAC_TRAFFIC_LIGHT_POSITION
    }
  }
  if (usesControlsOverlay(process.platform)) {
    return {
      titleBarStyle: 'hidden',
      titleBarOverlay: {

        color: '#07090c',

        symbolColor: '#8b93a1',
        height: TITLEBAR_HEIGHT
      }
    }
  }

  return { frame: false }
}

function createWindow(): void {

  const minWidth = Math.round(1120 * UI_SCALE)
  const minHeight = Math.round(700 * UI_SCALE)

  const saved = loadWindowState({ width: 1480, height: 920, minWidth, minHeight })

  const bootWidth = Math.round(BOOT_WIDTH * UI_SCALE)
  const bootHeight = Math.round(BOOT_HEIGHT * UI_SCALE)

  mainWindow = new BrowserWindow({
    width: bootWidth,
    height: bootHeight,

    resizable: false,
    show: false,

    ...chromeOptions(),
    backgroundColor: '#07090c',
    title: 'Artemis',

    icon: join(
      __dirname,
      process.platform === 'win32' ? '../../resources/icon.ico' : '../../resources/icon.png'
    ),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow?.webContents.setZoomFactor(UI_SCALE)

    deliverPendingOpen()
  })

  mainWindow.on('ready-to-show', () => {
    if (!mainWindow) return
    mainWindow.center()
    mainWindow.show()

    runBootSequence(mainWindow, saved, { width: minWidth, height: minHeight }, checkForUpdates(mainWindow))
      .then(() => {
        if (!mainWindow) return
        rememberWindowState(mainWindow)

        announceOfferedUpdate(mainWindow)
      })
      .catch((err) => console.error('[boot] sequence rejected:', err))

    registerUpdateIpc(mainWindow)
    watchForUpdates(mainWindow)
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https:')) shell.openExternal(url)
    return { action: 'deny' }
  })

  registerWindowIpc(mainWindow)

  installAppMenu(mainWindow)

  registerSetupIpc(mainWindow)

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
  registerVanillaIpc()
  registerPresenceIpc()
  registerBootIpc()

  void registerFileAssociation()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
