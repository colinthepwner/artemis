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

  tops: Record<string, string>

  particles?: Record<string, string>
}

const BLOCK_DIR = 'assets/minecraft/textures/block/'
const ITEM_DIR = 'assets/minecraft/textures/item/'

const PARTICLE_DIR = 'assets/minecraft/textures/particle/'

const SKIP = /\.(emiss|cmask)\.|_overlay|_fancy|\bstage\d/

function fancyFor(rel: string, paths: string[]): string | undefined {
  const fancy = rel.replace(/\.png$/, '_fancy.png')
  return paths.includes(fancy) ? fancy : undefined
}

const EXTRA_BLOCK_TEXTURES: Record<string, string> = {

  GLASS_JOINED_X: 'glass/left_right.png',

  FLOWER_RED: 'flower_red/3.png',
  FLOWER_YELLOW: 'flower_yellow/3.png',
  FLOWER_ORANGE: 'flower_orange/3.png',
  FLOWER_PURPLE: 'flower_purple/3.png',

  FLOWER_LIGHT_BLUE: 'flower_lightblue/3.png',
  FLOWER_PINK: 'flower_pink/3.png',
  TALLGRASS_FERN: 'fern.png',
  FLUID_WATER_FLOWING: 'fluid/water/flowing.png',
  FLUID_WATER_STILL: 'fluid/water/still.png',
  FLUID_LAVA_FLOWING: 'fluid/lava/flowing.png',
  FLUID_LAVA_STILL: 'fluid/lava/still.png',

  CROPS_WHEAT: 'crops_wheat/stage7.png',
  CROPS_PUMPKIN: 'crops_pumpkin/stage4_side.png',

  LEAVES_CHERRY_FLOWERING: 'leaves/cherry.png',

  LADDER_OAK: 'ladder.png',
  BOOKSHELF_PLANKS_OAK: 'bookshelf.png',
  PATH_DIRT: 'grass_path/side.png',
  SPONGE_DRY: 'sponge.png',

  PUMICE_DRY: 'pumice.png',
  PUMICE_WET: 'pumice.png',
  BLOCK_NETHER_COAL: 'block_nethercoal.png',
  FARMLAND_DIRT: 'farmland/dry_top.png',
  MOBSPAWNER_DEACTIVATED: 'mobspawner.png',
  DISPENSER_COBBLE_STONE: 'dispenser/front.png',
  BRAZIER_INACTIVE: 'brazier/side.png',
  BRAZIER_ACTIVE: 'brazier/side.png',
  PAPER_WALL: 'paperwall.png',
  FENCE_PAPER_WALL: 'paperwall.png',
  JAR_GLASS: 'jar.png',

  JAR_BUTTERFLY_BLUE: 'jar_butterfly.png',
  JAR_BUTTERFLY_ORANGE: 'jar_butterfly.png',
  JAR_BUTTERFLY_PINK: 'jar_butterfly.png',
  JAR_BUTTERFLY_SILVER: 'jar_butterfly.png',

  COBBLE_NETHERRACK: 'cobbled_netherrack/normal.png',

  ORE_REDSTONE_GLOWING_STONE: 'ore/redstone/stone_active.png',
  ORE_REDSTONE_GLOWING_BASALT: 'ore/redstone/basalt_active.png',
  ORE_REDSTONE_GLOWING_LIMESTONE: 'ore/redstone/limestone_active.png',
  ORE_REDSTONE_GLOWING_GRANITE: 'ore/redstone/granite_active.png',
  ORE_REDSTONE_GLOWING_PERMAFROST: 'ore/redstone/permafrost_active.png',

  PISTON_BASE: 'piston/side.png',
  PISTON_MOVING: 'piston/side.png',
  PISTON_BASE_STICKY: 'piston_sticky/side.png',
  PISTON_BASE_STEEL: 'piston_steel/side.png',

  PUMPKIN_CARVED_IDLE: 'pumpkin_carved/front.png',
  PUMPKIN_CARVED_ACTIVE: 'pumpkin_carved_lit/front.png',

  LAMP_IDLE: 'lamp/white_idle.png',
  LAMP_ACTIVE: 'lamp/white_active.png',
  LAMP_INVERTED_IDLE: 'lamp/white_idle.png',
  LAMP_INVERTED_ACTIVE: 'lamp/white_active.png',

  TRAPDOOR_PLANKS_OAK: 'trapdoor/planks/top.png',
  TRAPDOOR_PLANKS_PAINTED: 'trapdoor/planks_white/top.png',
  DOOR_PLANKS_OAK_BOTTOM: 'door/planks/bottom.png',
  DOOR_PLANKS_OAK_TOP: 'door/planks/top.png',
  DOOR_PLANKS_PAINTED_BOTTOM: 'door/planks_white/bottom.png',
  DOOR_PLANKS_PAINTED_TOP: 'door/planks_white/top.png',
  CHEST_PLANKS_OAK: 'chest/planks/front.png',
  CHEST_PLANKS_OAK_PAINTED: 'chest/planks_white/front.png',
  CHEST_LEGACY: 'chest/planks/front.png',
  CHEST_LEGACY_PAINTED: 'chest/planks_white/front.png',

  PLANKS_OAK_PAINTED: 'planks/white.png',
  SLAB_PLANKS_PAINTED: 'planks/white.png',
  STAIRS_PLANKS_PAINTED: 'planks/white.png',
  BUTTON_PLANKS_PAINTED: 'planks/white.png',
  PRESSURE_PLATE_PLANKS_OAK_PAINTED: 'planks/white.png',
  FENCE_PLANKS_OAK_PAINTED: 'planks/white.png',
  FENCE_GATE_PLANKS_OAK_PAINTED: 'planks/white.png',
  SIGN_POST_PLANKS_OAK: 'planks/oak.png',
  SIGN_WALL_PLANKS_OAK: 'planks/oak.png',
  SIGN_POST_PLANKS_OAK_PAINTED: 'planks/white.png',
  SIGN_WALL_PLANKS_OAK_PAINTED: 'planks/white.png',

  WORKBENCH_FRONT: 'workbench/front.png',
  FURNACE_STONE_SIDE: 'furnace_stone/side.png',
  FURNACE_STONE_FRONT: 'furnace_stone/idle_front.png'
}

const EXTRA_ITEM_TEXTURES: Record<string, string> = {

  JAR_GLASS: 'jar.png',
  BUCKET_IRON: 'bucket_iron/empty.png',
  BUCKET_STEEL: 'bucket_steel/empty.png',

  DYE: 'dye_black.png',
  DOOR_OAK_PAINTED: 'door_white.png',
  SIGN_PAINTED: 'sign/white.png',

  WAND_MONSTER_SPAWNER: 'wand_monster.png',
  RUBYGLASS: 'rubyglass_crystal.png'
}

const EXTRACT_REVISION = 8

function extractionTag(btaVersion: string): string {
  const table = (t: Record<string, string>): string =>
    Object.entries(t)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join(',')

  const registry = getVanillaRegistry(btaVersion)
  const fields = registry.blocks
    .map((b) => b.field)
    .concat(registry.items.map((i) => i.field))
    .join(',')
  const src = `${EXTRACT_REVISION} ${table(EXTRA_BLOCK_TEXTURES)} ${table(EXTRA_ITEM_TEXTURES)} ${fields}`
  let h = 2166136261
  for (let i = 0; i < src.length; i++) {
    h ^= src.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0).toString(36)
}

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

const SHAPE_TOKENS = new Set([
  'slab',
  'stairs',
  'button',
  'statue',
  'lower',
  'upper',
  'layer',
  'gate',
  'plate',
  'pressure',
  'fence',
  'overlay'
])

function pickTexture(want: string[], paths: string[]): string | null {
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

export function matchBlockTexture(field: string, paths: string[]): string | null {
  const want = tokens(field)
  const exact = pickTexture(want, paths)
  if (exact) return exact

  const trimmed = want.filter((w) => !SHAPE_TOKENS.has(w))
  if (!trimmed.length || trimmed.length === want.length) return null
  return pickTexture(trimmed, paths)
}

export function topFaceFor(iconPath: string, paths: string[]): string | null {
  if (!/(^|[/_])side\.png$/.test(iconPath)) return null
  const top = iconPath.replace(/(^|[/_])side\.png$/, '$1top.png')
  return paths.includes(top) ? top : null
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
  const dir = join(app.getPath('userData'), 'vanilla-art')
  const cacheFile = join(dir, `${btaVersion}-${extractionTag(btaVersion)}.json`)
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
    await mkdir(dir, { recursive: true })
    temp = join(dir, `client-${btaVersion}.jar`)
    await download(url, temp)
    jar = temp
  }

  const buf = readFileSync(jar)
  const entries = readCentralDirectory(buf).filter(
    (e) =>
      e.name.endsWith('.png') &&
      (e.name.startsWith(BLOCK_DIR) ||
        e.name.startsWith(ITEM_DIR) ||
        e.name.startsWith(PARTICLE_DIR))
  )

  const byName = new Map(entries.map((e) => [e.name, e]))

  const allBlockPaths = entries
    .filter((e) => e.name.startsWith(BLOCK_DIR))
    .map((e) => e.name.slice(BLOCK_DIR.length))
  const blockPaths = allBlockPaths.filter((rel) => !SKIP.test(rel))

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

  const particles: Record<string, string> = {}

  for (const e of entries) {
    if (!e.name.startsWith(PARTICLE_DIR)) continue
    const url = dataUrl(e.name)
    if (url) particles[e.name.slice(PARTICLE_DIR.length, -'.png'.length)] = url
  }

  const art: VanillaArt = { blocks: {}, items: {}, tops: {}, particles }

  for (const item of registry.items) {
    const url = dataUrl(`${ITEM_DIR}${item.field.toLowerCase()}.png`)
    if (url) art.items[item.field] = url
  }
  for (const block of registry.blocks) {
    const rel = matchBlockTexture(block.field, blockPaths)

    const face = rel ? (fancyFor(rel, allBlockPaths) ?? rel) : null
    const url = face && dataUrl(`${BLOCK_DIR}${face}`)
    if (url) art.blocks[block.field] = url

    const relTop = rel && topFaceFor(rel, blockPaths)
    if (relTop) {
      const topUrl = dataUrl(`${BLOCK_DIR}${relTop}`)
      if (topUrl) art.tops[block.field] = topUrl
    }
  }

  for (const [field, rel] of Object.entries(EXTRA_ITEM_TEXTURES)) {
    const url = dataUrl(`${ITEM_DIR}${rel}`)
    if (url) art.items[field] = url
  }

  for (const [field, rel] of Object.entries(EXTRA_BLOCK_TEXTURES)) {

    const url = dataUrl(`${BLOCK_DIR}${fancyFor(rel, allBlockPaths) ?? rel}`)
    if (url) art.blocks[field] = url

    const relTop = topFaceFor(rel, blockPaths)
    if (relTop) {
      const topUrl = dataUrl(`${BLOCK_DIR}${relTop}`)
      if (topUrl) art.tops[field] = topUrl
    }
  }

  await mkdir(dir, { recursive: true })
  writeFileSync(cacheFile, JSON.stringify(art), 'utf-8')

  try {
    for (const name of await readdir(dir)) {
      const mine = name === `${btaVersion}.json` || name.startsWith(`${btaVersion}-`)
      if (mine && name.endsWith('.json') && join(dir, name) !== cacheFile) {
        await rm(join(dir, name), { force: true })
      }
    }
  } catch {

  }
  if (temp) await rm(temp, { force: true }).catch(() => {})
  return art
}

export function registerVanillaIpc(): void {
  ipcMain.handle(IPC.VanillaArt, async (_e, btaVersion: string): Promise<VanillaArt> => {
    try {
      return await loadVanillaArt(btaVersion)
    } catch {

      return { blocks: {}, items: {}, tops: {}, particles: {} }
    }
  })
}
