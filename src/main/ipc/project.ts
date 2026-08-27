import { app, dialog, ipcMain, shell } from 'electron'
import { writeFile, readFile, mkdir } from 'fs/promises'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { IPC, type RecentProject } from '../../shared/ipc'

const ARTEMIS_FILTER = [{ name: 'Artemis Project', extensions: ['artemis'] }]

export function prefsFile(): string {
  return join(projectsRoot(), 'preferences.json')
}

export function projectsRoot(): string {
  const dir = join(app.getPath('documents'), 'ArtemisForBTA')
  try {
    mkdirSync(dir, { recursive: true })
  } catch {

  }
  return dir
}

function autoSavePath(modId: string): string {
  const base = modId.trim() || 'mod'
  const dir = projectsRoot()
  let target = join(dir, `${base}.artemis`)
  for (let i = 2; existsSync(target); i++) target = join(dir, `${base}-${i}.artemis`)
  return target
}

function modIdOf(json: string): string {
  try {
    return (JSON.parse(json) as { meta?: { modId?: string } }).meta?.modId ?? 'mod'
  } catch {
    return 'mod'
  }
}

const RECENTS_MAX = 10
const recentsFile = (): string => join(app.getPath('userData'), 'recent-projects.json')

function readRecents(): RecentProject[] {
  try {
    const raw = readFileSync(recentsFile(), 'utf-8')
    const list = JSON.parse(raw) as RecentProject[]

    return list.filter((r) => r.path && existsSync(r.path))
  } catch {
    return []
  }
}

function writeRecents(list: RecentProject[]): void {
  try {
    writeFileSync(recentsFile(), JSON.stringify(list.slice(0, RECENTS_MAX), null, 2), 'utf-8')
  } catch {

  }
}

function upsertRecent(entry: RecentProject): void {
  const list = readRecents().filter((r) => r.path !== entry.path)
  list.unshift(entry)
  writeRecents(list)
}

export function registerProjectIpc(): void {

  ipcMain.handle(IPC.ProjectSave, async (_e, json: string, currentPath: string | null) => {
    const target = currentPath ?? autoSavePath(modIdOf(json))
    await mkdir(dirname(target), { recursive: true })
    await writeFile(target, json, 'utf-8')
    return target
  })

  ipcMain.handle(IPC.ProjectSaveAs, async (_e, json: string, suggestedName: string) => {
    const res = await dialog.showSaveDialog({
      filters: ARTEMIS_FILTER,
      defaultPath: join(projectsRoot(), `${suggestedName || 'MyMod'}.artemis`)
    })
    if (res.canceled || !res.filePath) return null
    await writeFile(res.filePath, json, 'utf-8')
    return res.filePath
  })

  ipcMain.handle(IPC.ProjectOpen, async () => {
    const res = await dialog.showOpenDialog({
      filters: ARTEMIS_FILTER,
      defaultPath: projectsRoot(),
      properties: ['openFile']
    })
    if (res.canceled || res.filePaths.length === 0) return null
    const path = res.filePaths[0]
    const json = await readFile(path, 'utf-8')
    return { path, json }
  })

  ipcMain.handle(IPC.ProjectsDir, () => projectsRoot())

  ipcMain.handle(IPC.PrefsLoad, (): Record<string, unknown> => {
    try {
      const raw = readFileSync(prefsFile(), 'utf-8')
      const parsed: unknown = JSON.parse(raw)

      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {}
    } catch {
      return {}
    }
  })

  ipcMain.on(IPC.PrefsSave, (_e, prefs: Record<string, unknown>) => {
    try {
      writeFileSync(prefsFile(), JSON.stringify(prefs, null, 2), 'utf-8')
    } catch {

    }
  })

  ipcMain.handle(IPC.ProjectOpenPath, async (_e, path: string) => {
    if (!existsSync(path)) return null
    try {
      const json = await readFile(path, 'utf-8')
      return { path, json }
    } catch {
      return null
    }
  })

  ipcMain.handle(IPC.RecentsList, () => readRecents())
  ipcMain.on(IPC.RecentsAdd, (_e, entry: RecentProject) => upsertRecent(entry))
  ipcMain.on(IPC.RecentsRemove, (_e, path: string) => {
    writeRecents(readRecents().filter((r) => r.path !== path))
  })

  ipcMain.on(IPC.ShellOpenPath, (_e, path: string) => {
    shell.openPath(path)
  })
}
