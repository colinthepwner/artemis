import { spawn, spawnSync, type ChildProcess } from 'child_process'
import { createWriteStream, existsSync } from 'fs'
import { mkdir, rm } from 'fs/promises'
import { get } from 'https'
import { join } from 'path'
import { app } from 'electron'

export const DEFAULT_GRADLE_VERSION = '8.10.2'

export interface GradleLauncher {
  cmd: string
  label: string
}

const isWin = process.platform === 'win32'

function gradleCacheDir(): string {
  return join(app.getPath('userData'), 'gradle')
}

function bundledGradleBin(version: string): string {
  return join(gradleCacheDir(), `gradle-${version}`, 'bin', isWin ? 'gradle.bat' : 'gradle')
}

function systemGradleExists(): boolean {
  const r = spawnSync(isWin ? 'where' : 'which', ['gradle'], { stdio: 'ignore' })
  return r.status === 0
}

function download(url: string, dest: string, onProgress: (pct: number) => void, hops = 0): Promise<void> {
  return new Promise((resolve, reject) => {
    if (hops > 5) return reject(new Error('Too many redirects downloading Gradle'))
    const req = get(url, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume()
        download(res.headers.location, dest, onProgress, hops + 1).then(resolve, reject)
        return
      }
      if (res.statusCode !== 200) {
        res.resume()
        reject(new Error(`HTTP ${res.statusCode} downloading Gradle`))
        return
      }
      const total = Number(res.headers['content-length'] ?? 0)
      let got = 0
      let lastPct = -10
      const out = createWriteStream(dest)
      res.on('data', (chunk: Buffer) => {
        got += chunk.length
        if (total > 0) {
          const pct = Math.floor((got / total) * 100)
          if (pct >= lastPct + 10) {
            lastPct = pct
            onProgress(pct)
          }
        }
      })
      res.pipe(out)
      out.on('finish', () => out.close(() => resolve()))
      res.on('error', reject)
      out.on('error', reject)
    })
    req.on('error', reject)
  })
}

function extractZip(zip: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = isWin
      ? spawn('powershell.exe', [
          '-NoProfile',
          '-NonInteractive',
          '-Command',
          `Expand-Archive -LiteralPath '${zip}' -DestinationPath '${dest}' -Force`
        ])
      : spawn('unzip', ['-o', '-q', zip, '-d', dest])
    child.on('error', reject)
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`Extraction failed (exit ${code})`))))
  })
}

async function ensureBundledGradle(version: string, onLine: (line: string) => void): Promise<string> {
  const bin = bundledGradleBin(version)
  if (existsSync(bin)) return bin

  const cache = gradleCacheDir()
  await mkdir(cache, { recursive: true })
  const zip = join(cache, `gradle-${version}.zip`)
  const url = `https://services.gradle.org/distributions/gradle-${version}-bin.zip`

  onLine(`Gradle isn't installed. Downloading Gradle ${version} (one time, about 130 MB)…`)
  await download(url, zip, (pct) => onLine(`  downloading… ${pct}%`))
  onLine('  extracting…')
  await extractZip(zip, cache)
  await rm(zip, { force: true })

  if (!existsSync(bin)) throw new Error(`Gradle unpacked but ${bin} is missing`)
  onLine(`  Gradle ${version} ready.`)
  return bin
}

export async function resolveGradleLauncher(
  dir: string,
  version: string,
  onLine: (line: string) => void
): Promise<GradleLauncher> {
  if (existsSync(join(dir, isWin ? 'gradlew.bat' : 'gradlew'))) {
    return { cmd: isWin ? 'gradlew.bat' : './gradlew', label: 'gradle wrapper' }
  }
  if (systemGradleExists()) {
    return { cmd: 'gradle', label: 'system gradle' }
  }
  const bin = await ensureBundledGradle(version, onLine)
  return { cmd: bin, label: `bundled gradle ${version}` }
}

export interface GradleRun {
  child: ChildProcess
  launcher: GradleLauncher

  done: Promise<{ code: number | null; signal: NodeJS.Signals | null }>
}

export async function runGradle(
  dir: string,
  args: string,
  onLine: (line: string) => void,
  version: string = DEFAULT_GRADLE_VERSION
): Promise<GradleRun> {
  const launcher = await resolveGradleLauncher(dir, version, onLine)

  const cmd = launcher.cmd.includes(' ') || launcher.cmd.includes('\\') ? `"${launcher.cmd}"` : launcher.cmd
  const child = spawn(`${cmd} ${args} --console=plain`, {
    cwd: dir,
    shell: true,
    env: { ...process.env }
  })

  const pipe = (buf: Buffer): void => {
    for (const line of buf.toString().split(/\r?\n/)) {
      if (line.length) onLine(line)
    }
  }
  child.stdout?.on('data', pipe)
  child.stderr?.on('data', pipe)

  const done = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) => {
    child.on('error', (err) => {
      onLine(`Failed to start Gradle: ${err.message}`)
      onLine('Is a JDK 17 installed? Gradle itself is provided automatically, but Java is not.')
      resolve({ code: null, signal: null })
    })
    child.on('exit', (code, signal) => resolve({ code, signal }))
  })

  return { child, launcher, done }
}

export function killGradle(child: ChildProcess): void {
  if (!child.pid) return
  if (process.platform === 'win32') {
    spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'])
  } else {
    child.kill('SIGTERM')
  }
}
