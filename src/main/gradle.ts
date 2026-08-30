import { spawn, spawnSync, type ChildProcess } from 'child_process'
import { StringDecoder } from 'string_decoder'
import { existsSync, readFileSync } from 'fs'
import { mkdir, rm } from 'fs/promises'
import { join } from 'path'
import { app } from 'electron'
import { extractAll } from './zip'
import { download } from './net'
import { currentJdk, jdkEnv, MIN_JAVA } from './jdk'
import { desktopPlatform, gradleBinName, gradleWrapperName } from '../shared/platform'

export const DEFAULT_GRADLE_VERSION = '9.3.1'

export interface GradleLauncher {
  cmd: string
  label: string
}

const isWin = process.platform === 'win32'

function gradleCacheDir(): string {
  return join(app.getPath('userData'), 'gradle')
}

function bundledGradleBin(version: string): string {
  return join(gradleCacheDir(), `gradle-${version}`, 'bin', gradleBinName(process.platform))
}

function systemGradleExists(): boolean {
  const r = spawnSync(isWin ? 'where' : 'which', ['gradle'], { stdio: 'ignore' })
  return r.status === 0
}

export function powershellPath(): string {
  const inSystem32 = process.env.SystemRoot
    ? join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
    : ''
  return inSystem32 && existsSync(inSystem32) ? inSystem32 : 'powershell.exe'
}

export async function extractZip(zip: string, dest: string): Promise<void> {
  extractAll(readFileSync(zip), dest)
}

export function findJava(): { home: string | null; source: string } | null {
  const { candidate, onPath } = currentJdk()
  if (!candidate) return null

  return { home: onPath ? null : candidate.home, source: candidate.source }
}

export function warnIfNoJava(onLine: (line: string) => void): boolean {
  if (findJava()) return true
  for (const line of javaMissingAdvice()) onLine(line)
  return false
}

export function javaMissingAdvice(): string[] {
  const p = desktopPlatform(process.platform)
  const lines = [
    'No Java was found, and Gradle is a Java program, so nothing can build yet.',

    `Gradle itself is provided automatically. A JDK (${MIN_JAVA} or newer) is not.`
  ]
  if (p === 'darwin') {
    lines.push('  brew install --cask temurin', '  or download it from https://adoptium.net')
  } else if (p === 'linux') {
    lines.push(
      '  Debian and Ubuntu:  sudo apt install default-jdk',
      '  Fedora:             sudo dnf install java-latest-openjdk-devel',
      '  Arch:               sudo pacman -S jdk-openjdk',
      '  or download it from https://adoptium.net'
    )
  } else {
    lines.push(
      '  winget install EclipseAdoptium.Temurin.21.JDK',
      '  or download it from https://adoptium.net'
    )
  }
  lines.push('Then restart Artemis so it picks up the new PATH.')
  return lines
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

  const wrapper = join(dir, gradleWrapperName(process.platform))
  if (existsSync(wrapper)) {
    return { cmd: wrapper, label: 'gradle wrapper' }
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

    env: jdkEnv(),

    detached: desktopPlatform(process.platform) !== 'win32'
  })

  const lineReader = (): { feed: (buf: Buffer) => void; flush: () => void } => {
    const decoder = new StringDecoder('utf8')
    let rest = ''
    return {
      feed(buf: Buffer): void {
        const parts = (rest + decoder.write(buf)).split(/\r?\n/)

        rest = parts.pop() ?? ''
        for (const line of parts) if (line.length) onLine(line)
      },
      flush(): void {
        const tail = rest + decoder.end()
        rest = ''
        if (tail.length) onLine(tail)
      }
    }
  }
  const out = lineReader()
  const err = lineReader()
  child.stdout?.on('data', (b: Buffer) => out.feed(b))
  child.stderr?.on('data', (b: Buffer) => err.feed(b))
  child.stdout?.on('end', () => out.flush())
  child.stderr?.on('end', () => err.flush())

  const done = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) => {
    child.on('error', (err2) => {

      onLine(`Failed to start Gradle: ${err2.message}`)
      resolve({ code: null, signal: null })
    })
    child.on('exit', (code, signal) => {

      out.flush()
      err.flush()
      resolve({ code, signal })
    })
  })

  return { child, launcher, done }
}

export function killGradle(child: ChildProcess): void {
  if (!child.pid) return
  if (desktopPlatform(process.platform) === 'win32') {
    spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'])
    return
  }
  try {
    process.kill(-child.pid, 'SIGTERM')
  } catch {

    try {
      child.kill('SIGTERM')
    } catch {

    }
  }
}
