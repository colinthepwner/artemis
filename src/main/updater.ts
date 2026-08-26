import { app, type BrowserWindow } from 'electron'
import { spawn } from 'child_process'
import { createWriteStream, existsSync } from 'fs'
import { readdir, rename, rm, stat } from 'fs/promises'
import { get } from 'https'
import { dirname, join } from 'path'
import { IPC, type UpdateState } from '../shared/ipc'
import { isNewerVersion } from '../shared/version'

const REPO = 'colinthepwner/artemis'

const ALLOW_PRERELEASE = true

const OLD_SUFFIX = '.old-update'
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
  assets: ReleaseAsset[]
}

function send(win: BrowserWindow | null, state: UpdateState): void {
  if (win && !win.isDestroyed()) win.webContents.send(IPC.UpdateState, state)
}

function portableExe(): string | null {
  const p = process.env['PORTABLE_EXECUTABLE_FILE']
  return p && existsSync(p) ? p : null
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

async function cleanupLeftovers(dir: string): Promise<void> {
  try {
    for (const name of await readdir(dir)) {
      if (name.endsWith(OLD_SUFFIX)) await rm(join(dir, name), { force: true }).catch(() => {})
    }
  } catch {

  }
}

async function swapAndRelaunch(current: string, downloaded: string): Promise<void> {
  const backup = `${current}${OLD_SUFFIX}`
  await rm(backup, { force: true }).catch(() => {})
  await rename(current, backup)
  try {
    await rename(downloaded, current)
  } catch (err) {

    await rename(backup, current).catch(() => {})
    throw err
  }
  spawn(current, [], { detached: true, stdio: 'ignore' }).unref()

  setTimeout(() => app.exit(0), 400)
}

export async function checkForUpdates(win: BrowserWindow): Promise<void> {
  const current = portableExe()
  if (!app.isPackaged || !current) return

  const dir = dirname(current)
  await cleanupLeftovers(dir)

  try {
    send(win, { status: 'checking' })
    const releases = await readJson<Release[]>(`https://api.github.com/repos/${REPO}/releases?per_page=10`)
    const release = releases.find((r) => !r.draft && (ALLOW_PRERELEASE || !r.prerelease))
    if (!release) return send(win, { status: 'idle' })

    const version = release.tag_name.replace(/^v/i, '')
    if (!isNewerVersion(version, app.getVersion())) return send(win, { status: 'idle' })

    const asset =
      release.assets.find((a) => /portable.*\.exe$/i.test(a.name)) ??
      release.assets.find((a) => /\.exe$/i.test(a.name))
    if (!asset) return send(win, { status: 'idle' })

    const tmp = join(dir, `.artemis-update-${version}.exe`)
    await rm(tmp, { force: true }).catch(() => {})

    send(win, { status: 'downloading', version, percent: 0, transferred: 0, total: asset.size })
    await download(asset.browser_download_url, tmp, (percent, transferred, total) =>
      send(win, { status: 'downloading', version, percent, transferred, total })
    )

    const written = await stat(tmp)
    if (asset.size > 0 && written.size !== asset.size) {
      await rm(tmp, { force: true }).catch(() => {})
      throw new Error('download was incomplete')
    }

    send(win, { status: 'installing', version })
    await swapAndRelaunch(current, tmp)
  } catch (err) {
    send(win, {
      status: 'error',
      message: err instanceof Error ? err.message : String(err)
    })
  }
}
