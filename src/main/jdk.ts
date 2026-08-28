import { app } from 'electron'
import { spawn, spawnSync } from 'child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'fs'
import { homedir } from 'os'
import { dirname, join } from 'path'
import { adoptiumTarget, desktopPlatform, javaBinCandidates } from '../shared/platform'
import { extractAll } from './zip'
import { download } from './net'

export const MIN_JAVA = 17

export interface JdkCandidate {

  home: string

  version: string

  major: number

  source: string
}

interface SetupFile {

  javaHome?: string
}

function setupFile(): string {
  return join(app.getPath('userData'), 'setup.json')
}

function readSetup(): SetupFile {
  try {
    const parsed: unknown = JSON.parse(readFileSync(setupFile(), 'utf-8'))
    return parsed && typeof parsed === 'object' ? (parsed as SetupFile) : {}
  } catch {
    return {}
  }
}

function writeSetup(next: SetupFile): void {
  try {
    mkdirSync(app.getPath('userData'), { recursive: true })
    writeFileSync(setupFile(), JSON.stringify(next, null, 2), 'utf-8')
  } catch {

  }
}

export function managedJdkRoot(): string {
  return join(app.getPath('userData'), 'jdk')
}

function javaBin(home: string): string | null {
  for (const segments of javaBinCandidates(process.platform)) {
    const bin = join(home, ...segments)
    if (existsSync(bin)) return bin
  }
  return null
}

export function probeJdk(home: string, source = 'chosen'): JdkCandidate | null {
  const bin = javaBin(home)
  if (!bin) return null
  const r = spawnSync(bin, ['-version'], { encoding: 'utf-8', timeout: 10_000 })
  if (r.error || r.status !== 0) return null
  const text = `${r.stderr ?? ''}${r.stdout ?? ''}`
  const m = text.match(/version "([^"]+)"/)
  if (!m) return null
  const version = m[1]
  const parts = version.split(/[._-]/).map((n) => Number(n))
  const major = parts[0] === 1 ? (parts[1] ?? 0) : (parts[0] ?? 0)
  if (!Number.isFinite(major) || major <= 0) return null

  return { home: dirname(dirname(bin)), version, major, source }
}

function searchRoots(): Array<{ dir: string; source: string }> {
  const home = homedir()
  const p = desktopPlatform(process.platform)
  const roots: Array<{ dir: string; source: string }> = [
    { dir: managedJdkRoot(), source: 'installed by Artemis' }
  ]

  if (p === 'win32') {
    const pf = process.env['ProgramFiles'] ?? 'C:\\Program Files'
    const pf86 = process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)'
    const local = process.env['LOCALAPPDATA'] ?? join(home, 'AppData', 'Local')
    for (const base of [pf, pf86]) {
      roots.push(
        { dir: join(base, 'Java'), source: 'Program Files' },
        { dir: join(base, 'Eclipse Adoptium'), source: 'Adoptium' },
        { dir: join(base, 'Zulu'), source: 'Zulu' },
        { dir: join(base, 'Microsoft'), source: 'Microsoft OpenJDK' },
        { dir: join(base, 'Amazon Corretto'), source: 'Corretto' },
        { dir: join(base, 'BellSoft'), source: 'Liberica' }
      )
    }
    roots.push({ dir: join(local, 'Programs', 'Eclipse Adoptium'), source: 'Adoptium' })
  } else if (p === 'darwin') {
    roots.push(

      { dir: '/Library/Java/JavaVirtualMachines', source: 'system' },
      { dir: join(home, 'Library', 'Java', 'JavaVirtualMachines'), source: 'user' },

      { dir: '/opt/homebrew/opt', source: 'Homebrew' },
      { dir: '/usr/local/opt', source: 'Homebrew' }
    )
  } else {
    roots.push(
      { dir: '/usr/lib/jvm', source: 'system' },
      { dir: '/usr/java', source: 'system' },
      { dir: '/opt/java', source: '/opt' },
      { dir: '/opt', source: '/opt' }
    )
  }

  roots.push(
    { dir: join(home, '.sdkman', 'candidates', 'java'), source: 'SDKMAN' },
    { dir: join(home, '.asdf', 'installs', 'java'), source: 'asdf' },
    { dir: join(home, '.jdks'), source: 'JetBrains' },
    { dir: join(home, '.gradle', 'jdks'), source: 'Gradle toolchains' }
  )
  return roots
}

export function scanForJdks(): JdkCandidate[] {
  const found = new Map<string, JdkCandidate>()

  const consider = (dir: string, source: string): void => {
    if (found.has(dir)) return
    const c = probeJdk(dir, source)
    if (c && c.major >= MIN_JAVA) found.set(dir, c)
  }

  for (const { dir, source } of searchRoots()) {
    if (!existsSync(dir)) continue
    consider(dir, source)
    let entries: string[] = []
    try {
      entries = readdirSync(dir)
    } catch {

      continue
    }
    for (const name of entries) consider(join(dir, name), source)
  }

  const envHome = process.env['JAVA_HOME']
  if (envHome && existsSync(envHome)) consider(envHome, 'JAVA_HOME')

  return [...found.values()].sort((a, b) => b.major - a.major || a.home.localeCompare(b.home))
}

export function currentJdk(): { candidate: JdkCandidate | null; onPath: boolean } {
  const chosen = readSetup().javaHome
  if (chosen) {
    const c = probeJdk(chosen, 'chosen')
    if (c && c.major >= MIN_JAVA) return { candidate: c, onPath: false }
  }

  const envHome = process.env['JAVA_HOME']
  if (envHome) {
    const c = probeJdk(envHome, 'JAVA_HOME')
    if (c && c.major >= MIN_JAVA) return { candidate: c, onPath: false }
  }

  const bare = spawnSync('java', ['-version'], {
    encoding: 'utf-8',
    shell: true,
    timeout: 10_000
  })
  if (!bare.error && bare.status === 0) {
    const text = `${bare.stderr ?? ''}${bare.stdout ?? ''}`
    const m = text.match(/version "([^"]+)"/)
    const version = m ? m[1] : 'unknown'
    const parts = version.split(/[._-]/).map((n) => Number(n))
    const major = parts[0] === 1 ? (parts[1] ?? 0) : (parts[0] ?? 0)
    if (major >= MIN_JAVA) {
      return { candidate: { home: '', version, major, source: 'PATH' }, onPath: true }
    }
  }
  return { candidate: null, onPath: false }
}

export function chooseJdk(home: string | null): JdkCandidate | null {
  if (home === null) {
    writeSetup({})
    return null
  }
  const c = probeJdk(home, 'chosen')
  if (!c || c.major < MIN_JAVA) return null

  writeSetup({ javaHome: c.home })
  return c
}

export function jdkEnv(): NodeJS.ProcessEnv {
  const { candidate, onPath } = currentJdk()
  if (!candidate || onPath || !candidate.home) return { ...process.env }
  const bin = javaBin(candidate.home)

  if (!bin) return { ...process.env }

  const binDir = dirname(bin)
  const sep = process.platform === 'win32' ? ';' : ':'
  return {
    ...process.env,
    JAVA_HOME: candidate.home,
    PATH: `${binDir}${sep}${process.env['PATH'] ?? ''}`
  }
}

function adoptiumUrl(): string {
  const { os, arch } = adoptiumTarget(process.platform, process.arch)
  return (
    `https://api.adoptium.net/v3/binary/latest/21/ga/${os}/${arch}` +
    '/jdk/hotspot/normal/eclipse?project=jdk'
  )
}

function untar(archive: string, into: string): Promise<void> {
  return new Promise((resolve, reject) => {

    const child = spawn('tar', ['-xzf', archive, '-C', into], { stdio: 'ignore' })
    child.on('error', reject)
    child.on('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(`tar failed unpacking the JDK (exit ${code})`))
    )
  })
}

export async function installJdk(onProgress: (percent: number) => void): Promise<JdkCandidate> {
  const root = managedJdkRoot()

  rmSync(root, { recursive: true, force: true })
  mkdirSync(root, { recursive: true })

  const { archiveExt } = adoptiumTarget(process.platform, process.arch)
  const archive = join(root, `jdk.${archiveExt}`)

  await download(adoptiumUrl(), archive, onProgress)

  if (archiveExt === 'zip') extractAll(readFileSync(archive), root)
  else await untar(archive, root)
  rmSync(archive, { force: true })

  for (const name of readdirSync(root)) {
    const c = probeJdk(join(root, name), 'installed by Artemis')
    if (c && c.major >= MIN_JAVA) {
      writeSetup({ javaHome: c.home })
      return c
    }
  }
  throw new Error('the download unpacked but no Java was found inside it')
}
