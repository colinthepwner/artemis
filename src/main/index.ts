import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  shell,
  type BrowserWindowConstructorOptions
} from 'electron'
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
import { flushWindowState, loadWindowState, rememberWindowState } from './windowState'
import { claimSingleInstance, serveTakeovers } from './singleInstance'
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

process.env['ARTEMIS_VERSION'] = app.getVersion()

if (process.platform === 'win32') app.setAppUserModelId('com.colin.artemis')

let mainWindow: BrowserWindow | null = null

const READY_TO_SHOW_GRACE_MS = 2000

let pendingOpen: string | null = projectPathFromArgv(process.argv)

function deliverPendingOpen(): void {
  if (!pendingOpen || !mainWindow) return
  const path = pendingOpen
  pendingOpen = null
  mainWindow.webContents.send(IPC.ProjectOpenRequested, path)
}

function saveAndRelease(): Promise<void> {
  return new Promise((resolve) => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      resolve()
      return
    }
    ipcMain.once(IPC.SessionYielded, () => {
      if (mainWindow && !mainWindow.isDestroyed()) flushWindowState(mainWindow)
      resolve()
    })
    mainWindow.webContents.send(IPC.SessionYield)
  })
}

function noteOpenRequest(path: string): void {
  pendingOpen = path
  deliverPendingOpen()
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

  const revealWindow = (): void => {
    if (!mainWindow || mainWindow.isDestroyed() || mainWindow.isVisible()) return
    mainWindow.center()
    mainWindow.show()
  }

  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow?.webContents.setZoomFactor(UI_SCALE)

    deliverPendingOpen()

    setTimeout(beginSession, READY_TO_SHOW_GRACE_MS)
  })

  let sessionStarted = false
  const beginSession = (): void => {
    if (sessionStarted || !mainWindow || mainWindow.isDestroyed()) return
    sessionStarted = true
    revealWindow()

    runBootSequence(mainWindow, saved, { width: minWidth, height: minHeight }, checkForUpdates(mainWindow))
      .then((expanded) => {
        if (!mainWindow) return

        if (!expanded) return
        rememberWindowState(mainWindow)

        announceOfferedUpdate(mainWindow)
      })
      .catch((err) => console.error('[boot] sequence rejected:', err))

    registerUpdateIpc(mainWindow)
    watchForUpdates(mainWindow)
  }

  mainWindow.on('ready-to-show', beginSession)

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https:')) shell.openExternal(url)
    return { action: 'deny' }
  })

  registerWindowIpc(mainWindow)

  installAppMenu(mainWindow)

  registerSetupIpc(mainWindow)

  const failed = (why: string): void => {
    if (!mainWindow || mainWindow.isDestroyed()) return
    console.error(`[window] ${why}`)

    revealWindow()

    void mainWindow.webContents.loadURL(
      'data:text/html;charset=utf-8,' +
        encodeURIComponent(
          `<body style="margin:0;display:flex;align-items:center;justify-content:center;` +
            `height:100vh;background:#07090c;color:#e6e8eb;` +
            `font:14px/1.6 system-ui,Segoe UI,sans-serif">` +
            `<div style="max-width:34rem;padding:2rem">` +
            `<h1 style="font-size:1.1rem;margin:0 0 .75rem">Artemis could not open its window</h1>` +
            `<p style="margin:0 0 .75rem;opacity:.85">${why}</p>` +
            `<p style="margin:0;opacity:.6">Reinstalling usually fixes this. If it does not, ` +
            `this message is the useful half of a bug report.</p>` +
            `</div></body>`
        )
    )
  }

  mainWindow.webContents.on(
    'did-fail-load',
    (_event, errorCode, errorDescription, _validatedURL, isMainFrame) => {

      if (!isMainFrame || errorCode === -3) return
      failed(`The interface failed to load (${errorDescription || errorCode}).`)
    }
  )

  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    failed(`The interface stopped running (${details.reason}).`)
  })

  const watchdog = setTimeout(() => {
    if (!mainWindow || mainWindow.isDestroyed() || mainWindow.isVisible()) return
    failed('The interface did not finish loading in time.')
  }, 30_000)
  const stopWatchdog = (): void => clearTimeout(watchdog)
  mainWindow.once('show', stopWatchdog)
  mainWindow.once('closed', stopWatchdog)

  if (process.env['ELECTRON_RENDERER_URL']) {

    void mainWindow
      .loadURL(process.env['ELECTRON_RENDERER_URL'])
      .catch((err) => failed(`The dev server did not answer (${String(err)}).`))
  } else {

    void mainWindow
      .loadFile(join(__dirname, '../renderer/index.html'))
      .catch((err) => failed(`The interface files could not be read (${String(err)}).`))
  }

  mainWindow.on('closed', () => (mainWindow = null))
}

function startupFailed(err: unknown): void {
  const detail = err instanceof Error ? (err.stack ?? err.message) : String(err)
  console.error('[startup] failed before the window existed:', detail)
  try {
    dialog.showErrorBox(
      'Artemis could not start',
      'Something failed while starting up, so no window was opened.\n\n' +
        detail +
        '\n\nThis message is the useful half of a bug report.'
    )
  } catch {

  }
  app.exit(1)
}

async function start(): Promise<void> {

  if (app.isPackaged) {
    const { proceed, locked } = await claimSingleInstance()

    if (!proceed) {
      app.exit(0)
      return
    }

    if (locked) serveTakeovers({ yield: saveAndRelease, openFile: noteOpenRequest })
  }

  await app.whenReady()

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
}

void start().catch(startupFailed)

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
