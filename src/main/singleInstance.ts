import { app } from 'electron'
import { mkdir, readFile, readdir, rm, writeFile } from 'fs/promises'
import { join } from 'path'

const YIELD_GRACE_MS = 4500

const CLAIM_DEADLINE_MS = 10_000

const BEAT_MS = 2000
const BEAT_STALE_MS = 6500

const POLL_MS = 100

const RECLAIM_TRIES = 12
const RECLAIM_MS = 250

interface LaunchNotice {
  artemisTakeover: true
  argv: string[]
}

interface InstanceRecord {
  pid: number
  exe: string
  started: string

  beat: string
}

function instancesDir(): string {
  return join(app.getPath('userData'), 'instances')
}

function recordPath(pid: number): string {
  return join(instancesDir(), `${pid}.json`)
}

function alive(pid: number): boolean {
  try {

    process.kill(pid, 0)
    return true
  } catch (err) {

    return (err as NodeJS.ErrnoException).code === 'EPERM'
  }
}

let beating: NodeJS.Timeout | null = null

async function writeRecord(): Promise<void> {
  try {
    await mkdir(instancesDir(), { recursive: true })
    const record: InstanceRecord = {
      pid: process.pid,
      exe: process.execPath,
      started: STARTED_AT,
      beat: new Date().toISOString()
    }
    await writeFile(recordPath(process.pid), JSON.stringify(record), 'utf-8')
  } catch {

  }
}

const STARTED_AT = new Date().toISOString()

async function registerInstance(): Promise<void> {
  await writeRecord()
  if (beating) return
  beating = setInterval(() => void writeRecord(), BEAT_MS)
  beating.unref()
}

async function unregisterInstance(): Promise<void> {
  if (beating) {
    clearInterval(beating)
    beating = null
  }
  try {
    await rm(recordPath(process.pid), { force: true })
  } catch {

  }
}

async function otherInstances(): Promise<InstanceRecord[]> {
  let names: string[]
  try {
    names = await readdir(instancesDir())
  } catch {
    return []
  }

  const live: InstanceRecord[] = []
  for (const name of names) {
    if (!name.endsWith('.json')) continue
    const file = join(instancesDir(), name)
    let record: InstanceRecord
    try {
      record = JSON.parse(await readFile(file, 'utf-8')) as InstanceRecord
    } catch {
      await rm(file, { force: true }).catch(() => {})
      continue
    }
    if (!Number.isInteger(record.pid) || record.pid === process.pid) continue
    if (!alive(record.pid)) {
      await rm(file, { force: true }).catch(() => {})
      continue
    }
    live.push(record)
  }
  return live
}

async function kill(records: InstanceRecord[]): Promise<number> {
  let killed = 0
  for (const record of records) {
    try {
      process.kill(record.pid, 'SIGKILL')
      killed++
      console.error(`[instance] killed unresponsive Artemis (pid ${record.pid})`)
    } catch {

    }
    await rm(recordPath(record.pid), { force: true }).catch(() => {})
  }
  return killed
}

function responsive(record: InstanceRecord): boolean {
  const beat = Date.parse(record.beat ?? '')
  if (!Number.isFinite(beat)) return false
  return Date.now() - beat < BEAT_STALE_MS
}

const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

export interface ClaimResult {

  proceed: boolean

  locked: boolean
}

export async function claimSingleInstance(): Promise<ClaimResult> {
  const holders = (await otherInstances()).filter((h) => alive(h.pid))

  const wedged = holders.filter((h) => !responsive(h))
  const healthy = holders.filter((h) => responsive(h))
  if (wedged.length > 0) {
    console.error(`[instance] ${wedged.length} Artemis instance(s) stopped responding; ending them`)
    await kill(wedged)
  }

  if (healthy.length === 0) {

    for (let i = 0; i < RECLAIM_TRIES; i++) {
      if (app.requestSingleInstanceLock()) {
        await registerInstance()
        return { proceed: true, locked: true }
      }

      if (wedged.length === 0) break
      await wait(RECLAIM_MS)
    }
    if (wedged.length > 0) {
      console.error('[instance] took over but could not take the lock; starting without it')
      await registerInstance()
      return { proceed: true, locked: false }
    }
    console.error('[instance] this profile belongs to an Artemis that cannot be replaced; standing down')
    return { proceed: false, locked: false }
  }

  const notice: LaunchNotice = { artemisTakeover: true, argv: process.argv }
  if (app.requestSingleInstanceLock(notice)) {
    await registerInstance()
    return { proceed: true, locked: true }
  }

  console.error('[instance] another Artemis holds the lock; asking it to save and quit')

  const start = Date.now()
  let killedLate = false

  while (healthy.some((h) => alive(h.pid))) {
    if (!killedLate && Date.now() - start >= YIELD_GRACE_MS) {
      killedLate = true
      await kill(healthy.filter((h) => alive(h.pid)))
    }
    if (Date.now() - start >= CLAIM_DEADLINE_MS) {
      console.error('[instance] the previous Artemis will not go; starting anyway')
      break
    }
    await wait(POLL_MS)
  }

  for (let i = 0; i < RECLAIM_TRIES; i++) {
    if (app.requestSingleInstanceLock(notice)) {
      await registerInstance()
      return { proceed: true, locked: true }
    }
    await wait(RECLAIM_MS)
  }

  console.error('[instance] took over but could not take the lock; starting without it')
  await registerInstance()
  return { proceed: true, locked: false }
}

export interface HolderHooks {

  yield: () => Promise<void>

  openFile: (path: string) => void
}

export function serveTakeovers(hooks: HolderHooks): void {
  let yielding = false

  app.on('second-instance', (_event, argv, _cwd, data) => {
    const notice = data as Partial<LaunchNotice> | undefined

    const path = projectPathFrom(notice?.argv ?? argv)
    if (path) hooks.openFile(path)

    if (yielding) return
    yielding = true

    console.error('[instance] a newer Artemis is taking over; saving and standing down')

    const bail = setTimeout(() => {
      console.error('[instance] the handover did not finish in time; exiting hard')
      app.exit(0)
    }, YIELD_GRACE_MS - 500)

    hooks
      .yield()
      .catch((err) => console.error('[instance] saving before handover failed:', err))
      .finally(() => {
        void unregisterInstance().finally(() => app.quit())
      })
  })

  app.on('will-quit', () => {
    void unregisterInstance()
  })
}

function projectPathFrom(argv: string[]): string | null {
  for (let i = argv.length - 1; i >= 0; i--) {
    const arg = argv[i]
    if (typeof arg !== 'string' || arg.startsWith('-')) continue
    if (arg.toLowerCase().endsWith('.artemis')) return arg
  }
  return null
}
