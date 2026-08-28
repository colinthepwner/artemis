import { app, BrowserWindow, Menu, ipcMain, type MenuItemConstructorOptions } from 'electron'
import { IPC, type MenuCommand, type MenuState } from '../shared/ipc'
import { desktopPlatform } from '../shared/platform'

let state: MenuState = {
  hasProject: false,
  autoCapitalize: true,
  inspectorOpen: false,
  reduceAnimations: false,
  showCheckerGrid: true,
  discordPresence: true,
  bundleTestMods: true,
  savingMode: 'manual'
}

let target: BrowserWindow | null = null

function send(command: MenuCommand): void {
  if (target && !target.isDestroyed()) target.webContents.send(IPC.MenuCommand, command)
}

function template(): MenuItemConstructorOptions[] {
  const item = (
    label: string,
    command: MenuCommand,
    extra: Partial<MenuItemConstructorOptions> = {}
  ): MenuItemConstructorOptions => ({ label, click: () => send(command), ...extra })

  return [
    {

      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },

        {
          label: 'Settings',
          submenu: [
            item('Capitalize each word in names', 'settings.autoCapitalize', {
              type: 'checkbox',
              checked: state.autoCapitalize
            }),
            item('Show the code preview', 'settings.inspector', {
              type: 'checkbox',
              checked: state.inspectorOpen
            }),
            item('Reduce animations', 'settings.reduceAnimations', {
              type: 'checkbox',
              checked: state.reduceAnimations
            }),
            item('Show checkered grid', 'settings.checkerGrid', {
              type: 'checkbox',
              checked: state.showCheckerGrid
            }),
            item('Show what you are modding on Discord', 'settings.discordPresence', {
              type: 'checkbox',
              checked: state.discordPresence
            }),
            { type: 'separator' },

            item('Save manually', 'settings.saving.manual', {
              type: 'radio',
              checked: state.savingMode === 'manual'
            }),
            item('Save periodically', 'settings.saving.periodic', {
              type: 'radio',
              checked: state.savingMode === 'periodic'
            }),
            item('Save on change', 'settings.saving.onChange', {
              type: 'radio',
              checked: state.savingMode === 'onChange'
            }),
            { type: 'separator' },
            item('Bundle ModMenu with the test client', 'settings.bundleTestMods', {
              type: 'checkbox',
              checked: state.bundleTestMods
            })
          ]
        },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },

        { role: 'quit' }
      ]
    },
    {
      label: 'File',
      submenu: [
        item('New Project', 'file.new', { accelerator: 'CmdOrCtrl+N' }),
        item('Open Project…', 'file.open', { accelerator: 'CmdOrCtrl+O' }),
        { type: 'separator' },
        item('Save', 'file.save', { accelerator: 'CmdOrCtrl+S', enabled: state.hasProject }),
        { type: 'separator' },
        item('Export Mod', 'file.export', { enabled: state.hasProject })
      ]
    },
    {

      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' }
      ]
    },
    {
      label: 'Window',
      submenu: [{ role: 'minimize' }, { role: 'zoom' }, { type: 'separator' }, { role: 'front' }]
    },
    {
      label: 'Help',
      submenu: [item('Take the tour again', 'help.tour')]
    }
  ]
}

function rebuild(): void {
  Menu.setApplicationMenu(Menu.buildFromTemplate(template()))
}

export function installAppMenu(win: BrowserWindow): void {
  target = win

  if (desktopPlatform(process.platform) !== 'darwin') {
    Menu.setApplicationMenu(null)
    return
  }

  rebuild()

  ipcMain.removeAllListeners(IPC.MenuState)
  ipcMain.on(IPC.MenuState, (_e, next: MenuState) => {

    if (JSON.stringify(next) === JSON.stringify(state)) return
    state = next
    rebuild()
  })

  win.on('closed', () => {
    ipcMain.removeAllListeners(IPC.MenuState)
    target = null
  })
}
