import { app, ipcMain, type BrowserWindow } from 'electron'
import { spawn } from 'child_process'
import { createWriteStream, existsSync } from 'fs'
import { chmod, mkdir, readdir, rename, rm, stat } from 'fs/promises'
import { get } from 'https'
import { dirname, join } from 'path'
import { IPC, type UpdateState } from '../shared/ipc'
import { isNewerVersion } from '../shared/version'
import { canSelfUpdate, desktopPlatform, type InstallKind } from '../shared/platform'

const REPO = 'colinthepwner/artemis'

const ALLOW_PRERELEASE = true

export const OLD_SUFFIX = '.old-update'
const CHECK_TIMEOUT_MS = 8000

interface ReleaseAsset {
  name: string
  browser_download_url: string
  size: number
}

interface Release {
  tag_name: string
  draft: boolean
  prerelease: boolean

  html_url: string

  body: string
  assets: ReleaseAsset[]
}

function send(win: BrowserWindow | null, state: UpdateState): void {
  if (win && !win.isDestroyed()) win.webContents.send(IPC.UpdateState, state)
}

function detectInstallKind(): { kind: InstallKind; target: string } {
  const portable = process.env['PORTABLE_EXECUTABLE_FILE']
  if (portable && existsSync(portable)) return { kind: 'windows-portable', target: portable }

  const appImage = process.env['APPIMAGE']
  if (appImage && existsSync(appImage)) return { kind: 'appimage', target: appImage }

  if (desktopPlatform(process.platform) === 'darwin') {

    const bundle = dirname(dirname(dirname(process.execPath)))
    if (bundle.endsWith('.app') && existsSync(bundle)) return { kind: 'macos-app', target: bundle }
  }

  return { kind: 'managed', target: '' }
}

export function installKind(): { kind: InstallKind; target: string } {
  return detectInstallKind()
}

function portableExe(): string | null {
  const { kind, target } = detectInstallKind()
  return kind === 'windows-portable' || kind === 'appimage' ? target : null
}

function assetFor(kind: InstallKind, assets: ReleaseAsset[], arch: string): ReleaseAsset | null {
  const find = (re: RegExp): ReleaseAsset | undefined => assets.find((a) => re.test(a.name))

  if (kind === 'windows-portable') {
    return find(/portable.*\.exe$/i) ?? find(/\.exe$/i) ?? null
  }
  if (kind === 'appimage') {

    const wanted = arch === 'arm64' ? /(arm64|aarch64)/i : /(x86_64|x64|amd64)/i
    return (
      assets.find((a) => /\.AppImage$/i.test(a.name) && wanted.test(a.name)) ??

      (arch === 'x64' ? find(/\.AppImage$/i) : undefined) ??
      null
    )
  }
  if (kind === 'macos-app') {
    return (
      find(/universal.*mac.*\.zip$/i) ??
      find(/mac.*\.zip$/i) ??
      find(/\.zip$/i) ??
      null
    )
  }
  return null
}

function request(url: string, headers: Record<string, string>, hops = 0): Promise<{ res: NodeJS.ReadableStream; total: number }> {
  return new Promise((resolve, reject) => {
    if (hops > 5) return reject(new Error('too many redirects'))
    if (!url.startsWith('https://')) return reject(new Error('refusing a non-https update URL'))
    const req = get(url, { headers, timeout: CHECK_TIMEOUT_MS }, (res) => {
      const code = res.statusCode ?? 0
      if (code >= 300 && code < 400 && res.headers.location) {
        res.resume()

        request(res.headers.location, headers, hops + 1).then(resolve, reject)
        return
      }
      if (code !== 200) {
        res.resume()
        reject(new Error(`HTTP ${code}`))
        return
      }
      resolve({ res, total: Number(res.headers['content-length'] ?? 0) })
    })
    req.on('timeout', () => req.destroy(new Error('timed out')))
    req.on('error', reject)
  })
}

async function readJson<T>(url: string): Promise<T> {
  const { res } = await request(url, {
    'User-Agent': 'Artemis-Updater',
    Accept: 'application/vnd.github+json'
  })
  let body = ''
  for await (const chunk of res) body += chunk
  return JSON.parse(body) as T
}

async function download(
  url: string,
  dest: string,
  onProgress: (pct: number, transferred: number, total: number) => void
): Promise<void> {
  const { res, total } = await request(url, { 'User-Agent': 'Artemis-Updater', Accept: 'application/octet-stream' })
  await new Promise<void>((resolve, reject) => {
    const out = createWriteStream(dest)
    let got = 0
    let lastPct = -1
    res.on('data', (chunk: Buffer) => {
      got += chunk.length
      if (total > 0) {
        const pct = Math.floor((got / total) * 100)
        if (pct !== lastPct) {
          lastPct = pct
          onProgress(pct, got, total)
        }
      }
    })
    res.on('error', reject)
    out.on('error', reject)
    out.on('finish', () => out.close(() => resolve()))
    res.pipe(out)
  })
}

export async function cleanupLeftovers(dir: string): Promise<void> {
  try {
    for (const name of await readdir(dir)) {

      if (name.endsWith(OLD_SUFFIX)) {
        await rm(join(dir, name), { force: true, recursive: true }).catch(() => {})
      }
    }
  } catch {

  }
}

export async function swapExe(current: string, downloaded: string): Promise<void> {
  const backup = `${current}${OLD_SUFFIX}`

  await rm(backup, { force: true, recursive: true }).catch(() => {})
  await rename(current, backup)
  try {
    await rename(downloaded, current)
  } catch (err) {

    await rename(backup, current).catch(() => {})
    throw err
  }
}

function extractMacApp(zip: string, into: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn('/usr/bin/ditto', ['-xk', zip, into], { stdio: 'ignore' })
    child.on('error', reject)
    child.on('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(`ditto failed unpacking the update (exit ${code})`))
    )
  })
}

async function findBundle(dir: string): Promise<string | null> {
  for (const name of await readdir(dir)) {
    if (name.endsWith('.app')) return join(dir, name)
  }
  return null
}

async function swapAndRelaunch(
  kind: InstallKind,
  current: string,
  downloaded: string
): Promise<void> {
  if (kind === 'macos-app') {

    const staging = `${current}.new-update`
    await rm(staging, { force: true, recursive: true }).catch(() => {})
    await mkdir(staging, { recursive: true })
    await extractMacApp(downloaded, staging)
    const fresh = await findBundle(staging)
    if (!fresh) {
      await rm(staging, { force: true, recursive: true }).catch(() => {})
      throw new Error('the downloaded archive held no .app bundle')
    }
    await swapExe(current, fresh)
    await rm(staging, { force: true, recursive: true }).catch(() => {})
    await rm(downloaded, { force: true }).catch(() => {})

    spawn('/usr/bin/open', ['-n', current], { detached: true, stdio: 'ignore' }).unref()
    setTimeout(() => app.exit(0), 400)
    return
  }

  if (kind === 'appimage') {

    await chmod(downloaded, 0o755)
    await swapExe(current, downloaded)
    spawn(current, [], { detached: true, stdio: 'ignore' }).unref()
    setTimeout(() => app.exit(0), 400)
    return
  }

  await swapExe(current, downloaded)
  spawn(current, [], { detached: true, stdio: 'ignore' }).unref()

  setTimeout(() => app.exit(0), 400)
}

export interface AvailableUpdate {

  kind: InstallKind
  version: string

  url: string

  size: number

  current: string

  page: string

  selfInstall: boolean

  notes: string
}

export function noteSummary(body: string, limit = 200): string {
  const line = (body ?? '')
    .split(/\r?\n/)

    .map((l) => l.trim())
    .find((l) => l.length > 0 && !l.startsWith('#') && !l.startsWith('---') && !l.startsWith('!['))

  if (!line) return ''

  const plain = line
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\[(.+?)\]\([^)]*\)/g, '$1')
    .replace(/[`*_]/g, '')
    .trim()

  if (plain.length <= limit) return plain
  const cut = plain.slice(0, limit)
  const lastSpace = cut.lastIndexOf(' ')
  return `${(lastSpace > limit * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[,.;:]$/, '')}…`
}

export async function findUpdate(): Promise<AvailableUpdate | null> {
  if (!app.isPackaged) return null

  const { kind, target } = detectInstallKind()

  const releases = await readJson<Release[]>(
    `https://api.github.com/repos/${REPO}/releases?per_page=10`
  )
  const release = releases.find((r) => !r.draft && (ALLOW_PRERELEASE || !r.prerelease))
  if (!release) return null

  const version = release.tag_name.replace(/^v/i, '')
  if (!isNewerVersion(version, app.getVersion())) return null

  const page = release.html_url

  const notes = noteSummary(release.body)

  if (!canSelfUpdate(kind)) {
    return { kind, version, url: page, size: 0, current: '', page, selfInstall: false, notes }
  }

  const asset = assetFor(kind, release.assets, process.arch)
  if (!asset) {

    return { kind, version, url: page, size: 0, current: '', page, selfInstall: false, notes }
  }

  return {
    kind,
    version,
    url: asset.browser_download_url,
    size: asset.size,
    current: target,
    page,
    selfInstall: true,
    notes
  }
}

export async function installUpdate(
  win: BrowserWindow,
  update: AvailableUpdate
): Promise<boolean> {
  const dir = dirname(update.current)

  const suffix =
    update.kind === 'macos-app' ? 'zip' : update.kind === 'appimage' ? 'AppImage' : 'exe'
  const tmp = join(dir, `.artemis-update-${update.version}.${suffix}`)
  try {
    await rm(tmp, { force: true }).catch(() => {})

    send(win, {
      status: 'downloading',
      version: update.version,
      percent: 0,
      transferred: 0,
      total: update.size
    })
    await download(update.url, tmp, (percent, transferred, total) =>
      send(win, { status: 'downloading', version: update.version, percent, transferred, total })
    )

    const written = await stat(tmp)
    if (update.size > 0 && written.size !== update.size) {
      await rm(tmp, { force: true }).catch(() => {})
      throw new Error('download was incomplete')
    }

    send(win, { status: 'installing', version: update.version })
    await swapAndRelaunch(update.kind, update.current, tmp)
    return true
  } catch (err) {
    send(win, {
      status: 'error',
      message: err instanceof Error ? err.message : String(err)
    })
    return false
  }
}

export async function checkForUpdates(win: BrowserWindow): Promise<boolean> {
  if (!app.isPackaged) return false

  const current = portableExe()
  if (current) await cleanupLeftovers(dirname(current))

  try {
    send(win, { status: 'checking' })
    const update = await findUpdate()
    if (!update) {
      send(win, { status: 'idle' })
      return false
    }
    if (!update.selfInstall) {

      offered = update
      send(win, { status: 'idle' })
      return false
    }
    return await installUpdate(win, update)
  } catch (err) {
    send(win, {
      status: 'error',
      message: err instanceof Error ? err.message : String(err)
    })
    return false
  }
}

const CHECK_EVERY_MS = 60 * 60 * 1000

const FIRST_CHECK_MS = 15 * 60 * 1000

let watchTimer: NodeJS.Timeout | null = null
let offered: AvailableUpdate | null = null

export function offeredUpdate(): AvailableUpdate | null {
  return offered
}

export function announceOfferedUpdate(win: BrowserWindow): void {
  if (!offered || win.isDestroyed()) return
  send(win, {
    status: 'available',
    version: offered.version,
    total: offered.size,
    page: offered.page,
    selfInstall: offered.selfInstall,
    notes: offered.notes
  })
}

export function watchForUpdates(win: BrowserWindow): void {
  if (!app.isPackaged || watchTimer) return

  const tick = async (): Promise<void> => {

    if (offered || win.isDestroyed()) return
    try {
      const update = await findUpdate()
      if (!update || win.isDestroyed()) return
      offered = update
      send(win, {
        status: 'available',
        version: update.version,
        total: update.size,
        page: update.page,
        selfInstall: update.selfInstall,
        notes: update.notes
      })
    } catch {

    }
  }

  watchTimer = setTimeout(function repeat() {
    void tick()
    watchTimer = setTimeout(repeat, CHECK_EVERY_MS)
  }, FIRST_CHECK_MS)

  win.on('closed', () => {
    if (watchTimer) clearTimeout(watchTimer)
    watchTimer = null
  })
}

export async function installOfferedUpdate(win: BrowserWindow): Promise<boolean> {
  const update = offered
  if (!update) return false
  offered = null
  return installUpdate(win, update)
}

export function registerUpdateIpc(win: BrowserWindow): void {
  ipcMain.removeAllListeners(IPC.UpdateInstall)
  ipcMain.on(IPC.UpdateInstall, () => {
    void installOfferedUpdate(win)
  })
}
