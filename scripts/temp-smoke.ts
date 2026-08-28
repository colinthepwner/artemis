import { mkdirSync, writeFileSync, existsSync, utimesSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { spawn } from 'child_process'
import { sweepStale, probeWorkspace } from './_temp'
import { harness } from './_harness'

const audit = harness()
const check = audit.check

const PREFIX = `artemis-tempsmoke-${process.pid}-`

function make(label: string, claim?: string): string {
  const dir = join(tmpdir(), `${PREFIX}${label}`)
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  if (claim !== undefined) writeFileSync(join(dir, '.artemis-live'), claim)
  return dir
}

function backdate(dir: string, msAgo: number): void {
  const when = new Date(Date.now() - msAgo)
  utimesSync(dir, when, when)
}

async function main(): Promise<void> {

  const other = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 60000)'], {
    stdio: 'ignore'
  })
  await new Promise((r) => setTimeout(r, 300))
  const alive = other.pid ?? 0
  check('the smoke got a second process to ask about', alive > 0)

  const now = new Date().toISOString()
  const liveOwner = make('live-owner', `${alive} ${now}\n`)

  const deadOwner = make('dead-owner', `999999 ${now}\n`)
  const freshBare = make('fresh-bare')
  const oldBare = make('old-bare')
  backdate(oldBare, 10 * 60 * 1000)

  const ancient = make('ancient', `${alive} ${new Date(Date.now() - 8 * 3600 * 1000).toISOString()}\n`)

  const swept = sweepStale(PREFIX)

  check('a workspace whose owner is still running survives the sweep', existsSync(liveOwner),
    'this is the collision itself: the other run loses its game mid-boot')
  check('a workspace whose owner is gone is swept', !existsSync(deadOwner),
    'the leak would grow forever, which is what sweepStale exists to stop')
  check('a workspace with no claim made a moment ago survives', existsSync(freshBare),
    'this is the gap between mkdtemp and the claim, and it belongs to somebody')
  check('a workspace with no claim made long ago is swept', !existsSync(oldBare),
    'workspaces left by runs from before the claim existed still have to go')
  check('a claim too old to trust stops protecting its workspace', !existsSync(ancient),
    'otherwise a reused pid keeps a dead run\'s directory alive forever')
  check('the sweep counted exactly what it removed', swept === 3, `it said ${swept}, and 3 went`)

  const mine = probeWorkspace(PREFIX)
  const before = existsSync(mine)
  sweepStale(PREFIX)
  check('probeWorkspace claims its directory as it makes it', before)
  check('and a concurrent sweep of the same prefix leaves it alone', existsSync(mine),
    'this is A58 turned destructive: the exact thing that killed a fixture')

  other.kill()

  for (let i = 0; i < 40 && !other.killed; i++) await new Promise((r) => setTimeout(r, 50))
  await new Promise((r) => setTimeout(r, 300))
  const stillMine = probeWorkspace(PREFIX)
  check('a workspace this run owns survives its own later sweeps', existsSync(stillMine))

  rmSync(mine, { recursive: true, force: true })
  rmSync(stillMine, { recursive: true, force: true })
  rmSync(liveOwner, { recursive: true, force: true })
  rmSync(freshBare, { recursive: true, force: true })

  console.log(`\n${audit.passes} checks passed, ${audit.failures} failed`)
  if (audit.failures > 0) {
    console.log('TEMP FAIL')
    process.exit(1)
  }
  console.log('TEMP PASS')
}

void main()
