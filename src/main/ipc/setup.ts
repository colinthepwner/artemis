import { BrowserWindow, dialog, ipcMain } from 'electron'
import { IPC, type JdkCandidate, type PermissionIssue, type SetupStatus } from '../../shared/ipc'
import { checkPermissions, openPermissionSettings } from '../permissions'
import { MIN_JAVA, chooseJdk, currentJdk, installJdk, probeJdk, scanForJdks } from '../jdk'

export function registerSetupIpc(win: BrowserWindow): void {
  ipcMain.handle(IPC.SetupStatus, (): SetupStatus => {
    const permissions = checkPermissions()
    return {
      permissions,

      jdk: permissions.length > 0 ? null : currentJdk().candidate,
      minJava: MIN_JAVA
    }
  })

  ipcMain.on(IPC.SetupOpenSettings, (_e, issue: PermissionIssue) => {
    void openPermissionSettings(issue)
  })

  ipcMain.handle(IPC.JdkScan, (): JdkCandidate[] => scanForJdks())

  ipcMain.handle(
    IPC.JdkPick,
    async (): Promise<{ ok: boolean; candidate?: JdkCandidate; error?: string }> => {
      const picked = await dialog.showOpenDialog(win, {
        title: 'Choose a Java installation',
        properties: ['openDirectory'],
        message: 'Pick the JDK folder itself, the one containing bin'
      })
      if (picked.canceled || picked.filePaths.length === 0) return { ok: false }

      const home = picked.filePaths[0]
      const candidate = probeJdk(home, 'chosen')
      if (!candidate) {

        return {
          ok: false,
          error:
            'No Java was found there. Pick the JDK folder itself, the one with a bin folder ' +
            'inside it, rather than bin or the folder holding several JDKs.'
        }
      }
      if (candidate.major < MIN_JAVA) {
        return {
          ok: false,
          error: `That is Java ${candidate.version}. Artemis needs ${MIN_JAVA} or newer, because Gradle will not start on anything older.`
        }
      }
      chooseJdk(home)
      return { ok: true, candidate }
    }
  )

  ipcMain.handle(IPC.JdkChoose, (_e, home: string): JdkCandidate | null => chooseJdk(home))

  ipcMain.handle(
    IPC.JdkInstall,
    async (): Promise<{ ok: boolean; candidate?: JdkCandidate; error?: string }> => {
      try {
        const candidate = await installJdk((percent) => {
          if (!win.isDestroyed()) win.webContents.send(IPC.JdkInstallProgress, percent)
        })
        return { ok: true, candidate }
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) }
      }
    }
  )

  win.on('closed', () => {
    ipcMain.removeHandler(IPC.SetupStatus)
    ipcMain.removeHandler(IPC.JdkScan)
    ipcMain.removeHandler(IPC.JdkPick)
    ipcMain.removeHandler(IPC.JdkChoose)
    ipcMain.removeHandler(IPC.JdkInstall)
    ipcMain.removeAllListeners(IPC.SetupOpenSettings)
  })
}
