import { mkdtempSync, rmSync, readdirSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

const owned: string[] = []

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
    if (remove(join(root, name))) swept++
  }
  return swept
}

function remove(dir: string): boolean {
  try {
    rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
    return true
  } catch {
    return false
  }
}
