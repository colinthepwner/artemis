import { app, clipboard, dialog, ipcMain, nativeImage, shell } from 'electron'
import { access, mkdir, readFile, readdir, writeFile } from 'fs/promises'
import { basename, dirname, join } from 'path'
import { gzipSync } from 'zlib'
import { IPC, type RecentProject } from '../../shared/ipc'
import { AUDIO_EXTENSIONS } from '../../shared/audio'

const ARTEMIS_FILTER = [{ name: 'Artemis Project', extensions: ['artemis'] }]

function dataUrlToBuffer(dataUrl: string): Buffer {
  const comma = dataUrl.indexOf(',')
  return Buffer.from(comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl, 'base64')
}

export function projectsRoot(): string {
  return join(app.getPath('documents'), 'ArtemisForBTA')
}

export async function ensureProjectsRoot(): Promise<string> {
  const dir = projectsRoot()
  try {
    await mkdir(dir, { recursive: true })
  } catch {

  }
  return dir
}

export function prefsFile(): string {
  return join(projectsRoot(), 'preferences.json')
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

async function autoSavePath(modId: string): Promise<string> {
  const base = modId.trim() || 'mod'
  const dir = await ensureProjectsRoot()
  let taken: Set<string>
  try {
    taken = new Set(await readdir(dir))
  } catch {
    return join(dir, `${base}.artemis`)
  }
  if (!taken.has(`${base}.artemis`)) return join(dir, `${base}.artemis`)

  for (let i = 2; ; i++) {
    const name = `${base}-${i}.artemis`
    if (!taken.has(name)) return join(dir, name)
  }
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

async function readRecents(): Promise<RecentProject[]> {
  let list: RecentProject[]
  try {
    list = JSON.parse(await readFile(recentsFile(), 'utf-8')) as RecentProject[]
  } catch {
    return []
  }
  if (!Array.isArray(list)) return []

  const present = await Promise.all(list.map((r) => (r?.path ? exists(r.path) : Promise.resolve(false))))
  return list.filter((_r, i) => present[i])
}

async function writeRecents(list: RecentProject[]): Promise<void> {
  try {
    await writeFile(recentsFile(), JSON.stringify(list.slice(0, RECENTS_MAX), null, 2), 'utf-8')
  } catch {

  }
}

async function upsertRecent(entry: RecentProject): Promise<void> {
  const list = (await readRecents()).filter((r) => r.path !== entry.path)
  list.unshift(entry)
  await writeRecents(list)
}

let prefsWrite: Promise<void> = Promise.resolve()

function queuePrefsWrite(prefs: Record<string, unknown>): void {
  prefsWrite = prefsWrite
    .catch(() => {})
    .then(async () => {
      try {
        await ensureProjectsRoot()
        await writeFile(prefsFile(), JSON.stringify(prefs, null, 2), 'utf-8')
      } catch {

      }
    })
}

export function registerProjectIpc(): void {

  ipcMain.handle(IPC.ProjectSave, async (_e, json: string, currentPath: string | null) => {
    const target = currentPath ?? (await autoSavePath(modIdOf(json)))
    await mkdir(dirname(target), { recursive: true })
    await writeFile(target, json, 'utf-8')
    return target
  })

  ipcMain.handle(IPC.ProjectSaveAs, async (_e, json: string, suggestedName: string) => {
    const res = await dialog.showSaveDialog({
      filters: ARTEMIS_FILTER,
      defaultPath: join(await ensureProjectsRoot(), `${suggestedName || 'MyMod'}.artemis`)
    })
    if (res.canceled || !res.filePath) return null
    await writeFile(res.filePath, json, 'utf-8')
    return res.filePath
  })

  ipcMain.handle(IPC.ProjectOpen, async () => {
    const res = await dialog.showOpenDialog({
      filters: ARTEMIS_FILTER,
      defaultPath: await ensureProjectsRoot(),
      properties: ['openFile']
    })
    if (res.canceled || res.filePaths.length === 0) return null
    const path = res.filePaths[0]
    const json = await readFile(path, 'utf-8')
    return { path, json }
  })

  ipcMain.handle(IPC.SoundImport, async () => {
    const res = await dialog.showOpenDialog({
      filters: [
        { name: 'Audio', extensions: AUDIO_EXTENSIONS },
        { name: 'All files', extensions: ['*'] }
      ],
      properties: ['openFile']
    })
    if (res.canceled || res.filePaths.length === 0) return null
    const path = res.filePaths[0]
    const raw = await readFile(path)
    const file = basename(path)
    const dot = file.lastIndexOf('.')
    return {
      name: dot > 0 ? file.slice(0, dot) : file,
      ext: dot > 0 ? file.slice(dot + 1).toLowerCase() : '',
      data: raw.toString('base64'),
      bytes: raw.length
    }
  })

  ipcMain.handle(IPC.TextureExportFile, async (_e, dataUrl: string, suggestedName: string) => {
    const res = await dialog.showSaveDialog({
      filters: [{ name: 'PNG Image', extensions: ['png'] }],
      defaultPath: join(app.getPath('pictures'), `${suggestedName || 'texture'}.png`)
    })
    if (res.canceled || !res.filePath) return null
    const target = /\.png$/i.test(res.filePath) ? res.filePath : `${res.filePath}.png`
    await writeFile(target, dataUrlToBuffer(dataUrl))
    return target
  })

  ipcMain.handle(IPC.TextureExportClipboard, (_e, dataUrl: string) => {

    const image = nativeImage.createFromBuffer(dataUrlToBuffer(dataUrl))
    if (image.isEmpty()) return false
    clipboard.writeImage(image)
    return true
  })

  ipcMain.handle(IPC.ProjectsDir, () => ensureProjectsRoot())

  ipcMain.handle(IPC.PrefsLoad, async (): Promise<Record<string, unknown>> => {
    try {
      const parsed: unknown = JSON.parse(await readFile(prefsFile(), 'utf-8'))

      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {}
    } catch {
      return {}
    }
  })

  ipcMain.on(IPC.PrefsSave, (_e, prefs: Record<string, unknown>) => queuePrefsWrite(prefs))

  ipcMain.handle(IPC.ProjectOpenPath, async (_e, path: string) => {
    try {
      const json = await readFile(path, 'utf-8')
      return { path, json }
    } catch {
      return null
    }
  })

  ipcMain.handle(IPC.RecentsList, () => readRecents())
  ipcMain.on(IPC.RecentsAdd, (_e, entry: RecentProject) => void upsertRecent(entry))
  ipcMain.on(IPC.RecentsRemove, (_e, path: string) => {
    void readRecents().then((list) => writeRecents(list.filter((r) => r.path !== path)))
  })

  ipcMain.on(IPC.ShellOpenPath, (_e, path: string) => {
    shell.openPath(path)
  })
}
