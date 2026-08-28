import { mkdtempSync, rmSync, readdirSync, readFileSync, writeFileSync, statSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

const owned: string[] = []

const CLAIM = '.artemis-live'

const UNCLAIMED_GRACE_MS = 60_000

const CLAIM_MAX_MS = 6 * 60 * 60 * 1000

export function tempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix))
  owned.push(dir)
  return dir
}

export function sweepTempDirs(): void {
  for (const dir of owned) remove(dir)
}

export function sweepStale(prefix: string): number {
  let swept = 0
  const root = tmpdir()
  let entries: string[]
  try {
    entries = readdirSync(root)
  } catch {
    return 0
  }
  for (const name of entries) {
    if (!name.startsWith(prefix)) continue
    const dir = join(root, name)

    if (inUse(dir)) continue
    if (remove(dir)) swept++
  }
  return swept
}

export function probeWorkspace(prefix: string): string {

  const stale = sweepStale(prefix)
  if (stale > 0) console.log(`swept ${stale} workspace(s) left by earlier runs`)
  const dir = mkdtempSync(join(tmpdir(), prefix))
  try {
    writeFileSync(join(dir, CLAIM), `${process.pid} ${new Date().toISOString()}\n`)
  } catch {

  }
  return dir
}

function inUse(dir: string): boolean {
  let claim: string
  try {
    claim = readFileSync(join(dir, CLAIM), 'utf8')
  } catch {

    try {
      return Date.now() - statSync(dir).mtimeMs < UNCLAIMED_GRACE_MS
    } catch {
      return false
    }
  }
  const [pid, at] = claim.trim().split(/\s+/)
  const claimed = Date.parse(at ?? '')
  if (Number.isFinite(claimed) && Date.now() - claimed > CLAIM_MAX_MS) return false
  const owner = Number(pid)
  if (!Number.isInteger(owner) || owner <= 0) return false
  try {

    process.kill(owner, 0)
    return true
  } catch (e) {

    return (e as NodeJS.ErrnoException).code === 'EPERM'
  }
}

function remove(dir: string): boolean {
  try {
    rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
    return true
  } catch {
    return false
  }
}
