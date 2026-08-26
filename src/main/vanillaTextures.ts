import { app, ipcMain } from 'electron'
import { createWriteStream, existsSync, readFileSync, writeFileSync } from 'fs'
import { mkdir, readdir, rm } from 'fs/promises'
import { get } from 'https'
import { join } from 'path'
import { readCentralDirectory, readEntry } from './zip'
import { IPC } from '../shared/ipc'
import { getMapping } from '../shared/generator/mappings'
import { getVanillaRegistry } from '../shared/generator/vanilla'

export interface VanillaArt {
  blocks: Record<string, string>
  items: Record<string, string>
}

const BLOCK_DIR = 'assets/minecraft/textures/block/'
const ITEM_DIR = 'assets/minecraft/textures/item/'

const SKIP = /\.(emiss|cmask)\.|_overlay|_fancy|\bstage\d/

function tokens(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/\.png$/, '')
    .split(/[/_.]+/)
    .filter(Boolean)
}

function related(a: string, b: string): boolean {
  if (a === b) return true
  const short = a.length < b.length ? a : b
  const long = a.length < b.length ? b : a
  return short.length >= 3 && long.startsWith(short)
}

export function matchBlockTexture(field: string, paths: string[]): string | null {
  const want = tokens(field)
  let best: string | null = null
  let bestScore = -Infinity

  for (const path of paths) {
    const have = tokens(path)
    const used = new Set<number>()
    let matched = 0
    let exact = 0
    for (const w of want) {

      let i = have.findIndex((h, idx) => !used.has(idx) && h === w)
      if (i >= 0) exact++
      else i = have.findIndex((h, idx) => !used.has(idx) && related(w, h))
      if (i >= 0) {
        used.add(i)
        matched++
      }
    }
    if (matched < want.length) continue

    const extra = have.length - matched

    const face = have.includes('side') ? 2 : have.includes('top') ? 1 : 0
    const score = exact * 3 + face - extra * 2
    if (score > bestScore) {
      bestScore = score
      best = path
    }
  }
  return best
}

function download(url: string, dest: string, hops = 0): Promise<void> {
  return new Promise((resolve, reject) => {
    if (hops > 5) return reject(new Error('too many redirects'))
    get(url, (res) => {
      const code = res.statusCode ?? 0
      if (code >= 300 && code < 400 && res.headers.location) {
        res.resume()
        return download(res.headers.location, dest, hops + 1).then(resolve, reject)
      }
      if (code !== 200) {
        res.resume()
        return reject(new Error(`HTTP ${code}`))
      }
      const out = createWriteStream(dest)
      res.pipe(out)
      out.on('finish', () => out.close(() => resolve()))
      out.on('error', reject)
      res.on('error', reject)
    }).on('error', reject)
  })
}

async function jarFromGradleCache(btaVersion: string): Promise<string | null> {
  const root = join(app.getPath('home'), '.gradle', 'caches', 'fabric-loom')
  const short = btaVersion.split('.').slice(0, 2).join('.')
  for (const dir of [btaVersion, short]) {
    const candidate = join(root, dir, 'minecraft-client.jar')
    if (existsSync(candidate)) return candidate
  }
  try {
    for (const entry of await readdir(root)) {
      const candidate = join(root, entry, 'minecraft-client.jar')
      if (entry.startsWith(short) && existsSync(candidate)) return candidate
    }
  } catch {

  }
  return null
}

export async function loadVanillaArt(btaVersion: string): Promise<VanillaArt> {
  const cacheFile = join(app.getPath('userData'), 'vanilla-art', `${btaVersion}.json`)
  if (existsSync(cacheFile)) {
    try {
      return JSON.parse(readFileSync(cacheFile, 'utf-8')) as VanillaArt
    } catch {

    }
  }

  let jar = await jarFromGradleCache(btaVersion)
  let temp: string | null = null
  if (!jar) {
    const manifest = getMapping(btaVersion).gradle.manifestUrl
    const meta = await new Promise<{ downloads?: { client?: { url?: string } } }>((resolve, reject) => {
      get(manifest, (res) => {
        let body = ''
        res.on('data', (c) => (body += c))
        res.on('end', () => {
          try {
            resolve(JSON.parse(body))
          } catch (e) {
            reject(e)
          }
        })
        res.on('error', reject)
      }).on('error', reject)
    })
    const url = meta.downloads?.client?.url
    if (!url) throw new Error('the BTA manifest has no client download')
    const dir = join(app.getPath('userData'), 'vanilla-art')
    await mkdir(dir, { recursive: true })
    temp = join(dir, `client-${btaVersion}.jar`)
    await download(url, temp)
    jar = temp
  }

  const buf = readFileSync(jar)
  const entries = readCentralDirectory(buf).filter(
    (e) => e.name.endsWith('.png') && !SKIP.test(e.name) &&
      (e.name.startsWith(BLOCK_DIR) || e.name.startsWith(ITEM_DIR))
  )
  const byName = new Map(entries.map((e) => [e.name, e]))
  const blockPaths = entries
    .filter((e) => e.name.startsWith(BLOCK_DIR))
    .map((e) => e.name.slice(BLOCK_DIR.length))

  const dataUrl = (name: string): string | null => {
    const entry = byName.get(name)
    if (!entry) return null
    try {
      return `data:image/png;base64,${readEntry(buf, entry).toString('base64')}`
    } catch {
      return null
    }
  }

  const registry = getVanillaRegistry(btaVersion)
  const art: VanillaArt = { blocks: {}, items: {} }

  for (const item of registry.items) {
    const url = dataUrl(`${ITEM_DIR}${item.field.toLowerCase()}.png`)
    if (url) art.items[item.field] = url
  }
  for (const block of registry.blocks) {
    const rel = matchBlockTexture(block.field, blockPaths)
    const url = rel && dataUrl(`${BLOCK_DIR}${rel}`)
    if (url) art.blocks[block.field] = url
  }

  await mkdir(join(app.getPath('userData'), 'vanilla-art'), { recursive: true })
  writeFileSync(cacheFile, JSON.stringify(art), 'utf-8')
  if (temp) await rm(temp, { force: true }).catch(() => {})
  return art
}

export function registerVanillaIpc(): void {
  ipcMain.handle(IPC.VanillaArt, async (_e, btaVersion: string): Promise<VanillaArt> => {
    try {
      return await loadVanillaArt(btaVersion)
    } catch {

      return { blocks: {}, items: {} }
    }
  })
}
