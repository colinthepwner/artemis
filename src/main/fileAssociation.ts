import { app } from 'electron'
import { spawn } from 'child_process'
import { copyFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'

const PROG_ID = 'Artemis.Project'
const EXT = '.artemis'

const FRIENDLY_NAME = 'Artemis Mod Project'

const SEP = String.fromCharCode(92)

function launcherPath(): string {
  return process.env.PORTABLE_EXECUTABLE_FILE || process.execPath
}

function iconPath(): string {
  const dir = join(app.getPath('userData'), 'shell')
  const dest = join(dir, 'artemis-file.ico')
  try {
    const source = app.isPackaged
      ? join(process.resourcesPath, 'file-icon.ico')
      : join(app.getAppPath(), 'resources', 'file-icon.ico')
    if (!existsSync(source)) return ''
    mkdirSync(dir, { recursive: true })

    copyFileSync(source, dest)
    return dest
  } catch {
    return ''
  }
}

export interface RegEntry {
  key: string

  name?: string
  value: string
}

export function associationEntries(exe: string, icon: string): RegEntry[] {
  const classes = 'HKCU' + SEP + 'Software' + SEP + 'Classes'
  const progKey = classes + SEP + PROG_ID
  const entries: RegEntry[] = [
    { key: classes + SEP + EXT, value: PROG_ID },
    { key: progKey, value: FRIENDLY_NAME },
    { key: progKey, name: 'FriendlyTypeName', value: FRIENDLY_NAME }
  ]
  if (icon) entries.push({ key: progKey + SEP + 'DefaultIcon', value: icon })
  entries.push({
    key: progKey + SEP + 'shell' + SEP + 'open' + SEP + 'command',
    value: '"' + exe + '" "%1"'
  })
  return entries
}

function regAdd(key: string, value: string, name?: string): Promise<void> {
  return new Promise((resolve) => {
    const args = ['add', key, '/f', '/t', 'REG_SZ', '/d', value]
    if (name) args.push('/v', name)
    else args.push('/ve')
    const child = spawn('reg', args, { windowsHide: true, stdio: 'ignore' })
    child.on('error', () => resolve())
    child.on('close', () => resolve())
  })
}

export async function registerFileAssociation(): Promise<void> {
  if (process.platform !== 'win32') return
  try {
    for (const entry of associationEntries(launcherPath(), iconPath())) {
      await regAdd(entry.key, entry.value, entry.name)
    }
  } catch {

  }
}

export function projectPathFromArgv(argv: string[]): string | null {
  for (let i = argv.length - 1; i >= 0; i--) {
    const arg = argv[i]
    if (typeof arg !== 'string' || arg.startsWith('-')) continue
    if (!arg.toLowerCase().endsWith(EXT)) continue
    if (!existsSync(arg)) continue
    return arg
  }
  return null
}
