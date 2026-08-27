import { swapExe, cleanupLeftovers, OLD_SUFFIX } from '../src/main/updater'
import { mkdtempSync, writeFileSync, readFileSync, existsSync, readdirSync, mkdirSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

let failures = 0
let passes = 0
const check = (name: string, condition: boolean, detail?: string): void => {
  if (condition) passes++
  else {
    failures++
    console.log(`  FAIL ${name}${detail ? `\n       ${detail}` : ''}`)
  }
}

const read = (p: string): string => (existsSync(p) ? readFileSync(p, 'utf-8') : '')

function installDir(): { dir: string; exe: string } {
  const dir = mkdtempSync(join(tmpdir(), 'artemis-updater-'))
  const exe = join(dir, 'Artemis.exe')
  writeFileSync(exe, 'RUNNING VERSION')
  return { dir, exe }
}

async function main(): Promise<void> {

  console.log('the ordinary update')

  {
    const { dir, exe } = installDir()
    const downloaded = join(dir, 'Artemis-new.exe')
    writeFileSync(downloaded, 'NEW VERSION')

    await swapExe(exe, downloaded)

    check('the exe the user launches is now the new one', read(exe) === 'NEW VERSION', read(exe))
    check('the old one is kept aside, not deleted', read(`${exe}${OLD_SUFFIX}`) === 'RUNNING VERSION')
    check('and the download is no longer sitting beside it', !existsSync(downloaded))
    check(
      'nothing else was left in the folder',
      readdirSync(dir).sort().join(' ') === ['Artemis.exe', `Artemis.exe${OLD_SUFFIX}`].sort().join(' '),
      readdirSync(dir).join(' ')
    )
    rmSync(dir, { recursive: true, force: true })
  }

  console.log('\na second update, with last time\'s leftover still there')

  {

    const { dir, exe } = installDir()
    writeFileSync(`${exe}${OLD_SUFFIX}`, 'VERSION FROM TWO UPDATES AGO')
    const downloaded = join(dir, 'Artemis-new.exe')
    writeFileSync(downloaded, 'NEW VERSION')

    let threw: unknown = null
    try {
      await swapExe(exe, downloaded)
    } catch (e) {
      threw = e
    }
    check('a stale backup does not block the update', threw === null, String(threw))
    check('the new version is in place', read(exe) === 'NEW VERSION')
    check(
      'and the backup is the version that was just running, not the older one',
      read(`${exe}${OLD_SUFFIX}`) === 'RUNNING VERSION',
      read(`${exe}${OLD_SUFFIX}`)
    )

    const second = installDir()
    mkdirSync(`${second.exe}${OLD_SUFFIX}`)
    writeFileSync(join(`${second.exe}${OLD_SUFFIX}`, 'junk.txt'), 'not an exe')
    const secondDownload = join(second.dir, 'Artemis-new.exe')
    writeFileSync(secondDownload, 'NEW VERSION')
    let blocked: unknown = null
    try {
      await swapExe(second.exe, secondDownload)
    } catch (e) {
      blocked = e
    }
    check('a folder squatting on the backup name does not stop an update', blocked === null, String(blocked))
    check('and the new version still lands', read(second.exe) === 'NEW VERSION')
    rmSync(second.dir, { recursive: true, force: true })
    rmSync(dir, { recursive: true, force: true })
  }

  console.log('\nthe failure that would cost someone their install')

  {

    const { dir, exe } = installDir()
    const downloaded = join(dir, 'Artemis-new.exe')

    let threw: unknown = null
    try {
      await swapExe(exe, downloaded)
    } catch (e) {
      threw = e
    }
    check('the failure is reported rather than swallowed', threw !== null)
    check('the working exe is back under its own name', read(exe) === 'RUNNING VERSION', read(exe))
    check(
      'and nothing is left stranded under the backup name',
      !existsSync(`${exe}${OLD_SUFFIX}`),
      readdirSync(dir).join(' ')
    )
    check('so the folder is exactly as it started', readdirSync(dir).join(' ') === 'Artemis.exe')
    rmSync(dir, { recursive: true, force: true })
  }

  console.log('\nthe sweep on the next launch')

  {
    const { dir, exe } = installDir()
    writeFileSync(`${exe}${OLD_SUFFIX}`, 'previous version')
    writeFileSync(join(dir, `Artemis-0.1.0.exe${OLD_SUFFIX}`), 'the one before that')

    mkdirSync(join(dir, `Artemis-0.0.9.exe${OLD_SUFFIX}`))
    writeFileSync(join(dir, `Artemis-0.0.9.exe${OLD_SUFFIX}`, 'inside.txt'), 'x')

    writeFileSync(join(dir, 'projects.artemis'), 'a project someone saved next to the exe')
    writeFileSync(join(dir, 'Artemis.exe.config'), 'settings')
    mkdirSync(join(dir, 'workspaces'))

    await cleanupLeftovers(dir)

    check('every leftover exe is gone', readdirSync(dir).every((f) => !f.endsWith(OLD_SUFFIX)), readdirSync(dir).join(' '))
    check('the running exe is untouched', read(exe) === 'RUNNING VERSION')
    check('a saved project is untouched', existsSync(join(dir, 'projects.artemis')))
    check('and so is anything else in the folder', existsSync(join(dir, 'Artemis.exe.config')) && existsSync(join(dir, 'workspaces')))

    let threw: unknown = null
    try {
      await cleanupLeftovers(dir)
      await cleanupLeftovers(join(dir, 'no-such-folder'))
    } catch (e) {
      threw = e
    }
    check('running it again, or on a folder that is not there, is quiet', threw === null, String(threw))
    rmSync(dir, { recursive: true, force: true })
  }

  console.log(`\n${passes} checks passed, ${failures} failed`)
  if (failures) {
    console.log('UPDATER FAIL')
    process.exit(1)
  }
  console.log('UPDATER PASS')
}

void main()
